-- Target database: marketing_workbench_v2
-- Scope: separate project coordination from case/job runtime truth.
-- Safety: a case stores business routing and lifecycle only; no credential, URL,
-- raw payload, or raw response may be stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.workflow_cases (
  case_id text PRIMARY KEY,
  case_key text NOT NULL UNIQUE,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  advertiser_id text NOT NULL REFERENCES mwb.advertiser_accounts(advertiser_id),
  business_goal text NOT NULL DEFAULT '',
  lifecycle_status text NOT NULL DEFAULT 'active',
  source_usage text NOT NULL DEFAULT 'runtime_truth',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_cases_lifecycle_status_check CHECK (lifecycle_status IN (
    'active', 'paused', 'completed', 'cancelled'
  )),
  CONSTRAINT workflow_cases_source_usage_check CHECK (source_usage IN (
    'runtime_truth', 'test_run', 'seed_source'
  )),
  CONSTRAINT workflow_cases_case_key_shape_check CHECK (
    case_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'
  ),
  CONSTRAINT workflow_cases_metadata_object_check CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT workflow_cases_no_sensitive_raw_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|authorization|cookie|tf-api\\.3k\\.com|callback/click)'
  )
);

ALTER TABLE mwb.launch_jobs
  ADD COLUMN IF NOT EXISTS case_id text REFERENCES mwb.workflow_cases(case_id);

-- Every historical job remains available and is assigned to a deterministic legacy
-- case. New runtime jobs are required to name/select their own case explicitly.
INSERT INTO mwb.workflow_cases (
  case_id, case_key, route_id, game_code, advertiser_id,
  business_goal, lifecycle_status, source_usage, metadata, created_at, updated_at
)
SELECT DISTINCT ON (j.route_id, j.game_code, j.advertiser_id, j.source_usage)
  'CASE-LEGACY-' || upper(substr(md5(concat_ws(':', j.route_id, j.game_code, j.advertiser_id, j.source_usage)), 1, 24)),
  'legacy.' || lower(substr(md5(concat_ws(':', j.route_id, j.game_code, j.advertiser_id, j.source_usage)), 1, 32)),
  j.route_id,
  j.game_code,
  j.advertiser_id,
  'Historical workflow jobs migrated without changing their evidence.',
  CASE WHEN j.source_usage = 'runtime_truth' THEN 'active' ELSE 'completed' END,
  j.source_usage,
  jsonb_build_object('migration', '035_add_workflow_cases', 'legacy', true),
  min(j.created_at) OVER (PARTITION BY j.route_id, j.game_code, j.advertiser_id, j.source_usage),
  max(j.updated_at) OVER (PARTITION BY j.route_id, j.game_code, j.advertiser_id, j.source_usage)
FROM mwb.launch_jobs j
ON CONFLICT (case_id) DO NOTHING;

UPDATE mwb.workflow_cases
SET lifecycle_status = CASE WHEN source_usage = 'runtime_truth' THEN 'active' ELSE 'completed' END,
    updated_at = now()
WHERE metadata->>'migration' = '035_add_workflow_cases';

UPDATE mwb.launch_jobs j
SET case_id = 'CASE-LEGACY-' || upper(substr(md5(concat_ws(':', j.route_id, j.game_code, j.advertiser_id, j.source_usage)), 1, 24))
WHERE j.case_id IS NULL;

ALTER TABLE mwb.launch_jobs
  ALTER COLUMN case_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_cases_scope
  ON mwb.workflow_cases(route_id, game_code, advertiser_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_launch_jobs_case_updated
  ON mwb.launch_jobs(case_id, updated_at DESC);

CREATE OR REPLACE VIEW mwb.workflow_case_summary AS
SELECT
  wc.case_id,
  wc.case_key,
  wc.route_id,
  wc.game_code,
  wc.advertiser_id,
  wc.business_goal,
  wc.lifecycle_status,
  wc.source_usage,
  wc.created_at,
  wc.updated_at,
  latest.job_id AS latest_job_id,
  latest.job_status AS latest_job_status,
  latest.current_node AS latest_current_node,
  latest.updated_at AS latest_job_updated_at,
  coalesce(plan.plan_status, '') AS latest_plan_status,
  coalesce(plan.blocker_codes, '[]'::jsonb) AS blocker_codes,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(jsonb_array_length(plan.blocker_codes), 0) > 0 THEN 'resolve_case_blockers'
    WHEN latest.job_status IN ('created_pending_readback', 'readback_pending') THEN 'run_readback_only'
    WHEN plan.plan_status = 'ready' THEN 'await_job_write_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_fresh_readiness'
    ELSE 'review_latest_job'
  END AS current_gate,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(jsonb_array_length(plan.blocker_codes), 0) > 0 THEN 'resolve_blockers_from_latest_plan'
    WHEN latest.job_status IN ('created_pending_readback', 'readback_pending') THEN 'perform_readback_only'
    WHEN plan.plan_status = 'ready' THEN 'obtain_single_job_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_readonly_readiness'
    ELSE 'inspect_latest_job'
  END AS suggested_next_action,
  coalesce((
    SELECT jsonb_agg(jsonb_build_object('node_key', n.node_key, 'status', n.status) ORDER BY n.node_run_id)
    FROM mwb.launch_node_runs n
    WHERE n.job_id = latest.job_id
  ), '[]'::jsonb) AS latest_node_states,
  coalesce((
    SELECT jsonb_agg(jsonb_build_object('resource_type', ar.resource_type, 'visibility_status', ar.visibility_status, 'readback_status', ar.readback_status) ORDER BY ar.resource_type, ar.resource_id)
    FROM mwb.account_resources ar
    WHERE ar.route_id = wc.route_id
      AND ar.game_code = wc.game_code
      AND ar.advertiser_id = wc.advertiser_id
  ), '[]'::jsonb) AS resource_readiness,
  EXISTS (
    SELECT 1 FROM mwb.account_touchpoints t
    WHERE t.route_id = wc.route_id
      AND t.game_code = wc.game_code
      AND t.advertiser_id = wc.advertiser_id
      AND t.monitor_id <> ''
  ) AS monitor_resolved,
  coalesce((
    SELECT jsonb_build_object(
      'platform_action_count', count(*),
      'last_readback_status', coalesce((
        SELECT rb.readback_status
        FROM mwb.readback_records rb
        WHERE rb.job_id = latest.job_id
        ORDER BY rb.created_at DESC
        LIMIT 1
      ), '')
    )
    FROM mwb.platform_actions pa
    WHERE pa.job_id = latest.job_id
  ), jsonb_build_object('platform_action_count', 0, 'last_readback_status', '')) AS action_readback_state
FROM mwb.workflow_cases wc
LEFT JOIN LATERAL (
  SELECT j.*
  FROM mwb.launch_jobs j
  WHERE j.case_id = wc.case_id
  ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
  LIMIT 1
) latest ON true
LEFT JOIN LATERAL (
  SELECT ep.*
  FROM mwb.launch_execution_plans ep
  WHERE ep.job_id = latest.job_id
  ORDER BY ep.plan_version DESC, ep.updated_at DESC
  LIMIT 1
) plan ON true;

COMMENT ON TABLE mwb.workflow_cases IS
  'Long-lived business workflow cases. Cases group independent launch/readback jobs without duplicating Node, Skill, resource, action, or evidence records.';

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Read-only projection of the latest job and execution-plan facts for each workflow case. It is the current gate and blocker source for UI, CLI, and task references.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: add unified execution plan foundation for one-click launch planning.
-- Safety: stores only action summaries, hashes, blockers, and necessary IDs.
-- No token, Cookie, full URL, raw request, or raw response may be stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.launch_execution_plans (
  plan_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  plan_version integer NOT NULL DEFAULT 1,
  plan_status text NOT NULL,
  plan_hash text NOT NULL,
  planned_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocker_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_id text REFERENCES mwb.launch_drafts(draft_id),
  payload_hash text NOT NULL DEFAULT '',
  source_usage text NOT NULL DEFAULT 'runtime_truth',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT launch_execution_plans_unique_version UNIQUE (job_id, plan_version),
  CONSTRAINT launch_execution_plans_status_check CHECK (plan_status IN (
    'blocked',
    'planned',
    'ready',
    'consumed',
    'stale',
    'cancelled'
  )),
  CONSTRAINT launch_execution_plans_json_shape_check CHECK (
    jsonb_typeof(planned_actions) = 'array'
    AND jsonb_typeof(blocker_codes) = 'array'
    AND jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT launch_execution_plans_no_sensitive_raw_text_check CHECK (
    planned_actions::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|authorization|cookie|tf-api\.3k\.com|callback/click)'
    AND metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|authorization|cookie|tf-api\.3k\.com|callback/click)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_launch_execution_plans_one_active_per_job
  ON mwb.launch_execution_plans(job_id)
  WHERE plan_status IN ('blocked', 'planned', 'ready');

CREATE INDEX IF NOT EXISTS idx_launch_execution_plans_job_updated
  ON mwb.launch_execution_plans(job_id, updated_at DESC);

ALTER TABLE mwb.launch_confirmations
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES mwb.launch_execution_plans(plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_launch_confirmations_plan_once
  ON mwb.launch_confirmations(plan_id)
  WHERE plan_id IS NOT NULL;

ALTER TABLE mwb.platform_actions
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES mwb.launch_execution_plans(plan_id),
  ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_actions_idempotency_key
  ON mwb.platform_actions(idempotency_key)
  WHERE idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_platform_actions_plan_id
  ON mwb.platform_actions(plan_id)
  WHERE plan_id IS NOT NULL;

ALTER TABLE mwb.monitor_provision_runs
  ADD COLUMN IF NOT EXISTS job_id text REFERENCES mwb.launch_jobs(job_id),
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES mwb.launch_execution_plans(plan_id);

CREATE INDEX IF NOT EXISTS idx_monitor_provision_runs_job_plan
  ON mwb.monitor_provision_runs(job_id, plan_id)
  WHERE job_id IS NOT NULL OR plan_id IS NOT NULL;

ALTER TABLE mwb.monitor_provision_attempts
  ADD COLUMN IF NOT EXISTS job_id text REFERENCES mwb.launch_jobs(job_id),
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES mwb.launch_execution_plans(plan_id);

CREATE INDEX IF NOT EXISTS idx_monitor_provision_attempts_job_plan
  ON mwb.monitor_provision_attempts(job_id, plan_id)
  WHERE job_id IS NOT NULL OR plan_id IS NOT NULL;

ALTER TABLE mwb.launch_skill_runs
  ADD COLUMN IF NOT EXISTS execution_cycle integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS blocker_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS error_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS module_ref text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_launch_skill_runs_job_cycle_skill
  ON mwb.launch_skill_runs(job_id, execution_cycle, skill_key, attempt_no);

COMMENT ON TABLE mwb.launch_execution_plans IS
  'Unified redacted execution plans for launch jobs. Stores action summaries, blockers, hashes, and necessary IDs only.';

COMMENT ON COLUMN mwb.launch_execution_plans.planned_actions IS
  'Array of planned action summaries: action_type, target_ref, idempotency_key, status, module_ref, and redacted metadata.';

COMMENT ON COLUMN mwb.launch_skill_runs.module_ref IS
  'Source module reference for locating the Skill implementation without storing raw request/response data.';

COMMIT;

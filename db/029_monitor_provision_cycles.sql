-- Target database: marketing_workbench_v2
-- Scope: add Qiankun monitor provision cycle semantics without deleting historical runs or attempts.
-- Safety: no token, Cookie, full URL, raw request, raw response, or raw payload may be stored here.

BEGIN;

ALTER TABLE mwb.monitor_provision_attempts
  DROP CONSTRAINT IF EXISTS monitor_provision_attempts_provision_id_fkey;

ALTER TABLE mwb.monitor_provision_runs
  ADD COLUMN IF NOT EXISTS cycle_id text,
  ADD COLUMN IF NOT EXISTS cycle_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS supersedes_cycle_id text,
  ADD COLUMN IF NOT EXISTS reissue_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preflight_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

UPDATE mwb.monitor_provision_runs
SET cycle_id = provision_id || '-CYCLE-01'
WHERE coalesce(cycle_id, '') = '';

UPDATE mwb.monitor_provision_runs
SET opened_at = coalesce(opened_at, created_at, now()),
    cycle_status = CASE
      WHEN coalesce(monitor_id, '') <> '' THEN 'resolved'
      WHEN status IN ('resolved', 'monitor_resolved', 'touchpoint_resolved', 'monitor_resolved_touchpoint_pending') THEN 'resolved'
      WHEN status IN ('terminal_failed') THEN 'stopped'
      WHEN status = 'failed' AND create_attempt_no >= 2 THEN 'stopped'
      ELSE 'active'
    END,
    closed_at = CASE
      WHEN coalesce(monitor_id, '') <> ''
        OR status IN ('resolved', 'monitor_resolved', 'touchpoint_resolved', 'monitor_resolved_touchpoint_pending', 'terminal_failed')
        OR (status = 'failed' AND create_attempt_no >= 2)
        THEN coalesce(closed_at, updated_at, now())
      ELSE closed_at
    END
WHERE true;

ALTER TABLE mwb.monitor_provision_runs
  ALTER COLUMN cycle_id SET NOT NULL;

ALTER TABLE mwb.monitor_provision_runs
  DROP CONSTRAINT IF EXISTS monitor_provision_runs_cycle_id_check;

ALTER TABLE mwb.monitor_provision_runs
  ADD CONSTRAINT monitor_provision_runs_cycle_id_check CHECK (
    cycle_id <> ''
    AND cycle_no >= 1
    AND cycle_status IN ('active', 'stopped', 'resolved', 'failed')
    AND reissue_reason !~* '(raw_request|raw_response|passport_token|x-passport-token|authorization|cookie|tf-api\.3k\.com|callback/click)'
  );

ALTER TABLE mwb.monitor_provision_runs
  DROP CONSTRAINT IF EXISTS monitor_provision_runs_pkey CASCADE;

ALTER TABLE mwb.monitor_provision_runs
  ADD CONSTRAINT monitor_provision_runs_pkey PRIMARY KEY (cycle_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_runs_provision_cycle
  ON mwb.monitor_provision_runs(provision_id, cycle_no);

DROP INDEX IF EXISTS mwb.idx_monitor_provision_runs_open_scope;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_runs_active_cycle
  ON mwb.monitor_provision_runs(provision_id)
  WHERE cycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_monitor_provision_runs_scope_cycle
  ON mwb.monitor_provision_runs(route_id, game_code, advertiser_id, cycle_no DESC, updated_at DESC);

DROP INDEX IF EXISTS mwb.idx_monitor_provision_runs_effective_fingerprint;

CREATE INDEX IF NOT EXISTS idx_monitor_provision_runs_request_fingerprint
  ON mwb.monitor_provision_runs(request_fingerprint);

ALTER TABLE mwb.monitor_provision_attempts
  ADD COLUMN IF NOT EXISTS cycle_id text,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

UPDATE mwb.monitor_provision_attempts a
SET cycle_id = r.cycle_id,
    finished_at = coalesce(a.finished_at, a.completed_at)
FROM mwb.monitor_provision_runs r
WHERE a.provision_id = r.provision_id
  AND coalesce(a.cycle_id, '') = '';

ALTER TABLE mwb.monitor_provision_attempts
  ALTER COLUMN cycle_id SET NOT NULL;

ALTER TABLE mwb.monitor_provision_attempts
  DROP CONSTRAINT IF EXISTS monitor_provision_attempts_cycle_id_fkey;

ALTER TABLE mwb.monitor_provision_attempts
  ADD CONSTRAINT monitor_provision_attempts_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES mwb.monitor_provision_runs(cycle_id) ON DELETE CASCADE;

ALTER TABLE mwb.monitor_provision_attempts
  DROP CONSTRAINT IF EXISTS monitor_provision_attempts_provision_id_fkey;

ALTER TABLE mwb.monitor_provision_attempts
  DROP CONSTRAINT IF EXISTS monitor_provision_attempts_provision_id_present_check;

ALTER TABLE mwb.monitor_provision_attempts
  ADD CONSTRAINT monitor_provision_attempts_provision_id_present_check CHECK (provision_id <> '');

DROP INDEX IF EXISTS idx_monitor_provision_attempts_provision_attempt;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_attempts_cycle_attempt
  ON mwb.monitor_provision_attempts(cycle_id, attempt_no);

CREATE INDEX IF NOT EXISTS idx_monitor_provision_attempts_cycle_latest
  ON mwb.monitor_provision_attempts(cycle_id, attempt_no DESC, created_at DESC);

DROP VIEW IF EXISTS mwb.v_monitor_provision_blocker_report;
DROP VIEW IF EXISTS mwb.v_monitor_provision_status_report;

CREATE OR REPLACE VIEW mwb.v_monitor_provision_status_report AS
WITH attempt_counts AS (
  SELECT
    cycle_id,
    count(*)::integer AS attempt_count,
    max(attempt_no) AS latest_attempt_no
  FROM mwb.monitor_provision_attempts
  GROUP BY cycle_id
),
latest_attempt AS (
  SELECT DISTINCT ON (cycle_id)
    cycle_id,
    attempt_id,
    attempt_no,
    trigger_reason,
    attempt_status,
    http_status,
    api_code,
    error_category,
    error_summary,
    request_hash,
    response_hash,
    evidence_artifact_id,
    scheduled_at,
    started_at,
    coalesce(finished_at, completed_at) AS completed_at
  FROM mwb.monitor_provision_attempts
  ORDER BY cycle_id, attempt_no DESC, coalesce(finished_at, completed_at, started_at, created_at) DESC
)
SELECT
  r.provision_id,
  r.cycle_id,
  r.cycle_no,
  r.cycle_status,
  r.supersedes_cycle_id,
  r.reissue_reason,
  r.preflight_hash,
  r.route_id,
  r.game_code,
  r.advertiser_id,
  coalesce(a.account_name, '') AS account_name,
  coalesce(a.auth_status, '') AS account_auth_status,
  r.status AS provision_status,
  r.credential_status,
  r.owner_key,
  r.owner_name,
  r.technical_account_record_id,
  r.media_account_id,
  r.agent_id,
  r.monitor_serial_id,
  r.monitor_id,
  (r.monitor_id IS NOT NULL AND r.monitor_id <> '') AS monitor_id_present,
  coalesce(t.touchpoint_ref, r.touchpoint_ref, '') AS touchpoint_ref,
  coalesce(t.status, '') AS touchpoint_status,
  coalesce(t.url_hash, r.touchpoint_url_hash, '') AS touchpoint_url_hash,
  (t.touchpoint_url IS NOT NULL AND t.touchpoint_url <> '') AS touchpoint_url_present,
  coalesce(d.raw_defaults ? 'monitor_provision', false) AS monitor_provision_present,
  coalesce(d.raw_defaults -> 'monitor_provision', '{}'::jsonb) AS monitor_provision,
  r.create_called,
  coalesce(ac.attempt_count, r.create_attempt_no, 0) AS create_attempt_no,
  coalesce(ac.attempt_count, 0) AS attempt_count,
  la.attempt_id AS latest_attempt_id,
  la.attempt_no AS latest_attempt_no,
  la.trigger_reason AS latest_attempt_trigger_reason,
  la.attempt_status AS latest_attempt_status,
  la.http_status AS latest_attempt_http_status,
  la.api_code AS latest_attempt_api_code,
  la.error_category AS latest_attempt_error_category,
  la.error_summary AS latest_attempt_error_summary,
  la.completed_at AS latest_attempt_completed_at,
  r.create_confirmed_at,
  r.create_completed_at,
  r.request_fingerprint,
  coalesce(la.request_hash, r.request_hash) AS request_hash,
  coalesce(la.response_hash, r.response_hash) AS response_hash,
  r.error_summary,
  r.evidence_artifact_id,
  coalesce(ev.content_hash, '') AS evidence_content_hash,
  r.opened_at,
  r.closed_at,
  r.updated_at
FROM mwb.monitor_provision_runs r
LEFT JOIN attempt_counts ac
  ON ac.cycle_id = r.cycle_id
LEFT JOIN latest_attempt la
  ON la.cycle_id = r.cycle_id
LEFT JOIN mwb.advertiser_accounts a
  ON a.advertiser_id = r.advertiser_id
 AND a.route_id = r.route_id
 AND a.game_code = r.game_code
LEFT JOIN mwb.account_touchpoints t
  ON t.advertiser_id = r.advertiser_id
 AND t.route_id = r.route_id
 AND t.game_code = r.game_code
 AND (
   (r.monitor_id IS NOT NULL AND r.monitor_id <> '' AND t.monitor_id = r.monitor_id)
   OR (r.monitor_id IS NULL OR r.monitor_id = '')
 )
LEFT JOIN mwb.game_route_defaults d
  ON d.route_id = r.route_id
 AND d.game_code = r.game_code
LEFT JOIN mwb.evidence_artifacts ev
  ON ev.artifact_id = coalesce(la.evidence_artifact_id, r.evidence_artifact_id);

CREATE OR REPLACE VIEW mwb.v_monitor_provision_blocker_report AS
WITH latest_attempt AS (
  SELECT DISTINCT ON (cycle_id)
    cycle_id,
    attempt_no,
    attempt_status,
    api_code,
    error_category,
    error_summary
  FROM mwb.monitor_provision_attempts
  ORDER BY cycle_id, attempt_no DESC, coalesce(finished_at, completed_at, started_at, created_at) DESC
)
SELECT
  r.provision_id,
  r.cycle_id,
  r.cycle_no,
  r.cycle_status,
  r.route_id,
  r.game_code,
  r.advertiser_id,
  r.status AS provision_status,
  r.monitor_id,
  r.create_called,
  r.create_attempt_no,
  la.attempt_no AS latest_attempt_no,
  la.attempt_status AS latest_attempt_status,
  la.api_code AS latest_attempt_api_code,
  la.error_category AS latest_attempt_error_category,
  b.blocker,
  r.updated_at
FROM mwb.monitor_provision_runs r
LEFT JOIN latest_attempt la
  ON la.cycle_id = r.cycle_id
CROSS JOIN LATERAL (
  SELECT trim(value) AS blocker
  FROM regexp_split_to_table(
    coalesce(nullif(r.error_summary, ''), nullif(la.error_summary, ''), 'none'),
    ';'
  ) AS value
) b
WHERE b.blocker <> ''
  AND b.blocker <> 'none';

COMMENT ON COLUMN mwb.monitor_provision_runs.cycle_id IS
  'Cycle-scoped primary key for one explicit Qiankun monitor creation cycle.';

COMMENT ON COLUMN mwb.monitor_provision_runs.provision_id IS
  'Stable provision scope: route_id + game_code + advertiser_id. One provision may have multiple cycles.';

COMMENT ON COLUMN mwb.monitor_provision_runs.cycle_no IS
  'Monotonic cycle number inside the same provision. Historical rows are migrated to cycle_no=1.';

COMMENT ON COLUMN mwb.monitor_provision_runs.cycle_status IS
  'Cycle lifecycle state: active, stopped, resolved, or failed.';

COMMENT ON COLUMN mwb.monitor_provision_attempts.cycle_id IS
  'The monitor creation cycle this attempt belongs to. Attempt numbers restart from 1 for each cycle.';

COMMENT ON VIEW mwb.v_monitor_provision_status_report IS
  'Redacted operational status report for Qiankun monitor provision cycles. Complete touchpoint URLs are not exposed.';

COMMENT ON VIEW mwb.v_monitor_provision_blocker_report IS
  'Redacted blocker drilldown for Qiankun monitor provision cycles and latest attempt.';

COMMIT;

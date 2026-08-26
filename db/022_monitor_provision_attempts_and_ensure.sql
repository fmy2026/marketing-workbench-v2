-- Target database: marketing_workbench_v2
-- Scope: monitor:ensure busy-retry gate, per-attempt audit table, and redacted report updates.
-- Safety: attempts never store passport tokens, request headers, raw requests/responses, or complete touchpoint URLs.

ALTER TABLE mwb.monitor_provision_runs
  DROP CONSTRAINT IF EXISTS monitor_provision_runs_create_attempt_no_check;

ALTER TABLE mwb.monitor_provision_runs
  ADD CONSTRAINT monitor_provision_runs_create_attempt_no_check
  CHECK (create_attempt_no >= 0 AND create_attempt_no <= 2);

ALTER TABLE mwb.monitor_provision_runs
  DROP CONSTRAINT IF EXISTS monitor_provision_runs_status_check;

ALTER TABLE mwb.monitor_provision_runs
  ADD CONSTRAINT monitor_provision_runs_status_check CHECK (status IN (
    'planned',
    'account_resolved',
    'monitor_resolved',
    'touchpoint_resolved',
    'resolved',
    'failed',
    'monitor_resolved_touchpoint_pending',
    'terminal_failed'
  ));

CREATE TABLE IF NOT EXISTS mwb.monitor_provision_attempts (
  attempt_id text PRIMARY KEY,
  provision_id text NOT NULL REFERENCES mwb.monitor_provision_runs(provision_id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  trigger_reason text NOT NULL,
  attempt_status text NOT NULL,
  http_status integer,
  api_code text NOT NULL DEFAULT '',
  error_category text NOT NULL DEFAULT '',
  error_summary text NOT NULL DEFAULT '',
  request_hash text,
  response_hash text,
  evidence_artifact_id text REFERENCES mwb.evidence_artifacts(artifact_id),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_provision_attempts_attempt_no_check CHECK (attempt_no IN (1, 2)),
  CONSTRAINT monitor_provision_attempts_status_check CHECK (attempt_status IN (
    'claimed',
    'started',
    'passed',
    'failed',
    'blocked'
  )),
  CONSTRAINT monitor_provision_attempts_no_raw_payload_check CHECK (
    coalesce(error_summary, '') !~* '(raw_request|raw_response|passport_token|x-passport-token|authorization|cookie|tf-api\.3k\.com|callback/click)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_attempts_provision_attempt
  ON mwb.monitor_provision_attempts(provision_id, attempt_no);

CREATE INDEX IF NOT EXISTS idx_monitor_provision_attempts_provision_latest
  ON mwb.monitor_provision_attempts(provision_id, attempt_no DESC, created_at DESC);

INSERT INTO mwb.monitor_provision_attempts (
  attempt_id,
  provision_id,
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
  completed_at,
  created_at
)
SELECT
  r.provision_id || '-ATTEMPT-01',
  r.provision_id,
  1,
  'initial_create_once',
  CASE
    WHEN coalesce(r.monitor_id, '') <> '' THEN 'passed'
    ELSE 'failed'
  END,
  NULL,
  CASE
    WHEN r.error_summary LIKE '%monitor_create_failed:500:%' THEN '500'
    ELSE ''
  END,
  CASE
    WHEN r.error_summary LIKE '%monitor_create_failed:500:%服务器繁忙%' THEN 'server_busy'
    ELSE ''
  END,
  coalesce(nullif(r.error_summary, ''), 'first_attempt_backfilled_from_monitor_provision_runs'),
  r.request_hash,
  r.response_hash,
  r.evidence_artifact_id,
  r.create_confirmed_at,
  r.create_confirmed_at,
  r.create_completed_at,
  coalesce(r.create_confirmed_at, r.updated_at, now())
FROM mwb.monitor_provision_runs r
WHERE (r.create_called = true OR r.create_attempt_no >= 1)
ON CONFLICT (provision_id, attempt_no) DO UPDATE SET
  attempt_status = EXCLUDED.attempt_status,
  api_code = EXCLUDED.api_code,
  error_category = EXCLUDED.error_category,
  error_summary = EXCLUDED.error_summary,
  request_hash = EXCLUDED.request_hash,
  response_hash = EXCLUDED.response_hash,
  evidence_artifact_id = EXCLUDED.evidence_artifact_id,
  completed_at = EXCLUDED.completed_at;

WITH counts AS (
  SELECT provision_id, count(*)::integer AS attempt_count
  FROM mwb.monitor_provision_attempts
  GROUP BY provision_id
)
UPDATE mwb.monitor_provision_runs r
SET create_called = counts.attempt_count > 0,
    create_attempt_no = greatest(r.create_attempt_no, counts.attempt_count),
    updated_at = now()
FROM counts
WHERE counts.provision_id = r.provision_id;

DROP VIEW IF EXISTS mwb.v_monitor_provision_blocker_report;
DROP VIEW IF EXISTS mwb.v_monitor_provision_status_report;

CREATE OR REPLACE VIEW mwb.v_monitor_provision_status_report AS
WITH attempt_counts AS (
  SELECT
    provision_id,
    count(*)::integer AS attempt_count,
    max(attempt_no) AS latest_attempt_no
  FROM mwb.monitor_provision_attempts
  GROUP BY provision_id
),
latest_attempt AS (
  SELECT DISTINCT ON (provision_id)
    provision_id,
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
    completed_at
  FROM mwb.monitor_provision_attempts
  ORDER BY provision_id, attempt_no DESC, coalesce(completed_at, started_at, created_at) DESC
)
SELECT
  r.provision_id,
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
  r.updated_at
FROM mwb.monitor_provision_runs r
LEFT JOIN attempt_counts ac
  ON ac.provision_id = r.provision_id
LEFT JOIN latest_attempt la
  ON la.provision_id = r.provision_id
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
  SELECT DISTINCT ON (provision_id)
    provision_id,
    attempt_no,
    attempt_status,
    api_code,
    error_category,
    error_summary
  FROM mwb.monitor_provision_attempts
  ORDER BY provision_id, attempt_no DESC, coalesce(completed_at, started_at, created_at) DESC
)
SELECT
  r.provision_id,
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
  ON la.provision_id = r.provision_id
CROSS JOIN LATERAL (
  SELECT trim(value) AS blocker
  FROM regexp_split_to_table(
    coalesce(nullif(r.error_summary, ''), nullif(la.error_summary, ''), 'none'),
    ';'
  ) AS value
) b
WHERE b.blocker <> ''
  AND b.blocker <> 'none';

COMMENT ON TABLE mwb.monitor_provision_attempts IS
  'Per-call redacted audit for Qiankun monitor serial creation attempts. Maximum two attempts per provision.';

COMMENT ON VIEW mwb.v_monitor_provision_status_report IS
  'Redacted operational status report for Qiankun monitor provision. Complete touchpoint URLs are not exposed.';

COMMENT ON VIEW mwb.v_monitor_provision_blocker_report IS
  'Redacted blocker drilldown for Qiankun monitor provision runs and latest attempt.';

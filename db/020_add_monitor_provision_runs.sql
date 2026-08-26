-- Target database: marketing_workbench_v2
-- Scope: add redacted monitor provision run records for Qiankun monitor serial bootstrap.
-- Safety: never store passport tokens, request headers, raw requests, raw responses, or complete touchpoint URLs here.

CREATE TABLE IF NOT EXISTS mwb.monitor_provision_runs (
  provision_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  advertiser_id text NOT NULL,
  status text NOT NULL,
  request_fingerprint text NOT NULL,
  technical_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_key text NOT NULL DEFAULT '',
  owner_name text NOT NULL DEFAULT '',
  credential_status text NOT NULL DEFAULT 'missing',
  credential_updated_at timestamptz,
  credential_expires_at timestamptz,
  technical_account_record_id text,
  media_account_id text,
  agent_id text,
  monitor_serial_id text,
  monitor_id text,
  touchpoint_ref text,
  touchpoint_url_hash text,
  request_hash text,
  response_hash text,
  error_summary text NOT NULL DEFAULT '',
  evidence_artifact_id text REFERENCES mwb.evidence_artifacts(artifact_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_provision_runs_status_check CHECK (status IN (
    'planned',
    'account_resolved',
    'monitor_resolved',
    'touchpoint_resolved',
    'resolved',
    'failed'
  )),
  CONSTRAINT monitor_provision_runs_credential_status_check CHECK (credential_status IN (
    'active',
    'expired',
    'missing',
    'mismatch'
  )),
  CONSTRAINT monitor_provision_runs_ids_are_strings_check CHECK (
    advertiser_id <> ''
    AND request_fingerprint <> ''
    AND jsonb_typeof(technical_config) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_runs_effective_fingerprint
  ON mwb.monitor_provision_runs(request_fingerprint)
  WHERE status <> 'failed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_provision_runs_open_scope
  ON mwb.monitor_provision_runs(route_id, game_code, advertiser_id)
  WHERE status IN ('planned', 'account_resolved', 'monitor_resolved', 'touchpoint_resolved');

CREATE INDEX IF NOT EXISTS idx_monitor_provision_runs_scope
  ON mwb.monitor_provision_runs(route_id, game_code, advertiser_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_provision_runs_monitor_id
  ON mwb.monitor_provision_runs(monitor_id)
  WHERE monitor_id IS NOT NULL AND monitor_id <> '';

COMMENT ON TABLE mwb.monitor_provision_runs IS
  'Redacted Qiankun monitor serial provision attempts. Tokens, headers, raw requests/responses, and complete touchpoint URLs are forbidden.';

COMMENT ON COLUMN mwb.monitor_provision_runs.technical_config IS
  'Redacted monitor_provision fixed config snapshot from mwb.game_route_defaults.raw_defaults.monitor_provision.';

COMMENT ON COLUMN mwb.monitor_provision_runs.touchpoint_url_hash IS
  'Hash only. Complete touchpoint URLs may only live in controlled account_touchpoints.touchpoint_url storage.';

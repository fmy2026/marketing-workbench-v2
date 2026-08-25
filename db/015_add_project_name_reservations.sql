-- Target database: marketing_workbench_v2
-- Scope: durable, database-level std_project name occupancy. No platform API calls.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.project_name_reservations (
  reservation_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id) ON DELETE CASCADE,
  draft_id text NOT NULL,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  advertiser_id text NOT NULL REFERENCES mwb.advertiser_accounts(advertiser_id),
  object_type text NOT NULL,
  name_prefix text NOT NULL,
  yyyymmdd text NOT NULL,
  project_seq integer NOT NULL,
  project_name text NOT NULL,
  reservation_status text NOT NULL DEFAULT 'reserved',
  source_usage text NOT NULL DEFAULT 'runtime_truth',
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  released_at timestamptz,
  CONSTRAINT project_name_reservations_sequence_positive CHECK (project_seq > 0),
  CONSTRAINT project_name_reservations_date_format CHECK (yyyymmdd ~ '^[0-9]{8}$'),
  CONSTRAINT project_name_reservations_status_check CHECK (reservation_status IN ('reserved', 'consumed', 'released')),
  CONSTRAINT project_name_reservations_source_usage_check CHECK (source_usage IN ('runtime_truth', 'reference_only', 'seed_source', 'private_runtime', 'test_run')),
  CONSTRAINT project_name_reservations_job_unique UNIQUE (job_id),
  CONSTRAINT project_name_reservations_scope_sequence_unique UNIQUE (
    route_id, game_code, advertiser_id, object_type, name_prefix, yyyymmdd, project_seq, source_usage
  ),
  CONSTRAINT project_name_reservations_scope_name_unique UNIQUE (
    route_id, game_code, advertiser_id, object_type, project_name, source_usage
  )
);

CREATE INDEX IF NOT EXISTS idx_project_name_reservations_runtime_scope
  ON mwb.project_name_reservations(route_id, game_code, advertiser_id, object_type, name_prefix, yyyymmdd, project_seq)
  WHERE source_usage = 'runtime_truth';

COMMENT ON TABLE mwb.project_name_reservations IS
  'Database-level std_project naming occupancy. runtime_truth rows are durable; test_run rows are isolated and cascade-cleaned.';

INSERT INTO mwb.project_name_reservations (
  reservation_id, job_id, draft_id, route_id, game_code, advertiser_id,
  object_type, name_prefix, yyyymmdd, project_seq, project_name,
  reservation_status, source_usage, created_at, consumed_at
)
SELECT
  'PNR-' || j.job_id,
  j.job_id,
  d.draft_id,
  j.route_id,
  j.game_code,
  j.advertiser_id,
  d.object_type,
  regexp_replace(d.project_name, '_P[0-9]+_[0-9]{8}$', ''),
  substring(d.project_name FROM '([0-9]{8})$'),
  (substring(d.project_name FROM '_P([0-9]+)_[0-9]{8}$'))::integer,
  d.project_name,
  'consumed',
  j.source_usage,
  d.created_at,
  d.created_at
FROM mwb.launch_drafts d
JOIN mwb.launch_jobs j ON j.job_id = d.job_id
WHERE j.source_usage IN ('runtime_truth', 'test_run')
  AND d.project_name ~ '_P[0-9]+_[0-9]{8}$'
ON CONFLICT DO NOTHING;

COMMIT;

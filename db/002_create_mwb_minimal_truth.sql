-- Target database: marketing_workbench_v2
-- Scope: create the mwb schema and first-version minimal truth tables.

CREATE SCHEMA IF NOT EXISTS mwb;

CREATE TABLE IF NOT EXISTS mwb.platform_routes (
  route_id text PRIMARY KEY,
  platform text NOT NULL,
  marketing_product text NOT NULL,
  route_name text NOT NULL,
  version text NOT NULL,
  object_type text NOT NULL,
  write_policy text NOT NULL,
  status text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.games (
  game_code text PRIMARY KEY,
  game_name text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  brand_name text NOT NULL,
  status text NOT NULL,
  product_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.advertiser_accounts (
  advertiser_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  account_name text NOT NULL,
  platform text NOT NULL,
  auth_status text NOT NULL,
  platform_status text NOT NULL,
  owner_name text NOT NULL,
  monitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.account_touchpoints (
  touchpoint_id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES mwb.advertiser_accounts(advertiser_id),
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  monitor_id text NOT NULL,
  touchpoint_ref text NOT NULL,
  url_hash text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.game_route_defaults (
  id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  objective text NOT NULL,
  deep_objective text NOT NULL,
  deep_bid_type text NOT NULL,
  budget numeric(14,2) NOT NULL,
  bid numeric(14,2) NOT NULL,
  roi_goal numeric(10,4) NOT NULL,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  targeting_summary text NOT NULL,
  dmp_summary text NOT NULL,
  raw_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, game_code)
);

CREATE TABLE IF NOT EXISTS mwb.game_assets (
  asset_id text PRIMARY KEY,
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  asset_type text NOT NULL,
  asset_name text NOT NULL,
  asset_ref text NOT NULL,
  asset_hash text,
  visibility_status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.material_packs (
  pack_id text PRIMARY KEY,
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  pack_name text NOT NULL,
  pack_type text NOT NULL,
  status text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.material_pack_items (
  item_id text PRIMARY KEY,
  pack_id text NOT NULL REFERENCES mwb.material_packs(pack_id),
  asset_id text NOT NULL REFERENCES mwb.game_assets(asset_id),
  item_type text NOT NULL,
  asset_ref text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.launch_jobs (
  job_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  advertiser_id text NOT NULL REFERENCES mwb.advertiser_accounts(advertiser_id),
  object_type text NOT NULL,
  job_status text NOT NULL,
  current_node text NOT NULL,
  source_record_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.launch_node_runs (
  node_run_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  node_key text NOT NULL,
  node_name text NOT NULL,
  phase text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  diagnostic_level text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (job_id, node_key)
);

CREATE TABLE IF NOT EXISTS mwb.launch_drafts (
  draft_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  object_type text NOT NULL,
  project_name text NOT NULL,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  duplicate_status text NOT NULL,
  write_policy text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.readback_records (
  readback_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  object_type text NOT NULL,
  object_id text NOT NULL,
  object_name text NOT NULL,
  readback_status text NOT NULL,
  field_diff_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mwb.evidence_artifacts (
  artifact_id text PRIMARY KEY,
  job_id text REFERENCES mwb.launch_jobs(job_id),
  artifact_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  content_hash text NOT NULL,
  storage_ref text NOT NULL,
  source_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advertiser_accounts_route_game
  ON mwb.advertiser_accounts(route_id, game_code);

CREATE INDEX IF NOT EXISTS idx_account_touchpoints_account
  ON mwb.account_touchpoints(advertiser_id, monitor_id);

CREATE INDEX IF NOT EXISTS idx_game_assets_game
  ON mwb.game_assets(game_code, asset_type);

CREATE INDEX IF NOT EXISTS idx_launch_node_runs_job
  ON mwb.launch_node_runs(job_id, phase);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_job
  ON mwb.evidence_artifacts(job_id, artifact_type);

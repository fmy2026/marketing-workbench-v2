-- Target database: marketing_workbench_v2
-- Scope: controlled OE3 mini-game launch links by route + game.
-- Safety: launch_url is a controlled value; public summaries expose only hash,
-- presence, status, and refs. No token, Cookie, raw request, or raw response.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.game_route_launch_links (
  link_ref text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  platform_app_id text NOT NULL REFERENCES mwb.game_platform_apps(id),
  app_id text NOT NULL,
  launch_url text NOT NULL,
  url_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source_usage text NOT NULL DEFAULT 'private_runtime',
  source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_route_launch_links_app_id_shape CHECK (app_id ~ '^tt[A-Za-z0-9]+$'),
  CONSTRAINT game_route_launch_links_url_scheme CHECK (launch_url ~ '^sslocal://microgame'),
  CONSTRAINT game_route_launch_links_hash_shape CHECK (url_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT game_route_launch_links_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT game_route_launch_links_source_usage_check CHECK (source_usage IN ('runtime_truth', 'reference_only', 'seed_source', 'private_runtime', 'test_run')),
  CONSTRAINT game_route_launch_links_source_summary_shape CHECK (jsonb_typeof(source_summary) = 'object'),
  CONSTRAINT game_route_launch_links_metadata_shape CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT game_route_launch_links_no_sensitive_metadata CHECK (
    (source_summary::text || metadata::text) !~* '(sslocal://|https?://|raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|secret|auth_code)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_route_launch_links_route_game
  ON mwb.game_route_launch_links(route_id, game_code);

CREATE INDEX IF NOT EXISTS idx_game_route_launch_links_platform_app
  ON mwb.game_route_launch_links(platform_app_id, app_id, status);

COMMENT ON TABLE mwb.game_route_launch_links IS
  'Controlled mini-game launch deep links keyed by route + game. launch_url is only read by final payload/create code; public summaries expose hash and presence only.';

COMMIT;

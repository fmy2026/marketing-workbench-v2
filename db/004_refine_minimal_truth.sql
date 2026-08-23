-- Target database: marketing_workbench_v2
-- Scope: refine minimal truth schema for app identity, account resources,
-- and source usage semantics. Does not touch legacy databases or platforms.

CREATE TABLE IF NOT EXISTS mwb.game_platform_apps (
  id text PRIMARY KEY,
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  platform text NOT NULL,
  app_type text NOT NULL,
  app_id text NOT NULL,
  app_name text NOT NULL,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_code, platform, app_type)
);

CREATE TABLE IF NOT EXISTS mwb.account_resources (
  resource_id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES mwb.advertiser_accounts(advertiser_id),
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  resource_type text NOT NULL,
  resource_name text NOT NULL,
  platform_resource_id text,
  source_asset_id text,
  visibility_status text NOT NULL,
  readback_status text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mwb.evidence_artifacts
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

ALTER TABLE mwb.game_assets
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

ALTER TABLE mwb.material_packs
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

ALTER TABLE mwb.material_pack_items
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

ALTER TABLE mwb.game_route_defaults
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

ALTER TABLE mwb.launch_jobs
  ADD COLUMN IF NOT EXISTS source_usage text NOT NULL DEFAULT 'seed_source';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_platform_apps_status_check'
      AND conrelid = 'mwb.game_platform_apps'::regclass
  ) THEN
    ALTER TABLE mwb.game_platform_apps
      ADD CONSTRAINT game_platform_apps_status_check
      CHECK (status IN ('active', 'inactive', 'deprecated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_resources_resource_type_check'
      AND conrelid = 'mwb.account_resources'::regclass
  ) THEN
    ALTER TABLE mwb.account_resources
      ADD CONSTRAINT account_resources_resource_type_check
      CHECK (resource_type IN (
        'avatar',
        'dmp_audience_package',
        'event_asset',
        'video_asset',
        'product_image',
        'brand_info',
        'micro_app_instance'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_resources_visibility_status_check'
      AND conrelid = 'mwb.account_resources'::regclass
  ) THEN
    ALTER TABLE mwb.account_resources
      ADD CONSTRAINT account_resources_visibility_status_check
      CHECK (visibility_status IN (
        'visible',
        'not_visible',
        'pending',
        'needs_confirmation',
        'not_required'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_resources_readback_status_check'
      AND conrelid = 'mwb.account_resources'::regclass
  ) THEN
    ALTER TABLE mwb.account_resources
      ADD CONSTRAINT account_resources_readback_status_check
      CHECK (readback_status IN (
        'readback_verified',
        'pending',
        'needs_confirmation',
        'not_checked',
        'not_required'
      ));
  END IF;
END
$$;

DO $$
DECLARE
  target_table text;
  constraint_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'evidence_artifacts',
    'game_assets',
    'material_packs',
    'material_pack_items',
    'game_route_defaults',
    'launch_jobs'
  ]
  LOOP
    constraint_name := target_table || '_source_usage_check';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = ('mwb.' || target_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE mwb.%I ADD CONSTRAINT %I CHECK (source_usage IN (''runtime_truth'', ''reference_only'', ''seed_source'', ''private_runtime''))',
        target_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_game_platform_apps_lookup
  ON mwb.game_platform_apps(game_code, platform, app_type);

CREATE INDEX IF NOT EXISTS idx_account_resources_lookup
  ON mwb.account_resources(advertiser_id, route_id, game_code, resource_type);

CREATE INDEX IF NOT EXISTS idx_account_resources_visibility
  ON mwb.account_resources(visibility_status, readback_status);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_source_usage
  ON mwb.evidence_artifacts(source_usage);

CREATE INDEX IF NOT EXISTS idx_game_assets_source_usage
  ON mwb.game_assets(source_usage);

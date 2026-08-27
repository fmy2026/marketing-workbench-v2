-- Target database: marketing_workbench_v2
-- Scope: JSZC DMP baseline package-set truth and source/target readonly planning.
-- Safety: stores platform IDs, status, hashes, and redacted metadata only. No token, Cookie, raw request, or raw response.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.dmp_package_sets (
  package_set_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  set_name text NOT NULL,
  semantic_key text NOT NULL,
  payload_field text NOT NULL,
  source_advertiser_id text NOT NULL,
  status text NOT NULL DEFAULT 'reference_candidate',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_usage text NOT NULL DEFAULT 'reference_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dmp_package_sets_status_check CHECK (status IN (
    'reference_candidate',
    'source_readonly_verified',
    'target_readonly_verified',
    'push_plan_pending',
    'blocked'
  )),
  CONSTRAINT dmp_package_sets_metadata_shape_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT dmp_package_sets_no_sensitive_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|tf-api\\.3k\\.com|callback/click|landing_url)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dmp_package_sets_scope
  ON mwb.dmp_package_sets(route_id, game_code, semantic_key);

CREATE TABLE IF NOT EXISTS mwb.dmp_package_members (
  member_id text PRIMARY KEY,
  package_set_id text NOT NULL REFERENCES mwb.dmp_package_sets(package_set_id) ON DELETE CASCADE,
  custom_audience_id text NOT NULL,
  member_role text NOT NULL DEFAULT 'exclude',
  reference_status text NOT NULL DEFAULT 'reference_candidate',
  source_readonly_status text NOT NULL DEFAULT 'not_checked',
  target_readonly_status text NOT NULL DEFAULT 'not_checked',
  source_evidence_ref text NOT NULL DEFAULT '',
  target_evidence_ref text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_usage text NOT NULL DEFAULT 'reference_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dmp_package_members_id_numeric_check CHECK (custom_audience_id ~ '^[0-9]+$'),
  CONSTRAINT dmp_package_members_role_check CHECK (member_role IN ('exclude', 'include')),
  CONSTRAINT dmp_package_members_reference_status_check CHECK (reference_status IN (
    'reference_candidate',
    'source_verified',
    'target_verified',
    'rejected'
  )),
  CONSTRAINT dmp_package_members_readonly_status_check CHECK (
    source_readonly_status IN ('not_checked', 'passed', 'missing', 'blocked', 'credential_required', 'readonly_permission_required', 'transport_failed')
    AND target_readonly_status IN ('not_checked', 'passed', 'missing', 'blocked', 'credential_required', 'readonly_permission_required', 'transport_failed')
  ),
  CONSTRAINT dmp_package_members_metadata_shape_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT dmp_package_members_no_sensitive_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|tf-api\\.3k\\.com|callback/click|landing_url)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dmp_package_members_set_audience
  ON mwb.dmp_package_members(package_set_id, custom_audience_id);

CREATE TABLE IF NOT EXISTS mwb.dmp_package_push_plans (
  push_plan_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id) ON DELETE CASCADE,
  package_set_id text NOT NULL REFERENCES mwb.dmp_package_sets(package_set_id),
  custom_audience_id text NOT NULL,
  source_advertiser_id text NOT NULL,
  target_advertiser_id text NOT NULL,
  action_type text NOT NULL DEFAULT 'ensure_resource:dmp_audience_package',
  endpoint text NOT NULL,
  plan_status text NOT NULL DEFAULT 'planned',
  request_hash text NOT NULL,
  request_field_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ref text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dmp_package_push_plans_status_check CHECK (plan_status IN (
    'planned',
    'not_needed',
    'blocked',
    'executed',
    'verified',
    'failed'
  )),
  CONSTRAINT dmp_package_push_plans_id_numeric_check CHECK (custom_audience_id ~ '^[0-9]+$'),
  CONSTRAINT dmp_package_push_plans_metadata_shape_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT dmp_package_push_plans_no_sensitive_text_check CHECK (
    request_field_manifest::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie)'
    AND metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|tf-api\\.3k\\.com|callback/click|landing_url)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dmp_package_push_plans_job_audience
  ON mwb.dmp_package_push_plans(job_id, package_set_id, custom_audience_id);

INSERT INTO mwb.dmp_package_sets (
  package_set_id,
  route_id,
  game_code,
  set_name,
  semantic_key,
  payload_field,
  source_advertiser_id,
  status,
  metadata,
  source_usage,
  created_at,
  updated_at
) VALUES (
  'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  'JSZC 六个月转化排除保底人群包',
  'converted_exclude_tags',
  'audience.retargeting_tags_exclude',
  '1871922153496588',
  'reference_candidate',
  jsonb_build_object(
    'reference_source', 'historical_compile_json_reference_only',
    'member_count_expected', 10,
    'target_selection_policy', 'exact_package_member_only',
    'payload_policy', 'target_readonly_verified_ids_only'
  ),
  'reference_only',
  now(),
  now()
)
ON CONFLICT (package_set_id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  set_name = EXCLUDED.set_name,
  semantic_key = EXCLUDED.semantic_key,
  payload_field = EXCLUDED.payload_field,
  source_advertiser_id = EXCLUDED.source_advertiser_id,
  metadata = mwb.dmp_package_sets.metadata || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO mwb.dmp_package_members (
  member_id,
  package_set_id,
  custom_audience_id,
  member_role,
  reference_status,
  metadata,
  source_usage,
  created_at,
  updated_at
)
SELECT
  'DMPM-JSZC-CONVERTED-EXCLUDE-' || candidate_id,
  'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001',
  candidate_id,
  'exclude',
  'reference_candidate',
  jsonb_build_object(
    'reference_status', 'reference_candidate',
    'runtime_payload_allowed', false,
    'requires_source_readonly', true,
    'requires_target_readonly', true
  ),
  'reference_only',
  now(),
  now()
FROM unnest(ARRAY[
  '482709313',
  '479197805',
  '477503385',
  '477464681',
  '477250343',
  '476398053',
  '472360629',
  '470051114',
  '465498363',
  '467421696'
]::text[]) AS candidate_id
ON CONFLICT (package_set_id, custom_audience_id) DO UPDATE SET
  reference_status = EXCLUDED.reference_status,
  metadata = mwb.dmp_package_members.metadata || EXCLUDED.metadata,
  updated_at = now();

UPDATE mwb.game_route_resource_blueprints
SET source_advertiser_id = '1871922153496588',
    source_asset_id = 'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001',
    metadata = metadata || jsonb_build_object(
      'package_set_id', 'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001',
      'semantic_key', 'converted_exclude_tags',
      'payload_field', 'audience.retargeting_tags_exclude',
      'source_advertiser_id', '1871922153496588',
      'selection_policy', 'source_target_exact_member_readonly_then_push_plan'
    ),
    updated_at = now()
WHERE blueprint_id = 'BRP-JSZC-OE3-DMP';

COMMENT ON TABLE mwb.dmp_package_sets IS
  'Game-route DMP baseline package sets. Members are reference candidates until source and target readonly checks verify them.';

COMMENT ON TABLE mwb.dmp_package_members IS
  'DMP baseline member candidates and per-account readonly status. IDs are not payload truth until target_readonly_status=passed.';

COMMENT ON TABLE mwb.dmp_package_push_plans IS
  'Per-job, per-package DMP push plan rows. These are plans only, not platform action audit rows.';

COMMIT;

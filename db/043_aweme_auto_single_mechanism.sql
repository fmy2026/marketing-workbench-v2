-- Target database: marketing_workbench_v2
-- Scope: collapse aweme_id handling to one automatic game-default plus advertiser readonly verification mechanism.
-- Safety: stores only the game default ID in game_route_defaults and sanitized per-account verification state.

BEGIN;

ALTER TABLE mwb.advertiser_accounts
  DROP CONSTRAINT IF EXISTS advertiser_accounts_aweme_authorization_shape_check,
  DROP CONSTRAINT IF EXISTS advertiser_accounts_aweme_authorization_no_sensitive_check;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  raw_defaults,
  '{aweme_id_baseline}',
  jsonb_build_object(
    'version', '2026-08-29.oe3-aweme-id-baseline-v3',
    'required_when', jsonb_build_object('native_type', 'AWEME'),
    'payload_path', 'aweme_id',
    'source', 'tools/aweme_auth_list',
    'auth_type', 'AWEME_ACCOUNT',
    'accepted_auth_status', jsonb_build_array('AUTHRIZED', 'AUTHORIZED'),
    'verification_strategy', 'fixed_game_default_account_verify',
    'default_aweme_id', '57018827026',
    'default_aweme_id_hash', 'sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d',
    'fallback_forbidden', true,
    'official_reference', jsonb_build_object(
      'create_field', 'open.oceanengine.com-3.0-waibugei/创建标准项目.md',
      'auth_list', 'open.oceanengine.com-3.0/08-工具.md'
    ),
    'contract_version', '2026-08-29.aweme-id-fixed-default-account-verify-v2',
    'rule_hash', 'sha256:78150e5837ec28cfa3a347e30d17a7f3c0a33fbe22a9528fb34d83489bedb46d'
  ),
  true
)
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

UPDATE mwb.advertiser_accounts
SET aweme_authorization = '{}'::jsonb,
    updated_at = now()
WHERE aweme_authorization ?| array[
  'selection_status',
  'selection_policy',
  'selected_aweme_id',
  'selected_aweme_id_hash',
  'selected_display_name_summary',
  'selection_source',
  'selected_at',
  'active_candidates',
  'active_candidate_count',
  'default_aweme_authorized',
  'default_aweme_candidate_seen'
];

ALTER TABLE mwb.advertiser_accounts
  ADD CONSTRAINT advertiser_accounts_aweme_authorization_shape_check CHECK (
    jsonb_typeof(aweme_authorization) = 'object'
    AND NOT (aweme_authorization ?| array[
      'selection_status',
      'selection_policy',
      'selected_aweme_id',
      'selected_aweme_id_hash',
      'selected_display_name_summary',
      'selection_source',
      'selected_at',
      'active_candidates',
      'active_candidate_count',
      'default_aweme_authorized',
      'default_aweme_candidate_seen'
    ])
    AND (
      NOT (aweme_authorization ? 'verification_status')
      OR aweme_authorization->>'verification_status' IN (
        'authorized',
        'not_authorized',
        'inactive',
        'scope_mismatch',
        'default_mismatch',
        'probe_failed',
        'baseline_incomplete',
        'not_verified'
      )
    )
  );

ALTER TABLE mwb.advertiser_accounts
  ADD CONSTRAINT advertiser_accounts_aweme_authorization_no_sensitive_check CHECK (
    aweme_authorization::text !~* '(access[_-]?token|refresh[_-]?token|cookie|auth[_-]?code|app[_-]?secret|raw[_-]?(request|response|payload)|callback/|https?://)'
  );

COMMENT ON COLUMN mwb.advertiser_accounts.aweme_authorization IS
  'Advertiser-level readonly verification result for the game-route default aweme_id. Stores scope, verification status, default ID hash, job, timestamps, response hash, evidence ref and blocker only.';

DROP VIEW IF EXISTS mwb.v_advertiser_aweme_authorization_readiness;

CREATE OR REPLACE VIEW mwb.v_advertiser_aweme_authorization_readiness AS
WITH base AS (
  SELECT
    a.advertiser_id,
    a.route_id,
    a.game_code,
    coalesce(d.raw_defaults->'aweme_id_baseline', '{}'::jsonb) AS baseline,
    coalesce(d.raw_defaults->'payload_defaults'->'project'->>'native_type', '') AS native_type,
    coalesce(a.aweme_authorization, '{}'::jsonb) AS authorization
  FROM mwb.advertiser_accounts a
  LEFT JOIN mwb.game_route_defaults d
    ON d.route_id = a.route_id
   AND d.game_code = a.game_code
),
eval AS (
  SELECT
    b.*,
    (
      b.native_type = 'AWEME'
      OR b.native_type = coalesce(b.baseline->'required_when'->>'native_type', '')
    ) AS required,
    coalesce(b.baseline->>'default_aweme_id', '') ~ '^[0-9]+$'
      AND coalesce(b.baseline->>'default_aweme_id_hash', '') ~ '^sha256:[a-f0-9]{64}$'
      AND coalesce(b.baseline->>'source', '') = 'tools/aweme_auth_list'
      AND coalesce(b.baseline->>'fallback_forbidden', '') = 'true' AS configured,
    coalesce(b.baseline->>'default_aweme_id_hash', '') AS default_aweme_id_hash,
    coalesce(b.authorization->>'verification_status', 'not_verified') AS verification_status,
    coalesce(b.authorization->>'verified_at', '') AS verified_at,
    coalesce(b.authorization->>'expires_at', '') AS expires_at,
    coalesce(b.authorization->>'response_hash', '') AS response_hash,
    coalesce(b.authorization->>'evidence_artifact_id', '') AS evidence_ref,
    coalesce(b.authorization->>'blocker_code', '') AS stored_blocker_code,
    coalesce(b.authorization->>'default_aweme_id_hash', '') AS verified_default_hash,
    coalesce(b.authorization->>'verified_by_job_id', '') AS verified_by_job_id,
    coalesce(b.authorization->>'advertiser_id', '') AS verified_advertiser_id,
    coalesce(b.authorization->>'route_id', '') AS verified_route_id,
    coalesce(b.authorization->>'game_code', '') AS verified_game_code
  FROM base b
)
SELECT
  e.advertiser_id,
  e.route_id,
  e.game_code,
  e.required,
  e.configured,
  e.verification_status,
  CASE
    WHEN NOT (e.baseline ? 'required_when') THEN false
    WHEN NOT e.required THEN true
    WHEN NOT e.configured THEN false
    WHEN e.verification_status <> 'authorized' THEN false
    WHEN e.verified_default_hash <> e.default_aweme_id_hash THEN false
    WHEN e.verified_advertiser_id <> e.advertiser_id THEN false
    WHEN e.verified_route_id <> e.route_id THEN false
    WHEN e.verified_game_code <> e.game_code THEN false
    WHEN e.verified_by_job_id = '' THEN false
    ELSE true
  END AS ready,
  CASE
    WHEN NOT (e.baseline ? 'required_when') THEN 'aweme_id_baseline_missing'
    WHEN NOT e.required THEN ''
    WHEN NOT e.configured THEN 'aweme_default_aweme_id_missing_or_invalid'
    WHEN e.verification_status = 'authorized' AND e.verified_default_hash <> e.default_aweme_id_hash THEN 'aweme_default_hash_mismatch'
    WHEN e.verification_status = 'authorized' AND (e.verified_advertiser_id <> e.advertiser_id OR e.verified_route_id <> e.route_id OR e.verified_game_code <> e.game_code) THEN 'aweme_auth_account_scope_mismatch'
    WHEN e.verification_status = 'authorized' AND e.verified_by_job_id = '' THEN 'aweme_auth_job_scope_missing'
    WHEN e.verification_status = 'not_authorized' THEN 'aweme_default_not_authorized'
    WHEN e.verification_status = 'inactive' THEN 'aweme_default_authorization_inactive'
    WHEN e.verification_status = 'scope_mismatch' THEN 'aweme_auth_account_scope_mismatch'
    WHEN e.verification_status = 'default_mismatch' THEN 'aweme_default_not_returned'
    WHEN e.verification_status = 'probe_failed' THEN 'aweme_auth_probe_failed'
    WHEN e.verification_status = 'baseline_incomplete' THEN 'aweme_id_baseline_missing_or_incomplete'
    WHEN e.stored_blocker_code <> '' THEN e.stored_blocker_code
    ELSE 'aweme_auth_not_verified'
  END AS blocker_code,
  CASE
    WHEN NOT (e.baseline ? 'required_when') THEN 'record_game_route_aweme_baseline'
    WHEN NOT e.required THEN 'not_required_for_current_native_type'
    WHEN NOT e.configured THEN 'record_game_route_default_aweme_id'
    WHEN e.verification_status = 'authorized'
      AND e.verified_default_hash = e.default_aweme_id_hash
      AND e.verified_advertiser_id = e.advertiser_id
      AND e.verified_route_id = e.route_id
      AND e.verified_game_code = e.game_code
      AND e.verified_by_job_id <> '' THEN 'ready_for_node5_payload_build'
    WHEN e.verification_status = 'not_authorized' THEN 'authorize_default_aweme_id_for_advertiser_then_rerun_node4'
    WHEN e.verification_status = 'inactive' THEN 'restore_default_aweme_id_authorization_then_rerun_node4'
    WHEN e.verification_status = 'scope_mismatch' THEN 'check_advertiser_scope_and_default_aweme_authorization_then_rerun_node4'
    WHEN e.verification_status = 'default_mismatch' THEN 'verify_platform_auth_query_filters_then_rerun_node4'
    WHEN e.verification_status = 'probe_failed' THEN 'fix_readonly_query_or_credentials_then_rerun_node4'
    ELSE 'run_node4_aweme_authorization_readonly_for_default_aweme'
  END AS next_action,
  e.default_aweme_id_hash,
  e.verified_at,
  e.expires_at,
  e.evidence_ref
FROM eval e;

COMMIT;

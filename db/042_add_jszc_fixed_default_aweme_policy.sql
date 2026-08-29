-- Target database: marketing_workbench_v2
-- Scope: set JSZC oceanengine_3_byte_mini_game aweme_id to a fixed game-route default.
-- Safety: stores the game default platform ID as a string in game_route_defaults and per-account sanitized verification state only.

BEGIN;

ALTER TABLE mwb.advertiser_accounts
  DROP CONSTRAINT IF EXISTS advertiser_accounts_aweme_authorization_shape_check;

ALTER TABLE mwb.advertiser_accounts
  ADD CONSTRAINT advertiser_accounts_aweme_authorization_shape_check CHECK (
    jsonb_typeof(aweme_authorization) = 'object'
    AND (
      NOT (aweme_authorization ? 'selection_status')
      OR aweme_authorization->>'selection_status' IN (
        'auto_selected',
        'manual_selected',
        'selection_required',
        'selected_inactive',
        'no_active_authorization',
        'probe_failed',
        'default_authorized',
        'default_not_authorized',
        'default_inactive',
        'default_scope_mismatch'
      )
    )
    AND (
      NOT (aweme_authorization ? 'selected_aweme_id')
      OR aweme_authorization->>'selected_aweme_id' = ''
      OR (
        aweme_authorization->>'selected_aweme_id' ~ '^[0-9]+$'
        AND aweme_authorization->>'selected_aweme_id' !~* '^(https?://|web\.business\.image/)'
      )
    )
    AND (
      NOT (aweme_authorization ? 'active_candidates')
      OR jsonb_typeof(aweme_authorization->'active_candidates') = 'array'
    )
  );

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  raw_defaults,
  '{aweme_id_baseline}',
  jsonb_build_object(
    'version', '2026-08-29.oe3-aweme-id-baseline-v2',
    'required_when', jsonb_build_object('native_type', 'AWEME'),
    'payload_path', 'aweme_id',
    'source', 'tools/aweme_auth_list',
    'auth_type', 'AWEME_ACCOUNT',
    'accepted_auth_status', jsonb_build_array('AUTHRIZED', 'AUTHORIZED'),
    'selection_policy', 'fixed_game_default_account_verify',
    'default_aweme_id', '57018827026',
    'default_aweme_id_hash', 'sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d',
    'fallback_forbidden', true,
    'official_reference', jsonb_build_object(
      'create_field', 'open.oceanengine.com-3.0-waibugei/创建标准项目.md',
      'auth_list', 'open.oceanengine.com-3.0/08-工具.md'
    ),
    'contract_version', '2026-08-29.aweme-id-fixed-default-account-verify-v1',
    'rule_hash', 'sha256:8ce524a2c0dc04cce0b491b3492a6a36730baf254041979fd2f1d9ea9b7c6923'
  ),
  true
)
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

CREATE OR REPLACE VIEW mwb.v_advertiser_aweme_authorization_readiness AS
WITH base AS (
  SELECT
    a.advertiser_id,
    a.route_id,
    a.game_code,
    coalesce(d.raw_defaults->'aweme_id_baseline', '{}'::jsonb) AS aweme_id_baseline,
    coalesce(d.raw_defaults->'payload_defaults'->'project'->>'native_type', '') AS native_type,
    coalesce(a.aweme_authorization, '{}'::jsonb) AS aweme_authorization
  FROM mwb.advertiser_accounts a
  LEFT JOIN mwb.game_route_defaults d
    ON d.route_id = a.route_id
   AND d.game_code = a.game_code
),
eval AS (
  SELECT
    b.*,
    coalesce(b.aweme_id_baseline->>'selection_policy', '') AS selection_policy,
    b.aweme_id_baseline->>'selection_policy' = 'fixed_game_default_account_verify' AS fixed_default_policy,
    coalesce(b.aweme_id_baseline->>'default_aweme_id_hash', '') AS default_aweme_id_hash,
    coalesce(b.aweme_id_baseline->>'default_aweme_id', '') ~ '^[0-9]+$' AS default_aweme_id_configured,
    coalesce(b.aweme_authorization->>'selection_status', 'not_verified') AS selection_status,
    coalesce(jsonb_array_length(coalesce(b.aweme_authorization->'active_candidates', '[]'::jsonb)), 0) AS active_candidate_count,
    b.aweme_authorization ? 'selected_aweme_id'
      AND coalesce(b.aweme_authorization->>'selected_aweme_id', '') <> '' AS selected_aweme_id_present,
    coalesce(b.aweme_authorization->>'selected_aweme_id_hash', '') AS selected_aweme_id_hash,
    coalesce(b.aweme_authorization->>'verified_at', '') AS verified_at,
    coalesce(b.aweme_authorization->>'expires_at', '') AS expires_at,
    coalesce(b.aweme_authorization->>'response_hash', '') AS response_hash,
    coalesce(b.aweme_authorization->>'evidence_artifact_id', '') AS evidence_artifact_id,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(b.aweme_authorization->'active_candidates', '[]'::jsonb)) candidate
      WHERE candidate->>'aweme_id' = b.aweme_authorization->>'selected_aweme_id'
    ) AS selected_in_active_candidates
  FROM base b
)
SELECT
  e.advertiser_id,
  e.route_id,
  e.game_code,
  e.aweme_id_baseline,
  e.selection_status,
  e.active_candidate_count,
  e.selected_aweme_id_present,
  e.selected_aweme_id_hash,
  e.verified_at,
  e.expires_at,
  e.response_hash,
  e.evidence_artifact_id,
  CASE
    WHEN NOT (e.aweme_id_baseline ? 'required_when') THEN false
    WHEN e.native_type <> coalesce(e.aweme_id_baseline->'required_when'->>'native_type', '') THEN true
    WHEN e.fixed_default_policy THEN (
      e.selection_status = 'default_authorized'
      AND e.default_aweme_id_configured
      AND e.default_aweme_id_hash <> ''
      AND e.selected_aweme_id_hash = e.default_aweme_id_hash
      AND e.selected_in_active_candidates
      AND coalesce(e.aweme_authorization->>'default_aweme_authorized', '') = 'true'
    )
    WHEN e.selection_status NOT IN ('auto_selected', 'manual_selected') THEN false
    WHEN coalesce(e.aweme_authorization->>'selected_aweme_id', '') = '' THEN false
    WHEN NOT e.selected_in_active_candidates THEN false
    ELSE true
  END AS aweme_id_ready,
  CASE
    WHEN NOT (e.aweme_id_baseline ? 'required_when') THEN 'aweme_id_baseline_missing'
    WHEN e.native_type <> coalesce(e.aweme_id_baseline->'required_when'->>'native_type', '') THEN ''
    WHEN e.fixed_default_policy AND NOT e.default_aweme_id_configured THEN 'aweme_default_aweme_id_missing_or_invalid'
    WHEN e.fixed_default_policy AND e.selection_status = 'default_not_authorized' THEN 'aweme_default_not_authorized'
    WHEN e.fixed_default_policy AND e.selection_status = 'default_inactive' THEN 'aweme_default_authorization_inactive'
    WHEN e.fixed_default_policy AND e.selection_status = 'default_scope_mismatch' THEN 'aweme_auth_account_scope_mismatch'
    WHEN e.fixed_default_policy AND e.selection_status = 'probe_failed' THEN 'aweme_auth_probe_failed'
    WHEN e.fixed_default_policy AND e.selection_status <> 'default_authorized' THEN 'aweme_auth_not_verified'
    WHEN e.fixed_default_policy AND e.selected_aweme_id_hash <> e.default_aweme_id_hash THEN 'aweme_default_selected_mismatch'
    WHEN e.fixed_default_policy AND NOT e.selected_in_active_candidates THEN 'aweme_auth_selected_not_in_active_candidates'
    WHEN e.fixed_default_policy AND coalesce(e.aweme_authorization->>'default_aweme_authorized', '') <> 'true' THEN 'aweme_default_not_authorized'
    WHEN e.selection_status = 'selection_required' THEN 'aweme_auth_manual_selection_required'
    WHEN e.selection_status = 'no_active_authorization' THEN 'aweme_auth_no_active'
    WHEN e.selection_status = 'selected_inactive' THEN 'aweme_auth_selected_inactive'
    WHEN e.selection_status = 'probe_failed' THEN 'aweme_auth_probe_failed'
    WHEN e.selection_status NOT IN ('auto_selected', 'manual_selected') THEN 'aweme_auth_not_verified'
    WHEN coalesce(e.aweme_authorization->>'selected_aweme_id', '') = '' THEN 'aweme_auth_selected_aweme_id_missing'
    WHEN NOT e.selected_in_active_candidates THEN 'aweme_auth_selected_not_in_active_candidates'
    ELSE ''
  END AS blocker_code,
  CASE
    WHEN NOT (e.aweme_id_baseline ? 'required_when') THEN 'record_game_route_aweme_baseline'
    WHEN e.native_type <> coalesce(e.aweme_id_baseline->'required_when'->>'native_type', '') THEN 'not_required_for_current_native_type'
    WHEN e.fixed_default_policy AND NOT e.default_aweme_id_configured THEN 'record_jszc_default_aweme_id'
    WHEN e.fixed_default_policy AND e.selection_status = 'default_authorized' AND e.selected_aweme_id_hash = e.default_aweme_id_hash AND e.selected_in_active_candidates THEN 'ready_for_node5_payload_build'
    WHEN e.fixed_default_policy THEN 'run_node4_aweme_authorization_readonly_for_default_aweme'
    WHEN e.selection_status = 'selection_required' THEN 'select_aweme_authorization_in_workbench_then_rerun_node4'
    WHEN e.selection_status IN ('no_active_authorization', 'selected_inactive', 'probe_failed') THEN 'resolve_oceanengine_aweme_authorization_then_rerun_node4'
    WHEN e.selection_status NOT IN ('auto_selected', 'manual_selected') THEN 'run_node4_aweme_authorization_readonly'
    ELSE 'ready_for_node5_payload_build'
  END AS next_action,
  e.selection_policy,
  e.fixed_default_policy,
  e.default_aweme_id_configured,
  e.default_aweme_id_hash,
  CASE
    WHEN e.fixed_default_policy THEN (
      e.selection_status = 'default_authorized'
      AND e.default_aweme_id_configured
      AND e.default_aweme_id_hash <> ''
      AND e.selected_aweme_id_hash = e.default_aweme_id_hash
      AND e.selected_in_active_candidates
      AND coalesce(e.aweme_authorization->>'default_aweme_authorized', '') = 'true'
    )
    ELSE false
  END AS default_aweme_account_authorized
FROM eval e;

COMMIT;

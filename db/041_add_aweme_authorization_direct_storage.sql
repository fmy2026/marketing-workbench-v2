-- Target database: marketing_workbench_v2
-- Scope: store aweme_id as game-route baseline policy plus direct advertiser authorization truth.
-- Safety: stores selected platform aweme ID and redacted candidate summaries only; no token, Cookie, raw response, or URL.

BEGIN;

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS aweme_authorization jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE mwb.advertiser_accounts
  DROP CONSTRAINT IF EXISTS advertiser_accounts_aweme_authorization_shape_check,
  DROP CONSTRAINT IF EXISTS advertiser_accounts_aweme_authorization_no_sensitive_check;

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
        'probe_failed'
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

ALTER TABLE mwb.advertiser_accounts
  ADD CONSTRAINT advertiser_accounts_aweme_authorization_no_sensitive_check CHECK (
    aweme_authorization::text !~* '(access[_-]?token|refresh[_-]?token|cookie|auth[_-]?code|app[_-]?secret|raw[_-]?(request|response|payload)|callback/|https?://)'
  );

COMMENT ON COLUMN mwb.advertiser_accounts.aweme_authorization IS
  'Direct advertiser-level aweme authorization truth for std_project/create aweme_id. Stores selected ID, redacted candidate summaries, selection status, response hash and evidence ref only.';

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  raw_defaults,
  '{aweme_id_baseline}',
  jsonb_build_object(
    'version', '2026-08-29.oe3-aweme-id-baseline-v1',
    'required_when', jsonb_build_object('native_type', 'AWEME'),
    'payload_path', 'aweme_id',
    'source', 'tools/aweme_auth_list',
    'auth_type', 'AWEME_ACCOUNT',
    'accepted_auth_status', jsonb_build_array('AUTHRIZED', 'AUTHORIZED'),
    'selection_policy', 'single_active_auto_select_else_manual_select',
    'fallback_forbidden', true,
    'official_reference', jsonb_build_object(
      'create_field', 'open.oceanengine.com-3.0-waibugei/创建标准项目.md',
      'auth_list', 'open.oceanengine.com-3.0/08-工具.md'
    ),
    'contract_version', '2026-08-29.aweme-id-account-auth-v1',
    'rule_hash', 'sha256:5ad9140105b4a2876473f2e8e6e4fa9d1ed2e4211e1408df59aaf59b25f579ad'
  ),
  true
)
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

CREATE OR REPLACE VIEW mwb.v_advertiser_aweme_authorization_readiness AS
SELECT
  a.advertiser_id,
  a.route_id,
  a.game_code,
  coalesce(d.raw_defaults->'aweme_id_baseline', '{}'::jsonb) AS aweme_id_baseline,
  coalesce(a.aweme_authorization->>'selection_status', 'not_verified') AS selection_status,
  coalesce(jsonb_array_length(a.aweme_authorization->'active_candidates'), 0) AS active_candidate_count,
  a.aweme_authorization ? 'selected_aweme_id'
    AND coalesce(a.aweme_authorization->>'selected_aweme_id', '') <> '' AS selected_aweme_id_present,
  coalesce(a.aweme_authorization->>'selected_aweme_id_hash', '') AS selected_aweme_id_hash,
  coalesce(a.aweme_authorization->>'verified_at', '') AS verified_at,
  coalesce(a.aweme_authorization->>'expires_at', '') AS expires_at,
  coalesce(a.aweme_authorization->>'response_hash', '') AS response_hash,
  coalesce(a.aweme_authorization->>'evidence_artifact_id', '') AS evidence_artifact_id,
  CASE
    WHEN NOT (d.raw_defaults ? 'aweme_id_baseline') THEN false
    WHEN coalesce(d.raw_defaults->'payload_defaults'->'project'->>'native_type', '') <> coalesce(d.raw_defaults->'aweme_id_baseline'->'required_when'->>'native_type', '') THEN true
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') NOT IN ('auto_selected', 'manual_selected') THEN false
    WHEN coalesce(a.aweme_authorization->>'selected_aweme_id', '') = '' THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(a.aweme_authorization->'active_candidates', '[]'::jsonb)) candidate
      WHERE candidate->>'aweme_id' = a.aweme_authorization->>'selected_aweme_id'
    ) THEN false
    ELSE true
  END AS aweme_id_ready,
  CASE
    WHEN NOT (d.raw_defaults ? 'aweme_id_baseline') THEN 'aweme_id_baseline_missing'
    WHEN coalesce(d.raw_defaults->'payload_defaults'->'project'->>'native_type', '') <> coalesce(d.raw_defaults->'aweme_id_baseline'->'required_when'->>'native_type', '') THEN ''
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') = 'selection_required' THEN 'aweme_auth_manual_selection_required'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') = 'no_active_authorization' THEN 'aweme_auth_no_active'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') = 'selected_inactive' THEN 'aweme_auth_selected_inactive'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') = 'probe_failed' THEN 'aweme_auth_probe_failed'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') NOT IN ('auto_selected', 'manual_selected') THEN 'aweme_auth_not_verified'
    WHEN coalesce(a.aweme_authorization->>'selected_aweme_id', '') = '' THEN 'aweme_auth_selected_aweme_id_missing'
    WHEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(a.aweme_authorization->'active_candidates', '[]'::jsonb)) candidate
      WHERE candidate->>'aweme_id' = a.aweme_authorization->>'selected_aweme_id'
    ) THEN 'aweme_auth_selected_not_in_active_candidates'
    ELSE ''
  END AS blocker_code,
  CASE
    WHEN NOT (d.raw_defaults ? 'aweme_id_baseline') THEN 'record_game_route_aweme_baseline'
    WHEN coalesce(d.raw_defaults->'payload_defaults'->'project'->>'native_type', '') <> coalesce(d.raw_defaults->'aweme_id_baseline'->'required_when'->>'native_type', '') THEN 'not_required_for_current_native_type'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') = 'selection_required' THEN 'select_aweme_authorization_in_workbench_then_rerun_node4'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') IN ('no_active_authorization', 'selected_inactive', 'probe_failed') THEN 'resolve_oceanengine_aweme_authorization_then_rerun_node4'
    WHEN coalesce(a.aweme_authorization->>'selection_status', '') NOT IN ('auto_selected', 'manual_selected') THEN 'run_node4_aweme_authorization_readonly'
    ELSE 'ready_for_node5_payload_build'
  END AS next_action
FROM mwb.advertiser_accounts a
LEFT JOIN mwb.game_route_defaults d
  ON d.route_id = a.route_id
 AND d.game_code = a.game_code;

COMMIT;

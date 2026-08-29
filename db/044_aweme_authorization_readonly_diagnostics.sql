-- Target database: marketing_workbench_v2
-- Scope: expose sanitized Node 4 aweme authorization readonly diagnostics and align the
-- fixed default auth-status baseline with the official aweme_auth_list contract.
-- Safety: no table structure changes; no token, URL, raw request, or raw response storage.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  jsonb_set(
    raw_defaults,
    '{aweme_id_baseline,accepted_auth_status}',
    jsonb_build_array('AUTHRIZED'),
    true
  ),
  '{aweme_id_baseline,contract_version}',
  to_jsonb('2026-08-29.aweme-id-fixed-default-account-verify-v3'::text),
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
    coalesce(b.authorization->>'next_action', '') AS stored_next_action,
    coalesce(b.authorization->>'default_aweme_id_hash', '') AS verified_default_hash,
    coalesce(b.authorization->>'verified_by_job_id', '') AS verified_by_job_id,
    coalesce(b.authorization->>'advertiser_id', '') AS verified_advertiser_id,
    coalesce(b.authorization->>'route_id', '') AS verified_route_id,
    coalesce(b.authorization->>'game_code', '') AS verified_game_code,
    coalesce(b.authorization->>'probe_profile', '') AS probe_profile,
    nullif(b.authorization->>'http_status', '')::int AS http_status,
    coalesce(b.authorization->>'platform_code', '') AS platform_code,
    coalesce((b.authorization->>'request_id_present')::boolean, false) AS request_id_present,
    coalesce(b.authorization->>'message_hash', '') AS message_hash,
    coalesce((b.authorization->>'returned_row_count')::int, 0) AS returned_row_count,
    coalesce((b.authorization->>'primary_returned_row_count')::int, 0) AS primary_returned_row_count,
    coalesce((b.authorization->>'discovery_returned_row_count')::int, 0) AS discovery_returned_row_count,
    coalesce((b.authorization->>'discovery_page_count')::int, 0) AS discovery_page_count,
    coalesce((b.authorization->>'default_aweme_id_hit')::boolean, false) AS default_aweme_id_hit,
    coalesce((b.authorization->>'shared_relation_seen')::boolean, false) AS shared_relation_seen,
    coalesce(b.authorization->>'warning_code', '') AS warning_code
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
    WHEN e.verification_status = 'authorized' THEN ''
    WHEN e.verification_status = 'not_authorized' THEN 'aweme_default_not_authorized'
    WHEN e.verification_status = 'inactive' THEN 'aweme_default_authorization_inactive'
    WHEN e.verification_status = 'scope_mismatch' THEN 'aweme_auth_account_scope_mismatch'
    WHEN e.verification_status = 'default_mismatch' THEN 'aweme_default_not_returned'
    WHEN e.verification_status = 'probe_failed' AND e.stored_blocker_code <> '' THEN e.stored_blocker_code
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
    WHEN e.stored_next_action <> '' THEN e.stored_next_action
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
  e.evidence_ref,
  e.probe_profile,
  e.http_status,
  e.platform_code,
  e.request_id_present,
  e.message_hash,
  e.response_hash,
  e.returned_row_count,
  e.primary_returned_row_count,
  e.discovery_returned_row_count,
  e.discovery_page_count,
  e.default_aweme_id_hit,
  e.shared_relation_seen,
  e.warning_code
FROM eval e;

COMMIT;

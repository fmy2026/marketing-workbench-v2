-- Target database: marketing_workbench_v2
-- Scope: task 3 monitor create-once gates, JSZC monitor_provision defaults, and redacted report views.
-- Safety: report views never expose passport tokens, request headers, raw requests/responses, access tokens, or complete touchpoint URLs.

ALTER TABLE mwb.monitor_provision_runs
  ADD COLUMN IF NOT EXISTS create_called boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS create_attempt_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS create_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS create_completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'monitor_provision_runs_create_attempt_no_check'
      AND conrelid = 'mwb.monitor_provision_runs'::regclass
  ) THEN
    ALTER TABLE mwb.monitor_provision_runs
      ADD CONSTRAINT monitor_provision_runs_create_attempt_no_check
      CHECK (create_attempt_no >= 0 AND create_attempt_no <= 1);
  END IF;
END $$;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{monitor_provision}',
      '{
        "os": 3,
        "package_id": "36820",
        "cate_id": "122",
        "vest_id": "1414",
        "channel": "dymini3k",
        "media_id": "310",
        "agent_id": "613",
        "monitor_api": "toutiao_wxgame",
        "usage": 0,
        "num": 1,
        "source_ref": "docs/.参考文档/投放序列号/1-2、真实案例-举例.md",
        "derived_from_monitor_id": "245791",
        "account_specific_fields": ["owner", "media_account_id"],
        "touchpoint_candidate_field": "wxgame_click_url"
      }'::jsonb,
      true
    ),
    source_usage = 'runtime_truth',
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

CREATE OR REPLACE VIEW mwb.v_monitor_provision_status_report AS
SELECT
  r.provision_id,
  r.route_id,
  r.game_code,
  r.advertiser_id,
  coalesce(a.account_name, '') AS account_name,
  coalesce(a.auth_status, '') AS account_auth_status,
  r.status AS provision_status,
  r.credential_status,
  r.owner_key,
  r.owner_name,
  r.technical_account_record_id,
  r.media_account_id,
  r.agent_id,
  r.monitor_serial_id,
  r.monitor_id,
  (r.monitor_id IS NOT NULL AND r.monitor_id <> '') AS monitor_id_present,
  coalesce(t.touchpoint_ref, r.touchpoint_ref, '') AS touchpoint_ref,
  coalesce(t.status, '') AS touchpoint_status,
  coalesce(t.url_hash, r.touchpoint_url_hash, '') AS touchpoint_url_hash,
  (t.touchpoint_url IS NOT NULL AND t.touchpoint_url <> '') AS touchpoint_url_present,
  coalesce(d.raw_defaults ? 'monitor_provision', false) AS monitor_provision_present,
  coalesce(d.raw_defaults -> 'monitor_provision', '{}'::jsonb) AS monitor_provision,
  r.create_called,
  r.create_attempt_no,
  r.create_confirmed_at,
  r.create_completed_at,
  r.request_fingerprint,
  r.request_hash,
  r.response_hash,
  r.error_summary,
  r.evidence_artifact_id,
  coalesce(ev.content_hash, '') AS evidence_content_hash,
  r.updated_at
FROM mwb.monitor_provision_runs r
LEFT JOIN mwb.advertiser_accounts a
  ON a.advertiser_id = r.advertiser_id
 AND a.route_id = r.route_id
 AND a.game_code = r.game_code
LEFT JOIN mwb.account_touchpoints t
  ON t.advertiser_id = r.advertiser_id
 AND t.route_id = r.route_id
 AND t.game_code = r.game_code
 AND (
   (r.monitor_id IS NOT NULL AND r.monitor_id <> '' AND t.monitor_id = r.monitor_id)
   OR (r.monitor_id IS NULL OR r.monitor_id = '')
 )
LEFT JOIN mwb.game_route_defaults d
  ON d.route_id = r.route_id
 AND d.game_code = r.game_code
LEFT JOIN mwb.evidence_artifacts ev
  ON ev.artifact_id = r.evidence_artifact_id;

CREATE OR REPLACE VIEW mwb.v_monitor_provision_blocker_report AS
SELECT
  r.provision_id,
  r.route_id,
  r.game_code,
  r.advertiser_id,
  r.status AS provision_status,
  r.monitor_id,
  r.create_called,
  r.create_attempt_no,
  b.blocker,
  r.updated_at
FROM mwb.monitor_provision_runs r
CROSS JOIN LATERAL (
  SELECT trim(value) AS blocker
  FROM regexp_split_to_table(coalesce(nullif(r.error_summary, ''), 'none'), ';') AS value
) b
WHERE b.blocker <> ''
  AND b.blocker <> 'none';

COMMENT ON VIEW mwb.v_monitor_provision_status_report IS
  'Redacted operational status report for Qiankun monitor provision. Complete touchpoint URLs are not exposed.';

COMMENT ON VIEW mwb.v_monitor_provision_blocker_report IS
  'Redacted blocker drilldown for Qiankun monitor provision runs.';

-- Target database: marketing_workbench_v2
-- Scope: make OE3 platform-action diagnostics explicit without retaining raw messages.
-- Safety: request IDs are internal audit IDs; no raw payload, raw response, URL or message is stored.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mwb' AND table_name = 'platform_actions'
      AND column_name = 'platform_error_message_safe'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mwb' AND table_name = 'platform_actions'
      AND column_name = 'error_category'
  ) THEN
    ALTER TABLE mwb.platform_actions
      RENAME COLUMN platform_error_message_safe TO error_category;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mwb' AND table_name = 'platform_actions'
      AND column_name = 'platform_error_field'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mwb' AND table_name = 'platform_actions'
      AND column_name = 'offending_field_path'
  ) THEN
    ALTER TABLE mwb.platform_actions
      RENAME COLUMN platform_error_field TO offending_field_path;
  END IF;
END $$;

ALTER TABLE mwb.platform_actions
  ADD COLUMN IF NOT EXISTS error_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offending_field_path text NOT NULL DEFAULT '';

ALTER TABLE mwb.platform_actions
  DROP CONSTRAINT IF EXISTS platform_actions_error_category_check;

ALTER TABLE mwb.platform_actions
  ADD CONSTRAINT platform_actions_error_category_check CHECK (
    error_category IN (
      '',
      'invalid_field',
      'permission_denied',
      'resource_not_eligible',
      'landing_url_invalid',
      'unclassified'
    )
  );

COMMENT ON COLUMN mwb.platform_actions.request_id IS
  'Internal-only platform request ID. Never expose via API, frontend, ordinary logs, or task files.';
COMMENT ON COLUMN mwb.platform_actions.error_category IS
  'Allowlisted diagnostic category extracted in memory. Never stores the platform message.';
COMMENT ON COLUMN mwb.platform_actions.offending_field_path IS
  'Allowlisted std_project payload field path only; blank if no safe extraction is possible.';

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  raw_defaults,
  '{official_create_field_contract}',
  $$
  {
    "version": "2026-08-25.oe3-create-field-contract-v1",
    "source": "local_official_docs_only",
    "field_rules": {
      "advertiser_id": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "name": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "ad_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "landing_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "marketing_goal": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "external_action": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "deep_external_action": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "native_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "aweme_id": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "delivery_mode": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "delivery_medium": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "instance_id": {"evidence_level": "official_related_endpoint", "send_policy": "block", "reference": "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/获取标准项目列表.md", "applies_when": "byte_mini_game", "reason": "create_field_name_and_long_id_transport_need_direct_official_confirmation"},
      "asset_id": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "schedule_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "bid_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "budget_mode": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "budget": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "pricing": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "cpa_bid": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "roi_goal": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "deep_bid_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "audience_type": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "audience": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "brand_info": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "project_materials": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "track_url_setting": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "aigc_dynamic_creative_switch": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "is_comment_disable": {"evidence_level": "official_direct", "send_policy": "send", "reference": "open.oceanengine.com-3.0-waibugei/创建标准项目.md"},
      "delivery_type": {"evidence_level": "official_related_endpoint", "send_policy": "omit", "reference": "open.oceanengine.com-3.0-waibugei/调控任务/标准项目下获取可用优化目标.md", "reason": "query_contract_not_create_contract"},
      "micro_promotion_type": {"evidence_level": "official_related_endpoint", "send_policy": "omit", "reference": "open.oceanengine.com-3.0-waibugei/调控任务/标准项目下获取可用优化目标.md", "reason": "query_contract_not_create_contract"},
      "layer_roi_switch": {"evidence_level": "unverified", "send_policy": "omit", "reason": "no_local_official_create_field_evidence"}
    }
  }
  $$::jsonb,
  true
)
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;

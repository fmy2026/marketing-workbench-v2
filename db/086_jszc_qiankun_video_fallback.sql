-- Target database: marketing_workbench_v2
-- Scope: replace JSZC-HUNT local-file fallback videos with Qiankun origin-resource video catalog.
-- Safety: static origin identifiers only; account-scoped preheat/video state remains in account_resources.

BEGIN;

CREATE TEMP TABLE jszc_qiankun_videos (
  asset_id text PRIMARY KEY,
  material_code text NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO jszc_qiankun_videos (asset_id, material_code, sort_order) VALUES
  ('JSZC-HUNT-4H8V-53', '4h8v-53', 1),
  ('JSZC-HUNT-4IG2-3', '4iG2-3', 2),
  ('JSZC-HUNT-4IG2-1', '4iG2-1', 3),
  ('JSZC-HUNT-4IG2-18', '4iG2-18', 4),
  ('JSZC-HUNT-4ID1-1', '4iD1-1', 5),
  ('JSZC-HUNT-4IOY-1', '4iOy-1', 6),
  ('JSZC-HUNT-4ID2-1', '4iD2-1', 7),
  ('JSZC-HUNT-4IDB-1', '4iDB-1', 8),
  ('JSZC-HUNT-4H8V-130', '4h8v-130', 9),
  ('JSZC-HUNT-4IOR-2', '4iOr-2', 10);

INSERT INTO mwb.game_assets (asset_id, game_code, asset_type, asset_name, asset_ref, asset_hash, visibility_status, metadata, source_usage)
SELECT asset_id, 'JSZC', 'video_asset', material_code, asset_id, NULL, 'active',
  jsonb_build_object('qiankun_origin_resource_id', material_code, 'qiankun_resource_type', 2, 'source_kind', 'qiankun_origin_resource', 'api_doc_ref', 'docs/qiankun-api-docs-20260911.md'),
  'runtime_truth'
FROM jszc_qiankun_videos
ON CONFLICT (asset_id) DO UPDATE SET
  asset_name = EXCLUDED.asset_name, asset_ref = EXCLUDED.asset_ref, asset_hash = NULL,
  visibility_status = 'active', metadata = EXCLUDED.metadata, source_usage = EXCLUDED.source_usage, updated_at = now();

UPDATE mwb.material_packs
SET summary = jsonb_build_object('direction', '狩猎', 'required_video_count', 10, 'source_kind', 'qiankun_origin_resource',
  'default_video_asset_ids', (SELECT jsonb_agg(asset_id ORDER BY sort_order) FROM jszc_qiankun_videos)),
    updated_at = now()
WHERE pack_id = 'MD-JSZC-HUNT-HUNTING-BASELINE-001';

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      jsonb_set(
        raw_defaults,
        '{official_create_field_contract,success_profile,version}',
        '"2026-09-11.jszc-qiankun-ten-video-fallback-v4"'::jsonb,
        true
      ),
      '{official_create_field_contract,success_profile,material_counts,video_material_list}',
      '10'::jsonb,
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game' AND game_code = 'JSZC';

UPDATE mwb.material_pack_items
SET required = false, status = 'retired', metadata = metadata || jsonb_build_object('retired_reason', 'replaced_by_qiankun_origin_resource_baseline'), updated_at = now()
WHERE pack_id = 'MD-JSZC-HUNT-HUNTING-BASELINE-001'
  AND item_type = 'video_asset'
  AND item_id NOT LIKE 'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-QK-%';

INSERT INTO mwb.material_pack_items (item_id, pack_id, asset_id, item_type, asset_ref, required, sort_order, status, metadata, source_usage)
SELECT 'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-QK-' || lpad(sort_order::text, 2, '0'),
  'MD-JSZC-HUNT-HUNTING-BASELINE-001', asset_id, 'video_asset', asset_id, true, sort_order, 'active',
  jsonb_build_object('role', 'default_video', 'source_kind', 'qiankun_origin_resource', 'origin_resource_id', material_code), 'runtime_truth'
FROM jszc_qiankun_videos
ON CONFLICT (item_id) DO UPDATE SET asset_id = EXCLUDED.asset_id, asset_ref = EXCLUDED.asset_ref, required = true,
  sort_order = EXCLUDED.sort_order, status = 'active', metadata = EXCLUDED.metadata, source_usage = EXCLUDED.source_usage, updated_at = now();

UPDATE mwb.game_route_resource_blueprints
SET required = false, metadata = metadata || jsonb_build_object('retired_reason', 'replaced_by_qiankun_origin_resource_baseline'), updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND resource_type = 'video_asset'
  AND blueprint_id NOT LIKE 'BRP-JSZC-OE3-VIDEO-QK-%';

INSERT INTO mwb.game_route_resource_blueprints (blueprint_id, route_id, game_code, resource_type, resource_name, source_kind, source_asset_id, source_advertiser_id, candidate_platform_resource_id, required, inheritance_mode, metadata, source_usage)
SELECT 'BRP-JSZC-OE3-VIDEO-QK-' || lpad(sort_order::text, 2, '0'), 'oceanengine_3_byte_mini_game', 'JSZC', 'video_asset', material_code,
  'game_asset', asset_id, '', '', true, 'baseline_candidate',
  jsonb_build_object('role', 'default_video', 'origin_resource_id', material_code, 'source_kind', 'qiankun_origin_resource'), 'runtime_truth'
FROM jszc_qiankun_videos
ON CONFLICT (blueprint_id) DO UPDATE SET resource_name = EXCLUDED.resource_name, source_asset_id = EXCLUDED.source_asset_id,
  required = true, metadata = EXCLUDED.metadata, source_usage = EXCLUDED.source_usage, updated_at = now();

COMMIT;

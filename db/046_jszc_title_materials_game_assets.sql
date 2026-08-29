-- Target database: marketing_workbench_v2
-- Scope: register JSZC OE3 baseline title materials as game-level assets.
-- Safety: local configuration update only; no platform calls, no token, URL, raw request, or raw response storage.

BEGIN;

INSERT INTO mwb.game_assets (
  asset_id,
  game_code,
  asset_type,
  asset_name,
  asset_ref,
  asset_hash,
  visibility_status,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-001',
    'JSZC',
    'title_material',
    '开局一把枪，装备全靠捡，看你能射多远！',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-001',
    '1419d6c3ee8258d1d49beca1b16c9d7fa38003848ea425af0506475bf437d69a',
    'baseline_ready',
    jsonb_build_object(
      'direction', '狩猎',
      'creative_role', 'title',
      'baseline_identity', 'legacy_confirmed_baseline_title',
      'legacy_evidence_ref', 'marketing_workbench.mwb.game_assets:MD-JSZC-HUNT-HUNTING-BASELINE-001:content.creative.title_materials[0]',
      'contract_version', '2026-08-29.official-std-project-create-title-material-v1',
      'performance_claim', false
    ),
    now(),
    now()
  ),
  (
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-002',
    'JSZC',
    'title_material',
    '3分钟上手，5分钟上头，来试试你能过多少关卡！',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-002',
    'a84c908b4a30635c9bf4603fb3bd3b720984bf87630dc14b0872e6ed1cd1186d',
    'baseline_ready',
    jsonb_build_object(
      'direction', '狩猎',
      'creative_role', 'title',
      'baseline_identity', 'legacy_confirmed_baseline_title',
      'legacy_evidence_ref', 'marketing_workbench.mwb.game_assets:MD-JSZC-HUNT-HUNTING-BASELINE-001:content.creative.title_materials[1]',
      'contract_version', '2026-08-29.official-std-project-create-title-material-v1',
      'performance_claim', false
    ),
    now(),
    now()
  ),
  (
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-003',
    'JSZC',
    'title_material',
    '2026超魔性的休闲策略小游戏，无需下载，点开即玩！',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-003',
    '845806f118d2daab884b2a9143a7ec80bda05b51d009b79a4f8a930f7bd76468',
    'baseline_ready',
    jsonb_build_object(
      'direction', '狩猎',
      'creative_role', 'title',
      'baseline_identity', 'legacy_confirmed_baseline_title',
      'legacy_evidence_ref', 'marketing_workbench.mwb.game_assets:MD-JSZC-HUNT-HUNTING-BASELINE-001:content.creative.title_materials[2]',
      'contract_version', '2026-08-29.official-std-project-create-title-material-v1',
      'performance_claim', false
    ),
    now(),
    now()
  )
ON CONFLICT (asset_id) DO UPDATE SET
  game_code = EXCLUDED.game_code,
  asset_type = EXCLUDED.asset_type,
  asset_name = EXCLUDED.asset_name,
  asset_ref = EXCLUDED.asset_ref,
  asset_hash = EXCLUDED.asset_hash,
  visibility_status = EXCLUDED.visibility_status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO mwb.material_pack_items (
  item_id,
  pack_id,
  asset_id,
  item_type,
  asset_ref,
  required,
  sort_order,
  status,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-TITLE-001',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-001',
    'title_material',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-001',
    true,
    101,
    'active',
    jsonb_build_object('role', 'default_title'),
    now(),
    now()
  ),
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-TITLE-002',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-002',
    'title_material',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-002',
    true,
    102,
    'active',
    jsonb_build_object('role', 'default_title'),
    now(),
    now()
  ),
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-TITLE-003',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-003',
    'title_material',
    'TM-JSZC-HUNT-HUNTING-BASELINE-001-003',
    true,
    103,
    'active',
    jsonb_build_object('role', 'default_title'),
    now(),
    now()
  )
ON CONFLICT (item_id) DO UPDATE SET
  pack_id = EXCLUDED.pack_id,
  asset_id = EXCLUDED.asset_id,
  item_type = EXCLUDED.item_type,
  asset_ref = EXCLUDED.asset_ref,
  required = EXCLUDED.required,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

UPDATE mwb.material_packs
SET summary = summary || jsonb_build_object(
    'default_title_asset_ids',
    jsonb_build_array(
      'TM-JSZC-HUNT-HUNTING-BASELINE-001-001',
      'TM-JSZC-HUNT-HUNTING-BASELINE-001-002',
      'TM-JSZC-HUNT-HUNTING-BASELINE-001-003'
    ),
    'title_material_contract_version',
    '2026-08-29.official-std-project-create-title-material-v1'
  ),
  updated_at = now()
WHERE pack_id = 'MD-JSZC-HUNT-HUNTING-BASELINE-001';

COMMIT;


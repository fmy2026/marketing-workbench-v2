-- Target database: marketing_workbench_v2
-- Scope: incrementally correct JSZC route fallback values used by fresh Node 05 jobs.
-- Safety: one route-default row only; leaf updates plus before/after preservation assertions;
--         no historical Job/Plan/action/readback or account-specific resource mutation.

BEGIN;

CREATE TEMP TABLE _mwb_069_before ON COMMIT DROP AS
SELECT
  to_jsonb(defaults) AS route_row,
  defaults.raw_defaults,
  (
    SELECT coalesce(jsonb_agg(to_jsonb(member) ORDER BY member.member_id), '[]'::jsonb)
    FROM mwb.dmp_package_members member
    WHERE member.package_set_id = 'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001'
  ) AS dmp_members
FROM mwb.game_route_defaults defaults
WHERE defaults.id = 'GRD-oceanengine_3_byte_mini_game-JSZC';

DO $$
DECLARE
  target_cta jsonb := '["立即试玩","打开游戏","点击即玩","进入游戏","无需下载"]'::jsonb;
  target_age jsonb := '["AGE_BETWEEN_18_23","AGE_BETWEEN_24_30","AGE_BETWEEN_31_40","AGE_BETWEEN_41_49","AGE_ABOVE_50"]'::jsonb;
  target_schedule_time text :=
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 20) || repeat('1', 28) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('1', 48) || repeat('1', 48);
  current_row mwb.game_route_defaults%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM _mwb_069_before) <> 1 THEN
    RAISE EXCEPTION '069 expected exactly one target JSZC route-default row';
  END IF;

  SELECT * INTO current_row
  FROM mwb.game_route_defaults
  WHERE id = 'GRD-oceanengine_3_byte_mini_game-JSZC'
  FOR UPDATE;

  IF current_row.route_id <> 'oceanengine_3_byte_mini_game' OR current_row.game_code <> 'JSZC' THEN
    RAISE EXCEPTION '069 target route/game scope mismatch';
  END IF;
  IF current_row.budget IS NULL
     OR current_row.bid IS NULL
     OR current_row.roi_goal IS NULL
     OR current_row.budget NOT IN (88888, 66666)
     OR current_row.bid NOT IN (488, 366)
     OR current_row.roi_goal NOT IN (0.088, 0.16) THEN
    RAISE EXCEPTION '069 unexpected pre-existing budget/bid/roi values';
  END IF;
  IF current_row.raw_defaults #> '{payload_defaults,product,call_to_action_buttons}' IS NULL
     OR current_row.raw_defaults #> '{payload_defaults,product,call_to_action_buttons}'
     NOT IN ('["立即试玩"]'::jsonb, target_cta) THEN
    RAISE EXCEPTION '069 refuses to reduce or replace unexpected existing CTA values';
  END IF;
  IF current_row.raw_defaults #> '{payload_defaults,targeting,age}' IS NULL
     OR current_row.raw_defaults #> '{payload_defaults,targeting,age}'
     NOT IN ('[]'::jsonb, target_age) THEN
    RAISE EXCEPTION '069 refuses to reduce or replace unexpected existing age values';
  END IF;
  IF current_row.raw_defaults #>> '{payload_defaults,targeting,gender}' IS NULL
     OR current_row.raw_defaults #>> '{payload_defaults,targeting,gender}'
     NOT IN ('GENDER_UNLIMITED', 'GENDER_MALE') THEN
    RAISE EXCEPTION '069 unexpected pre-existing gender value';
  END IF;
  IF current_row.raw_defaults #>> '{payload_defaults,schedule,schedule_type}' IS DISTINCT FROM 'SCHEDULE_FROM_NOW' THEN
    RAISE EXCEPTION '069 schedule_type must remain SCHEDULE_FROM_NOW';
  END IF;
  IF current_row.schedule ->> 'schedule_time_digest'
     IS DISTINCT FROM '9e35339db1e951fd0c5b2de1908de02d1ff0d67243145c05ec195b15236c9594' THEN
    RAISE EXCEPTION '069 authoritative schedule digest mismatch';
  END IF;
  IF current_row.raw_defaults #>> '{payload_defaults,schedule,schedule_time}' IS NOT NULL
     AND current_row.raw_defaults #>> '{payload_defaults,schedule,schedule_time}' <> target_schedule_time THEN
    RAISE EXCEPTION '069 unexpected existing schedule_time';
  END IF;
  IF (SELECT jsonb_array_length(dmp_members) FROM _mwb_069_before) <> 10 THEN
    RAISE EXCEPTION '069 JSZC DMP baseline must contain exactly 10 members before update';
  END IF;
END $$;

UPDATE mwb.game_route_defaults
SET budget = 66666,
    bid = 366,
    roi_goal = 0.16,
    raw_defaults =
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
      jsonb_set(
        raw_defaults,
        '{budget_bid,budget}', '66666'::jsonb, false),
        '{budget_bid,bid}', '366'::jsonb, false),
        '{budget_bid,roi_goal}', '0.16'::jsonb, false),
        '{payload_defaults,product,call_to_action_buttons}', '["立即试玩","打开游戏","点击即玩","进入游戏","无需下载"]'::jsonb, false),
        '{payload_defaults,targeting,gender}', '"GENDER_MALE"'::jsonb, false),
        '{payload_defaults,targeting,age}', '["AGE_BETWEEN_18_23","AGE_BETWEEN_24_30","AGE_BETWEEN_31_40","AGE_BETWEEN_41_49","AGE_ABOVE_50"]'::jsonb, false),
        '{payload_defaults,schedule,schedule_time}', to_jsonb(
          repeat('0', 18) || repeat('1', 30) ||
          repeat('0', 18) || repeat('1', 30) ||
          repeat('0', 18) || repeat('1', 30) ||
          repeat('0', 20) || repeat('1', 28) ||
          repeat('0', 18) || repeat('1', 30) ||
          repeat('1', 48) || repeat('1', 48)
        ), true),
        '{official_create_field_contract,version}', '"2026-09-02.oe3-jszc-incremental-fallback-v2"'::jsonb, true),
        '{official_create_field_contract,source}', '"official_3_0_std_project_create_contract_plus_jszc_incremental_fallback"'::jsonb, true),
        '{official_create_field_contract,field_rules,schedule_time}', jsonb_build_object(
          'evidence_level', 'official_direct',
          'send_policy', 'send',
          'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:73',
          'applies_when', 'std_project_create',
          'reason', 'official_48x7_binary_half_hour_schedule_contract'
        ), true),
        '{official_create_field_contract,success_profile,version}', '"2026-09-02.jszc-byte-game-incremental-fallback-v2"'::jsonb, false),
        '{official_create_field_contract,success_profile,source}', '"jszc_incremental_fallback_screenshot_plus_official_create_contract"'::jsonb, false),
        '{official_create_field_contract,success_profile,fixture_hash}', '"sha256:c84fc54bbad9540e3d156ed1661a0482c1ff40e70a15c6541bcdef0e9937256b"'::jsonb, false),
        '{official_create_field_contract,success_profile,golden_field_shape_hash}', '"sha256:47bdf25b99339c610e31e9f54a9a6d4cf8c142b01bebfecb0ff843c4f866f464"'::jsonb, false),
        '{official_create_field_contract,success_profile,expected_ledger_path_count}', '92'::jsonb, false),
        '{official_create_field_contract,success_profile,schedule_time_digest}', '"9e35339db1e951fd0c5b2de1908de02d1ff0d67243145c05ec195b15236c9594"'::jsonb, true),
        '{official_create_field_contract,nested_rules,version}', '"2026-09-02.oe3-std-project-create-nested-fields-v5"'::jsonb, false),
        '{official_create_field_contract,nested_rules,groups,audience,rule}', '"male_plus_five_age_ranges;no_exclude_omits_filter_event_and_converted_time_duration;dmp_ids_integer_array_min_10"'::jsonb, true),
    updated_at = now()
WHERE id = 'GRD-oceanengine_3_byte_mini_game-JSZC';

DO $$
DECLARE
  before_raw jsonb;
  after_raw jsonb;
  before_row jsonb;
  after_row jsonb;
  before_dmp jsonb;
  after_dmp jsonb;
  schedule_time text;
BEGIN
  SELECT raw_defaults, route_row, dmp_members
  INTO before_raw, before_row, before_dmp
  FROM _mwb_069_before;

  SELECT raw_defaults, to_jsonb(defaults), raw_defaults #>> '{payload_defaults,schedule,schedule_time}'
  INTO after_raw, after_row, schedule_time
  FROM mwb.game_route_defaults defaults
  WHERE defaults.id = 'GRD-oceanengine_3_byte_mini_game-JSZC';

  SELECT coalesce(jsonb_agg(to_jsonb(member) ORDER BY member.member_id), '[]'::jsonb)
  INTO after_dmp
  FROM mwb.dmp_package_members member
  WHERE member.package_set_id = 'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001';

  before_raw := before_raw
    #- '{budget_bid,budget}'
    #- '{budget_bid,bid}'
    #- '{budget_bid,roi_goal}'
    #- '{payload_defaults,product,call_to_action_buttons}'
    #- '{payload_defaults,targeting,gender}'
    #- '{payload_defaults,targeting,age}'
    #- '{payload_defaults,schedule,schedule_time}'
    #- '{official_create_field_contract,version}'
    #- '{official_create_field_contract,source}'
    #- '{official_create_field_contract,field_rules,schedule_time}'
    #- '{official_create_field_contract,success_profile,version}'
    #- '{official_create_field_contract,success_profile,source}'
    #- '{official_create_field_contract,success_profile,fixture_hash}'
    #- '{official_create_field_contract,success_profile,golden_field_shape_hash}'
    #- '{official_create_field_contract,success_profile,expected_ledger_path_count}'
    #- '{official_create_field_contract,success_profile,schedule_time_digest}'
    #- '{official_create_field_contract,nested_rules,version}'
    #- '{official_create_field_contract,nested_rules,groups,audience,rule}';
  after_raw := after_raw
    #- '{budget_bid,budget}'
    #- '{budget_bid,bid}'
    #- '{budget_bid,roi_goal}'
    #- '{payload_defaults,product,call_to_action_buttons}'
    #- '{payload_defaults,targeting,gender}'
    #- '{payload_defaults,targeting,age}'
    #- '{payload_defaults,schedule,schedule_time}'
    #- '{official_create_field_contract,version}'
    #- '{official_create_field_contract,source}'
    #- '{official_create_field_contract,field_rules,schedule_time}'
    #- '{official_create_field_contract,success_profile,version}'
    #- '{official_create_field_contract,success_profile,source}'
    #- '{official_create_field_contract,success_profile,fixture_hash}'
    #- '{official_create_field_contract,success_profile,golden_field_shape_hash}'
    #- '{official_create_field_contract,success_profile,expected_ledger_path_count}'
    #- '{official_create_field_contract,success_profile,schedule_time_digest}'
    #- '{official_create_field_contract,nested_rules,version}'
    #- '{official_create_field_contract,nested_rules,groups,audience,rule}';

  IF before_raw <> after_raw THEN
    RAISE EXCEPTION '069 changed a non-allowlisted raw_defaults path';
  END IF;
  IF (before_row - 'budget' - 'bid' - 'roi_goal' - 'raw_defaults' - 'updated_at')
     <> (after_row - 'budget' - 'bid' - 'roi_goal' - 'raw_defaults' - 'updated_at') THEN
    RAISE EXCEPTION '069 changed a non-allowlisted route-default column';
  END IF;
  IF before_dmp <> after_dmp OR jsonb_array_length(after_dmp) <> 10 THEN
    RAISE EXCEPTION '069 changed or reduced JSZC DMP members';
  END IF;
  IF length(schedule_time) <> 336 OR schedule_time !~ '^[01]+$' THEN
    RAISE EXCEPTION '069 schedule_time must be a 336-bit binary string';
  END IF;
  IF schedule_time <>
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('0', 20) || repeat('1', 28) ||
    repeat('0', 18) || repeat('1', 30) ||
    repeat('1', 48) || repeat('1', 48) THEN
    RAISE EXCEPTION '069 schedule_time exact schedule mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.game_route_defaults defaults
    WHERE defaults.id = 'GRD-oceanengine_3_byte_mini_game-JSZC'
      AND defaults.budget = 66666
      AND defaults.bid = 366
      AND defaults.roi_goal = 0.16
      AND defaults.raw_defaults #> '{payload_defaults,product,call_to_action_buttons}' = '["立即试玩","打开游戏","点击即玩","进入游戏","无需下载"]'::jsonb
      AND defaults.raw_defaults #>> '{payload_defaults,targeting,gender}' = 'GENDER_MALE'
      AND defaults.raw_defaults #> '{payload_defaults,targeting,age}' = '["AGE_BETWEEN_18_23","AGE_BETWEEN_24_30","AGE_BETWEEN_31_40","AGE_BETWEEN_41_49","AGE_ABOVE_50"]'::jsonb
      AND defaults.raw_defaults #>> '{payload_defaults,schedule,schedule_type}' = 'SCHEDULE_FROM_NOW'
      AND defaults.raw_defaults #>> '{official_create_field_contract,success_profile,expected_ledger_path_count}' = '92'
  ) THEN
    RAISE EXCEPTION '069 target JSZC fallback values were not persisted exactly';
  END IF;
END $$;

COMMIT;

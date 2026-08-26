-- Target database: marketing_workbench_v2
-- Scope: require Qiankun monitor callback contract for JSZC byte mini-game route.
-- Safety: stores only stable callback contract defaults; no credentials, raw requests, or responses.

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{monitor_provision}',
      coalesce(raw_defaults -> 'monitor_provision', '{}'::jsonb) ||
      jsonb_build_object(
        'server_callback_required', true,
        'server_callback_type', '2',
        'server_callback_data_types', jsonb_build_array(
          'active',
          'register',
          'success_order'
        ),
        'callback_contract_source', 'tech_confirmed_2026-08-26',
        'callback_contract_status', 'required'
      ),
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

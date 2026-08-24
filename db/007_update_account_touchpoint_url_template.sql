-- Target database: marketing_workbench_v2
-- Scope: update one known account touchpoint with caller-supplied psql vars.
-- Required vars: touchpoint_url, url_hash
-- Do not commit a concrete full URL into project files.

UPDATE mwb.account_touchpoints
SET touchpoint_url = :'touchpoint_url',
    url_hash = :'url_hash',
    status = 'stored_in_database',
    updated_at = now()
WHERE touchpoint_ref = 'OCEANENGINE_BMG_TOUCHPOINT_1871922175825993_245791_URL'
  AND advertiser_id = '1871922175825993'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND monitor_id = '245791';

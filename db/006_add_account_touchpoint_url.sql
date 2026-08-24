-- Target database: marketing_workbench_v2
-- Scope: add controlled local storage for account touchpoint URLs.
-- Safety: full touchpoint URLs must not be returned by ordinary API views.

ALTER TABLE mwb.account_touchpoints
  ADD COLUMN IF NOT EXISTS touchpoint_url text;

COMMENT ON COLUMN mwb.account_touchpoints.touchpoint_url IS
  'Controlled local v2 storage only. Do not expose in ordinary API, frontend, logs, tasks, or docs.';

-- Target database: marketing_workbench_v2
-- Scope: one recoverable active runtime workflow Case per route/game/advertiser.
-- Safety: historical, test and completed/cancelled Cases remain unrestricted.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mwb.workflow_cases wc
    WHERE wc.source_usage = 'runtime_truth'
      AND wc.lifecycle_status = 'active'
    GROUP BY wc.route_id, wc.game_code, wc.advertiser_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'active_runtime_workflow_case_scope_conflict';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_workflow_cases_active_runtime_scope
  ON mwb.workflow_cases(route_id, game_code, advertiser_id)
  WHERE source_usage = 'runtime_truth'
    AND lifecycle_status = 'active';

COMMIT;

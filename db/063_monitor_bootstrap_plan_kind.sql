-- Target database: marketing_workbench_v2
-- Scope: classify the existing immutable Execution Plan contract and add the
--        single-action monitor bootstrap plan kind.
-- Safety: metadata remains redacted; this migration does not create monitor,
--         resource, or advertising-platform objects and does not rewrite run history.

BEGIN;

ALTER TABLE mwb.launch_execution_plans
  ADD COLUMN IF NOT EXISTS plan_kind text NOT NULL DEFAULT 'readiness_blocked';

UPDATE mwb.launch_execution_plans
SET plan_kind = CASE
  WHEN planned_actions @> '[{"action_type":"std_project_create"}]'::jsonb
    THEN 'std_project_create'
  WHEN jsonb_array_length(planned_actions) > 0
    THEN 'resource_prepare'
  ELSE 'readiness_blocked'
END
WHERE plan_kind NOT IN (
  'monitor_bootstrap',
  'resource_prepare',
  'std_project_create',
  'readiness_blocked'
) OR plan_kind = 'readiness_blocked';

ALTER TABLE mwb.launch_execution_plans
  DROP CONSTRAINT IF EXISTS launch_execution_plans_plan_kind_check;

ALTER TABLE mwb.launch_execution_plans
  ADD CONSTRAINT launch_execution_plans_plan_kind_check CHECK (
    plan_kind IN (
      'monitor_bootstrap',
      'resource_prepare',
      'std_project_create',
      'readiness_blocked'
    )
  );

CREATE INDEX IF NOT EXISTS idx_launch_execution_plans_job_kind_updated
  ON mwb.launch_execution_plans(job_id, plan_kind, updated_at DESC);

COMMENT ON COLUMN mwb.launch_execution_plans.plan_kind IS
  'Execution intent classification. monitor_bootstrap may contain only one ensure_monitor action.';

COMMIT;

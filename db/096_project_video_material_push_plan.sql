BEGIN;
ALTER TABLE mwb.launch_execution_plans
  DROP CONSTRAINT IF EXISTS launch_execution_plans_plan_kind_check;
ALTER TABLE mwb.launch_execution_plans
  ADD CONSTRAINT launch_execution_plans_plan_kind_check CHECK (
    plan_kind IN (
      'monitor_bootstrap', 'resource_prepare', 'std_project_create',
      'project_video_append', 'project_video_material_push', 'readiness_blocked'
    )
  );
COMMIT;

BEGIN;

ALTER TABLE mwb.workflow_cases
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'create_std_project';

ALTER TABLE mwb.workflow_cases
  ADD COLUMN IF NOT EXISTS target_project_id text NOT NULL DEFAULT '';

ALTER TABLE mwb.workflow_cases
  ADD COLUMN IF NOT EXISTS origin_resource_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE mwb.workflow_cases
  DROP CONSTRAINT IF EXISTS workflow_cases_operation_check;

ALTER TABLE mwb.workflow_cases
  ADD CONSTRAINT workflow_cases_operation_check CHECK (operation IN ('create_std_project', 'append_project_videos'));

ALTER TABLE mwb.workflow_cases
  ADD CONSTRAINT workflow_cases_origin_resource_ids_array_check CHECK (jsonb_typeof(origin_resource_ids) = 'array');

ALTER TABLE mwb.launch_execution_plans
  DROP CONSTRAINT IF EXISTS launch_execution_plans_plan_kind_check;

ALTER TABLE mwb.launch_execution_plans
  ADD CONSTRAINT launch_execution_plans_plan_kind_check CHECK (
    plan_kind IN (
      'monitor_bootstrap',
      'resource_prepare',
      'std_project_create',
      'project_video_append',
      'readiness_blocked'
    )
  );

COMMIT;

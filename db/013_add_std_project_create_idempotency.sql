-- Target database: marketing_workbench_v2
-- Scope: enforce one real OceanEngine std_project/create action per runtime job.
-- No platform API calls. Does not touch legacy databases.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mwb_platform_actions_one_oe_std_project_create_per_job
  ON mwb.platform_actions(job_id)
  WHERE action_type = 'oceanengine_std_project_create';

COMMENT ON INDEX mwb.ux_mwb_platform_actions_one_oe_std_project_create_per_job IS
  'Idempotency guard: one real OceanEngine std_project/create action per launch job.';

COMMIT;

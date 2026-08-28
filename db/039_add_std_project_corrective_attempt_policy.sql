-- Target database: marketing_workbench_v2
-- Scope: allow a bounded, versioned corrective std_project/create attempt per job.
-- Safety: prior drafts, plans, confirmations, actions and evidence remain immutable.

BEGIN;

DROP INDEX IF EXISTS mwb.ux_mwb_platform_actions_one_oe_std_project_create_per_job;

CREATE INDEX IF NOT EXISTS idx_platform_actions_std_project_attempts
  ON mwb.platform_actions(job_id, attempt_no DESC, started_at DESC)
  WHERE action_type = 'oceanengine_std_project_create';

COMMENT ON INDEX mwb.uq_platform_actions_singleton_by_job_action_attempt IS
  'One idempotent action for each job/action/attempt. Corrective std_project/create attempts must use a new immutable plan, draft, payload hash and attempt number.';

COMMIT;

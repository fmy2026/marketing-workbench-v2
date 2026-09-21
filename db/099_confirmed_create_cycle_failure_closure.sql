-- Target database: marketing_workbench_v2
-- Scope: remove the superseded per-Job Skill-run uniqueness so one Skill can
-- be recorded once in each durable execution cycle, and tighten the existing
-- zero-action recovery projection. The current four-field uniqueness remains
-- the sole idempotency boundary.
-- Safety: this migration changes no Case, Job, Plan, confirmation, action,
-- delivery, created object, credential, request, or response record.

BEGIN;

ALTER TABLE mwb.launch_skill_runs
  DROP CONSTRAINT IF EXISTS launch_skill_runs_unique_attempt;

ALTER TABLE mwb.launch_skill_runs
  DROP CONSTRAINT IF EXISTS launch_skill_runs_job_id_skill_key_attempt_no_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'mwb.launch_skill_runs'::regclass
      AND constraint_row.conname = 'launch_skill_runs_job_cycle_skill_attempt_unique'
  ) THEN
    ALTER TABLE mwb.launch_skill_runs
      ADD CONSTRAINT launch_skill_runs_job_cycle_skill_attempt_unique
      UNIQUE (job_id, execution_cycle, skill_key, attempt_no);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT launch_skill_runs_job_cycle_skill_attempt_unique
  ON mwb.launch_skill_runs IS
  'One Skill result per Job, durable execution cycle, Skill key, and attempt; retries within one cycle update the same record.';

DO $$
DECLARE
  view_definition text;
  old_prewrite_guard_pattern text := $regex$AND NOT [(]EXISTS [(] SELECT 1[[:space:]]+FROM mwb[.]platform_actions action[[:space:]]+WHERE action[.]job_id = latest[.]job_id[[:space:]]+AND action[.]action_type = 'oceanengine_std_project_create'::text[)][)]$regex$;
  tightened_prewrite_guard text := $fragment$AND NOT (EXISTS ( SELECT 1
                       FROM mwb.platform_actions action
                      WHERE action.job_id = latest.job_id))
              AND NOT (EXISTS ( SELECT 1
                       FROM mwb.platform_action_deliveries delivery
                       JOIN mwb.platform_actions action ON action.action_id = delivery.action_id
                      WHERE action.job_id = latest.job_id))
              AND NOT (EXISTS ( SELECT 1
                       FROM mwb.created_objects object_row
                      WHERE object_row.job_id = latest.job_id))$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('confirmed_create_cycle_failure_closure' IN obj_description('mwb.workflow_case_summary'::regclass, 'pg_class')) > 0 THEN
    RETURN;
  END IF;
  IF view_definition !~ old_prewrite_guard_pattern THEN
    RAISE EXCEPTION 'workflow_case_summary_099_prewrite_guard_fragment_missing';
  END IF;

  view_definition := regexp_replace(view_definition, old_prewrite_guard_pattern, tightened_prewrite_guard, 'g');
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. confirmed_prewrite_recovery_gate: a consumed std_project_create Plan blocked before every platform action, delivery, and created object projects its concrete blocker and permits only fresh readonly recovery. confirmed_create_cycle_failure_closure: execution-cycle persistence and recovery both fail closed.';

COMMIT;

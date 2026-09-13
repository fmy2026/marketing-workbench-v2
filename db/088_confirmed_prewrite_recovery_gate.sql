-- Target database: marketing_workbench_v2
-- Scope: surface a consumed Create Plan that stopped before any platform action
-- as its concrete blocker and route it to the existing fresh-readonly recovery.
-- Safety: projection only; does not create or modify a Case, Job, Plan,
-- confirmation, action, object, account resource, or platform state.

BEGIN;

DO $$
DECLARE
  view_definition text;
  prewrite_condition text := $fragment$latest.job_status = 'failed_waiting_manual_review'::text
              AND plan.plan_kind = 'std_project_create'::text
              AND plan.plan_status = 'consumed'::text
              AND COALESCE(plan.metadata ->> 'confirmed_execution_outcome'::text, ''::text) = 'blocked_before_create'::text
              AND COALESCE(plan.metadata ->> 'confirmed_execution_blocker'::text, ''::text) <> ''::text
              AND NOT (EXISTS ( SELECT 1
                       FROM mwb.platform_actions action
                      WHERE action.job_id = latest.job_id
                        AND action.action_type = 'oceanengine_std_project_create'::text))$fragment$;
  blocker_target text := $fragment$WHEN latest.job_status = 'failed_waiting_manual_review'::text THEN jsonb_build_array('corrective_attempt_requires_new_payload_version')$fragment$;
  blocker_replacement text;
  gate_target text := $fragment$WHEN latest.job_status = 'failed_waiting_manual_review'::text THEN 'prepare_corrective_attempt'::text$fragment$;
  next_target text := $fragment$WHEN latest.job_status = 'failed_waiting_manual_review'::text THEN 'correct_payload_then_build_next_attempt_version'::text$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('confirmed_prewrite_recovery_gate' IN obj_description('mwb.workflow_case_summary'::regclass, 'pg_class')) > 0 THEN
    RETURN;
  END IF;

  blocker_replacement := 'WHEN ' || prewrite_condition ||
    ' THEN jsonb_build_array(plan.metadata ->> ''confirmed_execution_blocker'') ' || blocker_target;

  IF length(replace(view_definition, blocker_target, blocker_replacement)) = length(view_definition) THEN
    RAISE EXCEPTION 'workflow_case_summary_088_blocker_fragment_missing';
  END IF;
  view_definition := replace(view_definition, blocker_target, blocker_replacement);

  IF position(gate_target IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_088_gate_fragment_missing';
  END IF;
  view_definition := replace(view_definition, gate_target,
    'WHEN ' || prewrite_condition || ' THEN ''resolve_case_blocker''::text ' || gate_target);

  IF position(next_target IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_088_next_action_fragment_missing';
  END IF;
  view_definition := replace(view_definition, next_target,
    'WHEN ' || prewrite_condition || ' THEN ''create_fresh_readonly_recovery''::text ' || next_target);

  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. confirmed_prewrite_recovery_gate: a consumed std_project_create Plan blocked before any create action projects its concrete prewrite blocker and permits only the existing fresh readonly recovery.';

COMMIT;

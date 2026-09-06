-- Target database: marketing_workbench_v2
-- Scope: return an active same-Job workflow to readonly readiness after its
--        monitor_bootstrap Plan was consumed and no std project create action
--        exists. Projection only; no platform call or runtime fact mutation.

BEGIN;

DO $$
DECLARE
  view_definition text;
  gate_target text := $fragment$WHEN plan.plan_status = 'ready'::text THEN 'await_job_write_authorization'::text
            WHEN latest.job_status = ANY (ARRAY['created'::text, 'running'::text, 'waiting'::text]) THEN 'run_fresh_readiness'::text$fragment$;
  gate_replacement text := $fragment$WHEN plan.plan_kind = 'monitor_bootstrap'::text
              AND plan.plan_status = 'consumed'::text
              AND monitor.readiness_status = 'ready'::text
              AND COALESCE(attempt.std_project_create_action_count, 0) = 0 THEN 'run_fresh_readiness'::text
            WHEN plan.plan_status = 'ready'::text THEN 'await_job_write_authorization'::text
            WHEN latest.job_status = ANY (ARRAY['created'::text, 'running'::text, 'waiting'::text]) THEN 'run_fresh_readiness'::text$fragment$;
  action_target text := $fragment$WHEN plan.plan_status = 'ready'::text THEN 'obtain_single_plan_confirmation'::text
            WHEN latest.job_status = ANY (ARRAY['created'::text, 'running'::text, 'waiting'::text]) THEN 'run_readonly_readiness'::text$fragment$;
  action_replacement text := $fragment$WHEN plan.plan_kind = 'monitor_bootstrap'::text
              AND plan.plan_status = 'consumed'::text
              AND monitor.readiness_status = 'ready'::text
              AND COALESCE(attempt.std_project_create_action_count, 0) = 0 THEN 'run_readonly_readiness'::text
            WHEN plan.plan_status = 'ready'::text THEN 'obtain_single_plan_confirmation'::text
            WHEN latest.job_status = ANY (ARRAY['created'::text, 'running'::text, 'waiting'::text]) THEN 'run_readonly_readiness'::text$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position(
    'COALESCE(attempt.std_project_create_action_count, 0) = 0 THEN ''run_fresh_readiness''::text'
    IN view_definition
  ) = 0 THEN
    IF position(gate_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_071_gate_fragment_missing';
    END IF;
    view_definition := replace(view_definition, gate_target, gate_replacement);

    IF position(action_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_071_action_fragment_missing';
    END IF;
    view_definition := replace(view_definition, action_target, action_replacement);

    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. Canonical monitor/account readiness supersedes stale blockers; a consumed ready monitor Plan with zero std create actions re-enters same-Job readonly readiness.';

COMMIT;

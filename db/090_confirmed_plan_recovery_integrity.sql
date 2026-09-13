-- Target database: marketing_workbench_v2
-- Scope: close the confirmed-create Plan loophole where a later, unconfirmed
-- Plan was published for the same Job after a zero-action prewrite stop.
-- Safety: only marks that later Plan stale and restores the existing
-- fresh-readonly recovery Gate. It never creates a platform action or object.

BEGIN;

WITH stale_later_plan AS (
  UPDATE mwb.launch_execution_plans later_plan
  SET plan_status = 'stale',
      metadata = later_plan.metadata || jsonb_build_object(
        'stale_reason', 'confirmed_create_plan_requires_fresh_job',
        'superseded_by_confirmed_plan_id', confirmed_plan.plan_id,
        'retry_allowed', false
      ),
      updated_at = now()
  FROM mwb.launch_execution_plans confirmed_plan
  JOIN mwb.launch_confirmations confirmation
    ON confirmation.plan_id = confirmed_plan.plan_id
   AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
  WHERE later_plan.job_id = confirmed_plan.job_id
    AND later_plan.plan_version > confirmed_plan.plan_version
    AND coalesce(later_plan.plan_kind, later_plan.metadata->>'plan_kind', '') = 'std_project_create'
    AND later_plan.plan_status IN ('blocked', 'planned', 'ready')
    AND NOT EXISTS (
      SELECT 1
      FROM mwb.launch_confirmations later_confirmation
      WHERE later_confirmation.plan_id = later_plan.plan_id
        AND later_confirmation.confirmation_status = 'confirmed_for_execution_plan'
    )
    AND coalesce(confirmed_plan.plan_kind, confirmed_plan.metadata->>'plan_kind', '') = 'std_project_create'
    AND confirmed_plan.plan_status = 'consumed'
    AND confirmed_plan.metadata->>'confirmed_execution_outcome' = 'blocked_before_create'
    AND NOT EXISTS (
      SELECT 1
      FROM mwb.platform_actions action
      WHERE action.job_id = confirmed_plan.job_id
        AND action.action_type = 'oceanengine_std_project_create'
    )
  RETURNING later_plan.job_id
), stopped_job AS (
  UPDATE mwb.launch_jobs job
  SET job_status = 'failed_waiting_manual_review',
      current_node = '6',
      updated_at = now()
  WHERE job.job_id IN (SELECT job_id FROM stale_later_plan)
  RETURNING job.job_id
)
SELECT count(*) AS recovered_jobs FROM stopped_job;

DO $$
DECLARE
  view_definition text;
  target_order text := $fragment$ORDER BY ep.plan_version DESC, ep.updated_at DESC$fragment$;
  preferred_confirmed_prewrite_order text := $fragment$ORDER BY CASE
  WHEN ep.plan_kind = 'std_project_create'::text
    AND ep.plan_status = 'consumed'::text
    AND COALESCE(ep.metadata ->> 'confirmed_execution_outcome'::text, ''::text) = 'blocked_before_create'::text
    AND EXISTS (
      SELECT 1
      FROM mwb.launch_confirmations confirmation
      WHERE confirmation.plan_id = ep.plan_id
        AND confirmation.confirmation_status = 'confirmed_for_execution_plan'::text
    )
    AND NOT EXISTS (
      SELECT 1
      FROM mwb.platform_actions action
      WHERE action.job_id = ep.job_id
        AND action.action_type = 'oceanengine_std_project_create'::text
    ) THEN 0
  ELSE 1
END, ep.plan_version DESC, ep.updated_at DESC$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('confirmed_plan_recovery_integrity' IN obj_description('mwb.workflow_case_summary'::regclass, 'pg_class')) > 0 THEN
    RETURN;
  END IF;
  IF position(target_order IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_090_plan_order_fragment_missing';
  END IF;

  view_definition := replace(view_definition, target_order, preferred_confirmed_prewrite_order);
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. confirmed_prewrite_recovery_gate: a consumed std_project_create Plan blocked before any create action permits only fresh readonly recovery. confirmed_prewrite_blocker_resolution: generic prewrite wrappers resolve to the concrete blocked Skill reason. confirmed_plan_recovery_integrity: a later unconfirmed Plan cannot hide a confirmed zero-action create stop.';

COMMIT;

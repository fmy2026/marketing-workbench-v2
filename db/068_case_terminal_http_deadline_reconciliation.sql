-- Target database: marketing_workbench_v2
-- Scope: reconcile deterministic runtime Case / Job / Create Plan terminal facts;
--        make non-active Cases read-only in the single Gate projection.
-- Safety: no platform call, confirmation/action/object fabrication, retry, or
--         source_usage other than runtime_truth. Ambiguous records are retained.

BEGIN;

-- A recorded platform action means this frozen Plan has been attempted and can
-- never be offered again. Preserve all action evidence; only close the Plan.
WITH attempted_ready_plan AS (
  UPDATE mwb.launch_execution_plans plan
  SET plan_status = 'consumed',
      metadata = plan.metadata || jsonb_build_object(
        'terminal_reconciled_by', '068_case_terminal_http_deadline_reconciliation',
        'confirmed_execution_outcome', 'historical_platform_action_recorded',
        'retry_allowed', false
      ),
      updated_at = now()
  FROM mwb.launch_jobs job
  WHERE plan.job_id = job.job_id
    AND plan.source_usage = 'runtime_truth'
    AND job.source_usage = 'runtime_truth'
    AND plan.plan_status = 'ready'
    AND EXISTS (
      SELECT 1
      FROM mwb.platform_actions action
      WHERE action.job_id = plan.job_id
        AND action.plan_id = plan.plan_id
    )
  RETURNING plan.plan_id, plan.job_id
), terminal_failed_job AS (
  UPDATE mwb.launch_jobs job
  SET job_status = 'failed_waiting_manual_review',
      current_node = '7',
      updated_at = now()
  FROM attempted_ready_plan plan
  WHERE job.job_id = plan.job_id
    AND EXISTS (
      SELECT 1
      FROM mwb.platform_actions action
      WHERE action.job_id = plan.job_id
        AND action.plan_id = plan.plan_id
        AND action.action_type = 'oceanengine_std_project_create'
        AND action.action_status IN ('failed', 'failed_or_unconfirmed')
    )
  RETURNING job.job_id
)
SELECT count(*) FROM terminal_failed_job;

-- Only a latest runtime Job with one exact verified Create/Readback chain is
-- completion evidence. Historical records without a confirmation remain
-- auditable; this migration never creates or infers one.
WITH verified_latest AS (
  SELECT workflow_case.case_id, job.job_id, plan.plan_id
  FROM mwb.workflow_cases workflow_case
  JOIN mwb.launch_jobs job
    ON job.case_id = workflow_case.case_id
   AND job.source_usage = 'runtime_truth'
  JOIN mwb.launch_execution_plans plan
    ON plan.job_id = job.job_id
   AND plan.source_usage = 'runtime_truth'
   AND plan.plan_kind = 'std_project_create'
  JOIN LATERAL (
    SELECT draft.*
    FROM mwb.launch_drafts draft
    WHERE draft.job_id = job.job_id
    ORDER BY draft.created_at DESC, draft.draft_id DESC
    LIMIT 1
  ) draft ON true
  JOIN LATERAL (
    SELECT readback.*
    FROM mwb.readback_records readback
    WHERE readback.job_id = job.job_id
      AND readback.object_type = 'std_project'
    ORDER BY readback.created_at DESC, readback.readback_id DESC
    LIMIT 1
  ) readback ON true
  JOIN mwb.created_objects created_object
    ON created_object.job_id = job.job_id
   AND created_object.object_type = 'std_project'
   AND created_object.object_id = readback.object_id
   AND created_object.object_name = draft.project_name
  WHERE workflow_case.source_usage = 'runtime_truth'
    AND workflow_case.lifecycle_status IN ('active', 'completed')
    AND job.job_id = (
      SELECT latest.job_id
      FROM mwb.launch_jobs latest
      WHERE latest.case_id = workflow_case.case_id
      ORDER BY latest.updated_at DESC, latest.created_at DESC, latest.job_id DESC
      LIMIT 1
    )
    AND plan.plan_id = (
      SELECT latest_plan.plan_id
      FROM mwb.launch_execution_plans latest_plan
      WHERE latest_plan.job_id = job.job_id
      ORDER BY latest_plan.plan_version DESC, latest_plan.updated_at DESC, latest_plan.plan_id DESC
      LIMIT 1
    )
    AND readback.readback_status = 'readback_verified'
    AND readback.object_name = draft.project_name
    AND (SELECT count(*) FROM mwb.platform_actions action
         WHERE action.job_id = job.job_id
           AND action.action_type = 'oceanengine_std_project_create') = 1
    AND (SELECT count(*) FROM mwb.created_objects object_count
         WHERE object_count.job_id = job.job_id
           AND object_count.object_type = 'std_project') = 1
    AND EXISTS (
      SELECT 1
      FROM mwb.platform_actions action
      WHERE action.job_id = job.job_id
        AND action.plan_id = plan.plan_id
        AND action.action_type = 'oceanengine_std_project_create'
        AND action.action_status = 'succeeded'
        AND action.object_id_present = true
    )
), consumed_verified_plan AS (
  UPDATE mwb.launch_execution_plans plan
  SET plan_status = 'consumed',
      metadata = plan.metadata || jsonb_build_object(
        'terminal_reconciled_by', '068_case_terminal_http_deadline_reconciliation',
        'confirmed_execution_outcome', 'readback_verified',
        'retry_allowed', false
      ),
      updated_at = now()
  FROM verified_latest verified
  WHERE plan.plan_id = verified.plan_id
    AND (
      plan.plan_status IN ('ready', 'waiting_readback')
      OR (
        plan.plan_status = 'consumed'
        AND coalesce(plan.metadata->>'terminal_reconciled_by', '')
          <> '068_case_terminal_http_deadline_reconciliation'
      )
    )
  RETURNING verified.case_id, verified.job_id, plan.plan_id
), completed_job AS (
  UPDATE mwb.launch_jobs job
  SET job_status = 'completed',
      current_node = '7',
      updated_at = now()
  FROM consumed_verified_plan verified
  WHERE job.job_id = verified.job_id
  RETURNING verified.case_id, verified.job_id, verified.plan_id
), completed_case AS (
  UPDATE mwb.workflow_cases workflow_case
  SET lifecycle_status = 'completed',
      metadata = workflow_case.metadata || jsonb_build_object(
        'completion_reason', coalesce(nullif(workflow_case.metadata->>'completion_reason', ''), 'first_std_project_create_completed'),
        'completed_job_id', completed.job_id,
        'terminal_reconciled_by', '068_case_terminal_http_deadline_reconciliation'
      ),
      updated_at = CASE
        WHEN workflow_case.lifecycle_status = 'completed' THEN workflow_case.updated_at
        ELSE now()
      END
  FROM completed_job completed
  WHERE workflow_case.case_id = completed.case_id
  RETURNING workflow_case.case_id
)
SELECT count(*) FROM completed_case;

-- Non-active Cases must not retain an executable Plan. A never-attempted
-- historical Plan is stale rather than consumed, so the audit distinction is
-- preserved without reopening confirmation or retry UI.
UPDATE mwb.launch_execution_plans plan
SET plan_status = 'stale',
    metadata = plan.metadata || jsonb_build_object(
      'terminal_reconciled_by', '068_case_terminal_http_deadline_reconciliation',
      'stale_reason', 'nonactive_case_unexecuted_plan',
      'retry_allowed', false
    ),
    updated_at = now()
FROM mwb.launch_jobs job
JOIN mwb.workflow_cases workflow_case ON workflow_case.case_id = job.case_id
WHERE plan.job_id = job.job_id
  AND plan.source_usage = 'runtime_truth'
  AND job.source_usage = 'runtime_truth'
  AND workflow_case.source_usage = 'runtime_truth'
  AND workflow_case.lifecycle_status <> 'active'
  AND plan.plan_status = 'ready'
  AND NOT EXISTS (
    SELECT 1
    FROM mwb.platform_actions action
    WHERE action.job_id = plan.job_id
      AND action.plan_id = plan.plan_id
  );

-- Keep all existing View columns. The final projection becomes read-only for
-- every non-active Case: verified completions retain their completed Gate;
-- anything else only permits inspection of the latest Job.
DO $$
DECLARE
  view_definition text;
  blocker_target text := $fragment$CASE
            WHEN COALESCE(attempt.created_object_count, 0) > 0 AND COALESCE(attempt.last_readback_status, ''::text) <> 'readback_verified'::text THEN jsonb_build_array('created_object_readback_pending')$fragment$;
  blocker_replacement text := $fragment$CASE
            WHEN wc.lifecycle_status <> 'active'::text THEN '[]'::jsonb
            WHEN COALESCE(attempt.created_object_count, 0) > 0 AND COALESCE(attempt.last_readback_status, ''::text) <> 'readback_verified'::text THEN jsonb_build_array('created_object_readback_pending')$fragment$;
  gate_target text := $fragment$CASE
            WHEN latest.job_id IS NULL THEN 'create_fresh_job'::text$fragment$;
  gate_replacement text := $fragment$CASE
            WHEN wc.lifecycle_status <> 'active'::text
              AND COALESCE(wc.metadata->>'completion_reason', ''::text) = 'first_std_project_create_completed'::text
              AND plan.plan_status = 'consumed'::text THEN 'first_std_project_create_completed'::text
            WHEN wc.lifecycle_status <> 'active'::text THEN 'review_latest_job'::text
            WHEN latest.job_id IS NULL THEN 'create_fresh_job'::text$fragment$;
  action_target text := $fragment$CASE
            WHEN latest.job_id IS NULL THEN 'create_fresh_job'::text$fragment$;
  action_replacement text := $fragment$CASE
            WHEN wc.lifecycle_status <> 'active'::text
              AND COALESCE(wc.metadata->>'completion_reason', ''::text) = 'first_std_project_create_completed'::text
              AND plan.plan_status = 'consumed'::text THEN 'first_std_project_create_completed'::text
            WHEN wc.lifecycle_status <> 'active'::text THEN 'inspect_latest_job'::text
            WHEN latest.job_id IS NULL THEN 'create_fresh_job'::text$fragment$;
  first_gate_position integer;
  second_gate_position integer;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('wc.lifecycle_status <> ''active''::text' IN view_definition) = 0 THEN
    IF position(blocker_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_068_blocker_fragment_missing';
    END IF;
    view_definition := replace(view_definition, blocker_target, blocker_replacement);

    first_gate_position := position(gate_target IN view_definition);
    IF first_gate_position = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_068_gate_fragment_missing';
    END IF;
    view_definition := overlay(view_definition placing gate_replacement FROM first_gate_position FOR length(gate_target));

    second_gate_position := position(action_target IN substr(view_definition, first_gate_position + length(gate_replacement)));
    IF second_gate_position = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_068_action_fragment_missing';
    END IF;
    second_gate_position := first_gate_position + length(gate_replacement) + second_gate_position - 1;
    view_definition := overlay(view_definition placing action_replacement FROM second_gate_position FOR length(action_target));

    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. root_blocker_codes contains zero or one blocker. Non-active Cases are review-only unless exact completed evidence is present.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: one task-approved Case-local corrective experiment.  Attempt 1 remains
-- immutable: the platform gave a generic explicit rejection, not a field-level
-- diagnosis.  This migration never calls the platform and never reopens its Plan.

BEGIN;

DO $$
DECLARE
  target_case_id text := 'CASE-MWBV2-AC24AABC9184D5588A';
  fallback_task_id text := 'TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910';
  updated_cases integer := 0;
BEGIN
  UPDATE mwb.workflow_cases workflow_case
  SET metadata = jsonb_set(
        jsonb_set(
          workflow_case.metadata,
          '{brand_fallback_experiment,status}',
          '"rejected"'::jsonb,
          true
        ),
        '{brand_empty_omit_experiment}',
        jsonb_build_object(
          'status', 'approved_for_single_create_validation',
          'case_id', workflow_case.case_id,
          'route_id', workflow_case.route_id,
          'game_code', workflow_case.game_code,
          'maximum_create_calls', 1,
          'retry_allowed', false,
          'source', 'task_approved_target_brand_list_empty_omit',
          'replaces_experiment', 'game_route_fallback_experiment',
          'prior_outcome', 'platform_explicit_rejection_without_field_attribution',
          'evidence_storage', 'redacted_summary_only'
        ),
        true
      ),
      updated_at = now()
  WHERE workflow_case.case_id = target_case_id
    AND workflow_case.lifecycle_status = 'active'
    AND workflow_case.metadata #>> '{brand_fallback_experiment,task_id}' = fallback_task_id
    AND EXISTS (
      SELECT 1
      FROM mwb.launch_jobs job
      JOIN mwb.platform_actions action ON action.job_id = job.job_id
      WHERE job.case_id = workflow_case.case_id
        AND action.action_type = 'oceanengine_std_project_create'
        AND action.action_status = 'failed'
        AND action.api_code = '40000'
    );
  GET DIAGNOSTICS updated_cases = ROW_COUNT;
  IF updated_cases <> 1 THEN
    RAISE EXCEPTION 'target_empty_brand_omit_experiment_case_not_exactly_one:%', updated_cases;
  END IF;

  -- Historical action remains failed.  Backfill only its already-frozen,
  -- redacted Draft ledger so Attempt 2 can be compared without raw payload.
  UPDATE mwb.platform_actions action
  SET request_field_manifest = draft.payload_summary -> 'final_payload_manifest'
  FROM mwb.launch_jobs job
  JOIN mwb.launch_drafts draft ON draft.job_id = job.job_id
  WHERE action.job_id = job.job_id
    AND job.case_id = target_case_id
    AND action.action_type = 'oceanengine_std_project_create'
    AND action.action_status = 'failed'
    AND action.api_code = '40000'
    AND coalesce(action.request_field_manifest, '{}'::jsonb) = '{}'::jsonb
    AND draft.payload_summary ? 'final_payload_manifest';
END;
$$;

COMMIT;

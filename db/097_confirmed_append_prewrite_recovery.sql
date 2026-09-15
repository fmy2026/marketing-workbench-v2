-- Target database: marketing_workbench_v2
-- Scope: surface a consumed, confirmed append/push Plan that stopped before
-- any platform action as the existing readonly-recovery Gate.

BEGIN;

DO $$
DECLARE
  view_definition text;
  prewrite text := 'wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text AND plan.plan_kind IN (''project_video_append''::text, ''project_video_material_push''::text) AND plan.plan_status = ''consumed''::text AND COALESCE(plan.metadata ->> ''confirmed_execution_outcome''::text, ''''::text) = ''blocked_before_platform_write''::text AND COALESCE(plan.metadata ->> ''confirmed_execution_blocker''::text, ''''::text) <> ''''::text AND NOT (EXISTS ( SELECT 1 FROM mwb.platform_actions action WHERE action.job_id = latest.job_id AND action.plan_id = plan.plan_id))';
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true) INTO view_definition;
  IF position('blocked_before_platform_write''::text' IN view_definition) > 0 AND position('project_video_material_push''::text' IN view_definition) > 0 THEN
    RETURN;
  END IF;
  IF position('WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''project_video_append_readback_pending'')' IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_097_blocker_anchor_missing';
  END IF;
  view_definition := replace(
    view_definition,
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''project_video_append_readback_pending'')',
    'WHEN ' || prewrite || ' THEN jsonb_build_array(plan.metadata ->> ''confirmed_execution_blocker''::text)' || chr(10) ||
    '            WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''project_video_append_readback_pending'')'
  );
  view_definition := replace(
    view_definition,
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN ''run_project_video_append_readback''::text',
    'WHEN ' || prewrite || ' THEN ''resolve_case_blocker''::text' || chr(10) ||
    '            WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN ''run_project_video_append_readback''::text'
  );
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate, including confirmed append/push Plans blocked before platform write.';

COMMIT;

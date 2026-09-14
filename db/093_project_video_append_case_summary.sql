-- Target database: marketing_workbench_v2
-- Scope: make the existing single Gate projection describe append completion
-- and append failures without changing the create-project interpretation.

BEGIN;

DO $$
DECLARE
  view_definition text;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true) INTO view_definition;
  IF position('project_video_append_completed' IN view_definition) > 0 THEN
    RETURN;
  END IF;
  IF position('WHEN latest.job_id IS NULL THEN' IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_093_anchor_missing';
  END IF;
  view_definition := replace(
    view_definition,
    'WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''corrective_attempt_requires_new_payload_version'')',
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''project_video_append_readback_pending'')' || chr(10) ||
    '            WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN jsonb_build_array(''corrective_attempt_requires_new_payload_version'')'
  );
  view_definition := replace(
    view_definition,
    'WHEN latest.job_id IS NULL THEN ''create_fresh_job''::text',
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''readback_verified''::text THEN ''project_video_append_completed''::text' || chr(10) ||
    '            WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN ''run_project_video_append_readback''::text' || chr(10) ||
    '            WHEN latest.job_id IS NULL THEN ''create_fresh_job''::text'
  );
  view_definition := replace(
    view_definition,
    'WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN ''prepare_corrective_attempt''::text',
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN ''run_project_video_append_readback''::text' || chr(10) ||
    '            WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN ''prepare_corrective_attempt''::text'
  );
  view_definition := replace(
    view_definition,
    'WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN ''correct_payload_then_build_next_attempt_version''::text',
    'WHEN wc.operation = ''append_project_videos''::text AND latest.job_status = ''failed_waiting_manual_review''::text THEN ''run_project_video_append_readback''::text' || chr(10) ||
    '            WHEN latest.job_status = ''failed_waiting_manual_review''::text THEN ''correct_payload_then_build_next_attempt_version''::text'
  );
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate, including append_project_videos terminal readback state.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: project-video append has a successful terminal state only after the
-- append action's authoritative material readback has been recorded.

BEGIN;

DO $$
DECLARE
  view_definition text;
  standard_terminal text := 'WHEN wc.lifecycle_status <> ''active''::text AND COALESCE(wc.metadata ->> ''completion_reason''::text, ''''::text) = ''first_std_project_create_completed''::text AND plan.plan_status = ''consumed''::text THEN ''first_std_project_create_completed''::text';
  append_terminal text := 'WHEN wc.lifecycle_status <> ''active''::text AND COALESCE(wc.metadata ->> ''completion_reason''::text, ''''::text) = ''project_video_append_readback_verified''::text AND plan.plan_status = ''consumed''::text THEN ''project_video_append_completed''::text' || chr(10) || '            ';
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true) INTO view_definition;
  IF position('project_video_append_readback_verified' IN view_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(standard_terminal IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_094_anchor_missing';
  END IF;
  view_definition := replace(view_definition, standard_terminal, append_terminal || standard_terminal);
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate; append success requires consumed append Plan and authoritative material readback.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: aggregate std project create attempts across every runtime Job in one
--        Case so a failed latest Job can prepare a bounded fresh-Job attempt.
-- Safety: projection only; no historical runtime fact is modified.

BEGIN;

DO $$
DECLARE
  view_definition text;
  created_object_target text := $fragment$co.job_id = latest.job_id AND co.object_type = 'std_project'::text$fragment$;
  created_object_replacement text := $fragment$co.job_id IN (
                    SELECT case_object_job.job_id
                    FROM mwb.launch_jobs case_object_job
                    WHERE case_object_job.case_id = wc.case_id
                      AND case_object_job.source_usage = wc.source_usage
                  ) AND co.object_type = 'std_project'::text$fragment$;
  last_action_target text := $fragment$pa2.job_id = latest.job_id AND pa2.action_type = 'oceanengine_std_project_create'::text$fragment$;
  last_action_replacement text := $fragment$pa2.job_id IN (
                    SELECT case_action_job.job_id
                    FROM mwb.launch_jobs case_action_job
                    WHERE case_action_job.case_id = wc.case_id
                      AND case_action_job.source_usage = wc.source_usage
                  ) AND pa2.action_type = 'oceanengine_std_project_create'::text$fragment$;
  last_readback_target text := $fragment$rb.job_id = latest.job_id
                  ORDER BY rb.created_at DESC$fragment$;
  last_readback_replacement text := $fragment$rb.job_id IN (
                    SELECT case_readback_job.job_id
                    FROM mwb.launch_jobs case_readback_job
                    WHERE case_readback_job.case_id = wc.case_id
                      AND case_readback_job.source_usage = wc.source_usage
                  )
                    AND rb.object_type = 'std_project'::text
                  ORDER BY rb.created_at DESC$fragment$;
  action_count_target text := $fragment$WHERE pa.job_id = latest.job_id) attempt ON true$fragment$;
  action_count_replacement text := $fragment$WHERE pa.job_id IN (
            SELECT case_attempt_job.job_id
            FROM mwb.launch_jobs case_attempt_job
            WHERE case_attempt_job.case_id = wc.case_id
              AND case_attempt_job.source_usage = wc.source_usage
          )) attempt ON true$fragment$;
  completed_target text := $fragment$COALESCE(attempt.std_project_create_action_count, 0) = 1 AND COALESCE(attempt.created_object_count, 0) = 1 AND COALESCE(attempt.last_readback_status, ''::text) = 'readback_verified'::text$fragment$;
  completed_replacement text := $fragment$COALESCE(attempt.std_project_create_action_count, 0) > 0 AND COALESCE(attempt.created_object_count, 0) = 1 AND COALESCE(attempt.last_readback_status, ''::text) = 'readback_verified'::text$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('case_attempt_job.source_usage = wc.source_usage' IN view_definition) = 0 THEN
    IF position('case_attempt_job.source_usage = ''runtime_truth''::text' IN view_definition) > 0 THEN
      view_definition := replace(view_definition, 'case_object_job.source_usage = ''runtime_truth''::text', 'case_object_job.source_usage = wc.source_usage');
      view_definition := replace(view_definition, 'case_action_job.source_usage = ''runtime_truth''::text', 'case_action_job.source_usage = wc.source_usage');
      view_definition := replace(view_definition, 'case_readback_job.source_usage = ''runtime_truth''::text', 'case_readback_job.source_usage = wc.source_usage');
      view_definition := replace(view_definition, 'case_attempt_job.source_usage = ''runtime_truth''::text', 'case_attempt_job.source_usage = wc.source_usage');
      EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
      RETURN;
    END IF;

    IF position(created_object_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_073_created_object_fragment_missing';
    END IF;
    view_definition := replace(view_definition, created_object_target, created_object_replacement);

    IF position(last_action_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_073_last_action_fragment_missing';
    END IF;
    view_definition := replace(view_definition, last_action_target, last_action_replacement);

    IF position(last_readback_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_073_last_readback_fragment_missing';
    END IF;
    view_definition := replace(view_definition, last_readback_target, last_readback_replacement);

    IF position(action_count_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_073_action_count_fragment_missing';
    END IF;
    view_definition := replace(view_definition, action_count_target, action_count_replacement);

    IF position(completed_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_073_completed_fragment_missing';
    END IF;
    view_definition := replace(view_definition, completed_target, completed_replacement);

    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. Std project attempts, objects and readback are aggregated across runtime Jobs in one Case; at most three versioned attempts are exposed.';

COMMIT;

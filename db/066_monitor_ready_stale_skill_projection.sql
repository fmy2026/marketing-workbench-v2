-- Target database: marketing_workbench_v2
-- Scope: remove obsolete Node 02 monitor/touchpoint Skill blockers once the
--        canonical monitor projection is READY. Projection only; no platform
--        call, historical run deletion, or runtime fact mutation.

BEGIN;

DO $$
DECLARE
  view_definition text;
  target_fragment text := $sql$WHERE sr.job_id = latest.job_id AND (sr.skill_key = ANY (ARRAY['context-resolve-account'::text, 'context-resolve-touchpoint'::text])) AND blocker.value <> ''::text$sql$;
  replacement_fragment text := $sql$WHERE sr.job_id = latest.job_id AND (sr.skill_key = ANY (ARRAY['context-resolve-account'::text, 'context-resolve-touchpoint'::text])) AND blocker.value <> ''::text
                   AND blocker.value <> ALL (ARRAY['monitor_id_missing'::text, 'touchpoint_url_missing'::text, 'touchpoint_url_hash_mismatch'::text])$sql$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;
  IF position('monitor_id_missing' IN view_definition) = 0 THEN
    IF position(target_fragment IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_monitor_skill_fragment_missing';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' ||
      replace(view_definition, target_fragment, replacement_fragment);
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. Canonical monitor readiness supersedes stale Node 02 monitor/touchpoint Skill blockers.';

COMMIT;

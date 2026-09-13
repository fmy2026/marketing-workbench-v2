-- Target database: marketing_workbench_v2
-- Scope: prefer the concrete blocked Skill reason for an already-consumed
-- prewrite Create Plan when its stored summary is only a generic readiness
-- wrapper. Projection only; no business facts are changed.

BEGIN;

DO $$
DECLARE
  view_definition text;
  target text := $fragment$jsonb_build_array(plan.metadata ->> 'confirmed_execution_blocker'::text)$fragment$;
  replacement text := $fragment$jsonb_build_array(COALESCE(
  NULLIF(CASE
    WHEN plan.metadata ->> 'confirmed_execution_blocker'::text ~~ 'readiness_not_ready:%'::text
      OR plan.metadata ->> 'confirmed_execution_blocker'::text ~~ 'aweme_id_invalid_shape:%'::text
      OR plan.metadata ->> 'confirmed_execution_blocker'::text = ANY (ARRAY['aweme_auth_probe_failed'::text, 'aweme_id_missing'::text])
      THEN ''::text
    ELSE plan.metadata ->> 'confirmed_execution_blocker'::text
  END, ''::text),
  (SELECT blocker.value
     FROM mwb.launch_skill_runs skill
     CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(skill.blockers, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE skill.job_id = latest.job_id
      AND skill.status = ANY (ARRAY['blocked'::text, 'failed'::text])
      AND blocker.value <> ''::text
      AND blocker.value !~~ 'readiness_not_ready:%'::text
      AND blocker.value !~~ 'aweme_id_invalid_shape:%'::text
      AND blocker.value <> ALL (ARRAY['aweme_auth_probe_failed'::text, 'aweme_id_missing'::text])
    ORDER BY CASE skill.skill_key
      WHEN 'create-readiness'::text THEN 0
      WHEN 'aweme-authorization-readonly'::text THEN 1
      ELSE 2
    END, blocker.ordinality
    LIMIT 1),
  plan.metadata ->> 'confirmed_execution_blocker'::text))$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('confirmed_prewrite_blocker_resolution' IN obj_description('mwb.workflow_case_summary'::regclass, 'pg_class')) > 0 THEN
    RETURN;
  END IF;

  IF position(target IN view_definition) = 0 THEN
    RAISE EXCEPTION 'workflow_case_summary_089_blocker_fragment_missing';
  END IF;
  view_definition := replace(view_definition, target, replacement);
  EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. confirmed_prewrite_recovery_gate: a consumed std_project_create Plan blocked before any create action permits only fresh readonly recovery. confirmed_prewrite_blocker_resolution: generic prewrite wrappers resolve to the concrete blocked Skill reason.';

COMMIT;

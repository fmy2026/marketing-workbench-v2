-- Target database: marketing_workbench_v2
-- Scope: remove the invalid route-level Monitor agent reference and make the
--        Case projection surface a confirmed pre-write failure before the
--        generic monitor-plan blocker.
-- Safety: configuration/projection only; no platform call, Plan, confirmation,
--         action, object, or account identity fact is created or modified.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      (
        raw_defaults
        #- '{monitor_provision,agent_id}'
      ),
      '{monitor_provision_reference_candidates}',
      coalesce(raw_defaults->'monitor_provision_reference_candidates', '{}'::jsonb) - 'agent_id',
      true
    ),
    updated_at = now()
WHERE raw_defaults ? 'monitor_provision'
  AND (
    raw_defaults->'monitor_provision' ? 'agent_id'
    OR raw_defaults->'monitor_provision_reference_candidates' ? 'agent_id'
  );

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{monitor_provision,account_specific_fields}',
      CASE
        WHEN coalesce(raw_defaults->'monitor_provision'->'account_specific_fields', '[]'::jsonb) @> '["agent_id"]'::jsonb
          THEN coalesce(raw_defaults->'monitor_provision'->'account_specific_fields', '[]'::jsonb)
        ELSE coalesce(raw_defaults->'monitor_provision'->'account_specific_fields', '[]'::jsonb) || '["agent_id"]'::jsonb
      END,
      true
    ),
    updated_at = now()
WHERE raw_defaults ? 'monitor_provision';

DO $$
DECLARE
  view_definition text;
  candidate_target text := $fragment$UNION ALL
                 SELECT blocker.value,
                    5,
                    blocker.ordinality::integer AS ordinality
                   FROM jsonb_array_elements_text(COALESCE(plan.metadata -> 'root_blocker_codes'::text, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
                  WHERE blocker.value <> ''::text$fragment$;
  candidate_replacement text := $fragment$UNION ALL
                 SELECT COALESCE(plan.metadata ->> 'confirmed_execution_blocker'::text, ''::text),
                    0,
                    0
                  WHERE latest.job_status = 'blocked_confirmed_monitor_plan'::text
                    AND plan.plan_kind = 'monitor_bootstrap'::text
                    AND plan.plan_status = 'consumed'::text
                    AND COALESCE(plan.metadata ->> 'confirmed_execution_outcome'::text, ''::text) = 'blocked_before_platform_write'::text
                    AND COALESCE(plan.metadata ->> 'confirmed_execution_blocker'::text, ''::text) <> ''::text
                UNION ALL
                 SELECT blocker.value,
                    5,
                    blocker.ordinality::integer AS ordinality
                   FROM jsonb_array_elements_text(COALESCE(plan.metadata -> 'root_blocker_codes'::text, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
                  WHERE blocker.value <> ''::text$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('confirmed_execution_blocker' IN view_definition) = 0 THEN
    IF position(candidate_target IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_083_confirmed_monitor_blocker_fragment_missing';
    END IF;
    view_definition := replace(view_definition, candidate_target, candidate_replacement);
    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mwb.game_route_defaults
    WHERE raw_defaults->'monitor_provision' ? 'agent_id'
       OR raw_defaults->'monitor_provision_reference_candidates' ? 'agent_id'
  ) THEN
    RAISE EXCEPTION 'route_level_monitor_agent_id_must_be_absent';
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. A consumed monitor Bootstrap Plan that stopped before platform write projects its confirmed execution blocker before generic monitor readiness; consumers must use this projection only.';

COMMIT;

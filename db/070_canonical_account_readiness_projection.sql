-- Target database: marketing_workbench_v2
-- Scope: let the current canonical advertiser account supersede obsolete
--        context-resolve-account blockers. Projection only; preserves history
--        and does not call a platform or mutate runtime facts.

BEGIN;

DO $$
DECLARE
  view_definition text;
  target_fragment text := $sql$WHERE sr.job_id = latest.job_id AND (sr.skill_key = ANY (ARRAY['context-resolve-account'::text, 'context-resolve-touchpoint'::text])) AND blocker.value <> ''::text AND (blocker.value <> ALL (ARRAY['monitor_id_missing'::text, 'touchpoint_url_missing'::text, 'touchpoint_url_hash_mismatch'::text]))$sql$;
  replacement_fragment text := $sql$WHERE sr.job_id = latest.job_id AND (sr.skill_key = ANY (ARRAY['context-resolve-account'::text, 'context-resolve-touchpoint'::text])) AND blocker.value <> ''::text AND (blocker.value <> ALL (ARRAY['monitor_id_missing'::text, 'touchpoint_url_missing'::text, 'touchpoint_url_hash_mismatch'::text]))
                     AND NOT (blocker.value = 'account_missing'::text AND EXISTS (
                       SELECT 1
                       FROM mwb.advertiser_accounts current_account
                       WHERE current_account.advertiser_id = wc.advertiser_id
                         AND current_account.route_id = wc.route_id
                         AND current_account.game_code = wc.game_code
                     ))
                     AND NOT (blocker.value = 'account_not_ready'::text AND EXISTS (
                       SELECT 1
                       FROM mwb.advertiser_accounts current_account
                       WHERE current_account.advertiser_id = wc.advertiser_id
                         AND current_account.route_id = wc.route_id
                         AND current_account.game_code = wc.game_code
                         AND current_account.auth_status = 'ready'::text
                     ))$sql$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('current_account.auth_status = ''ready''::text' IN view_definition) = 0 THEN
    IF position(target_fragment IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_account_skill_fragment_missing';
    END IF;

    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' ||
      replace(view_definition, target_fragment, replacement_fragment);
  END IF;
END;
$$;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. Canonical monitor and account readiness supersede obsolete context Skill blockers; historical Skill records remain auditable.';

COMMIT;

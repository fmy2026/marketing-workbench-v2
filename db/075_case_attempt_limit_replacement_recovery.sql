-- Target database: marketing_workbench_v2
-- Scope: make the maximum std-project create attempts an explicit Case fact.
--        Existing Cases retain their historical default of three attempts;
--        approved replacement Cases may use exactly one validation attempt.
-- Safety: no platform call, Plan/action/object fabrication, or historical
--         runtime fact rewrite occurs in this migration.

BEGIN;

ALTER TABLE mwb.workflow_cases
  ADD COLUMN IF NOT EXISTS maximum_create_attempts integer NOT NULL DEFAULT 3;

ALTER TABLE mwb.workflow_cases
  DROP CONSTRAINT IF EXISTS workflow_cases_maximum_create_attempts_check;

ALTER TABLE mwb.workflow_cases
  ADD CONSTRAINT workflow_cases_maximum_create_attempts_check
  CHECK (maximum_create_attempts BETWEEN 1 AND 3);

-- Preserve the evolved View rather than rebuilding an older definition. The
-- exact fragments are asserted so a future incompatible projection fails
-- closed during migration instead of silently retaining a hard-coded limit.
DO $$
DECLARE
  view_definition text;
  limit_fragment text := $fragment$COALESCE(attempt.std_project_create_action_count, 0) >= 3$fragment$;
  next_attempt_fragment text := $fragment$'maximum_attempts', 3, 'next_attempt_no', LEAST(COALESCE(attempt.std_project_create_action_count, 0) + 1, 4)$fragment$;
BEGIN
  SELECT pg_get_viewdef('mwb.workflow_case_summary'::regclass, true)
    INTO view_definition;

  IF position('wc.maximum_create_attempts' IN view_definition) = 0 THEN
    IF position(limit_fragment IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_075_attempt_limit_fragment_missing';
    END IF;
    view_definition := replace(
      view_definition,
      limit_fragment,
      'COALESCE(attempt.std_project_create_action_count, 0) >= wc.maximum_create_attempts'
    );

    IF position(next_attempt_fragment IN view_definition) = 0 THEN
      RAISE EXCEPTION 'workflow_case_summary_075_next_attempt_fragment_missing';
    END IF;
    view_definition := replace(
      view_definition,
      next_attempt_fragment,
      '''maximum_attempts'', wc.maximum_create_attempts, ''next_attempt_no'', LEAST(COALESCE(attempt.std_project_create_action_count, 0) + 1, wc.maximum_create_attempts + 1)'
    );

    EXECUTE 'CREATE OR REPLACE VIEW mwb.workflow_case_summary AS ' || view_definition;
  END IF;
END;
$$;

COMMENT ON COLUMN mwb.workflow_cases.maximum_create_attempts IS
  'Case-level upper bound for std_project_create. Ordinary Cases default to three; an approved replacement Case may be one.';

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. Std-project action limits are aggregated across runtime Jobs in one Case and read from workflow_cases.maximum_create_attempts.';

COMMIT;

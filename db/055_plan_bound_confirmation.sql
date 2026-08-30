-- Target database: marketing_workbench_v2
-- Scope: allow one immutable Execution Plan confirmation before Node 5 derives a final draft.
-- Safety: no new table and no raw request/response fields.

BEGIN;

ALTER TABLE mwb.launch_confirmations
  ALTER COLUMN draft_id DROP NOT NULL;

COMMENT ON COLUMN mwb.launch_confirmations.draft_id IS
  'Nullable only for confirmation_status=confirmed_for_execution_plan. The final draft records its deterministic plan derivation separately.';

COMMIT;

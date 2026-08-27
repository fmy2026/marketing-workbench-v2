-- Target database: marketing_workbench_v2
-- Scope: add monitor provision attempt idempotency linkage for planned-action execution.
-- Safety: stores only plan/job references and deterministic idempotency keys.
-- No token, Cookie, full URL, raw request, or raw response may be stored here.

BEGIN;

ALTER TABLE mwb.monitor_provision_attempts
  ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_monitor_provision_attempts_idempotency_key
  ON mwb.monitor_provision_attempts(idempotency_key)
  WHERE idempotency_key <> '';

COMMENT ON COLUMN mwb.monitor_provision_attempts.idempotency_key IS
  'Deterministic planned-action idempotency key. Empty for legacy/manual rows.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: distinguish post-push propagation from genuine target visibility failures.
-- Safety: status and redacted metadata only; no credentials or raw payloads.

BEGIN;

ALTER TABLE mwb.dmp_package_member_account_states
  DROP CONSTRAINT IF EXISTS dmp_package_member_account_states_readonly_status_check;

ALTER TABLE mwb.dmp_package_member_account_states
  ADD CONSTRAINT dmp_package_member_account_states_readonly_status_check CHECK (
    readonly_status IN (
      'not_checked',
      'passed',
      'missing',
      'blocked',
      'readback_pending',
      'visible_not_available',
      'not_visible_after_push',
      'credential_required',
      'readonly_permission_required',
      'transport_failed'
    )
  );

COMMENT ON COLUMN mwb.dmp_package_member_account_states.readonly_status IS
  'Target-account DMP truth. readback_pending means push accepted but the bounded batch readback window did not yet confirm availability.';

COMMIT;

-- Target database: marketing_workbench_v2
-- Scope: target-account scoped DMP package member readonly state.
-- Safety: no token, Cookie, raw request, raw response, raw payload, or URL storage.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.dmp_package_member_account_states (
  account_state_id text PRIMARY KEY,
  package_set_id text NOT NULL REFERENCES mwb.dmp_package_sets(package_set_id) ON DELETE CASCADE,
  custom_audience_id text NOT NULL,
  advertiser_id text NOT NULL,
  readonly_status text NOT NULL DEFAULT 'not_checked',
  evidence_ref text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_usage text NOT NULL DEFAULT 'runtime_truth',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dmp_package_member_account_states_id_numeric_check CHECK (custom_audience_id ~ '^[0-9]+$'),
  CONSTRAINT dmp_package_member_account_states_advertiser_numeric_check CHECK (advertiser_id ~ '^[0-9]+$'),
  CONSTRAINT dmp_package_member_account_states_readonly_status_check CHECK (
    readonly_status IN ('not_checked', 'passed', 'missing', 'blocked', 'credential_required', 'readonly_permission_required', 'transport_failed')
  ),
  CONSTRAINT dmp_package_member_account_states_metadata_shape_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT dmp_package_member_account_states_no_sensitive_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|tf-api\\.3k\\.com|callback/click|landing_url)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dmp_package_member_account_states_scope
  ON mwb.dmp_package_member_account_states(package_set_id, custom_audience_id, advertiser_id);

ALTER TABLE mwb.platform_actions
  DROP CONSTRAINT IF EXISTS platform_actions_single_std_project_create;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_actions_singleton_by_job_action_attempt
  ON mwb.platform_actions(job_id, action_type, attempt_no)
  WHERE action_type IN (
    'oceanengine_std_project_create',
    'oceanengine_advertiser_avatar_upload',
    'oceanengine_advertiser_avatar_submit'
  );

COMMENT ON TABLE mwb.dmp_package_member_account_states IS
  'Target-account scoped DMP baseline member readonly state. Prevents one advertiser target check from overwriting another account truth.';

COMMENT ON COLUMN mwb.dmp_package_members.target_readonly_status IS
  'Legacy non-account-scoped target status. New runtime code reads/writes mwb.dmp_package_member_account_states for target-account truth.';

COMMIT;

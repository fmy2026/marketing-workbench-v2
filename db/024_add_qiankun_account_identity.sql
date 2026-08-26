-- Target database: marketing_workbench_v2
-- Scope: add redacted Qiankun technical account identity fields and allow readonly option relations
-- from Qiankun account/select endpoints.
-- Safety: never store passport tokens, request headers, raw requests/responses, host names, or complete URLs here.

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS qiankun_account_record_id text,
  ADD COLUMN IF NOT EXISTS qiankun_owner_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qiankun_agent_id text,
  ADD COLUMN IF NOT EXISTS qiankun_identity_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS qiankun_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertiser_accounts_qiankun_identity_status_check'
      AND conrelid = 'mwb.advertiser_accounts'::regclass
  ) THEN
    ALTER TABLE mwb.advertiser_accounts
      ADD CONSTRAINT advertiser_accounts_qiankun_identity_status_check
      CHECK (qiankun_identity_status IN ('unverified', 'observed', 'verified', 'mismatch'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertiser_accounts_qiankun_identity_no_sensitive_check'
      AND conrelid = 'mwb.advertiser_accounts'::regclass
  ) THEN
    ALTER TABLE mwb.advertiser_accounts
      ADD CONSTRAINT advertiser_accounts_qiankun_identity_no_sensitive_check
      CHECK (
        coalesce(qiankun_owner_key, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com|https?://)'
        AND coalesce(qiankun_account_record_id, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com|https?://)'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_advertiser_accounts_qiankun_record
  ON mwb.advertiser_accounts(qiankun_account_record_id)
  WHERE qiankun_account_record_id IS NOT NULL AND qiankun_account_record_id <> '';

ALTER TABLE mwb.qiankun_option_relations
  DROP CONSTRAINT IF EXISTS qiankun_option_relations_type_check;

ALTER TABLE mwb.qiankun_option_relations
  ADD CONSTRAINT qiankun_option_relations_type_check CHECK (
    relation_type <> ''
    AND parent_type <> ''
    AND parent_id <> ''
    AND child_type <> ''
    AND child_id <> ''
    AND (
      source_endpoint ~ '^/tf/ad/'
      OR source_endpoint = '/tf/account_info/accountIndex'
      OR source_endpoint = '/ajax/selectList/getList'
    )
  );

UPDATE mwb.game_route_defaults
SET raw_defaults =
      jsonb_set(
        (
          raw_defaults
          #- '{monitor_provision,media_id}'
          #- '{monitor_provision,agent_id}'
          #- '{monitor_provision,monitor_api}'
        ),
        '{monitor_provision_reference_candidates}',
        jsonb_build_object(
          'media_id', raw_defaults #>> '{monitor_provision,media_id}',
          'agent_id', raw_defaults #>> '{monitor_provision,agent_id}',
          'monitor_api', raw_defaults #>> '{monitor_provision,monitor_api}',
          'source_ref', raw_defaults #>> '{monitor_provision,source_ref}',
          'status', 'reference_only'
        ),
        true
      ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND raw_defaults ? 'monitor_provision'
  AND (
    raw_defaults -> 'monitor_provision' ? 'media_id'
    OR raw_defaults -> 'monitor_provision' ? 'agent_id'
    OR raw_defaults -> 'monitor_provision' ? 'monitor_api'
  );

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{monitor_provision_status}',
      '"qiankun_monitor_config_unverified"'::jsonb,
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_account_record_id IS
  'Qiankun account record ID. This is the only source for monitor create media_account_id after readonly verification.';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_owner_key IS
  'Redacted Qiankun owner key observed from readonly accountIndex. Backend controlled use only.';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_agent_id IS
  'Current Qiankun agent ID observed from readonly account/account-media cascades.';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_identity_status IS
  'unverified/observed/verified/mismatch status for the Qiankun technical identity.';

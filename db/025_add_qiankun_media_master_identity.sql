-- Target database: marketing_workbench_v2
-- Scope: store Qiankun level-2 media identity observed from accountIndex.
-- Safety: level-3 media resource positions stay in qiankun_option_relations.

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS qiankun_media_master_id text,
  ADD COLUMN IF NOT EXISTS qiankun_media_master_name text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertiser_accounts_qiankun_media_master_no_sensitive_check'
      AND conrelid = 'mwb.advertiser_accounts'::regclass
  ) THEN
    ALTER TABLE mwb.advertiser_accounts
      ADD CONSTRAINT advertiser_accounts_qiankun_media_master_no_sensitive_check
      CHECK (
        coalesce(qiankun_media_master_id, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com|https?://)'
        AND coalesce(qiankun_media_master_name, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com|https?://)'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_advertiser_accounts_qiankun_media_master
  ON mwb.advertiser_accounts(qiankun_media_master_id)
  WHERE qiankun_media_master_id IS NOT NULL AND qiankun_media_master_id <> '';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_media_master_id IS
  'Qiankun level-2 media identity observed from accountIndex.media_master_id.';

COMMENT ON COLUMN mwb.advertiser_accounts.qiankun_media_master_name IS
  'Qiankun level-2 media display name observed from accountIndex.media_master_id_name.';

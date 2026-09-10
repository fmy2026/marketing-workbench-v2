-- Target database: marketing_workbench_v2
-- Scope: record bounded, explicit-system-rate-limit deliveries beneath one
-- logical standard-project create action. No raw request or response is kept.

BEGIN;

ALTER TABLE mwb.platform_actions
  DROP CONSTRAINT IF EXISTS platform_actions_error_category_check;

ALTER TABLE mwb.platform_actions
  ADD CONSTRAINT platform_actions_error_category_check CHECK (
    error_category IN (
      '',
      'invalid_field',
      'permission_denied',
      'resource_not_eligible',
      'landing_url_invalid',
      'system_rate_limited',
      'unclassified'
    )
  );

CREATE TABLE IF NOT EXISTS mwb.platform_action_deliveries (
  delivery_id text PRIMARY KEY,
  action_id text NOT NULL REFERENCES mwb.platform_actions(action_id),
  delivery_no integer NOT NULL,
  delivery_status text NOT NULL,
  scheduled_offset_ms integer NOT NULL,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  request_hash text NOT NULL DEFAULT '',
  response_hash text NOT NULL DEFAULT '',
  http_status integer,
  api_code text NOT NULL DEFAULT '',
  request_id_present boolean NOT NULL DEFAULT false,
  object_id_present boolean NOT NULL DEFAULT false,
  error_category text NOT NULL DEFAULT '',
  error_summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT platform_action_deliveries_action_no_unique UNIQUE (action_id, delivery_no),
  CONSTRAINT platform_action_deliveries_no_check CHECK (delivery_no BETWEEN 1 AND 3),
  CONSTRAINT platform_action_deliveries_offset_check CHECK (scheduled_offset_ms BETWEEN 0 AND 49000),
  CONSTRAINT platform_action_deliveries_status_check CHECK (delivery_status IN (
    'started',
    'rate_limited',
    'succeeded',
    'failed',
    'failed_or_unconfirmed'
  )),
  CONSTRAINT platform_action_deliveries_no_sensitive_raw_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|authorization|cookie|tf-api\\.3k\\.com|callback/click)'
  )
);

CREATE INDEX IF NOT EXISTS platform_action_deliveries_action_idx
  ON mwb.platform_action_deliveries(action_id, delivery_no);

ALTER TABLE mwb.platform_action_deliveries
  DROP CONSTRAINT IF EXISTS platform_action_deliveries_action_id_fkey;

ALTER TABLE mwb.platform_action_deliveries
  ADD CONSTRAINT platform_action_deliveries_action_id_fkey
  FOREIGN KEY (action_id) REFERENCES mwb.platform_actions(action_id) ON DELETE CASCADE;

COMMENT ON TABLE mwb.platform_action_deliveries IS
  'Bounded physical deliveries for one logical platform action. Stores only hashes and safe outcome summaries.';

COMMENT ON COLUMN mwb.platform_actions.error_category IS
  'Allowlisted diagnostic category. system_rate_limited applies only to explicit 40100 handling; raw platform text is never retained.';

COMMIT;

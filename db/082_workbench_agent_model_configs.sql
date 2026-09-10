-- Target database: marketing_workbench_v2
-- Scope: per-user Agent model configuration metadata only. API keys remain in
-- the local 0600 credential store and are never persisted in Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.workbench_agent_model_configs (
  user_id text NOT NULL REFERENCES mwb.workbench_users(user_id),
  agent_key text NOT NULL,
  protocol text NOT NULL DEFAULT 'openai_compatible',
  model_name text NOT NULL,
  api_base text NOT NULL,
  credential_ref text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  test_status text NOT NULL DEFAULT 'not_configured',
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_key),
  CONSTRAINT workbench_agent_model_protocol_check CHECK (protocol = 'openai_compatible'),
  CONSTRAINT workbench_agent_model_agent_key_check CHECK (agent_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT workbench_agent_model_name_check CHECK (model_name ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  CONSTRAINT workbench_agent_model_api_base_check CHECK (api_base ~ '^https?://[^/?#@]+(/[^?#]*)?$'),
  CONSTRAINT workbench_agent_model_credential_ref_check CHECK (credential_ref ~ '^local:workbench_llm:[A-Za-z0-9_.:-]+:[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT workbench_agent_model_test_status_check CHECK (test_status IN ('not_configured', 'not_tested', 'passed', 'failed')),
  CONSTRAINT workbench_agent_model_enabled_tested_check CHECK (NOT enabled OR test_status = 'passed')
);

CREATE INDEX IF NOT EXISTS idx_workbench_agent_model_configs_user_updated
  ON mwb.workbench_agent_model_configs(user_id, updated_at DESC);

COMMIT;

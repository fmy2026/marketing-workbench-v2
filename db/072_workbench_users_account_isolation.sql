-- Target database: marketing_workbench_v2
-- Scope: authenticated LAN workbench users, single-owner advertiser access and
-- per-user workflow reporting. This migration does not change workflow nodes,
-- business gates, plans, actions or platform permissions.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.workbench_users (
  user_id text PRIMARY KEY,
  login_name text NOT NULL,
  display_name text NOT NULL,
  qiankun_owner_key text NOT NULL,
  user_role text NOT NULL DEFAULT 'operator',
  user_status text NOT NULL DEFAULT 'active',
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workbench_users_role_check CHECK (user_role IN ('admin', 'operator')),
  CONSTRAINT workbench_users_status_check CHECK (user_status IN ('active', 'disabled')),
  CONSTRAINT workbench_users_login_shape_check CHECK (login_name ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  CONSTRAINT workbench_users_owner_key_shape_check CHECK (qiankun_owner_key ~ '^[A-Za-z][A-Za-z0-9_-]{2,127}$'),
  CONSTRAINT workbench_users_password_hash_check CHECK (password_hash ~ '^scrypt[$]v1[$]')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_workbench_users_login_lower
  ON mwb.workbench_users(lower(login_name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_workbench_users_owner_key_lower
  ON mwb.workbench_users(lower(qiankun_owner_key));

CREATE TABLE IF NOT EXISTS mwb.workbench_sessions (
  session_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES mwb.workbench_users(user_id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workbench_sessions_token_hash_check CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_workbench_sessions_active_user
  ON mwb.workbench_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS mwb.workbench_audit_events (
  audit_event_id text PRIMARY KEY,
  actor_user_id text REFERENCES mwb.workbench_users(user_id),
  subject_user_id text REFERENCES mwb.workbench_users(user_id),
  advertiser_id text REFERENCES mwb.advertiser_accounts(advertiser_id),
  event_type text NOT NULL,
  event_status text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workbench_audit_summary_object_check CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT workbench_audit_no_sensitive_raw_text_check CHECK (
    summary::text !~* '(password|password_hash|token|authorization|cookie|raw_request|raw_response|raw_payload|passport|callback/click|https?://)'
  )
);

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES mwb.workbench_users(user_id);

ALTER TABLE mwb.workflow_cases
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES mwb.workbench_users(user_id),
  ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES mwb.workbench_users(user_id);

ALTER TABLE mwb.launch_confirmations
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id text REFERENCES mwb.workbench_users(user_id);

CREATE INDEX IF NOT EXISTS idx_advertiser_accounts_owner_user
  ON mwb.advertiser_accounts(owner_user_id, advertiser_id);
CREATE INDEX IF NOT EXISTS idx_workflow_cases_owner_runtime
  ON mwb.workflow_cases(owner_user_id, source_usage, lifecycle_status, updated_at DESC);

INSERT INTO mwb.workbench_users (
  user_id, login_name, display_name, qiankun_owner_key,
  user_role, user_status, password_hash, must_change_password
) VALUES
  ('USR-FENGMEIYU', 'fengmeiyu', '冯美钰', 'fengmeiyu', 'admin', 'active',
   'scrypt$v1$16384$8$1$KEIPcG6c6D7utQSP96QTfg$TitPVIo3NQWhI8LHAQ0HeYyIj90ChwaYlr6bHXDUP7wLk9ABhHMw8RyoUZB4hMtqWAM6pWAcfFdEsu-Slwv2Hg', true),
  ('USR-ZHANGJINGWEI', 'zhangjingwei', '张境威', 'zhangjingwei', 'operator', 'active',
   'scrypt$v1$16384$8$1$k8fo42H3KUW4L8WwpIdNjA$-lx8Vz2xtp0Fa8cj621Y5F1RjbUVZP8QgLDH5iCUMK0cZ1Xb3aH0898A-j6zD_AzTs6GHPkSnyW0qMh-dYE9Ww', true),
  ('USR-ZHANGCHAOBO', 'zhangchaobo', '张超博', 'zhangchaobo', 'operator', 'active',
   'scrypt$v1$16384$8$1$PULG2TETJ-Hasaldk0m45Q$iwznoWcglucMXPJaMx8swXtOawrRvyYnQtAl3a3c3aeymlHSFcrXNrdUVGzPnXaWH6Unrvov9LnnQpCkmhxZUA', true)
ON CONFLICT (user_id) DO UPDATE SET
  login_name = EXCLUDED.login_name,
  display_name = EXCLUDED.display_name,
  qiankun_owner_key = EXCLUDED.qiankun_owner_key,
  user_role = EXCLUDED.user_role,
  updated_at = now();

UPDATE mwb.advertiser_accounts account
SET owner_user_id = app_user.user_id,
    updated_at = now()
FROM mwb.workbench_users app_user
WHERE account.owner_user_id IS NULL
  AND lower(account.qiankun_owner_key) = lower(app_user.qiankun_owner_key);

UPDATE mwb.workflow_cases workflow_case
SET owner_user_id = account.owner_user_id,
    created_by_user_id = coalesce(workflow_case.created_by_user_id, account.owner_user_id),
    updated_at = now()
FROM mwb.advertiser_accounts account
WHERE workflow_case.advertiser_id = account.advertiser_id
  AND workflow_case.owner_user_id IS NULL
  AND account.owner_user_id IS NOT NULL;

CREATE OR REPLACE VIEW mwb.v_user_workflow_case_detail AS
SELECT
  summary.case_id,
  workflow_case.owner_user_id,
  owner_user.login_name AS owner_login_name,
  owner_user.display_name AS owner_display_name,
  workflow_case.created_by_user_id,
  summary.route_id,
  summary.game_code,
  summary.advertiser_id,
  account.account_name,
  summary.lifecycle_status,
  summary.latest_job_id,
  summary.latest_job_status,
  summary.current_gate,
  summary.root_blocker_codes,
  summary.action_readback_state,
  (summary.current_gate = 'first_std_project_create_completed') AS create_verified,
  summary.created_at AS case_created_at,
  summary.updated_at AS case_updated_at,
  summary.latest_job_updated_at
FROM mwb.workflow_case_summary summary
JOIN mwb.workflow_cases workflow_case ON workflow_case.case_id = summary.case_id
JOIN mwb.advertiser_accounts account ON account.advertiser_id = summary.advertiser_id
LEFT JOIN mwb.workbench_users owner_user ON owner_user.user_id = workflow_case.owner_user_id
WHERE summary.source_usage = 'runtime_truth';

CREATE OR REPLACE VIEW mwb.v_user_workflow_summary AS
WITH account_counts AS (
  SELECT owner_user_id, count(*)::integer AS advertiser_count
  FROM mwb.advertiser_accounts
  WHERE owner_user_id IS NOT NULL
  GROUP BY owner_user_id
), case_counts AS (
  SELECT
    owner_user_id,
    count(*)::integer AS case_count,
    count(*) FILTER (WHERE create_verified)::integer AS verified_success_count,
    count(*) FILTER (WHERE lifecycle_status = 'active')::integer AS active_case_count,
    count(*) FILTER (
      WHERE jsonb_array_length(coalesce(root_blocker_codes, '[]'::jsonb)) > 0
    )::integer AS blocked_case_count,
    count(*) FILTER (
      WHERE NOT create_verified
        AND lifecycle_status <> 'active'
    )::integer AS terminal_unsuccessful_count
  FROM mwb.v_user_workflow_case_detail
  WHERE owner_user_id IS NOT NULL
  GROUP BY owner_user_id
)
SELECT
  app_user.user_id,
  app_user.login_name,
  app_user.display_name,
  app_user.user_role,
  app_user.user_status,
  coalesce(account_counts.advertiser_count, 0) AS advertiser_count,
  coalesce(case_counts.case_count, 0) AS case_count,
  coalesce(case_counts.verified_success_count, 0) AS verified_success_count,
  coalesce(case_counts.active_case_count, 0) AS active_case_count,
  coalesce(case_counts.blocked_case_count, 0) AS blocked_case_count,
  coalesce(case_counts.terminal_unsuccessful_count, 0) AS terminal_unsuccessful_count
FROM mwb.workbench_users app_user
LEFT JOIN account_counts ON account_counts.owner_user_id = app_user.user_id
LEFT JOIN case_counts ON case_counts.owner_user_id = app_user.user_id;

COMMIT;

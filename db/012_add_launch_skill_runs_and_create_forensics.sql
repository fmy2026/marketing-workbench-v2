-- Target database: marketing_workbench_v2
-- Scope: add OE3 workflow Skill run audit table and redacted create forensics.
-- Safety: stores only hashes, manifests, summaries, and status flags. No raw
-- payload, raw response, token, Cookie, secret, auth_code, or full touchpoint URL.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.launch_skill_runs (
  skill_run_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  node_key text NOT NULL,
  skill_key text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  input_hash text NOT NULL DEFAULT '',
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_usage text NOT NULL DEFAULT 'runtime_truth',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT launch_skill_runs_unique_attempt UNIQUE (job_id, skill_key, attempt_no),
  CONSTRAINT launch_skill_runs_source_usage_check CHECK (source_usage IN (
    'runtime_truth',
    'reference_only',
    'seed_source',
    'private_runtime',
    'test_run'
  )),
  CONSTRAINT launch_skill_runs_status_check CHECK (status IN (
    'waiting',
    'running',
    'passed',
    'blocked',
    'locked',
    'failed',
    'skipped',
    'needs_confirmation',
    'mock_passed'
  ))
);

ALTER TABLE mwb.platform_actions
  ADD COLUMN IF NOT EXISTS request_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform_error_message_safe text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS platform_error_field text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS request_field_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS launch_skill_runs_job_node_idx
  ON mwb.launch_skill_runs(job_id, node_key);

CREATE INDEX IF NOT EXISTS launch_skill_runs_job_skill_idx
  ON mwb.launch_skill_runs(job_id, skill_key);

COMMIT;

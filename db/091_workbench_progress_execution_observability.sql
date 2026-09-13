-- Target database: marketing_workbench_v2
-- Scope: durable per-run timing and explicit Plan execution state.
-- Safety: stores only mode, status, Plan IDs and timestamps; no raw requests,
-- responses, credentials, URLs, or business payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.launch_execution_cycles (
  cycle_id text PRIMARY KEY,
  job_id text NOT NULL,
  cycle_no integer NOT NULL,
  run_mode text NOT NULL,
  plan_id text,
  cycle_status text NOT NULL CHECK (cycle_status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT launch_execution_cycles_job_cycle_unique UNIQUE (job_id, cycle_no),
  CONSTRAINT launch_execution_cycles_summary_shape CHECK (jsonb_typeof(outcome_summary) = 'object'),
  CONSTRAINT launch_execution_cycles_no_sensitive_raw_text CHECK (
    outcome_summary::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|authorization|cookie|tf-api\\.3k\\.com|callback/click)'
  )
);
ALTER TABLE mwb.launch_execution_cycles
  ADD CONSTRAINT launch_execution_cycles_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES mwb.launch_jobs(job_id) ON DELETE CASCADE;
ALTER TABLE mwb.launch_execution_cycles
  ADD CONSTRAINT launch_execution_cycles_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES mwb.launch_execution_plans(plan_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_launch_execution_cycles_job_started
  ON mwb.launch_execution_cycles(job_id, started_at DESC);

ALTER TABLE mwb.launch_skill_runs
  DROP CONSTRAINT IF EXISTS launch_skill_runs_job_id_skill_key_attempt_no_key;
ALTER TABLE mwb.launch_skill_runs
  ADD CONSTRAINT launch_skill_runs_job_cycle_skill_attempt_unique
  UNIQUE (job_id, execution_cycle, skill_key, attempt_no);

DROP INDEX IF EXISTS mwb.ux_launch_execution_plans_one_active_per_job;
CREATE UNIQUE INDEX IF NOT EXISTS ux_launch_execution_plans_one_active_per_job
  ON mwb.launch_execution_plans(job_id)
  WHERE plan_status IN ('blocked', 'planned', 'ready', 'executing', 'waiting_readback');

COMMENT ON TABLE mwb.launch_execution_cycles IS
  'One durable execution cycle per Job run. Skill rows reference its cycle_no so elapsed time never merges separate runs.';

COMMIT;

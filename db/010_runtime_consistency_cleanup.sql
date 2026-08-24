-- Target database: marketing_workbench_v2
-- Scope: runtime consistency cleanup after the first fixed std_project/create attempt.
-- Does not touch legacy databases or call any platform API.

BEGIN;

ALTER TABLE mwb.launch_jobs
  DROP CONSTRAINT IF EXISTS launch_jobs_source_usage_check;

ALTER TABLE mwb.launch_jobs
  ADD CONSTRAINT launch_jobs_source_usage_check
  CHECK (source_usage IN ('runtime_truth', 'reference_only', 'seed_source', 'private_runtime', 'test_run'));

ALTER TABLE mwb.evidence_artifacts
  DROP CONSTRAINT IF EXISTS evidence_artifacts_source_usage_check;

ALTER TABLE mwb.evidence_artifacts
  ADD CONSTRAINT evidence_artifacts_source_usage_check
  CHECK (source_usage IN ('runtime_truth', 'reference_only', 'seed_source', 'private_runtime', 'test_run'));

UPDATE mwb.launch_jobs
SET job_status = 'failed_waiting_manual_review',
    current_node = '7',
    updated_at = now()
WHERE job_id = 'JOB-MWBV2-20260824014546-851B76';

UPDATE mwb.launch_node_runs
SET output_summary = output_summary || jsonb_build_object(
      'output', 'readback_failed',
      'readbackStatus', 'not_found_or_mismatch',
      'realObjectIdPresent', false
    ),
    status = 'failed',
    diagnostic_level = 'error',
    finished_at = now()
WHERE job_id = 'JOB-MWBV2-20260824014546-851B76'
  AND node_key = 'readback_closer'
  AND (
    status = 'failed'
    OR output_summary->>'readback_status' = 'not_found_or_mismatch'
    OR output_summary->>'readbackStatus' = 'not_found_or_mismatch'
  );

ALTER TABLE mwb.games
  DROP COLUMN IF EXISTS app_id;

COMMIT;

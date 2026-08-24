-- Target database: marketing_workbench_v2
-- Scope: purge historical runtime placeholder/test jobs that have no platform actions
-- and no created objects. Keeps dimension truth tables and the protected failed job.
-- Does not touch legacy databases or call any platform API.

BEGIN;

CREATE TEMP TABLE _mwb011_candidate_jobs ON COMMIT DROP AS
SELECT j.job_id
FROM mwb.launch_jobs j
WHERE (
    (
      j.source_usage = 'runtime_truth'
      AND j.job_id <> 'JOB-MWBV2-20260824014546-851B76'
      AND j.source_record_ref = 'api:intake:97f20040f3d3d423'
    )
    OR j.source_usage = 'test_run'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM mwb.platform_actions pa
    WHERE pa.job_id = j.job_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM mwb.created_objects co
    WHERE co.job_id = j.job_id
  );

CREATE TEMP TABLE _mwb011_audit_counts (
  metric text PRIMARY KEY,
  value bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _mwb011_audit_counts(metric, value)
VALUES
  ('candidate_job_count_before', (SELECT count(*) FROM _mwb011_candidate_jobs)),
  ('candidate_evidence_count_before', (
    SELECT count(*)
    FROM mwb.evidence_artifacts e
    WHERE e.job_id IN (SELECT job_id FROM _mwb011_candidate_jobs)
  )),
  ('candidate_draft_count_before', (
    SELECT count(*)
    FROM mwb.launch_drafts d
    WHERE d.job_id IN (SELECT job_id FROM _mwb011_candidate_jobs)
  )),
  ('candidate_readback_count_before', (
    SELECT count(*)
    FROM mwb.readback_records r
    WHERE r.job_id IN (SELECT job_id FROM _mwb011_candidate_jobs)
  ));

DO $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM mwb.evidence_artifacts
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_evidence_count', deleted_count);

  DELETE FROM mwb.readback_records
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_readback_count', deleted_count);

  DELETE FROM mwb.launch_confirmations
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_confirmation_count', deleted_count);

  DELETE FROM mwb.launch_node_runs
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_node_run_count', deleted_count);

  DELETE FROM mwb.launch_drafts
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_draft_count', deleted_count);

  DELETE FROM mwb.launch_jobs
  WHERE job_id IN (SELECT job_id FROM _mwb011_candidate_jobs);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO _mwb011_audit_counts(metric, value)
  VALUES ('purged_job_count', deleted_count);
END $$;

INSERT INTO _mwb011_audit_counts(metric, value)
VALUES
  ('candidate_job_count_after', (
    SELECT count(*)
    FROM mwb.launch_jobs j
    WHERE (
        (
          j.source_usage = 'runtime_truth'
          AND j.job_id <> 'JOB-MWBV2-20260824014546-851B76'
          AND j.source_record_ref = 'api:intake:97f20040f3d3d423'
        )
        OR j.source_usage = 'test_run'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.platform_actions pa
        WHERE pa.job_id = j.job_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.created_objects co
        WHERE co.job_id = j.job_id
      )
  )),
  ('candidate_evidence_count_after', (
    SELECT count(*)
    FROM mwb.evidence_artifacts e
    WHERE e.job_id IN (SELECT job_id FROM _mwb011_candidate_jobs)
  ));

DO $$
DECLARE
  audit jsonb;
BEGIN
  SELECT jsonb_object_agg(metric, value ORDER BY metric)
  INTO audit
  FROM _mwb011_audit_counts;
  RAISE NOTICE 'mwb011_audit=%', audit;
END $$;

COMMIT;

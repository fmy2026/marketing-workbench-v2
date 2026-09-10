-- Target database: marketing_workbench_v2
-- Scope: close two exact historical runtime Cases superseded by independently
-- verified success Cases for the same owner. No platform calls or evidence
-- mutation occurs; all historical records remain auditable.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.workflow_cases legacy_case
    WHERE legacy_case.case_id = 'CASE-LEGACY-2E4217E20C9E26BFB648772C'
      AND legacy_case.advertiser_id = '1871922346964041'
      AND legacy_case.source_usage = 'runtime_truth'
      AND legacy_case.lifecycle_status = 'active'
      AND legacy_case.metadata->>'legacy' = 'true'
  ) THEN
    RAISE EXCEPTION 'expected active legacy Case for advertiser 1871922346964041 is absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mwb.workflow_cases verified_case
    JOIN mwb.launch_jobs verified_job ON verified_job.case_id = verified_case.case_id
    JOIN mwb.created_objects created_object
      ON created_object.job_id = verified_job.job_id
     AND created_object.object_type = 'std_project'
     AND created_object.readback_status = 'readback_verified'
    JOIN mwb.readback_records readback
      ON readback.job_id = verified_job.job_id
     AND readback.object_type = 'std_project'
     AND readback.object_id = created_object.object_id
     AND readback.object_name = created_object.object_name
     AND readback.readback_status = 'readback_verified'
    WHERE verified_case.case_id = 'CASE-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8'
      AND verified_case.advertiser_id = '1871922346964041'
      AND verified_case.lifecycle_status = 'completed'
      AND verified_job.job_id = 'JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8'
  ) THEN
    RAISE EXCEPTION 'verified successor for advertiser 1871922346964041 is absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mwb.workflow_cases duplicate_case
    JOIN mwb.launch_jobs duplicate_job
      ON duplicate_job.case_id = duplicate_case.case_id
    JOIN mwb.launch_execution_plans duplicate_plan
      ON duplicate_plan.job_id = duplicate_job.job_id
    WHERE duplicate_case.case_id = 'CASE-MWBV2-EC9287D4A4BC82E5E2'
      AND duplicate_case.advertiser_id = '1871922434025472'
      AND duplicate_case.source_usage = 'runtime_truth'
      AND duplicate_case.lifecycle_status = 'active'
      AND duplicate_job.job_id = 'JOB-MWBV2-20260831082504-E6BE94'
      AND duplicate_plan.plan_id = 'PLAN-JOB-MWBV2-20260831082504-E6BE94-V1'
      AND duplicate_plan.plan_status = 'ready'
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.launch_confirmations confirmation
        WHERE confirmation.plan_id = duplicate_plan.plan_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.platform_actions action
        WHERE action.plan_id = duplicate_plan.plan_id
      )
  ) THEN
    RAISE EXCEPTION 'expected unconsumed duplicate Case/Plan for advertiser 1871922434025472 is absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mwb.workflow_cases verified_case
    JOIN mwb.launch_jobs verified_job ON verified_job.case_id = verified_case.case_id
    JOIN mwb.created_objects created_object
      ON created_object.job_id = verified_job.job_id
     AND created_object.object_type = 'std_project'
     AND created_object.readback_status = 'readback_verified'
    JOIN mwb.readback_records readback
      ON readback.job_id = verified_job.job_id
     AND readback.object_type = 'std_project'
     AND readback.object_id = created_object.object_id
     AND readback.object_name = created_object.object_name
     AND readback.readback_status = 'readback_verified'
    WHERE verified_case.case_id = 'CASE-MWBV2-3CDAF4E9202381253E'
      AND verified_case.advertiser_id = '1871922434025472'
      AND verified_case.lifecycle_status = 'completed'
      AND verified_job.job_id = 'JOB-MWBV2-20260831050504-F412EF'
  ) THEN
    RAISE EXCEPTION 'verified successor for advertiser 1871922434025472 is absent';
  END IF;
END
$$;

UPDATE mwb.workflow_cases
SET lifecycle_status = 'cancelled',
    metadata = metadata || jsonb_build_object(
      'cancellation_reason', 'superseded_by_verified_same_account_case',
      'superseded_by_case_id', 'CASE-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8',
      'cancelled_by_task_id', 'TASK-MWBV2-HISTORICAL-CASE-MINIMAL-RECONCILIATION-20260910',
      'cancelled_at', now()::text
    ),
    updated_at = now()
WHERE case_id = 'CASE-LEGACY-2E4217E20C9E26BFB648772C'
  AND advertiser_id = '1871922346964041'
  AND source_usage = 'runtime_truth'
  AND lifecycle_status = 'active';

UPDATE mwb.launch_execution_plans
SET plan_status = 'stale',
    metadata = metadata || jsonb_build_object(
      'stale_reason', 'superseded_by_verified_same_account_case',
      'superseded_by_case_id', 'CASE-MWBV2-3CDAF4E9202381253E',
      'staled_by_task_id', 'TASK-MWBV2-HISTORICAL-CASE-MINIMAL-RECONCILIATION-20260910',
      'staled_at', now()::text
    ),
    updated_at = now()
WHERE plan_id = 'PLAN-JOB-MWBV2-20260831082504-E6BE94-V1'
  AND job_id = 'JOB-MWBV2-20260831082504-E6BE94'
  AND source_usage = 'runtime_truth'
  AND plan_status = 'ready';

UPDATE mwb.workflow_cases
SET lifecycle_status = 'cancelled',
    metadata = metadata || jsonb_build_object(
      'cancellation_reason', 'superseded_by_verified_same_account_case',
      'superseded_by_case_id', 'CASE-MWBV2-3CDAF4E9202381253E',
      'cancelled_by_task_id', 'TASK-MWBV2-HISTORICAL-CASE-MINIMAL-RECONCILIATION-20260910',
      'cancelled_at', now()::text
    ),
    updated_at = now()
WHERE case_id = 'CASE-MWBV2-EC9287D4A4BC82E5E2'
  AND advertiser_id = '1871922434025472'
  AND source_usage = 'runtime_truth'
  AND lifecycle_status = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mwb.workflow_cases
    WHERE case_id = 'CASE-LEGACY-2E4217E20C9E26BFB648772C'
      AND lifecycle_status = 'cancelled'
      AND metadata->>'cancellation_reason' = 'superseded_by_verified_same_account_case'
  ) THEN
    RAISE EXCEPTION 'legacy Case reconciliation did not persist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mwb.workflow_cases
    WHERE case_id = 'CASE-MWBV2-EC9287D4A4BC82E5E2'
      AND lifecycle_status = 'cancelled'
      AND metadata->>'cancellation_reason' = 'superseded_by_verified_same_account_case'
  ) THEN
    RAISE EXCEPTION 'duplicate Case reconciliation did not persist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mwb.launch_execution_plans
    WHERE plan_id = 'PLAN-JOB-MWBV2-20260831082504-E6BE94-V1'
      AND plan_status = 'stale'
      AND metadata->>'stale_reason' = 'superseded_by_verified_same_account_case'
  ) THEN
    RAISE EXCEPTION 'duplicate ready Plan was not staled';
  END IF;
END
$$;

COMMIT;

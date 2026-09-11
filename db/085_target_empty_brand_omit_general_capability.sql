-- Promote only evidence-complete historical target-empty brand experiments to
-- the general Node 04 brand contract. This migration never calls a platform,
-- creates a job, or alters any Plan, confirmation, action, or readback row.

BEGIN;

WITH eligible AS (
  SELECT
    ar.resource_id,
    job.case_id,
    job.job_id,
    ar.metadata->'target_empty_omit_experiment' AS experiment,
    ar.metadata->'brand_info_official' AS official,
    ar.metadata->'readonly_check' AS readonly_check
  FROM mwb.account_resources ar
  JOIN mwb.launch_jobs job
    ON job.job_id = ar.metadata #>> '{target_empty_omit_experiment,job_id}'
  JOIN mwb.platform_actions action
    ON action.job_id = job.job_id
   AND action.action_type = 'oceanengine_std_project_create'
   AND action.action_status = 'succeeded'
   AND action.object_id_present = true
  JOIN mwb.created_objects object
    ON object.job_id = job.job_id
   AND object.object_type = 'std_project'
  JOIN LATERAL (
    SELECT readback.*
    FROM mwb.readback_records readback
    WHERE readback.job_id = job.job_id
      AND readback.object_type = 'std_project'
      AND readback.object_id = object.object_id
    ORDER BY readback.created_at DESC
    LIMIT 1
  ) readback
    ON readback.readback_status = 'readback_verified'
  WHERE ar.resource_type = 'brand_info'
    AND ar.metadata->'brand_info_official'->>'source' = 'target_empty_omit_experiment'
    AND ar.metadata->'target_empty_omit_experiment'->>'status' = 'experimental_pending_create'
    AND coalesce((ar.metadata->'target_empty_omit_experiment'->>'matched_brand_count')::integer, -1) = 0
), promoted_resources AS (
  UPDATE mwb.account_resources ar
  SET metadata = (ar.metadata - 'target_empty_omit_experiment') || jsonb_build_object(
        'brand_info_official', jsonb_build_object(
          'source', 'live_target_account_empty_brand_list',
          'readback_status', 'target_brand_list_empty',
          'validation_status', 'not_required',
          'verified_by_job_id', eligible.job_id,
          'brand_list_count', 0,
          'matched_brand_count', 0,
          'response_hash', coalesce(
            nullif(eligible.experiment->>'empty_list_evidence_ref', ''),
            nullif(eligible.official->>'response_hash', '')
          )
        ),
        'target_empty_omit_validation', jsonb_build_object(
          'status', 'verified_by_target_create',
          'case_id', eligible.case_id,
          'job_id', eligible.job_id,
          'response_hash', coalesce(
            nullif(eligible.experiment->>'empty_list_evidence_ref', ''),
            nullif(eligible.official->>'response_hash', '')
          ),
          'evidence_refs', coalesce(eligible.readonly_check->'evidence_refs', '[]'::jsonb)
        ),
        'readonly_check', (coalesce(ar.metadata->'readonly_check', '{}'::jsonb) || jsonb_build_object(
          'status', 'passed',
          'key', 'baseline_platform_brand',
          'gap', '',
          'evidence_refs', coalesce(eligible.readonly_check->'evidence_refs', '[]'::jsonb)
        ))
      ),
      visibility_status = 'not_required',
      readback_status = 'not_required',
      inheritance_status = 'target_readonly_verified',
      updated_at = now()
  FROM eligible
  WHERE ar.resource_id = eligible.resource_id
  RETURNING eligible.case_id, eligible.job_id
)
UPDATE mwb.workflow_cases workflow_case
SET metadata = (workflow_case.metadata - 'brand_empty_omit_experiment') || jsonb_build_object(
      'brand_empty_omit_validation', coalesce(workflow_case.metadata->'brand_empty_omit_experiment', '{}'::jsonb) || jsonb_build_object(
        'status', 'verified_by_target_create',
        'validated_job_id', promoted_resources.job_id,
        'runtime_experiment_removed', true
      )
    ),
    updated_at = now()
FROM promoted_resources
WHERE workflow_case.case_id = promoted_resources.case_id;

COMMIT;

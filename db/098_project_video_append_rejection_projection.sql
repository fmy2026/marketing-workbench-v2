-- Target database: marketing_workbench_v2
-- Scope: make already-recorded append rejections available to the existing
-- readonly recovery policy without changing the historical action payload.

BEGIN;

UPDATE mwb.launch_execution_plans plan
SET metadata = plan.metadata || jsonb_build_object(
  'confirmed_execution_error_category', 'platform_rejected',
  'retry_allowed', false
),
updated_at = now()
WHERE plan.plan_kind = 'project_video_append'
  AND plan.plan_status = 'consumed'
  AND EXISTS (
    SELECT 1
    FROM mwb.platform_actions action
    WHERE action.job_id = plan.job_id
      AND action.plan_id = plan.plan_id
      AND action.action_type = 'oc_project_video_append'
      AND coalesce(action.metadata->>'platform_outcome_code', action.metadata->>'error_category', '') = 'platform_rejected'
  )
  AND coalesce(plan.metadata->>'confirmed_execution_error_category', '') <> 'platform_rejected';

COMMIT;

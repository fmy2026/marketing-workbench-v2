-- Target database: marketing_workbench_v2
-- Scope: preserve last verified backup landing-page facts on readonly degradation
-- and project the authoritative shared-inventory blocker as the Case root cause.
-- Safety: no platform calls; no raw request, response, URL, or credential storage.

BEGIN;

-- A shared-inventory transport/API failure is not evidence that the shared site
-- disappeared. Restore only a resource that this failure downgraded, using the
-- existing prior successful readonly Skill evidence for the same account scope.
WITH latest_inventory AS (
  SELECT DISTINCT ON (j.route_id, j.game_code, j.advertiser_id)
    j.route_id,
    j.game_code,
    j.advertiser_id,
    sr.finished_at,
    sr.started_at
  FROM mwb.launch_skill_runs sr
  JOIN mwb.launch_jobs j ON j.job_id = sr.job_id
  WHERE sr.skill_key = 'backup-landing-page-material-inventory'
  ORDER BY j.route_id, j.game_code, j.advertiser_id,
    coalesce(sr.finished_at, sr.started_at) DESC, sr.skill_run_id DESC
),
latest_shared_degraded AS (
  SELECT li.*
  FROM latest_inventory li
  JOIN mwb.launch_skill_runs sr
    ON sr.skill_key = 'backup-landing-page-material-inventory'
   AND sr.blockers ? 'site_get_target_shared_blocked'
  JOIN mwb.launch_jobs j
    ON j.job_id = sr.job_id
   AND j.route_id = li.route_id
   AND j.game_code = li.game_code
   AND j.advertiser_id = li.advertiser_id
   AND coalesce(sr.finished_at, sr.started_at) = coalesce(li.finished_at, li.started_at)
),
restore_candidates AS (
  SELECT ar.resource_id, verified.output_summary, verified.evidence_refs
  FROM mwb.account_resources ar
  JOIN latest_shared_degraded degraded
    ON ar.route_id = degraded.route_id
   AND ar.game_code = degraded.game_code
   AND ar.advertiser_id = degraded.advertiser_id
  CROSS JOIN LATERAL (
    SELECT prior.output_summary, prior.evidence_refs
    FROM mwb.launch_skill_runs prior
    JOIN mwb.launch_jobs prior_job ON prior_job.job_id = prior.job_id
    WHERE prior.skill_key = 'backup-landing-page-material-inventory'
      AND prior.status = 'passed'
      AND prior.output_summary->>'conclusion' = 'target_already_usable'
      AND prior_job.route_id = ar.route_id
      AND prior_job.game_code = ar.game_code
      AND prior_job.advertiser_id = ar.advertiser_id
      AND prior.output_summary->>'default_landing_page_asset_id' = ar.source_asset_id
      AND coalesce(prior.finished_at, prior.started_at) < coalesce(degraded.finished_at, degraded.started_at)
    ORDER BY coalesce(prior.finished_at, prior.started_at) DESC, prior.skill_run_id DESC
    LIMIT 1
  ) verified
  WHERE ar.resource_type = 'backup_landing_page'
    AND ar.visibility_status = 'unknown'
    AND ar.readback_status = 'not_checked'
)
UPDATE mwb.account_resources ar
SET
  visibility_status = 'visible',
  readback_status = 'readback_verified',
  metadata = ar.metadata || jsonb_build_object(
    'readonly_check', jsonb_build_object(
      'status', 'passed',
      'source_verified', true,
      'target_visible', true,
      'target_shared_match', true,
      'target_hash_matches', true,
      'response_hash_present', true,
      'evidence_ref', coalesce(verified.evidence_refs->>0, ''),
      'restored_from_last_verified_readonly', true
    ),
    'backup_landing_page_material_inventory', verified.output_summary
  ),
  updated_at = now()
FROM restore_candidates verified
WHERE ar.resource_id = verified.resource_id;

CREATE OR REPLACE VIEW mwb.workflow_case_summary AS
SELECT
  wc.case_id, wc.case_key, wc.route_id, wc.game_code, wc.advertiser_id,
  wc.business_goal, wc.lifecycle_status, wc.source_usage, wc.created_at, wc.updated_at,
  latest.job_id AS latest_job_id, latest.job_status AS latest_job_status,
  latest.current_node AS latest_current_node, latest.updated_at AS latest_job_updated_at,
  coalesce(plan.plan_status, '') AS latest_plan_status,
  CASE
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified'
      THEN '["created_object_readback_pending"]'::jsonb
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified'
      THEN '["std_project_create_attempt_limit_reached"]'::jsonb
    WHEN latest.job_status = 'failed_waiting_manual_review'
      THEN jsonb_build_array('corrective_attempt_requires_new_payload_version')
    WHEN root.blocker_code <> '' THEN jsonb_build_array(root.blocker_code)
    ELSE '[]'::jsonb
  END AS blocker_codes,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'run_readback_only'
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'manual_review_after_attempt_limit'
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN 'prepare_corrective_attempt'
    WHEN root.blocker_code <> '' THEN 'resolve_case_blocker'
    WHEN plan.plan_status = 'ready' THEN 'await_job_write_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_fresh_readiness'
    ELSE 'review_latest_job'
  END AS current_gate,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'perform_readback_only'
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'manual_review_attempt_limit_reached'
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN 'correct_payload_then_build_next_attempt_version'
    WHEN root.blocker_code <> '' THEN 'resolve_root_blocker:' || root.blocker_code
    WHEN plan.plan_status = 'ready' THEN 'obtain_single_plan_confirmation'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_readonly_readiness'
    ELSE 'inspect_latest_job'
  END AS suggested_next_action,
  coalesce((SELECT jsonb_agg(jsonb_build_object('node_key', n.node_key, 'status', n.status) ORDER BY n.node_run_id) FROM mwb.launch_node_runs n WHERE n.job_id = latest.job_id), '[]'::jsonb) AS latest_node_states,
  coalesce((SELECT jsonb_agg(jsonb_build_object('resource_type', ar.resource_type, 'visibility_status', ar.visibility_status, 'readback_status', ar.readback_status) ORDER BY ar.resource_type, ar.resource_id) FROM mwb.account_resources ar WHERE ar.route_id = wc.route_id AND ar.game_code = wc.game_code AND ar.advertiser_id = wc.advertiser_id), '[]'::jsonb) AS resource_readiness,
  EXISTS (SELECT 1 FROM mwb.account_touchpoints t WHERE t.route_id = wc.route_id AND t.game_code = wc.game_code AND t.advertiser_id = wc.advertiser_id AND t.monitor_id <> '') AS monitor_resolved,
  jsonb_build_object('platform_action_count', coalesce(attempt.std_project_create_action_count, 0), 'attempts_used', coalesce(attempt.std_project_create_action_count, 0), 'maximum_attempts', 3, 'next_attempt_no', least(coalesce(attempt.std_project_create_action_count, 0) + 1, 4), 'last_readback_status', coalesce(attempt.last_readback_status, ''), 'last_action_status', coalesce(attempt.last_action_status, '')) AS action_readback_state,
  coalesce(plan.blocker_codes, '[]'::jsonb) AS structural_blocker_codes,
  CASE
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified'
      THEN '["created_object_readback_pending"]'::jsonb
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified'
      THEN '["std_project_create_attempt_limit_reached"]'::jsonb
    WHEN latest.job_status = 'failed_waiting_manual_review'
      THEN jsonb_build_array('corrective_attempt_requires_new_payload_version')
    WHEN root.blocker_code <> '' THEN jsonb_build_array(root.blocker_code)
    ELSE '[]'::jsonb
  END AS root_blocker_codes
FROM mwb.workflow_cases wc
LEFT JOIN LATERAL (
  SELECT j.job_id, j.route_id, j.game_code, j.advertiser_id, j.object_type, j.job_status, j.current_node, j.source_record_ref, j.created_at, j.updated_at, j.source_usage, j.case_id
  FROM mwb.launch_jobs j
  WHERE j.case_id = wc.case_id
  ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
  LIMIT 1
) latest ON true
LEFT JOIN LATERAL (
  SELECT ep.plan_id, ep.job_id, ep.plan_version, ep.plan_status, ep.plan_hash, ep.planned_actions, ep.blocker_codes, ep.draft_id, ep.payload_hash, ep.source_usage, ep.metadata, ep.created_at, ep.updated_at
  FROM mwb.launch_execution_plans ep
  WHERE ep.job_id = latest.job_id
  ORDER BY ep.plan_version DESC, ep.updated_at DESC
  LIMIT 1
) plan ON true
LEFT JOIN LATERAL (
  SELECT candidate.blocker_code
  FROM (
    SELECT
      blocker.value AS blocker_code,
      1 AS source_priority,
      8 AS item_priority,
      0 AS detail_priority
    FROM mwb.launch_skill_runs sr
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(sr.blockers, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE sr.job_id = latest.job_id
      AND sr.skill_key = 'backup-landing-page-material-inventory'
      AND blocker.value = 'site_get_target_shared_blocked'

    UNION ALL

    SELECT
      coalesce(state.value->>'blocker', '') AS blocker_code,
      1 AS source_priority,
      CASE state.value->>'resource_type'
        WHEN 'avatar' THEN 1
        WHEN 'dmp_audience_package' THEN 2
        WHEN 'event_asset' THEN 3
        WHEN 'video_asset' THEN 4
        WHEN 'product_image' THEN 5
        WHEN 'brand_info' THEN 6
        WHEN 'micro_app_instance' THEN 7
        WHEN 'backup_landing_page' THEN 8
        ELSE 99
      END AS item_priority,
      1 AS detail_priority
    FROM jsonb_array_elements(coalesce(plan.metadata->'resource_states', '[]'::jsonb)) state
    WHERE state.value->>'state' = 'BLOCKED'
      AND coalesce(state.value->>'blocker', '') <> ''

    UNION ALL

    SELECT blocker.value, 2, blocker.ordinality::int, 0
    FROM jsonb_array_elements_text(coalesce(plan.blocker_codes, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE blocker.value LIKE 'resource_prepare_unsupported:%'

    UNION ALL

    SELECT blocker.value, 3, blocker.ordinality::int, 0
    FROM jsonb_array_elements_text(coalesce(plan.metadata->'root_blocker_codes', '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE blocker.value <> ''
  ) candidate
  ORDER BY candidate.source_priority, candidate.item_priority, candidate.detail_priority, candidate.blocker_code
  LIMIT 1
) root ON true
LEFT JOIN LATERAL (
  SELECT
    count(pa.*) FILTER (WHERE pa.action_type = 'oceanengine_std_project_create')::int AS std_project_create_action_count,
    (SELECT count(*)::int FROM mwb.created_objects co WHERE co.job_id = latest.job_id AND co.object_type = 'std_project') AS created_object_count,
    coalesce((SELECT pa2.action_status FROM mwb.platform_actions pa2 WHERE pa2.job_id = latest.job_id AND pa2.action_type = 'oceanengine_std_project_create' ORDER BY pa2.attempt_no DESC, pa2.finished_at DESC NULLS LAST, pa2.started_at DESC NULLS LAST LIMIT 1), '') AS last_action_status,
    coalesce((SELECT rb.readback_status FROM mwb.readback_records rb WHERE rb.job_id = latest.job_id ORDER BY rb.created_at DESC LIMIT 1), '') AS last_readback_status
  FROM mwb.platform_actions pa
  WHERE pa.job_id = latest.job_id
) attempt ON true;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow gate. root_blocker_codes contains zero or one blocker; structural_blocker_codes retains the complete forensic set.';

COMMIT;

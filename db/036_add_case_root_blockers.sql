-- Surface leaf blockers for user-facing case decisions while keeping execution-plan blockers intact.
CREATE OR REPLACE VIEW mwb.workflow_case_summary AS
SELECT
  wc.case_id, wc.case_key, wc.route_id, wc.game_code, wc.advertiser_id,
  wc.business_goal, wc.lifecycle_status, wc.source_usage, wc.created_at, wc.updated_at,
  latest.job_id AS latest_job_id, latest.job_status AS latest_job_status,
  latest.current_node AS latest_current_node, latest.updated_at AS latest_job_updated_at,
  coalesce(plan.plan_status, '') AS latest_plan_status,
  CASE
    WHEN latest.job_status = 'failed_waiting_manual_review' OR (coalesce(attempt.platform_action_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified')
      THEN '["single_create_attempt_already_recorded"]'::jsonb
    ELSE coalesce(nullif(plan.metadata->'root_blocker_codes', '[]'::jsonb), plan.blocker_codes, '[]'::jsonb)
  END AS blocker_codes,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN latest.job_status = 'failed_waiting_manual_review' OR (coalesce(attempt.platform_action_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified') THEN 'manual_review_after_single_create'
    WHEN coalesce(jsonb_array_length(coalesce(nullif(plan.metadata->'root_blocker_codes', '[]'::jsonb), plan.blocker_codes, '[]'::jsonb)), 0) > 0 THEN 'resolve_case_blockers'
    WHEN latest.job_status IN ('created_pending_readback', 'readback_pending') THEN 'run_readback_only'
    WHEN plan.plan_status = 'ready' THEN 'await_job_write_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_fresh_readiness'
    ELSE 'review_latest_job'
  END AS current_gate,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN latest.job_status = 'failed_waiting_manual_review' OR (coalesce(attempt.platform_action_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified') THEN 'manual_review_failed_create_no_retry'
    WHEN coalesce(jsonb_array_length(coalesce(nullif(plan.metadata->'root_blocker_codes', '[]'::jsonb), plan.blocker_codes, '[]'::jsonb)), 0) > 0 THEN 'resolve_root_blockers_from_latest_plan'
    WHEN latest.job_status IN ('created_pending_readback', 'readback_pending') THEN 'perform_readback_only'
    WHEN plan.plan_status = 'ready' THEN 'obtain_single_job_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_readonly_readiness'
    ELSE 'inspect_latest_job'
  END AS suggested_next_action,
  coalesce((SELECT jsonb_agg(jsonb_build_object('node_key', n.node_key, 'status', n.status) ORDER BY n.node_run_id) FROM mwb.launch_node_runs n WHERE n.job_id = latest.job_id), '[]'::jsonb) AS latest_node_states,
  coalesce((SELECT jsonb_agg(jsonb_build_object('resource_type', ar.resource_type, 'visibility_status', ar.visibility_status, 'readback_status', ar.readback_status) ORDER BY ar.resource_type, ar.resource_id) FROM mwb.account_resources ar WHERE ar.route_id = wc.route_id AND ar.game_code = wc.game_code AND ar.advertiser_id = wc.advertiser_id), '[]'::jsonb) AS resource_readiness,
  EXISTS (SELECT 1 FROM mwb.account_touchpoints t WHERE t.route_id = wc.route_id AND t.game_code = wc.game_code AND t.advertiser_id = wc.advertiser_id AND t.monitor_id <> '') AS monitor_resolved,
  jsonb_build_object('platform_action_count', coalesce(attempt.platform_action_count, 0), 'last_readback_status', coalesce(attempt.last_readback_status, ''), 'last_action_status', coalesce(attempt.last_action_status, '')) AS action_readback_state,
  coalesce(plan.blocker_codes, '[]'::jsonb) AS structural_blocker_codes,
  coalesce(plan.metadata->'root_blocker_codes', '[]'::jsonb) AS root_blocker_codes
FROM mwb.workflow_cases wc
LEFT JOIN LATERAL (SELECT j.job_id, j.route_id, j.game_code, j.advertiser_id, j.object_type, j.job_status, j.current_node, j.source_record_ref, j.created_at, j.updated_at, j.source_usage, j.case_id FROM mwb.launch_jobs j WHERE j.case_id = wc.case_id ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT ep.plan_id, ep.job_id, ep.plan_version, ep.plan_status, ep.plan_hash, ep.planned_actions, ep.blocker_codes, ep.draft_id, ep.payload_hash, ep.source_usage, ep.metadata, ep.created_at, ep.updated_at FROM mwb.launch_execution_plans ep WHERE ep.job_id = latest.job_id ORDER BY ep.plan_version DESC, ep.updated_at DESC LIMIT 1) plan ON true
LEFT JOIN LATERAL (
  SELECT
    count(pa.*)::int AS platform_action_count,
    coalesce((SELECT pa2.action_status FROM mwb.platform_actions pa2 WHERE pa2.job_id = latest.job_id ORDER BY pa2.finished_at DESC NULLS LAST, pa2.started_at DESC NULLS LAST LIMIT 1), '') AS last_action_status,
    coalesce((SELECT rb.readback_status FROM mwb.readback_records rb WHERE rb.job_id = latest.job_id ORDER BY rb.created_at DESC LIMIT 1), '') AS last_readback_status
  FROM mwb.platform_actions pa
  WHERE pa.job_id = latest.job_id
) attempt ON true;

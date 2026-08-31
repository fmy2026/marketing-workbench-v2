-- Target database: marketing_workbench_v2
-- Scope: allow the one ready monitor_bootstrap Plan to reach the existing
--        confirmation Gate without masking monitor readiness or any other root
--        blocker. No platform call or historical-run mutation occurs here.

BEGIN;

CREATE OR REPLACE VIEW mwb.workflow_case_summary AS
SELECT
  wc.case_id, wc.case_key, wc.route_id, wc.game_code, wc.advertiser_id,
  wc.business_goal, wc.lifecycle_status, wc.source_usage, wc.created_at, wc.updated_at,
  latest.job_id AS latest_job_id, latest.job_status AS latest_job_status,
  latest.current_node AS latest_current_node, latest.updated_at AS latest_job_updated_at,
  coalesce(plan.plan_status, '') AS latest_plan_status,
  CASE
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN jsonb_build_array('created_object_readback_pending')
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN jsonb_build_array('std_project_create_attempt_limit_reached')
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN jsonb_build_array('corrective_attempt_requires_new_payload_version')
    WHEN root.blocker_code <> '' THEN jsonb_build_array(root.blocker_code)
    ELSE '[]'::jsonb
  END AS blocker_codes,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'run_readback_only'
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'manual_review_after_attempt_limit'
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN 'prepare_corrective_attempt'
    WHEN monitor.readiness_status IN ('needs_readonly', 'needs_touchpoint_readback') THEN 'run_monitor_readonly'
    WHEN monitor.readiness_status = 'needs_plan'
      AND plan.plan_kind = 'monitor_bootstrap' AND plan.plan_status = 'ready'
      AND jsonb_array_length(plan.planned_actions) = 1
      AND plan.planned_actions @> '[{"action_type":"ensure_monitor"}]'::jsonb THEN 'await_job_write_authorization'
    WHEN root.blocker_code <> '' THEN 'resolve_case_blocker'
    WHEN coalesce(attempt.std_project_create_action_count, 0) = 1 AND coalesce(attempt.created_object_count, 0) = 1 AND coalesce(attempt.last_readback_status, '') = 'readback_verified' THEN 'first_std_project_create_completed'
    WHEN plan.plan_status = 'ready' THEN 'await_job_write_authorization'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_fresh_readiness'
    ELSE 'review_latest_job'
  END AS current_gate,
  CASE
    WHEN latest.job_id IS NULL THEN 'create_fresh_job'
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'perform_readback_only'
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN 'manual_review_attempt_limit_reached'
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN 'correct_payload_then_build_next_attempt_version'
    WHEN monitor.readiness_status IN ('needs_readonly', 'needs_touchpoint_readback') THEN 'run_monitor_readonly_reconcile'
    WHEN monitor.readiness_status = 'needs_plan'
      AND plan.plan_kind = 'monitor_bootstrap' AND plan.plan_status = 'ready'
      AND jsonb_array_length(plan.planned_actions) = 1
      AND plan.planned_actions @> '[{"action_type":"ensure_monitor"}]'::jsonb THEN 'obtain_monitor_bootstrap_confirmation'
    WHEN root.blocker_code <> '' THEN 'resolve_root_blocker:' || root.blocker_code
    WHEN coalesce(attempt.std_project_create_action_count, 0) = 1 AND coalesce(attempt.created_object_count, 0) = 1 AND coalesce(attempt.last_readback_status, '') = 'readback_verified' THEN 'first_std_project_create_completed'
    WHEN plan.plan_status = 'ready' THEN 'obtain_single_plan_confirmation'
    WHEN latest.job_status IN ('created', 'running', 'waiting') THEN 'run_readonly_readiness'
    ELSE 'inspect_latest_job'
  END AS suggested_next_action,
  coalesce((SELECT jsonb_agg(jsonb_build_object('node_key', n.node_key, 'status', n.status) ORDER BY n.node_run_id) FROM mwb.launch_node_runs n WHERE n.job_id = latest.job_id), '[]'::jsonb) AS latest_node_states,
  coalesce((SELECT jsonb_agg(jsonb_build_object('resource_type', ar.resource_type, 'visibility_status', ar.visibility_status, 'readback_status', ar.readback_status) ORDER BY ar.resource_type, ar.resource_id) FROM mwb.account_resources ar WHERE ar.route_id = wc.route_id AND ar.game_code = wc.game_code AND ar.advertiser_id = wc.advertiser_id), '[]'::jsonb) AS resource_readiness,
  coalesce(monitor.monitor_ready, false) AS monitor_resolved,
  jsonb_build_object('platform_action_count', coalesce(attempt.std_project_create_action_count, 0), 'attempts_used', coalesce(attempt.std_project_create_action_count, 0), 'maximum_attempts', 3, 'next_attempt_no', least(coalesce(attempt.std_project_create_action_count, 0) + 1, 4), 'last_readback_status', coalesce(attempt.last_readback_status, ''), 'last_action_status', coalesce(attempt.last_action_status, '')) AS action_readback_state,
  coalesce(plan.blocker_codes, '[]'::jsonb) AS structural_blocker_codes,
  CASE
    WHEN coalesce(attempt.created_object_count, 0) > 0 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN jsonb_build_array('created_object_readback_pending')
    WHEN coalesce(attempt.std_project_create_action_count, 0) >= 3 AND coalesce(attempt.last_readback_status, '') <> 'readback_verified' THEN jsonb_build_array('std_project_create_attempt_limit_reached')
    WHEN latest.job_status = 'failed_waiting_manual_review' THEN jsonb_build_array('corrective_attempt_requires_new_payload_version')
    WHEN root.blocker_code <> '' THEN jsonb_build_array(root.blocker_code)
    ELSE '[]'::jsonb
  END AS root_blocker_codes
FROM mwb.workflow_cases wc
LEFT JOIN LATERAL (
  SELECT j.* FROM mwb.launch_jobs j WHERE j.case_id = wc.case_id ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC LIMIT 1
) latest ON true
LEFT JOIN LATERAL (
  SELECT ep.* FROM mwb.launch_execution_plans ep WHERE ep.job_id = latest.job_id ORDER BY ep.plan_version DESC, ep.updated_at DESC LIMIT 1
) plan ON true
LEFT JOIN mwb.v_monitor_readiness monitor
  ON monitor.route_id = wc.route_id
 AND monitor.game_code = wc.game_code
 AND monitor.advertiser_id = wc.advertiser_id
LEFT JOIN LATERAL (
  SELECT candidate.blocker_code
  FROM (
    SELECT blocker.value AS blocker_code, 0 AS source_priority, blocker.ordinality::int AS item_priority
    FROM (SELECT sr.blockers FROM mwb.launch_skill_runs sr WHERE sr.job_id = latest.job_id AND sr.skill_key = 'confirmed-resource-orchestrator' AND sr.status = 'blocked' ORDER BY coalesce(sr.finished_at, sr.started_at) DESC, sr.skill_run_id DESC LIMIT 1) confirmed_resource
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(confirmed_resource.blockers, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE blocker.value <> ''
    UNION ALL
    SELECT monitor.actionable_blocker_code, 1, 1
    WHERE monitor.readiness_status NOT IN ('needs_readonly', 'needs_touchpoint_readback')
      AND monitor.actionable_blocker_code <> ''
      AND NOT (monitor.readiness_status = 'needs_plan'
        AND plan.plan_kind = 'monitor_bootstrap' AND plan.plan_status = 'ready'
        AND jsonb_array_length(plan.planned_actions) = 1
        AND plan.planned_actions @> '[{"action_type":"ensure_monitor"}]'::jsonb)
    UNION ALL
    SELECT blocker.value, 2, blocker.ordinality::int
    FROM mwb.launch_skill_runs sr
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(sr.blockers, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE sr.job_id = latest.job_id AND sr.skill_key IN ('context-resolve-account', 'context-resolve-touchpoint') AND blocker.value <> ''
    UNION ALL
    SELECT blocker.value, 3, 0
    FROM mwb.launch_skill_runs sr
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(sr.blockers, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE sr.job_id = latest.job_id AND sr.skill_key = 'backup-landing-page-material-inventory' AND blocker.value = 'site_get_target_shared_blocked'
    UNION ALL
    SELECT coalesce(state.value->>'blocker', ''), 3,
      CASE state.value->>'resource_type' WHEN 'avatar' THEN 1 WHEN 'dmp_audience_package' THEN 2 WHEN 'event_asset' THEN 3 WHEN 'video_asset' THEN 4 WHEN 'product_image' THEN 5 WHEN 'brand_info' THEN 6 WHEN 'micro_app_instance' THEN 7 WHEN 'backup_landing_page' THEN 8 ELSE 99 END
    FROM jsonb_array_elements(coalesce(plan.metadata->'resource_states', '[]'::jsonb)) state
    WHERE state.value->>'state' = 'BLOCKED' AND coalesce(state.value->>'blocker', '') <> ''
    UNION ALL
    SELECT blocker.value, 4, blocker.ordinality::int
    FROM jsonb_array_elements_text(coalesce(plan.blocker_codes, '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE blocker.value LIKE 'resource_prepare_unsupported:%'
    UNION ALL
    SELECT blocker.value, 5, blocker.ordinality::int
    FROM jsonb_array_elements_text(coalesce(plan.metadata->'root_blocker_codes', '[]'::jsonb)) WITH ORDINALITY blocker(value, ordinality)
    WHERE blocker.value <> ''
  ) candidate
  ORDER BY candidate.source_priority, candidate.item_priority, candidate.blocker_code
  LIMIT 1
) root ON true
LEFT JOIN LATERAL (
  SELECT count(pa.*) FILTER (WHERE pa.action_type = 'oceanengine_std_project_create')::int AS std_project_create_action_count,
    (SELECT count(*)::int FROM mwb.created_objects co WHERE co.job_id = latest.job_id AND co.object_type = 'std_project') AS created_object_count,
    coalesce((SELECT pa2.action_status FROM mwb.platform_actions pa2 WHERE pa2.job_id = latest.job_id AND pa2.action_type = 'oceanengine_std_project_create' ORDER BY pa2.attempt_no DESC, pa2.finished_at DESC NULLS LAST, pa2.started_at DESC NULLS LAST LIMIT 1), '') AS last_action_status,
    coalesce((SELECT rb.readback_status FROM mwb.readback_records rb WHERE rb.job_id = latest.job_id ORDER BY rb.created_at DESC LIMIT 1), '') AS last_readback_status
  FROM mwb.platform_actions pa WHERE pa.job_id = latest.job_id
) attempt ON true;

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow Gate. A ready monitor_bootstrap Plan is the only exception that may temporarily precede the unresolved monitor plan blocker.';

COMMIT;

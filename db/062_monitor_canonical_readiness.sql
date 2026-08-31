-- Target database: marketing_workbench_v2
-- Scope: introduce one account-grain monitor readiness truth and prevent
-- resolved-cycle diagnostics from becoming current Case blockers.
-- Safety: projection/schema only; no platform call and no historical run or
-- attempt mutation.

BEGIN;

-- workflow_case_summary currently depends on the legacy blocker report. Drop
-- and rebuild both views atomically so the blocker report can keep its public
-- column shape while changing its semantics.
DROP VIEW IF EXISTS mwb.workflow_case_summary;
DROP VIEW IF EXISTS mwb.v_monitor_provision_blocker_report;

CREATE OR REPLACE VIEW mwb.v_monitor_readiness AS
WITH account_scope AS (
  SELECT DISTINCT route_id, game_code, advertiser_id
  FROM mwb.advertiser_accounts
  UNION
  SELECT DISTINCT route_id, game_code, advertiser_id
  FROM mwb.workflow_cases
), latest_cycle AS (
  SELECT DISTINCT ON (route_id, game_code, advertiser_id)
    *
  FROM mwb.v_monitor_provision_status_report
  ORDER BY route_id, game_code, advertiser_id, cycle_no DESC, updated_at DESC, cycle_id DESC
), scoped_touchpoint AS (
  SELECT DISTINCT ON (route_id, game_code, advertiser_id)
    route_id,
    game_code,
    advertiser_id,
    monitor_id,
    touchpoint_ref,
    status,
    url_hash,
    (touchpoint_url IS NOT NULL AND touchpoint_url <> '') AS touchpoint_url_present
  FROM mwb.account_touchpoints
  ORDER BY route_id, game_code, advertiser_id, updated_at DESC, touchpoint_id DESC
), normalized AS (
  SELECT
    s.route_id,
    s.game_code,
    s.advertiser_id,
    c.provision_id,
    c.cycle_id,
    c.cycle_no,
    coalesce(c.cycle_status, '') AS cycle_status,
    coalesce(c.provision_status, '') AS provision_status,
    coalesce(c.monitor_id, t.monitor_id, '') AS monitor_id,
    coalesce(c.monitor_id, t.monitor_id, '') <> '' AS monitor_id_present,
    coalesce(t.touchpoint_ref, c.touchpoint_ref, '') AS touchpoint_ref,
    coalesce(t.touchpoint_ref, c.touchpoint_ref, '') <> '' AS touchpoint_ref_present,
    coalesce(t.touchpoint_url_present, c.touchpoint_url_present, false) AS touchpoint_url_present,
    coalesce(c.evidence_artifact_id, '') AS evidence_artifact_id,
    coalesce(c.evidence_artifact_id, '') <> '' AS evidence_present,
    coalesce(c.error_summary, '') AS error_summary,
    coalesce(c.latest_attempt_error_summary, '') AS latest_attempt_error_summary,
    coalesce(c.attempt_count, 0) AS attempt_count,
    coalesce(c.latest_attempt_status, '') AS latest_attempt_status,
    coalesce(c.latest_attempt_error_category, '') AS latest_attempt_error_category,
    c.updated_at
  FROM account_scope s
  LEFT JOIN latest_cycle c
    ON c.route_id = s.route_id
   AND c.game_code = s.game_code
   AND c.advertiser_id = s.advertiser_id
  LEFT JOIN scoped_touchpoint t
    ON t.route_id = s.route_id
   AND t.game_code = s.game_code
   AND t.advertiser_id = s.advertiser_id
   AND (coalesce(c.monitor_id, '') = '' OR t.monitor_id = c.monitor_id)
), diagnosed AS (
  SELECT
    n.*,
    coalesce((
      SELECT jsonb_agg(code ORDER BY code)
      FROM (
        SELECT DISTINCT trim(value) AS code
        FROM regexp_split_to_table(concat_ws(';', n.error_summary, n.latest_attempt_error_summary), ';') value
        WHERE trim(value) <> ''
          AND trim(value) <> 'none'
      ) diagnostic
    ), '[]'::jsonb) AS diagnostic_codes
  FROM normalized n
)
SELECT
  route_id,
  game_code,
  advertiser_id,
  provision_id,
  cycle_id,
  cycle_no,
  cycle_status,
  provision_status,
  monitor_id,
  monitor_id_present,
  touchpoint_ref,
  touchpoint_ref_present,
  touchpoint_url_present,
  evidence_artifact_id,
  evidence_present,
  attempt_count,
  latest_attempt_status,
  latest_attempt_error_category,
  diagnostic_codes,
  (
    cycle_status = 'resolved'
    AND monitor_id_present
    AND touchpoint_ref_present
    AND touchpoint_url_present
    AND evidence_present
  ) AS readback_verified,
  (
    cycle_status = 'resolved'
    AND monitor_id_present
    AND touchpoint_ref_present
    AND touchpoint_url_present
    AND evidence_present
  ) AS monitor_ready,
  CASE
    WHEN cycle_status = 'resolved'
      AND monitor_id_present
      AND touchpoint_ref_present
      AND touchpoint_url_present
      AND evidence_present THEN 'ready'
    WHEN monitor_id_present AND (NOT touchpoint_ref_present OR NOT touchpoint_url_present) THEN 'needs_touchpoint_readback'
    WHEN provision_status = 'terminal_failed' OR (cycle_status = 'stopped' AND NOT monitor_id_present) THEN 'terminal_failed'
    WHEN provision_id IS NULL OR cycle_status = '' THEN 'needs_readonly'
    WHEN cycle_status = 'active' AND NOT monitor_id_present THEN 'needs_plan'
    ELSE 'needs_readonly'
  END AS readiness_status,
  CASE
    WHEN cycle_status = 'resolved'
      AND monitor_id_present
      AND touchpoint_ref_present
      AND touchpoint_url_present
      AND evidence_present THEN ''
    WHEN monitor_id_present AND (NOT touchpoint_ref_present OR NOT touchpoint_url_present) THEN 'touchpoint_url_missing'
    WHEN provision_status = 'terminal_failed' OR (cycle_status = 'stopped' AND NOT monitor_id_present)
      THEN coalesce(nullif(split_part(error_summary, ';', 1), ''), 'monitor_create_busy_retry_exhausted')
    WHEN provision_id IS NULL OR cycle_status = '' THEN 'monitor_readonly_reconcile_required'
    WHEN cycle_status = 'active' AND NOT monitor_id_present THEN 'monitor_plan_required'
    ELSE 'monitor_readonly_reconcile_required'
  END AS actionable_blocker_code,
  CASE
    WHEN cycle_status = 'resolved'
      AND monitor_id_present
      AND touchpoint_ref_present
      AND touchpoint_url_present
      AND evidence_present THEN 'run_fresh_readiness'
    WHEN monitor_id_present AND (NOT touchpoint_ref_present OR NOT touchpoint_url_present) THEN 'run_monitor_readonly_reconcile'
    WHEN provision_status = 'terminal_failed' OR (cycle_status = 'stopped' AND NOT monitor_id_present) THEN 'resolve_monitor_cycle_with_new_plan'
    WHEN provision_id IS NULL OR cycle_status = '' THEN 'run_monitor_readonly_reconcile'
    WHEN cycle_status = 'active' AND NOT monitor_id_present THEN 'compile_monitor_bootstrap_plan'
    ELSE 'run_monitor_readonly_reconcile'
  END AS suggested_action,
  updated_at
FROM diagnosed;

CREATE OR REPLACE VIEW mwb.v_monitor_provision_blocker_report AS
SELECT
  r.provision_id,
  r.cycle_id,
  r.cycle_no,
  r.cycle_status,
  r.route_id,
  r.game_code,
  r.advertiser_id,
  r.provision_status,
  r.monitor_id,
  coalesce(status.create_called, false) AS create_called,
  r.attempt_count AS create_attempt_no,
  r.attempt_count AS latest_attempt_no,
  r.latest_attempt_status,
  coalesce(status.latest_attempt_api_code, '') AS latest_attempt_api_code,
  r.latest_attempt_error_category,
  r.actionable_blocker_code AS blocker,
  r.updated_at
FROM mwb.v_monitor_readiness r
LEFT JOIN mwb.v_monitor_provision_status_report status
  ON status.cycle_id = r.cycle_id
WHERE r.actionable_blocker_code <> '';

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

COMMENT ON VIEW mwb.v_monitor_readiness IS
  'Canonical account-grain monitor readiness. Current blockers are separated from historical monitor-cycle diagnostics.';

COMMENT ON VIEW mwb.v_monitor_provision_blocker_report IS
  'Actionable monitor blockers only. Resolved-cycle policy diagnostics are intentionally excluded.';

COMMENT ON VIEW mwb.workflow_case_summary IS
  'Single current workflow gate. Monitor root blockers are consumed only from canonical monitor readiness.';

COMMIT;

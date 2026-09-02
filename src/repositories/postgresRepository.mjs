import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const DEFAULT_DATABASE = "marketing_workbench_v2";

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeNumericJsonNumber(name, value) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(text)) throw new Error(`invalid_${name}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`${name}_outside_safe_integer_range`);
  return number;
}

function safeTouchpointJson(alias = "t") {
  return `jsonb_build_object(
    'touchpoint_id', ${alias}.touchpoint_id,
    'advertiser_id', ${alias}.advertiser_id,
    'route_id', ${alias}.route_id,
    'game_code', ${alias}.game_code,
    'monitor_id', ${alias}.monitor_id,
    'touchpoint_ref', ${alias}.touchpoint_ref,
    'url_hash', ${alias}.url_hash,
    'status', ${alias}.status,
    'source', ${alias}.source,
    'touchpoint_url_present', (${alias}.touchpoint_url IS NOT NULL AND ${alias}.touchpoint_url <> ''),
    'created_at', ${alias}.created_at,
    'updated_at', ${alias}.updated_at
  )`;
}

function safeLandingPageJson(alias = "lpa") {
  return `jsonb_build_object(
    'landing_page_asset_id', ${alias}.landing_page_asset_id,
    'route_id', ${alias}.route_id,
    'game_code', ${alias}.game_code,
    'site_id', ${alias}.site_id,
    'site_name', ${alias}.site_name,
    'url_hash', ${alias}.url_hash,
    'source_advertiser_id', ${alias}.source_advertiser_id,
    'share_scope', ${alias}.share_scope,
    'is_default', ${alias}.is_default,
    'status', ${alias}.status,
    'source_usage', ${alias}.source_usage,
    'landing_url_present', (${alias}.landing_url IS NOT NULL AND ${alias}.landing_url <> ''),
    'landing_url_https', (${alias}.landing_url ~ '^https://'),
    'metadata', ${alias}.metadata,
    'created_at', ${alias}.created_at,
    'updated_at', ${alias}.updated_at
  )`;
}

function safeGameRouteLaunchLinkJson(alias = "grll") {
  return `jsonb_build_object(
    'link_ref', ${alias}.link_ref,
    'route_id', ${alias}.route_id,
    'game_code', ${alias}.game_code,
    'platform_app_id', ${alias}.platform_app_id,
    'app_id', ${alias}.app_id,
    'url_hash', ${alias}.url_hash,
    'status', ${alias}.status,
    'source_usage', ${alias}.source_usage,
    'source_summary', ${alias}.source_summary,
    'metadata', ${alias}.metadata,
    'controlled_value_present', (${alias}.launch_url IS NOT NULL AND ${alias}.launch_url <> ''),
    'created_at', ${alias}.created_at,
    'updated_at', ${alias}.updated_at
  )`;
}

function assertId(name, value, pattern = /^[A-Za-z0-9_:\-.]+$/) {
  const text = String(value ?? "");
  if (!text || !pattern.test(text)) {
    throw new Error(`invalid_${name}`);
  }
  return text;
}

function assertOwnerKey(value) {
  const text = String(value ?? "");
  if (text && /[\u0000-\u001F\u007F]/u.test(text)) throw new Error("invalid_owner_key");
  return text;
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

async function runPsql(sql, database) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-X",
      "-d",
      database,
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      compactSql(sql)
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const error = new Error(stderr.trim() || `psql exited with ${code}`);
        error.code = code;
        reject(error);
      }
    });
  });
}

async function queryJson(sql, database) {
  const stdout = await runPsql(sql, database);
  const value = stdout.trim();
  if (!value) return null;
  return JSON.parse(value);
}

export class PostgresRepository {
  constructor({ database = DEFAULT_DATABASE } = {}) {
    this.database = database;
  }

  async sourceUsageForJob(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT to_jsonb(coalesce(source_usage, 'runtime_truth'))::text
      FROM mwb.launch_jobs
      WHERE job_id = ${sqlLiteral(jobId)}
      LIMIT 1;
    `, this.database);
  }

  async getCoreContext({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      SELECT jsonb_build_object(
        'route', to_jsonb(r),
        'game', to_jsonb(g),
        'account', to_jsonb(a),
        'touchpoint', (
          SELECT ${safeTouchpointJson("t")}
          FROM mwb.account_touchpoints t
          WHERE t.route_id = r.route_id
            AND t.game_code = g.game_code
            AND t.advertiser_id = a.advertiser_id
          ORDER BY t.updated_at DESC
          LIMIT 1
        ),
        'monitorProvision', (
          SELECT jsonb_build_object(
            'provision_id', v.provision_id,
            'cycle_id', v.cycle_id,
            'cycle_status', v.cycle_status,
            'provision_status', v.provision_status,
            'monitor_id_present', v.monitor_id_present,
            'touchpoint_url_present', v.touchpoint_url_present,
            'blocker', CASE
              WHEN v.provision_status = 'terminal_failed' THEN coalesce(nullif(v.error_summary, ''), 'monitor_create_busy_retry_exhausted')
              ELSE ''
            END,
            'latest_attempt_status', v.latest_attempt_status,
            'latest_attempt_error_category', v.latest_attempt_error_category,
            'latest_attempt_error_summary', v.latest_attempt_error_summary,
            'updated_at', v.updated_at
          )
          FROM mwb.v_monitor_provision_status_report v
          WHERE v.route_id = r.route_id
            AND v.game_code = g.game_code
            AND v.advertiser_id = a.advertiser_id
          ORDER BY v.updated_at DESC
          LIMIT 1
        ),
        'monitorReadiness', (
          SELECT jsonb_build_object(
            'readiness_status', mr.readiness_status,
            'monitor_ready', mr.monitor_ready,
            'monitor_id_present', mr.monitor_id_present,
            'touchpoint_ref_present', mr.touchpoint_ref_present,
            'touchpoint_url_present', mr.touchpoint_url_present,
            'readback_verified', mr.readback_verified,
            'actionable_blocker_code', mr.actionable_blocker_code,
            'diagnostic_codes', mr.diagnostic_codes,
            'suggested_action', mr.suggested_action,
            'provision_id', mr.provision_id,
            'cycle_id', mr.cycle_id,
            'cycle_no', mr.cycle_no,
            'cycle_status', mr.cycle_status,
            'attempt_count', mr.attempt_count,
            'evidence_artifact_id', mr.evidence_artifact_id,
            'updated_at', mr.updated_at
          )
          FROM mwb.v_monitor_readiness mr
          WHERE mr.route_id = r.route_id
            AND mr.game_code = g.game_code
            AND mr.advertiser_id = a.advertiser_id
          LIMIT 1
        ),
        'defaults', (
          SELECT to_jsonb(d)
          FROM mwb.game_route_defaults d
          WHERE d.route_id = r.route_id
            AND d.game_code = g.game_code
          LIMIT 1
        ),
        'platformApp', (
          SELECT to_jsonb(pa)
          FROM mwb.game_platform_apps pa
          WHERE pa.game_code = g.game_code
            AND pa.platform = r.platform
            AND pa.app_type = r.marketing_product
          LIMIT 1
        ),
        'gameRouteLaunchLink', (
          SELECT ${safeGameRouteLaunchLinkJson("grll")}
          FROM mwb.game_route_launch_links grll
          WHERE grll.route_id = r.route_id
            AND grll.game_code = g.game_code
            AND grll.status = 'active'
          ORDER BY grll.updated_at DESC
          LIMIT 1
        ),
        'materialPack', (
          SELECT jsonb_build_object(
            'pack', to_jsonb(mp),
            'items', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object('item', to_jsonb(mpi), 'asset', to_jsonb(ga))
                ORDER BY mpi.sort_order
              )
              FROM mwb.material_pack_items mpi
              LEFT JOIN mwb.game_assets ga ON ga.asset_id = mpi.asset_id
              WHERE mpi.pack_id = mp.pack_id
            ), '[]'::jsonb)
          )
          FROM mwb.material_packs mp
          WHERE mp.route_id = r.route_id
            AND mp.game_code = g.game_code
            AND mp.status IN ('baseline_ready', 'active')
          ORDER BY mp.updated_at DESC
          LIMIT 1
        ),
        'backupLandingPage', (
          SELECT ${safeLandingPageJson("lpa")}
          FROM mwb.landing_page_assets lpa
          WHERE lpa.route_id = r.route_id
            AND lpa.game_code = g.game_code
            AND lpa.is_default = true
          ORDER BY
            CASE lpa.status
              WHEN 'active' THEN 1
              WHEN 'resolved' THEN 2
              WHEN 'reference_candidate' THEN 3
              ELSE 4
            END,
            lpa.updated_at DESC
          LIMIT 1
        ),
        'resourceBlueprints', (
          SELECT coalesce(jsonb_agg(to_jsonb(brp) ORDER BY brp.resource_type, brp.blueprint_id), '[]'::jsonb)
          FROM mwb.game_route_resource_blueprints brp
          WHERE brp.route_id = r.route_id
            AND brp.game_code = g.game_code
        ),
        'resources', (
          SELECT coalesce(jsonb_agg(to_jsonb(ar) ORDER BY ar.resource_type, ar.resource_id), '[]'::jsonb)
          FROM mwb.account_resources ar
          WHERE ar.route_id = r.route_id
            AND ar.game_code = g.game_code
            AND ar.advertiser_id = a.advertiser_id
        )
      )::text
      FROM mwb.platform_routes r
      JOIN mwb.games g ON g.game_code = ${sqlLiteral(gameCode)}
      JOIN mwb.advertiser_accounts a
        ON a.route_id = r.route_id
       AND a.game_code = g.game_code
       AND a.advertiser_id = ${sqlLiteral(advertiserId)}
      WHERE r.route_id = ${sqlLiteral(routeId)}
      LIMIT 1;
    `, this.database);
  }

  async getGameRouteDefaults({ routeId, gameCode }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    return queryJson(`
      SELECT to_jsonb(d)::text
      FROM mwb.game_route_defaults d
      WHERE d.route_id = ${sqlLiteral(routeId)}
        AND d.game_code = ${sqlLiteral(gameCode)}
      LIMIT 1;
    `, this.database);
  }

  async getGameAsset(assetId) {
    assertId("asset_id", assetId);
    return queryJson(`
      SELECT to_jsonb(ga)::text
      FROM mwb.game_assets ga
      WHERE ga.asset_id = ${sqlLiteral(assetId)}
      LIMIT 1;
    `, this.database);
  }

  async updateGameAssetFile({ assetId, assetRef, assetHash, visibilityStatus = "", metadata = {} } = {}) {
    assertId("asset_id", assetId);
    if (!String(assetRef || "").trim()) throw new Error("asset_ref_required");
    if (!String(assetHash || "").trim()) throw new Error("asset_hash_required");
    await runPsql(`
      UPDATE mwb.game_assets
      SET asset_ref = ${sqlLiteral(assetRef)},
          asset_hash = ${sqlLiteral(assetHash)},
          visibility_status = coalesce(nullif(${sqlLiteral(visibilityStatus || "")}, ''), visibility_status),
          metadata = metadata || ${sqlJson(metadata || {})},
          updated_at = now()
      WHERE asset_id = ${sqlLiteral(assetId)};
    `, this.database);
  }

  async getDmpPackageSet({ routeId, gameCode, packageSetId = "", targetAdvertiserId = "" }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    if (packageSetId) assertId("package_set_id", packageSetId);
    if (targetAdvertiserId) assertId("target_advertiser_id", targetAdvertiserId, /^[0-9]+$/);
    const targetJoin = targetAdvertiserId
      ? `LEFT JOIN mwb.dmp_package_member_account_states target_state
           ON target_state.package_set_id = m.package_set_id
          AND target_state.custom_audience_id = m.custom_audience_id
          AND target_state.advertiser_id = ${sqlLiteral(targetAdvertiserId)}`
      : "";
    const memberJson = targetAdvertiserId
      ? `to_jsonb(m) || jsonb_build_object(
          'target_advertiser_id', ${sqlLiteral(targetAdvertiserId)},
          'target_readonly_status', coalesce(target_state.readonly_status, 'not_checked'),
          'target_evidence_ref', coalesce(target_state.evidence_ref, ''),
          'target_state_metadata', coalesce(target_state.metadata, '{}'::jsonb)
        )`
      : "to_jsonb(m)";
    return queryJson(`
      SELECT jsonb_build_object(
        'packageSet', to_jsonb(s),
        'members', coalesce((
          SELECT jsonb_agg(${memberJson} ORDER BY m.custom_audience_id)
          FROM mwb.dmp_package_members m
          ${targetJoin}
          WHERE m.package_set_id = s.package_set_id
        ), '[]'::jsonb)
      )::text
      FROM mwb.dmp_package_sets s
      WHERE s.route_id = ${sqlLiteral(routeId)}
        AND s.game_code = ${sqlLiteral(gameCode)}
        ${packageSetId ? `AND s.package_set_id = ${sqlLiteral(packageSetId)}` : ""}
      ORDER BY
        CASE s.status
          WHEN 'target_readonly_verified' THEN 1
          WHEN 'source_readonly_verified' THEN 2
          WHEN 'push_plan_pending' THEN 3
          WHEN 'reference_candidate' THEN 4
          ELSE 5
        END,
        s.updated_at DESC
      LIMIT 1;
    `, this.database);
  }

  async updateDmpPackageMemberReadonly({
    packageSetId,
    customAudienceId,
    targetAdvertiserId = "",
    sourceReadonlyStatus = "",
    targetReadonlyStatus = "",
    sourceEvidenceRef = "",
    targetEvidenceRef = "",
    referenceStatus = "",
    metadata = {}
  }) {
    assertId("package_set_id", packageSetId);
    assertId("custom_audience_id", customAudienceId, /^[0-9]+$/);
    if (targetAdvertiserId) assertId("target_advertiser_id", targetAdvertiserId, /^[0-9]+$/);
    await runPsql(`
      UPDATE mwb.dmp_package_members
      SET source_readonly_status = coalesce(nullif(${sqlLiteral(sourceReadonlyStatus)}, ''), source_readonly_status),
          target_readonly_status = CASE
            WHEN ${sqlLiteral(targetAdvertiserId)} = '' THEN coalesce(nullif(${sqlLiteral(targetReadonlyStatus)}, ''), target_readonly_status)
            ELSE target_readonly_status
          END,
          source_evidence_ref = coalesce(nullif(${sqlLiteral(sourceEvidenceRef)}, ''), source_evidence_ref),
          target_evidence_ref = CASE
            WHEN ${sqlLiteral(targetAdvertiserId)} = '' THEN coalesce(nullif(${sqlLiteral(targetEvidenceRef)}, ''), target_evidence_ref)
            ELSE target_evidence_ref
          END,
          reference_status = coalesce(nullif(${sqlLiteral(referenceStatus)}, ''), reference_status),
          metadata = metadata || ${sqlJson(metadata || {})},
          updated_at = now()
      WHERE package_set_id = ${sqlLiteral(packageSetId)}
        AND custom_audience_id = ${sqlLiteral(customAudienceId)};
    `, this.database);
    if (targetAdvertiserId && targetReadonlyStatus) {
      await this.updateDmpPackageMemberAccountReadonly({
        packageSetId,
        customAudienceId,
        advertiserId: targetAdvertiserId,
        readonlyStatus: targetReadonlyStatus,
        evidenceRef: targetEvidenceRef,
        metadata
      });
    }
  }

  async updateDmpPackageMemberAccountReadonly({
    packageSetId,
    customAudienceId,
    advertiserId,
    readonlyStatus,
    evidenceRef = "",
    metadata = {},
    sourceUsage = "runtime_truth"
  }) {
    assertId("package_set_id", packageSetId);
    assertId("custom_audience_id", customAudienceId, /^[0-9]+$/);
    assertId("advertiser_id", advertiserId, /^[0-9]+$/);
    assertId("readonly_status", readonlyStatus);
    await runPsql(`
      INSERT INTO mwb.dmp_package_member_account_states (
        account_state_id,
        package_set_id,
        custom_audience_id,
        advertiser_id,
        readonly_status,
        evidence_ref,
        metadata,
        source_usage,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(`DMPAS-${packageSetId}-${advertiserId}-${customAudienceId}`)},
        ${sqlLiteral(packageSetId)},
        ${sqlLiteral(customAudienceId)},
        ${sqlLiteral(advertiserId)},
        ${sqlLiteral(readonlyStatus)},
        ${sqlLiteral(evidenceRef || "")},
        ${sqlJson(metadata || {})},
        ${sqlLiteral(sourceUsage || "runtime_truth")},
        now(),
        now()
      )
      ON CONFLICT (package_set_id, custom_audience_id, advertiser_id) DO UPDATE SET
        readonly_status = EXCLUDED.readonly_status,
        evidence_ref = coalesce(nullif(EXCLUDED.evidence_ref, ''), mwb.dmp_package_member_account_states.evidence_ref),
        metadata = mwb.dmp_package_member_account_states.metadata || EXCLUDED.metadata,
        source_usage = EXCLUDED.source_usage,
        updated_at = now();
    `, this.database);
  }

  async updateDmpPackageSetStatus({ packageSetId, status, metadata = {} }) {
    assertId("package_set_id", packageSetId);
    assertId("status", status);
    await runPsql(`
      UPDATE mwb.dmp_package_sets
      SET status = ${sqlLiteral(status)},
          metadata = metadata || ${sqlJson(metadata || {})},
          updated_at = now()
      WHERE package_set_id = ${sqlLiteral(packageSetId)};
    `, this.database);
  }

  async upsertDmpPackagePushPlans({
    jobId,
    packageSetId,
    sourceAdvertiserId,
    targetAdvertiserId,
    customAudienceIds = [],
    endpoint,
    requestFieldManifest = {},
    evidenceRef = "",
    metadata = {}
  }) {
    assertId("job_id", jobId);
    assertId("package_set_id", packageSetId);
    assertId("source_advertiser_id", sourceAdvertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("target_advertiser_id", targetAdvertiserId, /^[0-9A-Za-z_\-.]+$/);
    const ids = [...new Set(customAudienceIds.map((value) => String(value || "").trim()).filter(Boolean))];
    ids.forEach((id) => assertId("custom_audience_id", id, /^[0-9]+$/));
    if (!ids.length) return { plannedCount: 0, pushPlanIds: [] };
    const rows = ids.map((id) => {
      const payloadShape = {
        advertiser_id: safeNumericJsonNumber("source_advertiser_id", sourceAdvertiserId),
        custom_audience_id: safeNumericJsonNumber("custom_audience_id", id),
        target_advertiser_ids: [safeNumericJsonNumber("target_advertiser_id", targetAdvertiserId)]
      };
      const requestHash = `sha256:${sha256Hex(JSON.stringify(payloadShape))}`;
      return `(
        ${sqlLiteral(`DMPP-${jobId}-${id}`)},
        ${sqlLiteral(jobId)},
        ${sqlLiteral(packageSetId)},
        ${sqlLiteral(id)},
        ${sqlLiteral(sourceAdvertiserId)},
        ${sqlLiteral(targetAdvertiserId)},
        'ensure_resource:dmp_audience_package',
        ${sqlLiteral(endpoint)},
        'planned',
        ${sqlLiteral(requestHash)},
        ${sqlJson(requestFieldManifest || {})},
        ${sqlLiteral(evidenceRef || "")},
        ${sqlJson({
          ...(metadata || {}),
          request_hash_input_stored: false,
          delivery_status_policy: "readback_only_not_sent"
        })},
        now(),
        now()
      )`;
    }).join(",");
    return queryJson(`
      WITH upserted AS (
        INSERT INTO mwb.dmp_package_push_plans (
          push_plan_id,
          job_id,
          package_set_id,
          custom_audience_id,
          source_advertiser_id,
          target_advertiser_id,
          action_type,
          endpoint,
          plan_status,
          request_hash,
          request_field_manifest,
          evidence_ref,
          metadata,
          created_at,
          updated_at
        ) VALUES ${rows}
        ON CONFLICT (job_id, package_set_id, custom_audience_id) DO UPDATE SET
          source_advertiser_id = EXCLUDED.source_advertiser_id,
          target_advertiser_id = EXCLUDED.target_advertiser_id,
          action_type = EXCLUDED.action_type,
          endpoint = EXCLUDED.endpoint,
          plan_status = EXCLUDED.plan_status,
          request_hash = EXCLUDED.request_hash,
          request_field_manifest = EXCLUDED.request_field_manifest,
          evidence_ref = EXCLUDED.evidence_ref,
          metadata = mwb.dmp_package_push_plans.metadata || EXCLUDED.metadata,
          updated_at = now()
        RETURNING push_plan_id
      )
      SELECT jsonb_build_object(
        'plannedCount', count(*),
        'pushPlanIds', coalesce(jsonb_agg(push_plan_id ORDER BY push_plan_id), '[]'::jsonb)
      )::text
      FROM upserted;
    `, this.database);
  }

  async getDmpPackagePushPlans(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.custom_audience_id), '[]'::jsonb)::text
      FROM mwb.dmp_package_push_plans p
      WHERE p.job_id = ${sqlLiteral(jobId)};
    `, this.database);
  }

  async updateDmpPackagePushPlanStatus({
    pushPlanId,
    planStatus,
    evidenceRef = "",
    responseHash = "",
    metadata = {}
  }) {
    assertId("push_plan_id", pushPlanId);
    assertId("plan_status", planStatus);
    await runPsql(`
      UPDATE mwb.dmp_package_push_plans
      SET plan_status = ${sqlLiteral(planStatus)},
          evidence_ref = coalesce(nullif(${sqlLiteral(evidenceRef || "")}, ''), evidence_ref),
          metadata = metadata || ${sqlJson({
            ...(metadata || {}),
            ...(responseHash ? { response_hash: responseHash } : {})
          })},
          updated_at = now()
      WHERE push_plan_id = ${sqlLiteral(pushPlanId)};
    `, this.database);
  }

  async getLaunchJobBundle(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT jsonb_build_object(
        'job', to_jsonb(j),
        'case', to_jsonb(wc),
        'route', to_jsonb(r),
        'game', to_jsonb(g),
        'account', to_jsonb(a),
        'touchpoint', (
          SELECT ${safeTouchpointJson("t")}
          FROM mwb.account_touchpoints t
          WHERE t.route_id = j.route_id
            AND t.game_code = j.game_code
            AND t.advertiser_id = j.advertiser_id
          ORDER BY t.updated_at DESC
          LIMIT 1
        ),
        'monitorProvision', (
          SELECT jsonb_build_object(
            'provision_id', v.provision_id,
            'cycle_id', v.cycle_id,
            'cycle_status', v.cycle_status,
            'provision_status', v.provision_status,
            'monitor_id_present', v.monitor_id_present,
            'touchpoint_url_present', v.touchpoint_url_present,
            'blocker', CASE
              WHEN v.provision_status = 'terminal_failed' THEN coalesce(nullif(v.error_summary, ''), 'monitor_create_busy_retry_exhausted')
              ELSE ''
            END,
            'latest_attempt_status', v.latest_attempt_status,
            'latest_attempt_error_category', v.latest_attempt_error_category,
            'latest_attempt_error_summary', v.latest_attempt_error_summary,
            'updated_at', v.updated_at
          )
          FROM mwb.v_monitor_provision_status_report v
          WHERE v.route_id = j.route_id
            AND v.game_code = j.game_code
            AND v.advertiser_id = j.advertiser_id
          ORDER BY v.updated_at DESC
          LIMIT 1
        ),
        'monitorReadiness', (
          SELECT jsonb_build_object(
            'readiness_status', mr.readiness_status,
            'monitor_ready', mr.monitor_ready,
            'monitor_id_present', mr.monitor_id_present,
            'touchpoint_ref_present', mr.touchpoint_ref_present,
            'touchpoint_url_present', mr.touchpoint_url_present,
            'readback_verified', mr.readback_verified,
            'actionable_blocker_code', mr.actionable_blocker_code,
            'diagnostic_codes', mr.diagnostic_codes,
            'suggested_action', mr.suggested_action,
            'provision_id', mr.provision_id,
            'cycle_id', mr.cycle_id,
            'cycle_no', mr.cycle_no,
            'cycle_status', mr.cycle_status,
            'attempt_count', mr.attempt_count,
            'evidence_artifact_id', mr.evidence_artifact_id,
            'updated_at', mr.updated_at
          )
          FROM mwb.v_monitor_readiness mr
          WHERE mr.route_id = j.route_id
            AND mr.game_code = j.game_code
            AND mr.advertiser_id = j.advertiser_id
          LIMIT 1
        ),
        'defaults', (
          SELECT to_jsonb(d)
          FROM mwb.game_route_defaults d
          WHERE d.route_id = j.route_id
            AND d.game_code = j.game_code
          LIMIT 1
        ),
        'platformApp', (
          SELECT to_jsonb(pa)
          FROM mwb.game_platform_apps pa
          WHERE pa.game_code = j.game_code
            AND pa.platform = r.platform
            AND pa.app_type = r.marketing_product
          LIMIT 1
        ),
        'gameRouteLaunchLink', (
          SELECT ${safeGameRouteLaunchLinkJson("grll")}
          FROM mwb.game_route_launch_links grll
          WHERE grll.route_id = j.route_id
            AND grll.game_code = j.game_code
            AND grll.status = 'active'
          ORDER BY grll.updated_at DESC
          LIMIT 1
        ),
        'materialPack', (
          SELECT jsonb_build_object(
            'pack', to_jsonb(mp),
            'items', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object('item', to_jsonb(mpi), 'asset', to_jsonb(ga))
                ORDER BY mpi.sort_order
              )
              FROM mwb.material_pack_items mpi
              LEFT JOIN mwb.game_assets ga ON ga.asset_id = mpi.asset_id
              WHERE mpi.pack_id = mp.pack_id
            ), '[]'::jsonb)
          )
          FROM mwb.material_packs mp
          WHERE mp.route_id = j.route_id
            AND mp.game_code = j.game_code
            AND mp.status IN ('baseline_ready', 'active')
          ORDER BY mp.updated_at DESC
          LIMIT 1
        ),
        'backupLandingPage', (
          SELECT ${safeLandingPageJson("lpa")}
          FROM mwb.landing_page_assets lpa
          WHERE lpa.route_id = j.route_id
            AND lpa.game_code = j.game_code
            AND lpa.is_default = true
          ORDER BY
            CASE lpa.status
              WHEN 'active' THEN 1
              WHEN 'resolved' THEN 2
              WHEN 'reference_candidate' THEN 3
              ELSE 4
            END,
            lpa.updated_at DESC
          LIMIT 1
        ),
        'resourceBlueprints', (
          SELECT coalesce(jsonb_agg(to_jsonb(brp) ORDER BY brp.resource_type, brp.blueprint_id), '[]'::jsonb)
          FROM mwb.game_route_resource_blueprints brp
          WHERE brp.route_id = j.route_id
            AND brp.game_code = j.game_code
        ),
        'resources', (
          SELECT coalesce(jsonb_agg(to_jsonb(ar) ORDER BY ar.resource_type, ar.resource_id), '[]'::jsonb)
          FROM mwb.account_resources ar
          WHERE ar.route_id = j.route_id
            AND ar.game_code = j.game_code
            AND ar.advertiser_id = j.advertiser_id
        ),
        'nodes', (
          SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.node_run_id), '[]'::jsonb)
          FROM mwb.launch_node_runs n
          WHERE n.job_id = j.job_id
        ),
        'draft', (
          SELECT to_jsonb(d)
          FROM mwb.launch_drafts d
          WHERE d.job_id = j.job_id
          ORDER BY d.created_at DESC
          LIMIT 1
        ),
        'executionPlan', (
          SELECT to_jsonb(ep)
          FROM mwb.launch_execution_plans ep
          WHERE ep.job_id = j.job_id
          ORDER BY ep.plan_version DESC, ep.updated_at DESC
          LIMIT 1
        ),
        'readback', (
          SELECT to_jsonb(rb)
          FROM mwb.readback_records rb
          WHERE rb.job_id = j.job_id
          ORDER BY rb.created_at DESC
          LIMIT 1
        ),
        'placeholderReadback', (
          SELECT to_jsonb(rb)
          FROM mwb.readback_records rb
          WHERE rb.job_id = j.job_id
            AND (
              rb.readback_status = 'placeholder_recorded'
              OR rb.object_id LIKE 'PLACEHOLDER-%'
            )
          ORDER BY rb.created_at DESC
          LIMIT 1
        ),
        'platformAction', (
          SELECT jsonb_build_object(
            'action_id', pa.action_id,
            'action_type', pa.action_type,
            'plan_id', pa.plan_id,
            'attempt_no', pa.attempt_no,
            'endpoint', pa.endpoint,
            'action_status', pa.action_status,
            'http_status', pa.http_status,
            'api_code', pa.api_code,
            'request_id_present', pa.request_id_present,
            'request_id_recorded', (pa.request_id <> ''),
            'object_id_present', pa.object_id_present,
            'error_summary', pa.error_summary,
            'error_category', pa.error_category,
            'offending_field_path', pa.offending_field_path,
            'request_field_manifest', pa.request_field_manifest,
            'response_summary', pa.response_summary,
            'metadata', pa.metadata,
            'started_at', pa.started_at,
            'finished_at', pa.finished_at
          )
          FROM mwb.platform_actions pa
          WHERE pa.job_id = j.job_id
            AND pa.action_type IN ('oceanengine_std_project_create', 'mock_oceanengine_std_project_create')
          ORDER BY coalesce(pa.finished_at, pa.started_at) DESC
          LIMIT 1
        ),
        'createdObject', (
          SELECT jsonb_build_object(
            'created_object_id', co.created_object_id,
            'object_type', co.object_type,
            'object_id', co.object_id,
            'object_name', co.object_name,
            'object_status', co.object_status,
            'readback_status', co.readback_status,
            'evidence_ref', co.evidence_ref,
            'created_at', co.created_at,
            'readback_at', co.readback_at
          )
          FROM mwb.created_objects co
          WHERE co.job_id = j.job_id
          ORDER BY co.created_at DESC
          LIMIT 1
        ),
        'skillRuns', (
          SELECT coalesce(jsonb_agg(to_jsonb(sr) ORDER BY sr.started_at, sr.skill_run_id), '[]'::jsonb)
          FROM mwb.launch_skill_runs sr
          WHERE sr.job_id = j.job_id
        ),
        'evidence', (
          SELECT coalesce(jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at), '[]'::jsonb)
          FROM mwb.evidence_artifacts ev
          WHERE ev.job_id = j.job_id
        )
      )::text
      FROM mwb.launch_jobs j
      JOIN mwb.workflow_cases wc ON wc.case_id = j.case_id
      JOIN mwb.platform_routes r ON r.route_id = j.route_id
      JOIN mwb.games g ON g.game_code = j.game_code
      JOIN mwb.advertiser_accounts a ON a.advertiser_id = j.advertiser_id
      WHERE j.job_id = ${sqlLiteral(jobId)}
      LIMIT 1;
    `, this.database);
  }

  async createWorkflowCase({
    caseId,
    caseKey,
    routeId,
    gameCode,
    advertiserId,
    businessGoal = "",
    lifecycleStatus = "active",
    sourceUsage = "runtime_truth",
    metadata = {}
  }) {
    assertId("case_id", caseId);
    assertId("case_key", caseKey, /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("lifecycle_status", lifecycleStatus);
    assertId("source_usage", sourceUsage);
    if (typeof metadata !== "object" || Array.isArray(metadata) || metadata === null) throw new Error("invalid_workflow_case_metadata");
    await runPsql(`
      INSERT INTO mwb.workflow_cases (
        case_id, case_key, route_id, game_code, advertiser_id,
        business_goal, lifecycle_status, source_usage, metadata, created_at, updated_at
      ) VALUES (
        ${sqlLiteral(caseId)}, ${sqlLiteral(caseKey)}, ${sqlLiteral(routeId)}, ${sqlLiteral(gameCode)}, ${sqlLiteral(advertiserId)},
        ${sqlLiteral(businessGoal)}, ${sqlLiteral(lifecycleStatus)}, ${sqlLiteral(sourceUsage)}, ${sqlJson(metadata)}, now(), now()
      );
    `, this.database);
    return this.getWorkflowCase(caseId);
  }

  async getWorkflowCase(caseId) {
    assertId("case_id", caseId);
    return queryJson(`
      SELECT to_jsonb(wc)::text
      FROM mwb.workflow_cases wc
      WHERE wc.case_id = ${sqlLiteral(caseId)}
      LIMIT 1;
    `, this.database);
  }

  async updateWorkflowCaseLifecycle({ caseId, lifecycleStatus, metadataPatch = {} } = {}) {
    assertId("case_id", caseId);
    assertId("lifecycle_status", lifecycleStatus);
    if (typeof metadataPatch !== "object" || Array.isArray(metadataPatch) || metadataPatch === null) {
      throw new Error("invalid_workflow_case_metadata_patch");
    }
    await runPsql(`
      UPDATE mwb.workflow_cases
      SET lifecycle_status = ${sqlLiteral(lifecycleStatus)},
          metadata = metadata || ${sqlJson(metadataPatch)},
          updated_at = now()
      WHERE case_id = ${sqlLiteral(caseId)};
    `, this.database);
  }

  async completeVerifiedStdProjectRuntimeCase({ caseId, jobId, planId } = {}) {
    assertId("case_id", caseId);
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    const result = await queryJson(`
      WITH eligible AS (
        SELECT workflow_case.case_id
        FROM mwb.workflow_cases workflow_case
        JOIN mwb.launch_jobs job
          ON job.case_id = workflow_case.case_id
         AND job.job_id = ${sqlLiteral(jobId)}
        JOIN mwb.launch_execution_plans plan
          ON plan.job_id = job.job_id
         AND plan.plan_id = ${sqlLiteral(planId)}
        JOIN mwb.launch_drafts draft
          ON draft.job_id = job.job_id
        WHERE workflow_case.case_id = ${sqlLiteral(caseId)}
          AND workflow_case.source_usage = 'runtime_truth'
          AND workflow_case.lifecycle_status IN ('active', 'completed')
          AND job.source_usage = 'runtime_truth'
          AND job.job_id = (
            SELECT latest.job_id
            FROM mwb.launch_jobs latest
            WHERE latest.case_id = workflow_case.case_id
            ORDER BY latest.updated_at DESC, latest.created_at DESC, latest.job_id DESC
            LIMIT 1
          )
          AND plan.plan_status = 'consumed'
          AND coalesce(plan.plan_kind, plan.metadata->>'plan_kind', '') = 'std_project_create'
          AND draft.draft_id = (
            SELECT latest_draft.draft_id
            FROM mwb.launch_drafts latest_draft
            WHERE latest_draft.job_id = job.job_id
            ORDER BY latest_draft.created_at DESC, latest_draft.draft_id DESC
            LIMIT 1
          )
          AND (
            SELECT count(*)
            FROM mwb.platform_actions create_action
            WHERE create_action.job_id = job.job_id
              AND create_action.action_type = 'oceanengine_std_project_create'
          ) = 1
          AND (
            SELECT count(*)
            FROM mwb.created_objects std_project_object
            WHERE std_project_object.job_id = job.job_id
              AND std_project_object.object_type = 'std_project'
          ) = 1
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = job.job_id
              AND confirmation.plan_id = plan.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.platform_actions action
            WHERE action.job_id = job.job_id
              AND action.plan_id = plan.plan_id
              AND action.action_type = 'oceanengine_std_project_create'
              AND action.action_status = 'succeeded'
              AND action.object_id_present = true
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.created_objects created_object
            JOIN LATERAL (
              SELECT readback.*
              FROM mwb.readback_records readback
              WHERE readback.job_id = job.job_id
                AND readback.object_type = 'std_project'
              ORDER BY readback.created_at DESC
              LIMIT 1
            ) latest_readback ON true
            WHERE created_object.job_id = job.job_id
              AND created_object.object_type = 'std_project'
              AND created_object.object_id = latest_readback.object_id
              AND created_object.object_name = draft.project_name
              AND latest_readback.object_name = draft.project_name
              AND latest_readback.readback_status = 'readback_verified'
          )
        ORDER BY draft.created_at DESC
        LIMIT 1
      ), job_completed AS (
        UPDATE mwb.launch_jobs job
        SET job_status = 'completed',
            current_node = '7',
            updated_at = now()
        WHERE job.job_id = ${sqlLiteral(jobId)}
          AND EXISTS (SELECT 1 FROM eligible)
        RETURNING job.job_id
      ), completed AS (
        UPDATE mwb.workflow_cases workflow_case
        SET lifecycle_status = 'completed',
            metadata = workflow_case.metadata || jsonb_build_object(
              'completion_reason', 'first_std_project_create_completed',
              'completed_job_id', ${sqlLiteral(jobId)}
            ),
            updated_at = CASE
              WHEN workflow_case.lifecycle_status = 'completed' THEN workflow_case.updated_at
              ELSE now()
            END
        WHERE workflow_case.case_id = ${sqlLiteral(caseId)}
          AND EXISTS (SELECT 1 FROM job_completed)
        RETURNING workflow_case.case_id
      )
      SELECT jsonb_build_object(
        'completed', EXISTS (SELECT 1 FROM completed),
        'jobCompleted', EXISTS (SELECT 1 FROM job_completed),
        'caseId', ${sqlLiteral(caseId)},
        'jobId', ${sqlLiteral(jobId)},
        'planId', ${sqlLiteral(planId)}
      )::text;
    `, this.database);
    return result || { completed: false, caseId, jobId, planId };
  }

  async getWorkflowCaseByKey(caseKey) {
    assertId("case_key", caseKey, /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
    return queryJson(`
      SELECT to_jsonb(wc)::text
      FROM mwb.workflow_cases wc
      WHERE wc.case_key = ${sqlLiteral(caseKey)}
      LIMIT 1;
    `, this.database);
  }

  async getActiveRuntimeWorkflowCase({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    return queryJson(`
      SELECT to_jsonb(wc)::text
      FROM mwb.workflow_cases wc
      WHERE wc.route_id = ${sqlLiteral(routeId)}
        AND wc.game_code = ${sqlLiteral(gameCode)}
        AND wc.advertiser_id = ${sqlLiteral(advertiserId)}
        AND wc.source_usage = 'runtime_truth'
        AND wc.lifecycle_status = 'active'
      ORDER BY wc.updated_at DESC, wc.created_at DESC, wc.case_id DESC
      LIMIT 1;
    `, this.database);
  }

  async getLatestLaunchJobByCase(caseId) {
    assertId("case_id", caseId);
    return queryJson(`
      SELECT to_jsonb(job)::text
      FROM mwb.launch_jobs job
      WHERE job.case_id = ${sqlLiteral(caseId)}
      ORDER BY job.updated_at DESC, job.created_at DESC, job.job_id DESC
      LIMIT 1;
    `, this.database);
  }

  async getWorkflowCaseSummary(caseId) {
    assertId("case_id", caseId);
    return queryJson(`
      SELECT to_jsonb(summary)::text
      FROM mwb.workflow_case_summary summary
      WHERE summary.case_id = ${sqlLiteral(caseId)}
      LIMIT 1;
    `, this.database);
  }

  async getManualL3OverrideEvidence({ routeId, gameCode, advertiserId, provisionId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("provision_id", provisionId);
    return queryJson(`
      SELECT jsonb_build_object(
        'artifactId', artifact_id,
        'target', summary::jsonb->'target',
        'manualConfirm', summary::jsonb->'manualConfirm',
        'createdAt', created_at
      )::text
      FROM mwb.evidence_artifacts
      WHERE artifact_type = 'qiankun_manual_l3_confirm'
        AND summary::jsonb->'target'->>'routeId' = ${sqlLiteral(routeId)}
        AND summary::jsonb->'target'->>'gameCode' = ${sqlLiteral(gameCode)}
        AND summary::jsonb->'target'->>'advertiserId' = ${sqlLiteral(advertiserId)}
        AND summary::jsonb->'target'->>'provisionId' = ${sqlLiteral(provisionId)}
      ORDER BY created_at DESC
      LIMIT 1;
    `, this.database);
  }

  async listWorkflowCaseSummaries({ sourceUsage = "", lifecycleStatus = "" } = {}) {
    if (sourceUsage) assertId("source_usage", sourceUsage);
    if (lifecycleStatus) assertId("lifecycle_status", lifecycleStatus);
    const filters = [
      sourceUsage ? `summary.source_usage = ${sqlLiteral(sourceUsage)}` : "",
      lifecycleStatus ? `summary.lifecycle_status = ${sqlLiteral(lifecycleStatus)}` : ""
    ].filter(Boolean);
    const sourceFilter = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    return queryJson(`
      SELECT coalesce(jsonb_agg(to_jsonb(summary) ORDER BY summary.latest_job_updated_at DESC NULLS LAST, summary.updated_at DESC), '[]'::jsonb)::text
      FROM mwb.workflow_case_summary summary
      ${sourceFilter};
    `, this.database);
  }

  async listWorkflowCaseJobs(caseId) {
    assertId("case_id", caseId);
    return queryJson(`
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'job_id', j.job_id,
        'job_status', j.job_status,
        'current_node', j.current_node,
        'source_usage', j.source_usage,
        'source_record_ref', j.source_record_ref,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'plan_status', coalesce(ep.plan_status, ''),
        'blocker_codes', coalesce(ep.blocker_codes, '[]'::jsonb)
      ) ORDER BY j.updated_at DESC, j.created_at DESC), '[]'::jsonb)::text
      FROM mwb.launch_jobs j
      LEFT JOIN LATERAL (
        SELECT plan_status, blocker_codes
        FROM mwb.launch_execution_plans ep
        WHERE ep.job_id = j.job_id
        ORDER BY ep.plan_version DESC, ep.updated_at DESC
        LIMIT 1
      ) ep ON true
      WHERE j.case_id = ${sqlLiteral(caseId)};
    `, this.database);
  }

  async assertWorkflowCaseScope({ caseId, routeId, gameCode, advertiserId, sourceUsage }) {
    const workflowCase = await this.getWorkflowCase(caseId);
    if (!workflowCase) return { status: "not_found", workflowCase: null };
    const matches = workflowCase.route_id === routeId &&
      workflowCase.game_code === gameCode &&
      workflowCase.advertiser_id === advertiserId &&
      workflowCase.source_usage === sourceUsage;
    return {
      status: matches && workflowCase.lifecycle_status === "active" ? "passed" : "blocked",
      workflowCase,
      blockers: [
        ...(matches ? [] : ["workflow_case_scope_mismatch"]),
        ...(workflowCase.lifecycle_status === "active" ? [] : ["workflow_case_not_active"])
      ]
    };
  }

  async getOccupiedProjectNames({ routeId, gameCode, advertiserId, objectType = "std_project" }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("object_type", objectType);

    return queryJson(`
      SELECT coalesce(jsonb_agg(project_name ORDER BY project_name), '[]'::jsonb)::text
      FROM mwb.project_name_reservations
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND object_type = ${sqlLiteral(objectType)}
        AND source_usage = 'runtime_truth'
        AND reservation_status IN ('reserved', 'consumed');
    `, this.database);
  }

  async reserveProjectName({
    jobId,
    draftId,
    routeId,
    gameCode,
    advertiserId,
    objectType,
    namePrefix,
    yyyymmdd,
    sourceUsage = "runtime_truth",
    reservationAttempt = 0
  }) {
    assertId("job_id", jobId);
    assertId("draft_id", draftId);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("object_type", objectType);
    if (!String(namePrefix || "").trim()) throw new Error("name_prefix_required");
    if (!/^\d{8}$/.test(String(yyyymmdd || ""))) throw new Error("invalid_yyyymmdd");
    assertId("source_usage", sourceUsage);

    const reservationId = `PNR-${jobId}`;
    const scopeKey = [routeId, gameCode, advertiserId, objectType, namePrefix, yyyymmdd, sourceUsage].join(":");
    const reservation = await queryJson(`
      WITH scope_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(scopeKey)}, 0)) AS locked
      ),
      existing AS (
        SELECT *
        FROM mwb.project_name_reservations
        WHERE job_id = ${sqlLiteral(jobId)}
        FOR UPDATE
      ),
      next_sequence AS (
        SELECT candidate.project_seq
        FROM generate_series(1, 9999) AS candidate(project_seq)
        CROSS JOIN scope_lock
        WHERE NOT EXISTS (
          SELECT 1
          FROM mwb.project_name_reservations reservation
          WHERE reservation.route_id = ${sqlLiteral(routeId)}
            AND reservation.game_code = ${sqlLiteral(gameCode)}
            AND reservation.advertiser_id = ${sqlLiteral(advertiserId)}
            AND reservation.object_type = ${sqlLiteral(objectType)}
            AND reservation.name_prefix = ${sqlLiteral(namePrefix)}
            AND reservation.yyyymmdd = ${sqlLiteral(yyyymmdd)}
            AND reservation.source_usage = ${sqlLiteral(sourceUsage)}
            AND reservation.project_seq = candidate.project_seq
        )
        ORDER BY candidate.project_seq
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO mwb.project_name_reservations (
          reservation_id, job_id, draft_id, route_id, game_code, advertiser_id,
          object_type, name_prefix, yyyymmdd, project_seq, project_name,
          reservation_status, source_usage, created_at
        )
        SELECT
          ${sqlLiteral(reservationId)}, ${sqlLiteral(jobId)}, ${sqlLiteral(draftId)},
          ${sqlLiteral(routeId)}, ${sqlLiteral(gameCode)}, ${sqlLiteral(advertiserId)},
          ${sqlLiteral(objectType)}, ${sqlLiteral(namePrefix)}, ${sqlLiteral(yyyymmdd)},
          next_sequence.project_seq,
          ${sqlLiteral(namePrefix)} || '_P' || lpad(next_sequence.project_seq::text, 2, '0') || '_' || ${sqlLiteral(yyyymmdd)},
          'reserved', ${sqlLiteral(sourceUsage)}, now()
        FROM next_sequence
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT DO NOTHING
        RETURNING *
      )
      SELECT to_jsonb(reservation)::text
      FROM (
        SELECT * FROM existing
        UNION ALL
        SELECT * FROM inserted
      ) reservation
      LIMIT 1;
    `, this.database);
    if (!reservation && reservationAttempt < 4) {
      return this.reserveProjectName({
        jobId,
        draftId,
        routeId,
        gameCode,
        advertiserId,
        objectType,
        namePrefix,
        yyyymmdd,
        sourceUsage,
        reservationAttempt: reservationAttempt + 1
      });
    }
    if (!reservation) throw new Error("project_name_reservation_unavailable");
    return reservation;
  }

  async getTouchpointVerification({ routeId, gameCode, advertiserId, monitorId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    if (!monitorId) {
      return {
        status: "monitor_id_missing",
        touchpointRef: "",
        storedUrlHash: "",
        computedUrlHash: "",
        touchpointUrlPresent: false,
        urlHashMatches: false
      };
    }
    assertId("monitor_id", monitorId, /^[0-9A-Za-z_\-.]+$/);

    const row = await queryJson(`
      SELECT to_jsonb(t)::text
      FROM mwb.account_touchpoints t
      WHERE t.route_id = ${sqlLiteral(routeId)}
        AND t.game_code = ${sqlLiteral(gameCode)}
        AND t.advertiser_id = ${sqlLiteral(advertiserId)}
        AND t.monitor_id = ${sqlLiteral(monitorId)}
      ORDER BY t.updated_at DESC
      LIMIT 1;
    `, this.database);

    if (!row) {
      return {
        status: "missing",
        touchpointRef: "",
        storedUrlHash: "",
        computedUrlHash: "",
        touchpointUrlPresent: false,
        urlHashMatches: false
      };
    }

    const touchpointUrl = row.touchpoint_url || "";
    const computedUrlHash = touchpointUrl ? sha256Hex(touchpointUrl) : "";
    const storedUrlHash = row.url_hash || "";
    const normalizedStoredHash = storedUrlHash.startsWith("sha256:") ? storedUrlHash.slice("sha256:".length) : storedUrlHash;
    return {
      status: row.status || "unknown",
      touchpointRef: row.touchpoint_ref || "",
      storedUrlHash,
      computedUrlHash,
      touchpointUrlPresent: Boolean(touchpointUrl),
      urlHashMatches: Boolean(touchpointUrl && normalizedStoredHash && computedUrlHash === normalizedStoredHash)
    };
  }

  async getControlledTouchpointUrl({ routeId, gameCode, advertiserId, monitorId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("monitor_id", monitorId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      SELECT jsonb_build_object(
        'touchpoint_ref', t.touchpoint_ref,
        'url_hash', t.url_hash,
        'status', t.status,
        'touchpoint_url', t.touchpoint_url
      )::text
      FROM mwb.account_touchpoints t
      WHERE t.route_id = ${sqlLiteral(routeId)}
        AND t.game_code = ${sqlLiteral(gameCode)}
        AND t.advertiser_id = ${sqlLiteral(advertiserId)}
        AND t.monitor_id = ${sqlLiteral(monitorId)}
      ORDER BY t.updated_at DESC
      LIMIT 1;
    `, this.database);
  }

  async getMonitorProvisionDefaults({ routeId, gameCode }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);

    return queryJson(`
      SELECT jsonb_build_object(
        'route_id', d.route_id,
        'game_code', d.game_code,
        'source_usage', coalesce(d.source_usage, 'runtime_truth'),
        'monitor_provision_present', d.raw_defaults ? 'monitor_provision',
        'monitor_provision', coalesce(d.raw_defaults->'monitor_provision', '{}'::jsonb),
        'monitor_provision_reference_candidates', coalesce(d.raw_defaults->'monitor_provision_reference_candidates', '{}'::jsonb),
        'monitor_provision_status', coalesce(d.raw_defaults->>'monitor_provision_status', ''),
        'updated_at', d.updated_at
      )::text
      FROM mwb.game_route_defaults d
      WHERE d.route_id = ${sqlLiteral(routeId)}
        AND d.game_code = ${sqlLiteral(gameCode)}
      LIMIT 1;
    `, this.database);
  }

  async getLatestMonitorProvisionRun({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      SELECT to_jsonb(run)::text
      FROM mwb.monitor_provision_runs run
      WHERE run.route_id = ${sqlLiteral(routeId)}
        AND run.game_code = ${sqlLiteral(gameCode)}
        AND run.advertiser_id = ${sqlLiteral(advertiserId)}
      ORDER BY run.cycle_no DESC, run.updated_at DESC, run.created_at DESC
      LIMIT 1;
    `, this.database);
  }

  async getMonitorProvisionAttemptState({ provisionId, cycleId = "" }) {
    assertId("provision_id", provisionId);
    if (cycleId) assertId("cycle_id", cycleId);
    return queryJson(`
      WITH selected_run AS (
        SELECT *
        FROM mwb.monitor_provision_runs r
        WHERE r.provision_id = ${sqlLiteral(provisionId)}
          AND (${cycleId ? `r.cycle_id = ${sqlLiteral(cycleId)}` : "true"})
        ORDER BY
          CASE WHEN r.cycle_status = 'active' THEN 0 ELSE 1 END,
          r.cycle_no DESC,
          r.updated_at DESC,
          r.created_at DESC
        LIMIT 1
      )
      SELECT jsonb_build_object(
        'run', (
          SELECT to_jsonb(r)
          FROM selected_run r
        ),
        'attempts', coalesce((
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attempt_no)
          FROM mwb.monitor_provision_attempts a
          WHERE a.cycle_id = (SELECT cycle_id FROM selected_run)
        ), '[]'::jsonb),
        'attemptCount', (
          SELECT count(*)
          FROM mwb.monitor_provision_attempts a
          WHERE a.cycle_id = (SELECT cycle_id FROM selected_run)
        ),
        'latestAttempt', (
          SELECT to_jsonb(a)
          FROM mwb.monitor_provision_attempts a
          WHERE a.cycle_id = (SELECT cycle_id FROM selected_run)
          ORDER BY a.attempt_no DESC, coalesce(a.finished_at, a.completed_at, a.started_at, a.created_at) DESC
          LIMIT 1
        ),
        'firstAttempt', (
          SELECT to_jsonb(a)
          FROM mwb.monitor_provision_attempts a
          WHERE a.cycle_id = (SELECT cycle_id FROM selected_run)
            AND a.attempt_no = 1
          LIMIT 1
        )
      )::text;
    `, this.database);
  }

  async claimMonitorProvisionAttempt({
    provisionId,
    cycleId = "",
    attemptNo,
    triggerReason,
    scheduledAt = "",
    startedAt = "",
    jobId = "",
    planId = "",
    idempotencyKey = ""
  }) {
    assertId("provision_id", provisionId);
    if (cycleId) assertId("cycle_id", cycleId);
    const numericAttemptNo = Number(attemptNo);
    if (![1, 2].includes(numericAttemptNo)) throw new Error("invalid_attempt_no");
    if (jobId) assertId("job_id", jobId);
    if (planId) assertId("plan_id", planId);
    const id = `${cycleId || provisionId}-ATTEMPT-${String(numericAttemptNo).padStart(2, "0")}`;
    const timestampOrNull = (value) => value ? `${sqlLiteral(value)}::timestamptz` : "NULL";
    return queryJson(`
      WITH scope_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(provisionId)}, 0)) AS locked
      ),
      current_attempts AS (
        SELECT r.cycle_id, count(a.*)::integer AS attempt_count
        FROM mwb.monitor_provision_runs r
        LEFT JOIN mwb.monitor_provision_attempts a
          ON a.cycle_id = r.cycle_id
        WHERE r.provision_id = ${sqlLiteral(provisionId)}
          AND r.cycle_status = 'active'
          AND (${cycleId ? `r.cycle_id = ${sqlLiteral(cycleId)}` : "true"})
        GROUP BY r.cycle_id
        ORDER BY r.cycle_id DESC
        LIMIT 1
      ),
      claimed AS (
        INSERT INTO mwb.monitor_provision_attempts (
          attempt_id,
          provision_id,
          cycle_id,
          job_id,
          plan_id,
          attempt_no,
          trigger_reason,
          attempt_status,
          idempotency_key,
          scheduled_at,
          started_at,
          created_at
        )
        SELECT
          ${sqlLiteral(id)},
          ${sqlLiteral(provisionId)},
          current_attempts.cycle_id,
          ${jobId ? sqlLiteral(jobId) : "NULL"},
          ${planId ? sqlLiteral(planId) : "NULL"},
          ${numericAttemptNo},
          ${sqlLiteral(triggerReason || "monitor_ensure")},
          'started',
          ${sqlLiteral(idempotencyKey || "")},
          ${timestampOrNull(scheduledAt)},
          coalesce(${timestampOrNull(startedAt)}, now()),
          now()
        FROM scope_lock, current_attempts
        WHERE current_attempts.attempt_count < 2
        ON CONFLICT DO NOTHING
        RETURNING attempt_id
      )
      SELECT jsonb_build_object(
        'attemptId', ${sqlLiteral(id)},
        'claimed', EXISTS (SELECT 1 FROM claimed),
        'attemptNo', ${numericAttemptNo},
        'cycleId', (SELECT cycle_id FROM current_attempts),
        'attemptCountBeforeClaim', coalesce((SELECT attempt_count FROM current_attempts), 0)
      )::text;
    `, this.database);
  }

  async completeMonitorProvisionAttempt(attempt) {
    assertId("attempt_id", attempt.attemptId);
    const status = assertId("attempt_status", attempt.attemptStatus || "failed");
    const timestampOrNow = (value) => value ? `${sqlLiteral(value)}::timestamptz` : "now()";
    await runPsql(`
      UPDATE mwb.monitor_provision_attempts
      SET attempt_status = ${sqlLiteral(status)},
          http_status = ${attempt.httpStatus === null || attempt.httpStatus === undefined ? "NULL" : Number(attempt.httpStatus)},
          api_code = ${sqlLiteral(attempt.apiCode || "")},
          error_category = ${sqlLiteral(attempt.errorCategory || "")},
          error_summary = ${sqlLiteral(attempt.errorSummary || "")},
          request_hash = ${attempt.requestHash ? sqlLiteral(attempt.requestHash) : "NULL"},
          response_hash = ${attempt.responseHash ? sqlLiteral(attempt.responseHash) : "NULL"},
          evidence_artifact_id = ${attempt.evidenceArtifactId ? sqlLiteral(attempt.evidenceArtifactId) : "NULL"},
          completed_at = ${timestampOrNow(attempt.completedAt)},
          finished_at = ${timestampOrNow(attempt.completedAt)}
      WHERE attempt_id = ${sqlLiteral(attempt.attemptId)};
    `, this.database);
  }

  async upsertMonitorProvisionRun(run) {
    assertId("provision_id", run.provisionId);
    assertId("route_id", run.routeId);
    assertId("game_code", run.gameCode);
    assertId("advertiser_id", run.advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("request_fingerprint", run.requestFingerprint);
    const status = assertId("status", run.status);
    const credentialStatus = assertId("credential_status", run.credentialStatus || "missing");
    const ownerKey = assertOwnerKey(run.ownerKey || "");
    if (run.jobId) assertId("job_id", run.jobId);
    if (run.planId) assertId("plan_id", run.planId);
    const timestampOrNull = (value) => value ? `${sqlLiteral(value)}::timestamptz` : "NULL";
    const cycleNo = Number(run.cycleNo || 1);
    const cycleId = run.cycleId || `${run.provisionId}-CYCLE-${String(cycleNo).padStart(2, "0")}`;
    const cycleStatus = assertId("cycle_status", run.cycleStatus || (run.monitorId ? "resolved" : "active"));

    await runPsql(`
      INSERT INTO mwb.monitor_provision_runs (
        cycle_id,
        provision_id,
        cycle_no,
        cycle_status,
        supersedes_cycle_id,
        reissue_reason,
        preflight_hash,
        job_id,
        plan_id,
        route_id,
        game_code,
        advertiser_id,
        status,
        request_fingerprint,
        technical_config,
        owner_key,
        owner_name,
        credential_status,
        credential_updated_at,
        credential_expires_at,
        technical_account_record_id,
        media_account_id,
        agent_id,
        monitor_serial_id,
        monitor_id,
        touchpoint_ref,
        touchpoint_url_hash,
        request_hash,
        response_hash,
        error_summary,
        evidence_artifact_id,
        create_called,
        create_attempt_no,
        create_confirmed_at,
        create_completed_at,
        opened_at,
        closed_at,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(cycleId)},
        ${sqlLiteral(run.provisionId)},
        ${cycleNo},
        ${sqlLiteral(cycleStatus)},
        ${run.supersedesCycleId ? sqlLiteral(run.supersedesCycleId) : "NULL"},
        ${sqlLiteral(run.reissueReason || "")},
        ${sqlLiteral(run.preflightHash || "")},
        ${run.jobId ? sqlLiteral(run.jobId) : "NULL"},
        ${run.planId ? sqlLiteral(run.planId) : "NULL"},
        ${sqlLiteral(run.routeId)},
        ${sqlLiteral(run.gameCode)},
        ${sqlLiteral(run.advertiserId)},
        ${sqlLiteral(status)},
        ${sqlLiteral(run.requestFingerprint)},
        ${sqlJson(run.technicalConfig || {})},
        ${sqlLiteral(ownerKey)},
        ${sqlLiteral(run.ownerName || "")},
        ${sqlLiteral(credentialStatus)},
        ${timestampOrNull(run.credentialUpdatedAt)},
        ${timestampOrNull(run.credentialExpiresAt)},
        ${run.technicalAccountRecordId ? sqlLiteral(run.technicalAccountRecordId) : "NULL"},
        ${run.mediaAccountId ? sqlLiteral(run.mediaAccountId) : "NULL"},
        ${run.agentId ? sqlLiteral(run.agentId) : "NULL"},
        ${run.monitorSerialId ? sqlLiteral(run.monitorSerialId) : "NULL"},
        ${run.monitorId ? sqlLiteral(run.monitorId) : "NULL"},
        ${run.touchpointRef ? sqlLiteral(run.touchpointRef) : "NULL"},
        ${run.touchpointUrlHash ? sqlLiteral(run.touchpointUrlHash) : "NULL"},
        ${run.requestHash ? sqlLiteral(run.requestHash) : "NULL"},
        ${run.responseHash ? sqlLiteral(run.responseHash) : "NULL"},
        ${sqlLiteral(run.errorSummary || "")},
        ${run.evidenceArtifactId ? sqlLiteral(run.evidenceArtifactId) : "NULL"},
        ${run.createCalled ? "true" : "false"},
        ${Number(run.createAttemptNo || 0)},
        ${timestampOrNull(run.createConfirmedAt)},
        ${timestampOrNull(run.createCompletedAt)},
        coalesce(${timestampOrNull(run.openedAt)}, now()),
        ${timestampOrNull(run.closedAt)},
        now(),
        now()
      )
      ON CONFLICT (cycle_id) DO UPDATE SET
        job_id = coalesce(EXCLUDED.job_id, mwb.monitor_provision_runs.job_id),
        plan_id = coalesce(EXCLUDED.plan_id, mwb.monitor_provision_runs.plan_id),
        cycle_status = EXCLUDED.cycle_status,
        supersedes_cycle_id = coalesce(EXCLUDED.supersedes_cycle_id, mwb.monitor_provision_runs.supersedes_cycle_id),
        reissue_reason = coalesce(nullif(EXCLUDED.reissue_reason, ''), mwb.monitor_provision_runs.reissue_reason),
        preflight_hash = coalesce(nullif(EXCLUDED.preflight_hash, ''), mwb.monitor_provision_runs.preflight_hash),
        status = EXCLUDED.status,
        request_fingerprint = EXCLUDED.request_fingerprint,
        technical_config = EXCLUDED.technical_config,
        owner_key = EXCLUDED.owner_key,
        owner_name = EXCLUDED.owner_name,
        credential_status = EXCLUDED.credential_status,
        credential_updated_at = EXCLUDED.credential_updated_at,
        credential_expires_at = EXCLUDED.credential_expires_at,
        technical_account_record_id = EXCLUDED.technical_account_record_id,
        media_account_id = EXCLUDED.media_account_id,
        agent_id = EXCLUDED.agent_id,
        monitor_serial_id = EXCLUDED.monitor_serial_id,
        monitor_id = EXCLUDED.monitor_id,
        touchpoint_ref = EXCLUDED.touchpoint_ref,
        touchpoint_url_hash = EXCLUDED.touchpoint_url_hash,
        request_hash = EXCLUDED.request_hash,
        response_hash = EXCLUDED.response_hash,
        error_summary = EXCLUDED.error_summary,
        evidence_artifact_id = EXCLUDED.evidence_artifact_id,
        create_called = mwb.monitor_provision_runs.create_called OR EXCLUDED.create_called,
        create_attempt_no = greatest(mwb.monitor_provision_runs.create_attempt_no, EXCLUDED.create_attempt_no),
        create_confirmed_at = coalesce(mwb.monitor_provision_runs.create_confirmed_at, EXCLUDED.create_confirmed_at),
        create_completed_at = coalesce(mwb.monitor_provision_runs.create_completed_at, EXCLUDED.create_completed_at),
        opened_at = coalesce(mwb.monitor_provision_runs.opened_at, EXCLUDED.opened_at),
        closed_at = coalesce(EXCLUDED.closed_at, mwb.monitor_provision_runs.closed_at),
        updated_at = now();
    `, this.database);
  }

  async updateMonitorProvisionRunStatus({
    provisionId,
    cycleId = "",
    status,
    requestFingerprint,
    credentialStatus = "",
    responseHash = "",
    errorSummary = "",
    evidenceArtifactId = "",
    cycleStatus = "",
    preflightHash = "",
    closedAt = ""
  }) {
    assertId("provision_id", provisionId);
    if (cycleId) assertId("cycle_id", cycleId);
    assertId("status", status);
    assertId("request_fingerprint", requestFingerprint);
    const credentialStatusValue = credentialStatus ? assertId("credential_status", credentialStatus) : "";
    const cycleStatusValue = cycleStatus ? assertId("cycle_status", cycleStatus) : "";

    await runPsql(`
      UPDATE mwb.monitor_provision_runs
      SET status = ${sqlLiteral(status)},
          request_fingerprint = ${sqlLiteral(requestFingerprint)},
          cycle_status = coalesce(nullif(${sqlLiteral(cycleStatusValue)}, ''), cycle_status),
          preflight_hash = coalesce(nullif(${sqlLiteral(preflightHash)}, ''), preflight_hash),
          credential_status = coalesce(nullif(${sqlLiteral(credentialStatusValue)}, ''), credential_status),
          response_hash = coalesce(nullif(${sqlLiteral(responseHash)}, ''), response_hash),
          error_summary = ${sqlLiteral(errorSummary || "")},
          evidence_artifact_id = ${evidenceArtifactId ? sqlLiteral(evidenceArtifactId) : "NULL"},
          closed_at = coalesce(${closedAt ? `${sqlLiteral(closedAt)}::timestamptz` : "NULL"}, closed_at),
          updated_at = now()
      WHERE cycle_id = coalesce(nullif(${sqlLiteral(cycleId)}, ''), (
        SELECT r.cycle_id
        FROM mwb.monitor_provision_runs r
        WHERE r.provision_id = ${sqlLiteral(provisionId)}
        ORDER BY r.cycle_no DESC, r.updated_at DESC
        LIMIT 1
      ));
    `, this.database);
  }

  async closeMonitorProvisionCycle({ cycleId, cycleStatus = "stopped", errorSummary = "", evidenceArtifactId = "" }) {
    assertId("cycle_id", cycleId);
    const status = assertId("cycle_status", cycleStatus);
    await runPsql(`
      UPDATE mwb.monitor_provision_runs
      SET cycle_status = ${sqlLiteral(status)},
          status = CASE
            WHEN ${sqlLiteral(status)} = 'resolved' THEN status
            WHEN status = 'terminal_failed' THEN status
            ELSE 'terminal_failed'
          END,
          error_summary = coalesce(nullif(${sqlLiteral(errorSummary || "")}, ''), error_summary),
          evidence_artifact_id = coalesce(${evidenceArtifactId ? sqlLiteral(evidenceArtifactId) : "NULL"}, evidence_artifact_id),
          closed_at = coalesce(closed_at, now()),
          updated_at = now()
      WHERE cycle_id = ${sqlLiteral(cycleId)};
    `, this.database);
  }

  async createMonitorProvisionCycle({
    provisionId,
    routeId,
    gameCode,
    advertiserId,
    cycleNo,
    supersedesCycleId = "",
    reissueReason = "",
    preflightHash = "",
    requestFingerprint = "",
    technicalConfig = {},
    ownerKey = "",
    ownerName = "",
    credentialStatus = "missing",
    credentialUpdatedAt = "",
    credentialExpiresAt = "",
    technicalAccountRecordId = "",
    mediaAccountId = "",
    agentId = "",
    evidenceArtifactId = "",
    jobId = "",
    planId = ""
  }) {
    return this.upsertMonitorProvisionRun({
      provisionId,
      cycleId: `${provisionId}-CYCLE-${String(Number(cycleNo || 1)).padStart(2, "0")}`,
      cycleNo,
      cycleStatus: "active",
      supersedesCycleId,
      reissueReason,
      preflightHash,
      routeId,
      gameCode,
      advertiserId,
      status: "planned",
      requestFingerprint,
      technicalConfig,
      ownerKey,
      ownerName,
      credentialStatus,
      credentialUpdatedAt,
      credentialExpiresAt,
      technicalAccountRecordId,
      mediaAccountId,
      agentId,
      evidenceArtifactId,
      jobId,
      planId,
      openedAt: new Date().toISOString()
    });
  }

  async upsertAdvertiserAccount(account) {
    assertId("advertiser_id", account.advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("route_id", account.routeId);
    assertId("game_code", account.gameCode);
    const qiankunIdentityStatus = account.qiankunIdentityStatus
      ? assertId("qiankun_identity_status", account.qiankunIdentityStatus)
      : "";
    const timestampOrNow = (value) => value ? `${sqlLiteral(value)}::timestamptz` : "now()";

    await runPsql(`
      INSERT INTO mwb.advertiser_accounts (
        advertiser_id,
        route_id,
        game_code,
        account_name,
        platform,
        auth_status,
        platform_status,
        owner_name,
        monitor_id,
        qiankun_account_record_id,
        qiankun_owner_key,
        qiankun_agent_id,
        qiankun_media_master_id,
        qiankun_media_master_name,
        qiankun_identity_status,
        qiankun_verified_at,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(account.advertiserId)},
        ${sqlLiteral(account.routeId)},
        ${sqlLiteral(account.gameCode)},
        ${sqlLiteral(account.accountName || account.advertiserId)},
        ${sqlLiteral(account.platform || "oceanengine")},
        ${sqlLiteral(account.authStatus || "unknown")},
        ${sqlLiteral(account.platformStatus || "unknown")},
        ${sqlLiteral(account.ownerName || "")},
        ${sqlLiteral(account.monitorId || "")},
        ${account.qiankunAccountRecordId ? sqlLiteral(account.qiankunAccountRecordId) : "NULL"},
        ${sqlLiteral(assertOwnerKey(account.qiankunOwnerKey || ""))},
        ${account.qiankunAgentId ? sqlLiteral(account.qiankunAgentId) : "NULL"},
        ${account.qiankunMediaMasterId ? sqlLiteral(account.qiankunMediaMasterId) : "NULL"},
        ${sqlLiteral(account.qiankunMediaMasterName || "")},
        ${sqlLiteral(qiankunIdentityStatus || "unverified")},
        ${account.qiankunVerifiedAt ? timestampOrNow(account.qiankunVerifiedAt) : "NULL"},
        now(),
        now()
      )
      ON CONFLICT (advertiser_id) DO UPDATE SET
        route_id = EXCLUDED.route_id,
        game_code = EXCLUDED.game_code,
        account_name = EXCLUDED.account_name,
        platform = EXCLUDED.platform,
        auth_status = EXCLUDED.auth_status,
        platform_status = EXCLUDED.platform_status,
        owner_name = EXCLUDED.owner_name,
        monitor_id = CASE
          WHEN EXCLUDED.monitor_id <> '' THEN EXCLUDED.monitor_id
          ELSE mwb.advertiser_accounts.monitor_id
        END,
        qiankun_account_record_id = coalesce(EXCLUDED.qiankun_account_record_id, mwb.advertiser_accounts.qiankun_account_record_id),
        qiankun_owner_key = CASE
          WHEN EXCLUDED.qiankun_owner_key <> '' THEN EXCLUDED.qiankun_owner_key
          ELSE mwb.advertiser_accounts.qiankun_owner_key
        END,
        qiankun_agent_id = coalesce(EXCLUDED.qiankun_agent_id, mwb.advertiser_accounts.qiankun_agent_id),
        qiankun_media_master_id = coalesce(EXCLUDED.qiankun_media_master_id, mwb.advertiser_accounts.qiankun_media_master_id),
        qiankun_media_master_name = CASE
          WHEN EXCLUDED.qiankun_media_master_name <> '' THEN EXCLUDED.qiankun_media_master_name
          ELSE mwb.advertiser_accounts.qiankun_media_master_name
        END,
        qiankun_identity_status = CASE
          WHEN EXCLUDED.qiankun_identity_status <> 'unverified' THEN EXCLUDED.qiankun_identity_status
          ELSE mwb.advertiser_accounts.qiankun_identity_status
        END,
        qiankun_verified_at = coalesce(EXCLUDED.qiankun_verified_at, mwb.advertiser_accounts.qiankun_verified_at),
        updated_at = now();
    `, this.database);
  }

  async updateQiankunAccountIdentity({
    advertiserId,
    routeId,
    gameCode,
    accountName = "",
    authStatus = "unknown",
    platformStatus = "unknown",
    ownerName = "",
    qiankunAccountRecordId,
    qiankunOwnerKey,
    qiankunAgentId = "",
    qiankunMediaMasterId = "",
    qiankunMediaMasterName = "",
    qiankunIdentityStatus = "observed",
    qiankunVerifiedAt = ""
  }) {
    await this.upsertAdvertiserAccount({
      advertiserId,
      routeId,
      gameCode,
      accountName: accountName || advertiserId,
      platform: "oceanengine",
      authStatus,
      platformStatus,
      ownerName,
      qiankunAccountRecordId,
      qiankunOwnerKey,
      qiankunAgentId,
      qiankunMediaMasterId,
      qiankunMediaMasterName,
      qiankunIdentityStatus,
      qiankunVerifiedAt
    });
  }

  async updateAdvertiserAwemeAuthorization({
    advertiserId,
    routeId,
    gameCode,
    authorization
  }) {
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
      throw new Error("invalid_aweme_authorization");
    }
    await runPsql(`
      UPDATE mwb.advertiser_accounts
      SET aweme_authorization = ${sqlJson(authorization)},
          updated_at = now()
      WHERE advertiser_id = ${sqlLiteral(advertiserId)}
        AND route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)};
    `, this.database);
  }

  async getAdvertiserAwemeAuthorizationReadiness({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    return queryJson(`
      SELECT to_jsonb(v)::text
      FROM mwb.v_advertiser_aweme_authorization_readiness v
      WHERE v.route_id = ${sqlLiteral(routeId)}
        AND v.game_code = ${sqlLiteral(gameCode)}
        AND v.advertiser_id = ${sqlLiteral(advertiserId)}
      LIMIT 1;
    `, this.database);
  }

  async upsertAccountTouchpoint(touchpoint) {
    assertId("touchpoint_id", touchpoint.touchpointId);
    assertId("advertiser_id", touchpoint.advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("route_id", touchpoint.routeId);
    assertId("game_code", touchpoint.gameCode);

    await runPsql(`
      INSERT INTO mwb.account_touchpoints (
        touchpoint_id,
        advertiser_id,
        route_id,
        game_code,
        monitor_id,
        touchpoint_ref,
        url_hash,
        status,
        source,
        touchpoint_url,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(touchpoint.touchpointId)},
        ${sqlLiteral(touchpoint.advertiserId)},
        ${sqlLiteral(touchpoint.routeId)},
        ${sqlLiteral(touchpoint.gameCode)},
        ${sqlLiteral(touchpoint.monitorId || "")},
        ${sqlLiteral(touchpoint.touchpointRef || "")},
        ${sqlLiteral(touchpoint.urlHash || "")},
        ${sqlLiteral(touchpoint.status || "unresolved")},
        ${sqlLiteral(touchpoint.source || "qiankun_monitor_readonly_reconcile")},
        ${touchpoint.touchpointUrl ? sqlLiteral(touchpoint.touchpointUrl) : "NULL"},
        now(),
        now()
      )
      ON CONFLICT (touchpoint_id) DO UPDATE SET
        monitor_id = EXCLUDED.monitor_id,
        touchpoint_ref = EXCLUDED.touchpoint_ref,
        url_hash = EXCLUDED.url_hash,
        status = EXCLUDED.status,
        source = EXCLUDED.source,
        touchpoint_url = CASE
          WHEN EXCLUDED.touchpoint_url IS NULL THEN mwb.account_touchpoints.touchpoint_url
          ELSE EXCLUDED.touchpoint_url
        END,
        updated_at = now();
    `, this.database);
  }

  async getMonitorProvisionStatusReport({ provisionId = "" } = {}) {
    const filter = provisionId ? `WHERE provision_id = ${sqlLiteral(assertId("provision_id", provisionId))}` : "";
    return queryJson(`
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.updated_at DESC), '[]'::jsonb)::text
      FROM mwb.v_monitor_provision_status_report v
      ${filter};
    `, this.database);
  }

  async getMonitorReadiness({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    return queryJson(`
      SELECT to_jsonb(v)::text
      FROM mwb.v_monitor_readiness v
      WHERE v.route_id = ${sqlLiteral(routeId)}
        AND v.game_code = ${sqlLiteral(gameCode)}
        AND v.advertiser_id = ${sqlLiteral(advertiserId)}
      LIMIT 1;
    `, this.database);
  }

  async getMonitorProvisionBlockerReport({ provisionId = "" } = {}) {
    const filters = [
      "coalesce(cycle_status, '') <> 'resolved'",
      "coalesce(provision_status, '') NOT IN ('touchpoint_resolved', 'resolved')"
    ];
    if (provisionId) filters.unshift(`provision_id = ${sqlLiteral(assertId("provision_id", provisionId))}`);
    return queryJson(`
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.updated_at DESC, v.blocker), '[]'::jsonb)::text
      FROM mwb.v_monitor_provision_blocker_report v
      WHERE ${filters.join(" AND ")};
    `, this.database);
  }

  async syncQiankunOptionRelations({
    relationType,
    routeId,
    gameCode,
    os,
    parentType,
    parentId,
    parentName = "",
    childType,
    relations = [],
    validationStatus = "observed",
    sourceEndpoint,
    requestFingerprint,
    responseHash,
    evidenceArtifactId = ""
  }) {
    assertId("relation_type", relationType);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("os", os, /^[0-9A-Za-z_\-.]+$/);
    assertId("parent_type", parentType);
    assertId("parent_id", parentId, /^[0-9A-Za-z_\-.]+$/);
    assertId("child_type", childType);
    assertId("source_endpoint", sourceEndpoint, /^\/[A-Za-z0-9_./:-]+$/);
    assertId("request_fingerprint", requestFingerprint);
    assertId("response_hash", responseHash);
    const status = assertId("validation_status", validationStatus);
    const rows = (Array.isArray(relations) ? relations : []).map((relation) => {
      const childId = assertId("child_id", relation.childId, /^[0-9A-Za-z_\-.]+$/);
      return {
        relation_id: relation.relationId || `QKREL-${sha256Hex([
          relationType,
          routeId,
          gameCode,
          os,
          parentId,
          childId
        ].join(":"))}`,
        child_id: childId,
        child_name: String(relation.childName || ""),
        parent_name: String(relation.parentName || parentName || "")
      };
    });

    const artifactSql = evidenceArtifactId ? sqlLiteral(evidenceArtifactId) : "NULL";
    const syncResult = await queryJson(`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${sqlJson(rows)}) AS item(
          relation_id text,
          child_id text,
          child_name text,
          parent_name text
        )
      ),
      upserted AS (
        INSERT INTO mwb.qiankun_option_relations (
          relation_id,
          relation_type,
          route_id,
          game_code,
          os,
          parent_type,
          parent_id,
          parent_name,
          child_type,
          child_id,
          child_name,
          validation_status,
          source_endpoint,
          request_fingerprint,
          response_hash,
          evidence_artifact_id,
          first_seen_at,
          last_seen_at,
          created_at,
          updated_at
        )
        SELECT
          relation_id,
          ${sqlLiteral(relationType)},
          ${sqlLiteral(routeId)},
          ${sqlLiteral(gameCode)},
          ${sqlLiteral(os)},
          ${sqlLiteral(parentType)},
          ${sqlLiteral(parentId)},
          parent_name,
          ${sqlLiteral(childType)},
          child_id,
          child_name,
          ${sqlLiteral(status)},
          ${sqlLiteral(sourceEndpoint)},
          ${sqlLiteral(requestFingerprint)},
          ${sqlLiteral(responseHash)},
          ${artifactSql},
          now(),
          now(),
          now(),
          now()
        FROM incoming
        ON CONFLICT (
          relation_type,
          route_id,
          game_code,
          os,
          parent_id,
          child_id
        ) DO UPDATE SET
          parent_name = EXCLUDED.parent_name,
          child_name = EXCLUDED.child_name,
          validation_status = CASE
            WHEN mwb.qiankun_option_relations.validation_status = 'confirmed' THEN 'confirmed'
            ELSE EXCLUDED.validation_status
          END,
          source_endpoint = EXCLUDED.source_endpoint,
          request_fingerprint = EXCLUDED.request_fingerprint,
          response_hash = EXCLUDED.response_hash,
          evidence_artifact_id = EXCLUDED.evidence_artifact_id,
          last_seen_at = now(),
          updated_at = now()
        RETURNING relation_id
      ),
      stale AS (
        UPDATE mwb.qiankun_option_relations existing
        SET validation_status = 'stale',
            request_fingerprint = ${sqlLiteral(requestFingerprint)},
            response_hash = ${sqlLiteral(responseHash)},
            evidence_artifact_id = ${artifactSql},
            updated_at = now()
        WHERE existing.relation_type = ${sqlLiteral(relationType)}
          AND existing.route_id = ${sqlLiteral(routeId)}
          AND existing.game_code = ${sqlLiteral(gameCode)}
          AND existing.os = ${sqlLiteral(os)}
          AND existing.parent_type = ${sqlLiteral(parentType)}
          AND existing.parent_id = ${sqlLiteral(parentId)}
          AND existing.child_type = ${sqlLiteral(childType)}
          AND existing.validation_status <> 'invalid'
          AND NOT EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.child_id = existing.child_id
          )
        RETURNING relation_id
      )
      SELECT jsonb_build_object(
        'upsertedCount', (SELECT count(*) FROM upserted),
        'staleCount', (SELECT count(*) FROM stale)
      )::text;
    `, this.database);
    const currentRows = await queryJson(`
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'relationId', relation_id,
        'childId', child_id,
        'childName', child_name,
        'validationStatus', validation_status,
        'lastSeenAt', last_seen_at,
        'evidenceArtifactId', evidence_artifact_id
      ) ORDER BY child_id), '[]'::jsonb)::text
      FROM mwb.qiankun_option_relations
      WHERE relation_type = ${sqlLiteral(relationType)}
        AND route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND os = ${sqlLiteral(os)}
        AND parent_type = ${sqlLiteral(parentType)}
        AND parent_id = ${sqlLiteral(parentId)}
        AND child_type = ${sqlLiteral(childType)};
    `, this.database);
    return {
      ...(syncResult || {}),
      currentRows: Array.isArray(currentRows) ? currentRows : []
    };
  }

  async getControlledBackupLandingPageUrl({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      SELECT jsonb_build_object(
        'landing_page_asset_id', lpa.landing_page_asset_id,
        'site_id', lpa.site_id,
        'site_name', lpa.site_name,
        'url_hash', lpa.url_hash,
        'status', lpa.status,
        'landing_url', lpa.landing_url,
        'resource_visibility_status', ar.visibility_status,
        'resource_readback_status', ar.readback_status,
        'resource_readonly_status', ar.metadata->'readonly_check'->>'status'
      )::text
      FROM mwb.landing_page_assets lpa
      JOIN mwb.account_resources ar
        ON ar.route_id = lpa.route_id
       AND ar.game_code = lpa.game_code
       AND ar.advertiser_id = ${sqlLiteral(advertiserId)}
       AND ar.resource_type = 'backup_landing_page'
       AND ar.source_asset_id = lpa.landing_page_asset_id
      WHERE lpa.route_id = ${sqlLiteral(routeId)}
        AND lpa.game_code = ${sqlLiteral(gameCode)}
        AND lpa.is_default = true
        AND lpa.status = 'active'
        AND lpa.landing_url IS NOT NULL
        AND lpa.landing_url ~ '^https://'
        AND ar.visibility_status = 'visible'
        AND ar.readback_status = 'readback_verified'
        AND coalesce(ar.metadata->'readonly_check'->>'status', '') IN ('passed', 'passed_by_manual_confirmation')
      ORDER BY lpa.updated_at DESC
      LIMIT 1;
    `, this.database);
  }

  async getControlledGameRouteLaunchLink({ routeId, gameCode, platformAppId = "", appId = "" }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    if (platformAppId) assertId("platform_app_id", platformAppId);
    if (appId) assertId("app_id", appId, /^tt[A-Za-z0-9]+$/);

    const row = await queryJson(`
      SELECT jsonb_build_object(
        'link_ref', grll.link_ref,
        'route_id', grll.route_id,
        'game_code', grll.game_code,
        'platform_app_id', grll.platform_app_id,
        'app_id', grll.app_id,
        'url_hash', grll.url_hash,
        'status', grll.status,
        'source_usage', grll.source_usage,
        'controlled_value_present', (grll.launch_url IS NOT NULL AND grll.launch_url <> ''),
        'launch_url', grll.launch_url
      )::text
      FROM mwb.game_route_launch_links grll
      WHERE grll.route_id = ${sqlLiteral(routeId)}
        AND grll.game_code = ${sqlLiteral(gameCode)}
        AND grll.status = 'active'
        ${platformAppId ? `AND grll.platform_app_id = ${sqlLiteral(platformAppId)}` : ""}
        ${appId ? `AND grll.app_id = ${sqlLiteral(appId)}` : ""}
      ORDER BY grll.updated_at DESC
      LIMIT 1;
    `, this.database);
    if (!row) return null;
    const launchUrl = String(row.launch_url || "").trim();
    const computedHash = launchUrl ? sha256Hex(launchUrl) : "";
    const urlHash = String(row.url_hash || "").trim();
    return {
      ...row,
      launch_url: launchUrl,
      hash_matches: Boolean(launchUrl && urlHash && computedHash === urlHash),
      computed_url_hash: computedHash
    };
  }

  async upsertGameRouteLaunchLink({
    linkRef,
    routeId,
    gameCode,
    platformAppId,
    appId,
    launchUrl,
    status = "active",
    sourceUsage = "private_runtime",
    sourceSummary = {},
    metadata = {}
  }) {
    assertId("link_ref", linkRef);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("platform_app_id", platformAppId);
    assertId("app_id", appId, /^tt[A-Za-z0-9]+$/);
    assertId("status", status);
    assertId("source_usage", sourceUsage);
    const cleanLaunchUrl = String(launchUrl || "").trim();
    if (!/^sslocal:\/\/microgame/.test(cleanLaunchUrl)) throw new Error("invalid_mini_game_launch_url_scheme");
    const urlHash = sha256Hex(cleanLaunchUrl);
    const row = await queryJson(`
      WITH route_app AS (
        SELECT pa.id
        FROM mwb.game_platform_apps pa
        JOIN mwb.platform_routes r
          ON r.platform = pa.platform
         AND r.marketing_product = pa.app_type
        WHERE pa.id = ${sqlLiteral(platformAppId)}
          AND pa.game_code = ${sqlLiteral(gameCode)}
          AND pa.app_id = ${sqlLiteral(appId)}
          AND pa.status = 'active'
          AND r.route_id = ${sqlLiteral(routeId)}
      ),
      upserted AS (
        INSERT INTO mwb.game_route_launch_links (
          link_ref,
          route_id,
          game_code,
          platform_app_id,
          app_id,
          launch_url,
          url_hash,
          status,
          source_usage,
          source_summary,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          ${sqlLiteral(linkRef)},
          ${sqlLiteral(routeId)},
          ${sqlLiteral(gameCode)},
          ${sqlLiteral(platformAppId)},
          ${sqlLiteral(appId)},
          ${sqlLiteral(cleanLaunchUrl)},
          ${sqlLiteral(urlHash)},
          ${sqlLiteral(status)},
          ${sqlLiteral(sourceUsage)},
          ${sqlJson(sourceSummary || {})},
          ${sqlJson(metadata || {})},
          now(),
          now()
        FROM route_app
        ON CONFLICT (route_id, game_code) DO UPDATE SET
          link_ref = EXCLUDED.link_ref,
          platform_app_id = EXCLUDED.platform_app_id,
          app_id = EXCLUDED.app_id,
          launch_url = EXCLUDED.launch_url,
          url_hash = EXCLUDED.url_hash,
          status = EXCLUDED.status,
          source_usage = EXCLUDED.source_usage,
          source_summary = EXCLUDED.source_summary,
          metadata = mwb.game_route_launch_links.metadata || EXCLUDED.metadata,
          updated_at = now()
        RETURNING *
      )
      SELECT ${safeGameRouteLaunchLinkJson("u")}::text
      FROM upserted u
      LIMIT 1;
    `, this.database);
    if (!row) throw new Error("game_route_launch_link_app_id_mismatch_or_platform_app_missing");
    return row;
  }

  async getBackupLandingPageCandidates({ routeId, gameCode }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);

    return queryJson(`
      SELECT coalesce(jsonb_agg(${safeLandingPageJson("lpa")} ORDER BY lpa.is_default DESC, lpa.landing_page_asset_id), '[]'::jsonb)::text
      FROM mwb.landing_page_assets lpa
      WHERE lpa.route_id = ${sqlLiteral(routeId)}
        AND lpa.game_code = ${sqlLiteral(gameCode)};
    `, this.database);
  }

  async upsertLandingPageAsset({
    landingPageAssetId,
    routeId,
    gameCode,
    siteId,
    siteName,
    landingUrl = null,
    sourceAdvertiserId,
    shareScope = "organization_accounts",
    isDefault = false,
    status = "reference_candidate",
    sourceUsage = "reference_only",
    metadata = {}
  }) {
    assertId("landing_page_asset_id", landingPageAssetId);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("site_id", siteId, /^[0-9]+$/);
    if (sourceAdvertiserId) assertId("source_advertiser_id", sourceAdvertiserId, /^[0-9]+$/);
    const cleanLandingUrl = landingUrl ? String(landingUrl).trim() : "";
    const urlHash = cleanLandingUrl ? sha256Hex(cleanLandingUrl) : "";
    await runPsql(`
      INSERT INTO mwb.landing_page_assets (
        landing_page_asset_id,
        route_id,
        game_code,
        site_id,
        site_name,
        landing_url,
        url_hash,
        source_advertiser_id,
        share_scope,
        is_default,
        status,
        source_usage,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(landingPageAssetId)},
        ${sqlLiteral(routeId)},
        ${sqlLiteral(gameCode)},
        ${sqlLiteral(siteId)},
        ${sqlLiteral(siteName || siteId)},
        ${cleanLandingUrl ? sqlLiteral(cleanLandingUrl) : "NULL"},
        ${sqlLiteral(urlHash)},
        ${sqlLiteral(sourceAdvertiserId || "")},
        ${sqlLiteral(shareScope)},
        ${isDefault ? "true" : "false"},
        ${sqlLiteral(status)},
        ${sqlLiteral(sourceUsage)},
        ${sqlJson(metadata || {})},
        now(),
        now()
      )
      ON CONFLICT (landing_page_asset_id) DO UPDATE SET
        site_name = EXCLUDED.site_name,
        landing_url = coalesce(EXCLUDED.landing_url, mwb.landing_page_assets.landing_url),
        url_hash = CASE
          WHEN EXCLUDED.landing_url IS NOT NULL THEN EXCLUDED.url_hash
          ELSE mwb.landing_page_assets.url_hash
        END,
        source_advertiser_id = EXCLUDED.source_advertiser_id,
        share_scope = EXCLUDED.share_scope,
        is_default = EXCLUDED.is_default,
        status = EXCLUDED.status,
        source_usage = EXCLUDED.source_usage,
        metadata = mwb.landing_page_assets.metadata || EXCLUDED.metadata,
        updated_at = now();
    `, this.database);
  }

  async createLaunchJob({ jobId, caseId, routeId, gameCode, advertiserId, objectType, sourceRecordRef, sourceUsage = "runtime_truth" }) {
    assertId("job_id", jobId);
    assertId("case_id", caseId);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("object_type", objectType);

    await runPsql(`
      INSERT INTO mwb.launch_jobs (
        job_id,
        case_id,
        route_id,
        game_code,
        advertiser_id,
        object_type,
        job_status,
        current_node,
        source_record_ref,
        source_usage,
        created_at,
        updated_at
      ) VALUES (
        ${sqlLiteral(jobId)},
        ${sqlLiteral(caseId)},
        ${sqlLiteral(routeId)},
        ${sqlLiteral(gameCode)},
        ${sqlLiteral(advertiserId)},
        ${sqlLiteral(objectType)},
        'created',
        '1',
        ${sqlLiteral(sourceRecordRef)},
        ${sqlLiteral(sourceUsage)},
        now(),
        now()
      );
    `, this.database);
  }

  async createReadonlyRecoveryLaunchJobOnce({ recoveryJobId, predecessorJobId, caseId, sourceRecordRef }) {
    assertId("recovery_job_id", recoveryJobId);
    assertId("predecessor_job_id", predecessorJobId);
    assertId("case_id", caseId);
    assertId("source_record_ref", sourceRecordRef);
    return queryJson(`
      WITH scope_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(caseId)}, 0)) AS locked
      ),
      existing AS (
        SELECT j.*
        FROM mwb.launch_jobs j
        CROSS JOIN scope_lock
        WHERE j.case_id = ${sqlLiteral(caseId)}
          AND j.source_record_ref = ${sqlLiteral(sourceRecordRef)}
        ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
        LIMIT 1
      ),
      predecessor AS (
        SELECT j.*
        FROM mwb.launch_jobs j
        JOIN mwb.workflow_cases wc ON wc.case_id = j.case_id
        CROSS JOIN scope_lock
        WHERE j.job_id = ${sqlLiteral(predecessorJobId)}
          AND j.case_id = ${sqlLiteral(caseId)}
          AND j.source_usage = 'runtime_truth'
          AND wc.lifecycle_status = 'active'
          AND wc.source_usage = 'runtime_truth'
          AND j.job_status = 'blocked_confirmed_resource_plan'
        LIMIT 1
      ),
      latest AS (
        SELECT j.job_id
        FROM mwb.launch_jobs j
        CROSS JOIN scope_lock
        WHERE j.case_id = ${sqlLiteral(caseId)}
        ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO mwb.launch_jobs (
          job_id, case_id, route_id, game_code, advertiser_id, object_type,
          job_status, current_node, source_record_ref, source_usage, created_at, updated_at
        )
        SELECT
          ${sqlLiteral(recoveryJobId)}, p.case_id, p.route_id, p.game_code, p.advertiser_id, p.object_type,
          'created', '1', ${sqlLiteral(sourceRecordRef)}, p.source_usage, now(), now()
        FROM predecessor p
        CROSS JOIN scope_lock
        WHERE p.job_id = (SELECT job_id FROM latest)
          AND NOT EXISTS (SELECT 1 FROM existing)
        RETURNING *
      )
      SELECT jsonb_build_object(
        'created', EXISTS (SELECT 1 FROM inserted),
        'job', coalesce(
          (SELECT to_jsonb(i) FROM inserted i),
          (SELECT to_jsonb(e) FROM existing e)
        )
      )::text;
    `, this.database);
  }

  async updateJob(jobId, { status, currentNode }) {
    assertId("job_id", jobId);
    await runPsql(`
      UPDATE mwb.launch_jobs
      SET job_status = ${sqlLiteral(status)},
          current_node = ${sqlLiteral(currentNode)},
          updated_at = now()
      WHERE job_id = ${sqlLiteral(jobId)};
    `, this.database);
  }

  async upsertNodeRuns(jobId, nodes) {
    assertId("job_id", jobId);
    if (!Array.isArray(nodes) || nodes.length === 0) return;

    const values = nodes.map((node) => {
      assertId("node_key", node.nodeKey);
      const startedAt = node.started ? "now()" : "NULL";
      const finishedAt = node.finished ? "now()" : "NULL";
      return `(
        ${sqlLiteral(`${jobId}-${node.order}`)},
        ${sqlLiteral(jobId)},
        ${sqlLiteral(node.nodeKey)},
        ${sqlLiteral(node.nodeName)},
        ${sqlLiteral(node.phase)},
        ${sqlLiteral(node.status)},
        ${sqlLiteral(node.summary)},
        ${sqlLiteral(node.diagnosticLevel)},
        ${sqlJson(node.outputSummary || {})},
        ${sqlJson(node.evidenceRefs || [])},
        ${startedAt},
        ${finishedAt}
      )`;
    }).join(",");

    await runPsql(`
      INSERT INTO mwb.launch_node_runs (
        node_run_id,
        job_id,
        node_key,
        node_name,
        phase,
        status,
        summary,
        diagnostic_level,
        output_summary,
        evidence_refs,
        started_at,
        finished_at
      ) VALUES ${values}
      ON CONFLICT (job_id, node_key) DO UPDATE SET
        node_name = EXCLUDED.node_name,
        phase = EXCLUDED.phase,
        status = EXCLUDED.status,
        summary = EXCLUDED.summary,
        diagnostic_level = EXCLUDED.diagnostic_level,
        output_summary = EXCLUDED.output_summary,
        evidence_refs = EXCLUDED.evidence_refs,
        started_at = coalesce(mwb.launch_node_runs.started_at, EXCLUDED.started_at),
        finished_at = EXCLUDED.finished_at;
    `, this.database);
  }

  async upsertLaunchSkillRun(run) {
    assertId("skill_run_id", run.skillRunId);
    assertId("job_id", run.jobId);
    assertId("node_key", run.nodeKey);
    assertId("skill_key", run.skillKey);
    const status = assertId("status", run.status);
    await runPsql(`
      INSERT INTO mwb.launch_skill_runs (
        skill_run_id,
        job_id,
        node_key,
        skill_key,
        attempt_no,
        status,
        input_hash,
        output_summary,
        blockers,
        evidence_refs,
        execution_cycle,
        blocker_codes,
        error_code,
        module_ref,
        source_usage,
        started_at,
        finished_at
      ) VALUES (
        ${sqlLiteral(run.skillRunId)},
        ${sqlLiteral(run.jobId)},
        ${sqlLiteral(run.nodeKey)},
        ${sqlLiteral(run.skillKey)},
        ${Number(run.attemptNo || 1)},
        ${sqlLiteral(status)},
        ${sqlLiteral(run.inputHash || "")},
        ${sqlJson(run.outputSummary || {})},
        ${sqlJson(run.blockers || [])},
        ${sqlJson(run.evidenceRefs || [])},
        ${Number(run.executionCycle || 1)},
        ${sqlJson(run.blockerCodes || run.blockers || [])},
        ${sqlLiteral(run.errorCode || "")},
        ${sqlLiteral(run.moduleRef || "")},
        ${sqlLiteral(run.sourceUsage || "runtime_truth")},
        ${run.startedAt ? `${sqlLiteral(run.startedAt)}::timestamptz` : "now()"},
        ${run.finishedAt ? `${sqlLiteral(run.finishedAt)}::timestamptz` : "now()"}
      )
      ON CONFLICT (job_id, skill_key, attempt_no) DO UPDATE SET
        node_key = EXCLUDED.node_key,
        status = EXCLUDED.status,
        input_hash = EXCLUDED.input_hash,
        output_summary = EXCLUDED.output_summary,
        blockers = EXCLUDED.blockers,
        evidence_refs = EXCLUDED.evidence_refs,
        execution_cycle = EXCLUDED.execution_cycle,
        blocker_codes = EXCLUDED.blocker_codes,
        error_code = EXCLUDED.error_code,
        module_ref = EXCLUDED.module_ref,
        source_usage = EXCLUDED.source_usage,
        started_at = coalesce(mwb.launch_skill_runs.started_at, EXCLUDED.started_at),
        finished_at = EXCLUDED.finished_at;
    `, this.database);
  }

  async upsertLaunchExecutionPlan(plan) {
    assertId("plan_id", plan.planId);
    assertId("job_id", plan.jobId);
    const saved = await queryJson(`
      WITH confirmed AS (
        SELECT confirmation_id
        FROM mwb.launch_confirmations
        WHERE plan_id = ${sqlLiteral(plan.planId)}
          AND confirmation_status = 'confirmed_for_execution_plan'
      ), staled AS (
        UPDATE mwb.launch_execution_plans
        SET plan_status = 'stale',
            updated_at = now()
        WHERE job_id = ${sqlLiteral(plan.jobId)}
          AND plan_version < ${Number(plan.planVersion || 1)}
          AND plan_status IN ('blocked', 'planned', 'ready', 'executing', 'waiting_readback')
          AND NOT EXISTS (SELECT 1 FROM confirmed)
        RETURNING plan_id
      ), stale_barrier AS (
        SELECT count(*) AS stale_count FROM staled
      ), persisted AS (
        INSERT INTO mwb.launch_execution_plans (
          plan_id,
          job_id,
          plan_version,
          plan_kind,
          plan_status,
          plan_hash,
          planned_actions,
          blocker_codes,
          draft_id,
          payload_hash,
          source_usage,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          ${sqlLiteral(plan.planId)},
          ${sqlLiteral(plan.jobId)},
          ${Number(plan.planVersion || 1)},
          ${sqlLiteral(plan.planKind || plan.plan_kind || "readiness_blocked")},
          ${sqlLiteral(plan.planStatus)},
          ${sqlLiteral(plan.planHash)},
          ${sqlJson(plan.plannedActions || [])},
          ${sqlJson(plan.blockerCodes || [])},
          ${plan.draftId ? sqlLiteral(plan.draftId) : "NULL"},
          ${sqlLiteral(plan.payloadHash || "")},
          ${sqlLiteral(plan.sourceUsage || "runtime_truth")},
          ${sqlJson(plan.metadata || {})},
          now(),
          now()
        FROM stale_barrier
        WHERE NOT EXISTS (SELECT 1 FROM confirmed)
        ON CONFLICT (job_id, plan_version) DO UPDATE SET
          plan_kind = EXCLUDED.plan_kind,
          plan_status = EXCLUDED.plan_status,
          plan_hash = EXCLUDED.plan_hash,
          planned_actions = EXCLUDED.planned_actions,
          blocker_codes = EXCLUDED.blocker_codes,
          draft_id = EXCLUDED.draft_id,
          payload_hash = EXCLUDED.payload_hash,
          source_usage = EXCLUDED.source_usage,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        WHERE NOT EXISTS (
          SELECT 1
          FROM mwb.launch_confirmations confirmation
          WHERE confirmation.plan_id = mwb.launch_execution_plans.plan_id
            AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
        )
        RETURNING plan_id
      )
      SELECT jsonb_build_object(
        'saved', EXISTS (SELECT 1 FROM persisted),
        'immutable', EXISTS (SELECT 1 FROM confirmed)
      )::text;
    `, this.database);
    if (saved?.immutable || saved?.saved !== true) {
      throw new Error("confirmed_execution_plan_immutable");
    }
    return saved;
  }

  async upsertReadyStdProjectCreatePlanWithDraftBinding(plan, { derivationHash = "" } = {}) {
    assertId("plan_id", plan.planId);
    assertId("job_id", plan.jobId);
    assertId("draft_id", plan.draftId);
    if (plan.planStatus !== "ready" || String(plan.planKind || plan.plan_kind || "").trim() !== "std_project_create") {
      throw new Error("ready_std_project_create_plan_required");
    }
    const { jobId, draftId, payloadHash, planId, planHash } = plan;
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(payloadHash || ""))) throw new Error("draft_payload_hash_invalid");
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(planHash || ""))) throw new Error("execution_plan_hash_invalid");
    if (derivationHash && !/^sha256:[a-f0-9]{64}$/i.test(String(derivationHash))) throw new Error("plan_derivation_hash_invalid");
    const saved = await queryJson(`
      WITH confirmed AS (
        SELECT confirmation_id
        FROM mwb.launch_confirmations
        WHERE plan_id = ${sqlLiteral(planId)}
          AND confirmation_status = 'confirmed_for_execution_plan'
      ), staled AS (
        UPDATE mwb.launch_execution_plans
        SET plan_status = 'stale',
            updated_at = now()
        WHERE job_id = ${sqlLiteral(jobId)}
          AND plan_version < ${Number(plan.planVersion || 1)}
          AND plan_status IN ('blocked', 'planned', 'ready', 'executing', 'waiting_readback')
          AND NOT EXISTS (SELECT 1 FROM confirmed)
        RETURNING plan_id
      ), stale_barrier AS (
        SELECT count(*) AS stale_count FROM staled
      ), draft_candidate AS (
        SELECT draft.draft_id
        FROM mwb.launch_drafts draft
        WHERE draft.job_id = ${sqlLiteral(jobId)}
          AND draft.draft_id = ${sqlLiteral(draftId)}
          AND draft.payload_hash = ${sqlLiteral(payloadHash)}
        FOR UPDATE
      ), persisted AS (
        INSERT INTO mwb.launch_execution_plans (
          plan_id,
          job_id,
          plan_version,
          plan_kind,
          plan_status,
          plan_hash,
          planned_actions,
          blocker_codes,
          draft_id,
          payload_hash,
          source_usage,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          ${sqlLiteral(planId)},
          ${sqlLiteral(jobId)},
          ${Number(plan.planVersion || 1)},
          'std_project_create',
          'ready',
          ${sqlLiteral(planHash)},
          ${sqlJson(plan.plannedActions || [])},
          ${sqlJson(plan.blockerCodes || [])},
          ${sqlLiteral(draftId)},
          ${sqlLiteral(payloadHash)},
          ${sqlLiteral(plan.sourceUsage || "runtime_truth")},
          ${sqlJson(plan.metadata || {})},
          now(),
          now()
        FROM stale_barrier, draft_candidate
        WHERE NOT EXISTS (SELECT 1 FROM confirmed)
        ON CONFLICT (job_id, plan_version) DO UPDATE SET
          plan_kind = EXCLUDED.plan_kind,
          plan_status = 'ready',
          plan_hash = EXCLUDED.plan_hash,
          planned_actions = EXCLUDED.planned_actions,
          blocker_codes = EXCLUDED.blocker_codes,
          draft_id = EXCLUDED.draft_id,
          payload_hash = EXCLUDED.payload_hash,
          source_usage = EXCLUDED.source_usage,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        WHERE NOT EXISTS (
          SELECT 1
          FROM mwb.launch_confirmations confirmation
          WHERE confirmation.plan_id = mwb.launch_execution_plans.plan_id
            AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
        )
        RETURNING plan_id
      ), bound AS (
        UPDATE mwb.launch_drafts draft
        SET payload_summary = draft.payload_summary || jsonb_build_object(
          'derived_from_plan_id', ${sqlLiteral(planId)},
          'derived_from_plan_hash', ${sqlLiteral(planHash)},
          'plan_derivation_status', 'passed',
          'plan_derivation_blockers', '[]'::jsonb,
          'plan_derivation_hash', ${sqlLiteral(derivationHash)}
        )
        FROM persisted, draft_candidate
        WHERE draft.job_id = ${sqlLiteral(jobId)}
          AND draft.draft_id = ${sqlLiteral(draftId)}
          AND draft.payload_hash = ${sqlLiteral(payloadHash)}
        RETURNING draft.draft_id
      )
      SELECT jsonb_build_object(
        'saved', EXISTS (SELECT 1 FROM persisted),
        'bound', EXISTS (SELECT 1 FROM bound),
        'immutable', EXISTS (SELECT 1 FROM confirmed)
      )::text;
    `, this.database);
    if (saved?.immutable || saved?.saved !== true || saved?.bound !== true) {
      throw new Error("ready_create_plan_draft_binding_not_persisted");
    }
    return saved;
  }

  async staleExecutionPlanForContractChange({ planId, blockerCode }) {
    assertId("plan_id", planId);
    assertId("blocker_code", blockerCode);
    const saved = await queryJson(`
      WITH changed AS (
        UPDATE mwb.launch_execution_plans ep
        SET plan_status = 'stale',
            blocker_codes = jsonb_build_array(${sqlLiteral(blockerCode)}),
            metadata = ep.metadata || jsonb_build_object(
              'stale_reason', ${sqlLiteral(blockerCode)}
            ),
            updated_at = now()
        WHERE ep.plan_id = ${sqlLiteral(planId)}
          AND ep.plan_status = 'ready'
          AND NOT EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations lc
            WHERE lc.plan_id = ep.plan_id
              AND lc.confirmation_status = 'confirmed_for_execution_plan'
          )
        RETURNING ep.plan_id, ep.plan_status, ep.blocker_codes
      )
      SELECT coalesce((SELECT to_jsonb(changed) FROM changed), 'null'::jsonb)::text;
    `, this.database);
    if (!saved) throw new Error("execution_plan_not_staleable_for_contract_change");
    return saved;
  }

  async consumeConfirmedResourceExecutionPlan({ jobId, planId }) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    const result = await queryJson(`
      WITH target AS (
        SELECT
          p.plan_id,
          array_agg(action.value->>'action_type' ORDER BY action.ordinality) AS action_types
        FROM mwb.launch_execution_plans p
        CROSS JOIN LATERAL jsonb_array_elements(p.planned_actions) WITH ORDINALITY AS action(value, ordinality)
        WHERE p.job_id = ${sqlLiteral(jobId)}
          AND p.plan_id = ${sqlLiteral(planId)}
          AND p.plan_status = 'ready'
        GROUP BY p.plan_id
        HAVING count(*) > 0
          AND bool_and(action.value->>'action_type' <> 'std_project_create')
      ), consumed AS (
        UPDATE mwb.launch_execution_plans p
        SET plan_status = 'consumed',
            updated_at = now()
        FROM target t
        WHERE p.plan_id = t.plan_id
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations c
            WHERE c.job_id = ${sqlLiteral(jobId)}
              AND c.plan_id = t.plan_id
              AND c.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(t.action_types) AS expected(action_type)
            WHERE NOT EXISTS (
              SELECT 1
              FROM mwb.platform_actions action
              WHERE action.job_id = ${sqlLiteral(jobId)}
                AND action.plan_id = t.plan_id
                AND action.action_type = expected.action_type
                AND action.action_status = 'succeeded'
            )
          )
        RETURNING p.plan_id
      )
      SELECT jsonb_build_object('consumed', EXISTS (SELECT 1 FROM consumed))::text;
    `, this.database);
    return result || { consumed: false };
  }

  async finalizeConfirmedResourceExecutionPlan({ jobId, planId, blockerCode = "confirmed_resource_execution_interrupted" }) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    assertId("blocker_code", blockerCode);
    const result = await queryJson(`
      WITH finalized AS (
        UPDATE mwb.launch_execution_plans p
        SET plan_status = 'consumed',
            metadata = p.metadata || jsonb_build_object(
              'confirmed_execution_outcome', 'blocked',
              'confirmed_execution_blocker', ${sqlLiteral(blockerCode)},
              'retry_allowed', false
            ),
            updated_at = now()
        WHERE p.job_id = ${sqlLiteral(jobId)}
          AND p.plan_id = ${sqlLiteral(planId)}
          AND p.plan_status = 'ready'
          AND coalesce(p.plan_kind, p.metadata->>'plan_kind', '') = 'resource_prepare'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations c
            WHERE c.job_id = p.job_id
              AND c.plan_id = p.plan_id
              AND c.confirmation_status = 'confirmed_for_execution_plan'
          )
        RETURNING p.plan_id
      )
      SELECT jsonb_build_object('finalized', EXISTS (SELECT 1 FROM finalized))::text;
    `, this.database);
    return result || { finalized: false };
  }

  async finalizeConfirmedCreatePlanBeforeAction({ jobId, planId, blockerCode = "final_draft_plan_derivation_not_passed" } = {}) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    assertId("blocker_code", blockerCode);
    const result = await queryJson(`
      WITH finalized AS (
        UPDATE mwb.launch_execution_plans plan
        SET plan_status = 'consumed',
            metadata = plan.metadata || jsonb_build_object(
              'confirmed_execution_outcome', 'blocked_before_create',
              'confirmed_execution_blocker', ${sqlLiteral(blockerCode)},
              'platform_action_count', 0,
              'retry_allowed', false
            ),
            updated_at = now()
        WHERE plan.job_id = ${sqlLiteral(jobId)}
          AND plan.plan_id = ${sqlLiteral(planId)}
          AND plan.plan_status = 'ready'
          AND coalesce(plan.plan_kind, plan.metadata->>'plan_kind', '') = 'std_project_create'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = plan.job_id
              AND confirmation.plan_id = plan.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM mwb.platform_actions action
            WHERE action.job_id = plan.job_id
              AND action.plan_id = plan.plan_id
              AND action.action_type = 'oceanengine_std_project_create'
          )
        RETURNING plan.plan_id
      ), job_finalized AS (
        UPDATE mwb.launch_jobs job
        SET job_status = 'failed_waiting_manual_review',
            current_node = '6',
            updated_at = now()
        WHERE job.job_id = ${sqlLiteral(jobId)}
          AND EXISTS (SELECT 1 FROM finalized)
        RETURNING job.job_id
      )
      SELECT jsonb_build_object(
        'finalized', EXISTS (SELECT 1 FROM finalized),
        'jobFinalized', EXISTS (SELECT 1 FROM job_finalized)
      )::text;
    `, this.database);
    return result || { finalized: false, jobFinalized: false };
  }

  async markConfirmedStdProjectCreatePlanWaitingReadback({ jobId, planId } = {}) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    const result = await queryJson(`
      WITH transitioned AS (
        UPDATE mwb.launch_execution_plans plan
        SET plan_status = 'waiting_readback',
            metadata = plan.metadata || jsonb_build_object(
              'confirmed_execution_outcome', 'created_pending_readback',
              'retry_allowed', false
            ),
            updated_at = now()
        WHERE plan.job_id = ${sqlLiteral(jobId)}
          AND plan.plan_id = ${sqlLiteral(planId)}
          AND plan.plan_status = 'ready'
          AND coalesce(plan.plan_kind, plan.metadata->>'plan_kind', '') = 'std_project_create'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = plan.job_id
              AND confirmation.plan_id = plan.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.platform_actions action
            WHERE action.job_id = plan.job_id
              AND action.plan_id = plan.plan_id
              AND action.action_type IN ('oceanengine_std_project_create', 'mock_oceanengine_std_project_create')
              AND action.action_status IN ('succeeded', 'mock_succeeded')
              AND action.object_id_present = true
          )
        RETURNING plan.plan_id
      )
      SELECT jsonb_build_object('transitioned', EXISTS (SELECT 1 FROM transitioned))::text;
    `, this.database);
    return result || { transitioned: false };
  }

  async consumeConfirmedStdProjectCreatePlanAfterReadback({ jobId, planId } = {}) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    const result = await queryJson(`
      WITH consumed AS (
        UPDATE mwb.launch_execution_plans plan
        SET plan_status = 'consumed',
            metadata = plan.metadata || jsonb_build_object(
              'confirmed_execution_outcome', 'readback_verified',
              'retry_allowed', false
            ),
            updated_at = now()
        WHERE plan.job_id = ${sqlLiteral(jobId)}
          AND plan.plan_id = ${sqlLiteral(planId)}
          AND plan.plan_status = 'waiting_readback'
          AND coalesce(plan.plan_kind, plan.metadata->>'plan_kind', '') = 'std_project_create'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = plan.job_id
              AND confirmation.plan_id = plan.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.platform_actions action
            WHERE action.job_id = plan.job_id
              AND action.plan_id = plan.plan_id
              AND action.action_type IN ('oceanengine_std_project_create', 'mock_oceanengine_std_project_create')
              AND action.action_status IN ('succeeded', 'mock_succeeded')
              AND action.object_id_present = true
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.readback_records readback
            WHERE readback.job_id = plan.job_id
              AND readback.object_type = 'std_project'
              AND readback.readback_status = 'readback_verified'
          )
        RETURNING plan.plan_id
      )
      SELECT jsonb_build_object('consumed', EXISTS (SELECT 1 FROM consumed))::text;
    `, this.database);
    return result || { consumed: false };
  }

  async promoteUnconfirmedStdProjectCreateActionAfterReadback({ jobId, planId, actionId, objectId, objectName } = {}) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    assertId("action_id", actionId);
    assertId("object_id", objectId);
    if (!String(objectName || "").trim()) throw new Error("object_name_required");
    const result = await queryJson(`
      WITH promoted AS (
        UPDATE mwb.platform_actions action
        SET action_status = 'succeeded',
            object_id_present = true,
            error_summary = '',
            error_category = '',
            metadata = action.metadata || jsonb_build_object(
              'recovered_by_readback', true,
              'recovery_source', 'std_project_list_verified',
              'retry_allowed', false,
              'raw_payload_stored', false,
              'raw_response_stored', false
            ),
            response_summary = action.response_summary || jsonb_build_object(
              'outcome_category', 'recovered_by_readback',
              'verified_object_id_present', true,
              'raw_response_stored', false
            ),
            finished_at = coalesce(action.finished_at, now())
        WHERE action.action_id = ${sqlLiteral(actionId)}
          AND action.job_id = ${sqlLiteral(jobId)}
          AND action.plan_id = ${sqlLiteral(planId)}
          AND action.action_type = 'oceanengine_std_project_create'
          AND action.action_status = 'failed_or_unconfirmed'
          AND coalesce(action.response_summary->>'outcome_category', '') = 'platform_response_unknown'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = action.job_id
              AND confirmation.plan_id = action.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_drafts draft
            JOIN mwb.created_objects object
              ON object.job_id = draft.job_id
             AND object.object_type = 'std_project'
             AND object.object_id = ${sqlLiteral(objectId)}
             AND object.object_name = draft.project_name
            JOIN mwb.readback_records readback
              ON readback.job_id = draft.job_id
             AND readback.object_type = 'std_project'
             AND readback.object_id = ${sqlLiteral(objectId)}
             AND readback.object_name = draft.project_name
             AND readback.readback_status = 'readback_verified'
            WHERE draft.job_id = action.job_id
              AND draft.project_name = ${sqlLiteral(objectName)}
              AND draft.draft_id = (
                SELECT latest_draft.draft_id
                FROM mwb.launch_drafts latest_draft
                WHERE latest_draft.job_id = action.job_id
                ORDER BY latest_draft.created_at DESC, latest_draft.draft_id DESC
                LIMIT 1
              )
          )
        RETURNING action.action_id
      )
      SELECT jsonb_build_object('promoted', EXISTS (SELECT 1 FROM promoted))::text;
    `, this.database);
    return result || { promoted: false };
  }

  async finalizeConfirmedStdProjectCreatePlanAfterAction({ jobId, planId } = {}) {
    assertId("job_id", jobId);
    assertId("plan_id", planId);
    const result = await queryJson(`
      WITH terminal_action AS (
        SELECT action.action_status
        FROM mwb.platform_actions action
        WHERE action.job_id = ${sqlLiteral(jobId)}
          AND action.plan_id = ${sqlLiteral(planId)}
          AND action.action_type = 'oceanengine_std_project_create'
          AND action.action_status IN ('failed', 'failed_or_unconfirmed')
        ORDER BY action.attempt_no DESC, action.finished_at DESC NULLS LAST, action.started_at DESC
        LIMIT 1
      ), consumed AS (
        UPDATE mwb.launch_execution_plans plan
        SET plan_status = 'consumed',
            metadata = plan.metadata || jsonb_build_object(
              'confirmed_execution_outcome', coalesce((SELECT action_status FROM terminal_action), 'failed_or_unconfirmed'),
              'retry_allowed', false,
              'platform_action_count', 1
            ),
            updated_at = now()
        WHERE plan.job_id = ${sqlLiteral(jobId)}
          AND plan.plan_id = ${sqlLiteral(planId)}
          AND plan.plan_status IN ('ready', 'waiting_readback')
          AND coalesce(plan.plan_kind, plan.metadata->>'plan_kind', '') = 'std_project_create'
          AND EXISTS (
            SELECT 1
            FROM mwb.launch_confirmations confirmation
            WHERE confirmation.job_id = plan.job_id
              AND confirmation.plan_id = plan.plan_id
              AND confirmation.confirmation_status = 'confirmed_for_execution_plan'
          )
          AND EXISTS (SELECT 1 FROM terminal_action)
        RETURNING plan.plan_id
      ), job_finalized AS (
        UPDATE mwb.launch_jobs job
        SET job_status = 'failed_waiting_manual_review',
            current_node = '7',
            updated_at = now()
        WHERE job.job_id = ${sqlLiteral(jobId)}
          AND EXISTS (SELECT 1 FROM consumed)
        RETURNING job.job_id
      )
      SELECT jsonb_build_object(
        'consumed', EXISTS (SELECT 1 FROM consumed),
        'jobFinalized', EXISTS (SELECT 1 FROM job_finalized)
      )::text;
    `, this.database);
    return result || { consumed: false, jobFinalized: false };
  }

  async getLaunchExecutionPlan(planId) {
    assertId("plan_id", planId);
    return queryJson(`
      SELECT to_jsonb(ep)::text
      FROM mwb.launch_execution_plans ep
      WHERE ep.plan_id = ${sqlLiteral(planId)}
      LIMIT 1;
    `, this.database);
  }

  async getLatestLaunchExecutionPlan(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT to_jsonb(ep)::text
      FROM mwb.launch_execution_plans ep
      WHERE ep.job_id = ${sqlLiteral(jobId)}
      ORDER BY ep.plan_version DESC, ep.updated_at DESC
      LIMIT 1;
    `, this.database);
  }

  async updateNodeRun(jobId, nodeKey, { status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
    assertId("job_id", jobId);
    assertId("node_key", nodeKey);
    await runPsql(`
      UPDATE mwb.launch_node_runs
      SET status = ${sqlLiteral(status)},
          summary = ${sqlLiteral(summary)},
          diagnostic_level = ${sqlLiteral(diagnosticLevel)},
          output_summary = output_summary || ${sqlJson(outputSummary || {})},
          evidence_refs = ${sqlJson(evidenceRefs || [])},
          finished_at = now()
      WHERE job_id = ${sqlLiteral(jobId)}
        AND node_key = ${sqlLiteral(nodeKey)};
    `, this.database);
  }

  async updateAccountResourceReadonly({ routeId, gameCode, advertiserId, resourceType, visibilityStatus, readbackStatus, platformResourceId, inheritanceStatus, metadata, resourceMetadata }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("resource_type", resourceType);

    await runPsql(`
      UPDATE mwb.account_resources
      SET visibility_status = coalesce(nullif(${sqlLiteral(visibilityStatus || "")}, ''), visibility_status),
          readback_status = coalesce(nullif(${sqlLiteral(readbackStatus || "")}, ''), readback_status),
          platform_resource_id = coalesce(nullif(${sqlLiteral(platformResourceId || "")}, ''), platform_resource_id),
          inheritance_status = coalesce(nullif(${sqlLiteral(inheritanceStatus || "")}, ''), inheritance_status),
          metadata = metadata || jsonb_build_object('readonly_check', ${sqlJson(metadata || {})}) || ${sqlJson(resourceMetadata || {})},
          updated_at = now()
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND resource_type = ${sqlLiteral(resourceType)};
    `, this.database);
  }

  async mergeAccountResourceMetadata({ routeId, gameCode, advertiserId, resourceType, resourceMetadata }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("resource_type", resourceType);
    await runPsql(`
      UPDATE mwb.account_resources
      SET metadata = metadata || ${sqlJson(resourceMetadata || {})},
          updated_at = now()
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND resource_type = ${sqlLiteral(resourceType)};
    `, this.database);
  }

  async bootstrapAccountResourcesFromBlueprints({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      WITH blueprints AS (
        SELECT
          brp.*,
          coalesce(lpa.site_id, '') AS landing_site_id,
          coalesce(lpa.site_name, '') AS landing_site_name,
          coalesce(lpa.url_hash, '') AS landing_url_hash
        FROM mwb.game_route_resource_blueprints brp
        LEFT JOIN mwb.landing_page_assets lpa
          ON brp.source_kind = 'landing_page_asset'
         AND lpa.landing_page_asset_id = brp.source_asset_id
        WHERE brp.route_id = ${sqlLiteral(routeId)}
          AND brp.game_code = ${sqlLiteral(gameCode)}
      ),
      inserted AS (
        INSERT INTO mwb.account_resources (
          resource_id,
          advertiser_id,
          route_id,
          game_code,
          resource_type,
          resource_name,
          platform_resource_id,
          source_asset_id,
          visibility_status,
          readback_status,
          required,
          blueprint_id,
          inheritance_status,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          'AR-' || ${sqlLiteral(advertiserId)} || '-' || ${sqlLiteral(gameCode)} || '-BLUEPRINT-' || regexp_replace(b.blueprint_id, '[^A-Za-z0-9]+', '-', 'g'),
          ${sqlLiteral(advertiserId)},
          b.route_id,
          b.game_code,
          b.resource_type,
          CASE
            WHEN b.resource_type = 'backup_landing_page' AND b.landing_site_name <> '' THEN b.landing_site_name
            ELSE b.resource_name
          END,
          CASE
            WHEN b.resource_type = 'backup_landing_page' THEN coalesce(nullif(b.landing_site_id, ''), b.candidate_platform_resource_id)
            WHEN b.resource_type = 'video_asset' THEN b.source_asset_id
            ELSE ''
          END,
          b.source_asset_id,
          CASE WHEN b.resource_type = 'backup_landing_page' THEN 'unknown' ELSE 'needs_confirmation' END,
          'not_checked',
          b.required,
          b.blueprint_id,
          'baseline_candidate',
          jsonb_build_object(
            'baseline_blueprint', jsonb_build_object(
              'blueprint_id', b.blueprint_id,
              'source_kind', b.source_kind,
              'source_asset_id', b.source_asset_id,
              'source_advertiser_id', b.source_advertiser_id,
              'inheritance_mode', b.inheritance_mode
            ),
            'readonly_check', jsonb_build_object(
              'status', 'baseline_candidate',
              'key', 'resource_blueprint_bootstrap',
              'gap', 'target_account_readonly_required',
              'next_action', '运行目标账户真实只读核验'
            )
          )
          || CASE
            WHEN b.resource_type = 'backup_landing_page' THEN jsonb_build_object(
              'site_id', coalesce(nullif(b.landing_site_id, ''), b.candidate_platform_resource_id),
              'landing_page_asset_id', b.source_asset_id,
              'url_hash', b.landing_url_hash
            )
            ELSE '{}'::jsonb
          END,
          now(),
          now()
        FROM blueprints b
        WHERE NOT EXISTS (
          SELECT 1
          FROM mwb.account_resources existing
          WHERE existing.advertiser_id = ${sqlLiteral(advertiserId)}
            AND existing.route_id = b.route_id
            AND existing.game_code = b.game_code
            AND existing.blueprint_id = b.blueprint_id
        )
        ON CONFLICT (resource_id) DO UPDATE SET
          blueprint_id = EXCLUDED.blueprint_id,
          metadata = mwb.account_resources.metadata || jsonb_build_object(
            'baseline_blueprint', EXCLUDED.metadata->'baseline_blueprint'
          ),
          updated_at = now()
        RETURNING blueprint_id
      )
      SELECT jsonb_build_object(
        'blueprintCount', (SELECT count(*) FROM blueprints),
        'createdResourceCount', (SELECT count(*) FROM inserted),
        'existingResourceCount', (
          SELECT count(*)
          FROM mwb.account_resources ar
          WHERE ar.advertiser_id = ${sqlLiteral(advertiserId)}
            AND ar.route_id = ${sqlLiteral(routeId)}
            AND ar.game_code = ${sqlLiteral(gameCode)}
            AND ar.blueprint_id IS NOT NULL
        ),
        'inheritanceStatuses', (
          SELECT coalesce(jsonb_agg(DISTINCT inheritance_status ORDER BY inheritance_status), '[]'::jsonb)
          FROM mwb.account_resources ar
          WHERE ar.advertiser_id = ${sqlLiteral(advertiserId)}
            AND ar.route_id = ${sqlLiteral(routeId)}
            AND ar.game_code = ${sqlLiteral(gameCode)}
            AND ar.blueprint_id IS NOT NULL
        )
      )::text;
    `, this.database);
  }

  async upsertAccountResourceReadonlyBySourceAsset({
    routeId,
    gameCode,
    advertiserId,
    resourceType,
    sourceAssetId,
    resourceName,
    visibilityStatus,
    readbackStatus,
    platformResourceId,
    required = true,
    metadata,
    resourceMetadata
  }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("resource_type", resourceType);
    assertId("source_asset_id", sourceAssetId);
    const resourceId = `AR-${advertiserId}-${gameCode}-${resourceType.toUpperCase().replace(/_ASSET$/g, "").replace(/[^A-Z0-9]+/g, "-")}-${sourceAssetId.replace(/^JSZC-HUNT-/i, "").replace(/[^A-Za-z0-9]+/g, "-")}`;
    await runPsql(`
      WITH updated AS (
        UPDATE mwb.account_resources
        SET resource_name = coalesce(nullif(${sqlLiteral(resourceName || "")}, ''), resource_name),
            platform_resource_id = coalesce(nullif(${sqlLiteral(platformResourceId || sourceAssetId)}, ''), platform_resource_id),
            visibility_status = ${sqlLiteral(visibilityStatus || "needs_confirmation")},
            readback_status = ${sqlLiteral(readbackStatus || "not_checked")},
            required = ${required ? "true" : "false"},
            metadata = metadata || ${sqlJson(resourceMetadata || {})} || jsonb_build_object('readonly_check', ${sqlJson(metadata || {})}),
            updated_at = now()
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND resource_type = ${sqlLiteral(resourceType)}
          AND source_asset_id = ${sqlLiteral(sourceAssetId)}
        RETURNING resource_id
      )
      INSERT INTO mwb.account_resources (
        resource_id,
        advertiser_id,
        route_id,
        game_code,
        resource_type,
        resource_name,
        platform_resource_id,
        source_asset_id,
        visibility_status,
        readback_status,
        required,
        metadata,
        created_at,
        updated_at
      )
      SELECT
        ${sqlLiteral(resourceId)},
        ${sqlLiteral(advertiserId)},
        ${sqlLiteral(routeId)},
        ${sqlLiteral(gameCode)},
        ${sqlLiteral(resourceType)},
        ${sqlLiteral(resourceName || sourceAssetId)},
        ${sqlLiteral(platformResourceId || sourceAssetId)},
        ${sqlLiteral(sourceAssetId)},
        ${sqlLiteral(visibilityStatus || "needs_confirmation")},
        ${sqlLiteral(readbackStatus || "not_checked")},
        ${required ? "true" : "false"},
        ${sqlJson(resourceMetadata || {})} || jsonb_build_object('readonly_check', ${sqlJson(metadata || {})}),
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM updated)
      ON CONFLICT (resource_id) DO UPDATE SET
        resource_name = EXCLUDED.resource_name,
        platform_resource_id = EXCLUDED.platform_resource_id,
        source_asset_id = EXCLUDED.source_asset_id,
        visibility_status = EXCLUDED.visibility_status,
        readback_status = EXCLUDED.readback_status,
        required = EXCLUDED.required,
        metadata = mwb.account_resources.metadata || ${sqlJson(resourceMetadata || {})} || jsonb_build_object('readonly_check', ${sqlJson(metadata || {})}),
        updated_at = now();
    `, this.database);
  }

  async updateAccountResourcePlatformResource({ routeId, gameCode, advertiserId, resourceType, platformResourceId, visibilityStatus, readbackStatus, metadata }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("resource_type", resourceType);
    assertId("platform_resource_id", platformResourceId, /^[0-9A-Za-z_:\-/.]+$/);

    await runPsql(`
      UPDATE mwb.account_resources
      SET platform_resource_id = ${sqlLiteral(platformResourceId)},
          visibility_status = coalesce(nullif(${sqlLiteral(visibilityStatus || "")}, ''), visibility_status),
          readback_status = coalesce(nullif(${sqlLiteral(readbackStatus || "")}, ''), readback_status),
          metadata = metadata || ${sqlJson(metadata || {})},
          updated_at = now()
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND resource_type = ${sqlLiteral(resourceType)};
    `, this.database);
  }

  async updateDraftDuplicateStatus(draftId, duplicateStatus) {
    assertId("draft_id", draftId);
    assertId("duplicate_status", duplicateStatus);
    await runPsql(`
      UPDATE mwb.launch_drafts
      SET duplicate_status = ${sqlLiteral(duplicateStatus)}
      WHERE draft_id = ${sqlLiteral(draftId)};
    `, this.database);
  }

  async upsertDraft(draft) {
    assertId("draft_id", draft.draftId);
    assertId("job_id", draft.jobId);
    if (draft.reservationId) {
      assertId("reservation_id", draft.reservationId);
      const persisted = await queryJson(`
        WITH reservation AS (
          SELECT reservation_id
          FROM mwb.project_name_reservations
          WHERE reservation_id = ${sqlLiteral(draft.reservationId)}
            AND job_id = ${sqlLiteral(draft.jobId)}
            AND draft_id = ${sqlLiteral(draft.draftId)}
            AND project_name = ${sqlLiteral(draft.projectName)}
          FOR UPDATE
        ),
        persisted_draft AS (
          INSERT INTO mwb.launch_drafts (
            draft_id, job_id, object_type, project_name, payload_summary,
            payload_hash, duplicate_status, write_policy, created_at
          )
          SELECT
            ${sqlLiteral(draft.draftId)}, ${sqlLiteral(draft.jobId)}, ${sqlLiteral(draft.objectType)},
            ${sqlLiteral(draft.projectName)}, ${sqlJson(draft.payloadSummary)},
            ${sqlLiteral(draft.payloadHash)}, ${sqlLiteral(draft.duplicateStatus)},
            ${sqlLiteral(draft.writePolicy)}, now()
          FROM reservation
          ON CONFLICT (draft_id) DO UPDATE SET
            object_type = EXCLUDED.object_type,
            project_name = EXCLUDED.project_name,
            payload_summary = EXCLUDED.payload_summary,
            payload_hash = EXCLUDED.payload_hash,
            duplicate_status = EXCLUDED.duplicate_status,
            write_policy = EXCLUDED.write_policy,
            created_at = EXCLUDED.created_at
          RETURNING draft_id
        ),
        consumed AS (
          UPDATE mwb.project_name_reservations reservation
          SET reservation_status = 'consumed',
              consumed_at = coalesce(consumed_at, now())
          FROM persisted_draft
          WHERE reservation.reservation_id = ${sqlLiteral(draft.reservationId)}
          RETURNING reservation_id
        )
        SELECT to_jsonb(jsonb_build_object(
          'draftPersisted', EXISTS (SELECT 1 FROM persisted_draft),
          'reservationConsumed', EXISTS (SELECT 1 FROM consumed)
        ))::text;
      `, this.database);
      if (!persisted?.draftPersisted || !persisted?.reservationConsumed) {
        throw new Error("project_name_reservation_persist_failed");
      }
      return;
    }
    await runPsql(`
      INSERT INTO mwb.launch_drafts (
        draft_id,
        job_id,
        object_type,
        project_name,
        payload_summary,
        payload_hash,
        duplicate_status,
        write_policy,
        created_at
      ) VALUES (
        ${sqlLiteral(draft.draftId)},
        ${sqlLiteral(draft.jobId)},
        ${sqlLiteral(draft.objectType)},
        ${sqlLiteral(draft.projectName)},
        ${sqlJson(draft.payloadSummary)},
        ${sqlLiteral(draft.payloadHash)},
        ${sqlLiteral(draft.duplicateStatus)},
        ${sqlLiteral(draft.writePolicy)},
        now()
      )
      ON CONFLICT (draft_id) DO UPDATE SET
        object_type = EXCLUDED.object_type,
        project_name = EXCLUDED.project_name,
        payload_summary = EXCLUDED.payload_summary,
        payload_hash = EXCLUDED.payload_hash,
        duplicate_status = EXCLUDED.duplicate_status,
        write_policy = EXCLUDED.write_policy,
        created_at = EXCLUDED.created_at;
    `, this.database);
  }

  async upsertEvidence(evidence) {
    assertId("artifact_id", evidence.artifactId);
    await runPsql(`
      INSERT INTO mwb.evidence_artifacts (
        artifact_id,
        job_id,
        artifact_type,
        title,
        summary,
        content_hash,
        storage_ref,
        source_ref,
        source_usage,
        created_at
      ) VALUES (
        ${sqlLiteral(evidence.artifactId)},
        ${sqlLiteral(evidence.jobId)},
        ${sqlLiteral(evidence.artifactType)},
        ${sqlLiteral(evidence.title)},
        ${sqlLiteral(evidence.summary)},
        ${sqlLiteral(evidence.contentHash)},
        ${sqlLiteral(evidence.storageRef)},
        ${sqlLiteral(evidence.sourceRef)},
        ${sqlLiteral(evidence.sourceUsage || "runtime_truth")},
        now()
      )
      ON CONFLICT (artifact_id) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        artifact_type = EXCLUDED.artifact_type,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content_hash = EXCLUDED.content_hash,
        storage_ref = EXCLUDED.storage_ref,
        source_ref = EXCLUDED.source_ref,
        source_usage = EXCLUDED.source_usage,
        created_at = EXCLUDED.created_at;
    `, this.database);
  }

  async upsertReadbackRecord(readback) {
    assertId("readback_id", readback.readbackId);
    await runPsql(`
      INSERT INTO mwb.readback_records (
        readback_id,
        job_id,
        object_type,
        object_id,
        object_name,
        readback_status,
        field_diff_summary,
        evidence_ref,
        created_at
      ) VALUES (
        ${sqlLiteral(readback.readbackId)},
        ${sqlLiteral(readback.jobId)},
        ${sqlLiteral(readback.objectType)},
        ${sqlLiteral(readback.objectId)},
        ${sqlLiteral(readback.objectName)},
        ${sqlLiteral(readback.readbackStatus)},
        ${sqlJson(readback.fieldDiffSummary)},
        ${sqlLiteral(readback.evidenceRef)},
        now()
      )
      ON CONFLICT (readback_id) DO UPDATE SET
        object_type = EXCLUDED.object_type,
        object_id = EXCLUDED.object_id,
        object_name = EXCLUDED.object_name,
        readback_status = EXCLUDED.readback_status,
        field_diff_summary = EXCLUDED.field_diff_summary,
        evidence_ref = EXCLUDED.evidence_ref,
        created_at = EXCLUDED.created_at;
    `, this.database);
  }

  async attestCreateFieldLedger({ jobId, operator = "local_operator", allMatched = false } = {}) {
    assertId("job_id", jobId);
    if (allMatched !== true) throw new Error("create_field_ledger_all_matched_required");
    const bundle = await this.getLaunchJobBundle(jobId);
    if (!bundle?.draft || bundle.readback?.readback_status !== "readback_verified") {
      throw new Error("create_field_ledger_requires_verified_platform_readback");
    }
    const ledger = bundle.draft.payload_summary?.final_payload_manifest?.createFieldLedger || {};
    const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
    if (ledger.status !== "passed" || !entries.length || entries.some((entry) => entry.preCreateStatus !== "passed")) {
      throw new Error("create_field_ledger_not_ready_for_attestation");
    }
    const evidenceRef = `EV-${jobId}-STD-PROJECT-CONSOLE-FIELD-LEDGER`;
    const fieldLedger = {
      status: "manual_console_verified",
      rule_version: ledger.ruleVersion || "",
      checked_path_count: entries.length,
      matched_path_count: entries.length,
      mismatched_path_count: 0,
      operator,
      values_stored: false,
      entries: entries.map((entry) => ({
        path: entry.path || "",
        send_policy: entry.sendPolicy || "",
        observed_status: "matched",
        value_hash: entry.valueHash || ""
      }))
    };
    await this.upsertEvidence({
      artifactId: evidenceRef,
      jobId,
      artifactType: "std_project_console_field_ledger",
      title: "std project console field ledger",
      summary: `manual_console_verified=true checked_path_count=${entries.length} mismatched_path_count=0 values_stored=false`,
      contentHash: `sha256:${sha256Hex(JSON.stringify(fieldLedger))}`,
      storageRef: "postgres:evidence_artifacts:redacted_summary_only",
      sourceRef: "manual:std_project_console_field_check",
      sourceUsage: bundle.job.source_usage || "runtime_truth"
    });
    await this.upsertReadbackRecord({
      readbackId: bundle.readback.readback_id,
      jobId,
      objectType: bundle.readback.object_type,
      objectId: bundle.readback.object_id,
      objectName: bundle.readback.object_name,
      readbackStatus: bundle.readback.readback_status,
      fieldDiffSummary: {
        ...(bundle.readback.field_diff_summary || {}),
        create_field_ledger: fieldLedger
      },
      evidenceRef
    });
    return { evidenceRef, checkedPathCount: entries.length, status: "manual_console_verified" };
  }

  async upsertLaunchConfirmation(confirmation) {
    assertId("confirmation_id", confirmation.confirmationId);
    assertId("job_id", confirmation.jobId);
    if (confirmation.draftId) assertId("draft_id", confirmation.draftId);
    if (!confirmation.draftId && confirmation.confirmationStatus !== "confirmed_for_execution_plan") {
      throw new Error("draft_id_required_for_non_plan_confirmation");
    }
    await runPsql(`
      INSERT INTO mwb.launch_confirmations (
        confirmation_id,
        job_id,
        draft_id,
        object_type,
        object_name,
        payload_hash,
        confirmation_status,
        confirm_variable,
        confirmed_by,
        plan_id,
        metadata,
        confirmed_at
      ) VALUES (
        ${sqlLiteral(confirmation.confirmationId)},
        ${sqlLiteral(confirmation.jobId)},
        ${confirmation.draftId ? sqlLiteral(confirmation.draftId) : "NULL"},
        ${sqlLiteral(confirmation.objectType)},
        ${sqlLiteral(confirmation.objectName)},
        ${sqlLiteral(confirmation.payloadHash)},
        ${sqlLiteral(confirmation.confirmationStatus)},
        ${sqlLiteral(confirmation.confirmVariable)},
        ${sqlLiteral(confirmation.confirmedBy || "local_operator")},
        ${confirmation.planId ? sqlLiteral(confirmation.planId) : "NULL"},
        ${sqlJson(confirmation.metadata || {})},
        now()
      )
      ON CONFLICT (confirmation_id) DO UPDATE SET
        confirmation_status = CASE
          WHEN mwb.launch_confirmations.confirmation_status = 'confirmed_for_execution_plan'
            THEN mwb.launch_confirmations.confirmation_status
          ELSE EXCLUDED.confirmation_status
        END,
        metadata = CASE
          WHEN mwb.launch_confirmations.confirmation_status = 'confirmed_for_execution_plan'
            THEN mwb.launch_confirmations.metadata
          ELSE EXCLUDED.metadata
        END,
        confirmed_at = mwb.launch_confirmations.confirmed_at;
    `, this.database);
  }

  async claimLaunchExecutionPlanConfirmation(confirmation) {
    assertId("confirmation_id", confirmation.confirmationId);
    assertId("job_id", confirmation.jobId);
    assertId("plan_id", confirmation.planId);
    if (confirmation.confirmationStatus !== "confirmed_for_execution_plan") {
      throw new Error("plan_confirmation_status_invalid");
    }
    const result = await queryJson(`
      WITH claimed AS (
        INSERT INTO mwb.launch_confirmations (
          confirmation_id,
          job_id,
          draft_id,
          object_type,
          object_name,
          payload_hash,
          confirmation_status,
          confirm_variable,
          confirmed_by,
          plan_id,
          metadata,
          confirmed_at
        ) VALUES (
          ${sqlLiteral(confirmation.confirmationId)},
          ${sqlLiteral(confirmation.jobId)},
          ${confirmation.draftId ? sqlLiteral(confirmation.draftId) : "NULL"},
          ${sqlLiteral(confirmation.objectType)},
          ${sqlLiteral(confirmation.objectName)},
          ${sqlLiteral(confirmation.payloadHash)},
          ${sqlLiteral(confirmation.confirmationStatus)},
          ${sqlLiteral(confirmation.confirmVariable)},
          ${sqlLiteral(confirmation.confirmedBy || "local_operator")},
          ${sqlLiteral(confirmation.planId)},
          ${sqlJson(confirmation.metadata || {})},
          now()
        )
        ON CONFLICT DO NOTHING
        RETURNING confirmation_id
      )
      SELECT jsonb_build_object(
        'claimed', EXISTS (SELECT 1 FROM claimed),
        'confirmationId', COALESCE((SELECT confirmation_id FROM claimed LIMIT 1), '')
      )::text;
    `, this.database);
    return result || { claimed: false, confirmationId: "" };
  }

  async getLaunchConfirmationForPlan(planId) {
    assertId("plan_id", planId);
    return queryJson(`
      SELECT to_jsonb(c)::text
      FROM mwb.launch_confirmations c
      WHERE c.plan_id = ${sqlLiteral(planId)}
      LIMIT 1;
    `, this.database);
  }

  async claimStdProjectCreateAction({ confirmation, action, requireExistingConfirmation = false }) {
    assertId("confirmation_id", confirmation.confirmationId);
    assertId("action_id", action.actionId);
    assertId("job_id", action.jobId);
    const result = await queryJson(`
      WITH existing_confirmation AS (
        SELECT confirmation_id
        FROM mwb.launch_confirmations
        WHERE confirmation_id = ${sqlLiteral(confirmation.confirmationId)}
          AND job_id = ${sqlLiteral(confirmation.jobId)}
          AND plan_id IS NOT DISTINCT FROM ${confirmation.planId ? sqlLiteral(confirmation.planId) : "NULL"}
          AND confirmation_status IN ('confirmed_for_execution_plan', 'confirmed_for_single_create')
        FOR UPDATE
      ),
      inserted_confirmation AS (
        INSERT INTO mwb.launch_confirmations (
          confirmation_id, job_id, draft_id, object_type, object_name,
          payload_hash, confirmation_status, confirm_variable, confirmed_by,
          plan_id, metadata, confirmed_at
        )
        SELECT
          ${sqlLiteral(confirmation.confirmationId)}, ${sqlLiteral(confirmation.jobId)},
          ${confirmation.draftId ? sqlLiteral(confirmation.draftId) : "NULL"}, ${sqlLiteral(confirmation.objectType)},
          ${sqlLiteral(confirmation.objectName)}, ${sqlLiteral(confirmation.payloadHash)},
          ${sqlLiteral(confirmation.confirmationStatus)}, ${sqlLiteral(confirmation.confirmVariable)},
          ${sqlLiteral(confirmation.confirmedBy || "local_operator")},
          ${confirmation.planId ? sqlLiteral(confirmation.planId) : "NULL"},
          ${sqlJson(confirmation.metadata || {})}, now()
        WHERE ${requireExistingConfirmation ? "false" : "true"}
          AND NOT EXISTS (SELECT 1 FROM existing_confirmation)
        ON CONFLICT (confirmation_id) DO NOTHING
        RETURNING confirmation_id
      ),
      confirmed AS (
        SELECT confirmation_id FROM existing_confirmation
        UNION ALL
        SELECT confirmation_id FROM inserted_confirmation
      ),
      claimed AS (
        INSERT INTO mwb.platform_actions (
          action_id, job_id, confirmation_id, plan_id, action_type, endpoint, method,
          action_status, attempt_no, request_hash, response_hash, http_status,
          api_code, request_id_present, object_id_present, error_summary,
          request_id, error_category, offending_field_path, idempotency_key,
          request_field_manifest, response_summary, metadata, started_at, finished_at
        ) SELECT
          ${sqlLiteral(action.actionId)}, ${sqlLiteral(action.jobId)}, ${sqlLiteral(action.confirmationId)},
          ${action.planId ? sqlLiteral(action.planId) : "NULL"},
          ${sqlLiteral(action.actionType)}, ${sqlLiteral(action.endpoint)}, ${sqlLiteral(action.method || "POST")},
          'started', ${Number(action.attemptNo || 1)}, ${sqlLiteral(action.requestHash || "")}, '', NULL,
          '', false, false, '', '', '', '', ${sqlLiteral(action.idempotencyKey || "")}, ${sqlJson({})}, ${sqlJson({})},
          ${sqlJson(action.metadata || {})}, now(), NULL
        FROM confirmed
        ON CONFLICT DO NOTHING
        RETURNING action_id
      )
      SELECT to_jsonb(jsonb_build_object(
        'claimed', EXISTS (SELECT 1 FROM claimed),
        'confirmationRecorded', EXISTS (SELECT 1 FROM confirmed)
      ))::text;
    `, this.database);
    return result || { claimed: false, confirmationRecorded: false };
  }

  async claimPlannedExecutionAction({
    actionId,
    jobId,
    confirmationId,
    planId,
    actionType,
    idempotencyKey
  }) {
    assertId("action_id", actionId);
    assertId("job_id", jobId);
    assertId("confirmation_id", confirmationId);
    assertId("plan_id", planId);
    assertId("action_type", actionType);
    const result = await queryJson(`
      WITH confirmed AS (
        SELECT confirmation_id
        FROM mwb.launch_confirmations
        WHERE confirmation_id = ${sqlLiteral(confirmationId)}
          AND job_id = ${sqlLiteral(jobId)}
          AND plan_id = ${sqlLiteral(planId)}
          AND confirmation_status = 'confirmed_for_execution_plan'
      ), claimed AS (
        INSERT INTO mwb.platform_actions (
          action_id, job_id, confirmation_id, plan_id, action_type, endpoint, method,
          action_status, attempt_no, request_hash, idempotency_key,
          request_field_manifest, response_summary, metadata, started_at
        )
        SELECT
          ${sqlLiteral(actionId)}, ${sqlLiteral(jobId)}, confirmed.confirmation_id,
          ${sqlLiteral(planId)}, ${sqlLiteral(actionType)}, 'internal:confirmed-plan-orchestrator',
          'INTERNAL', 'started', 1, '', ${sqlLiteral(idempotencyKey)}, '{}'::jsonb, '{}'::jsonb,
          ${sqlJson({ high_level_plan_action: true, retry_allowed: false })}, now()
        FROM confirmed
        ON CONFLICT DO NOTHING
        RETURNING action_id
      )
      SELECT jsonb_build_object('claimed', EXISTS (SELECT 1 FROM claimed))::text;
    `, this.database);
    return result || { claimed: false };
  }

  async finishPlannedExecutionAction({
    actionId,
    jobId,
    confirmationId,
    planId,
    actionType,
    idempotencyKey,
    actionStatus,
    metadata = {}
  }) {
    return this.upsertPlatformAction({
      actionId,
      jobId,
      confirmationId,
      planId,
      actionType,
      endpoint: "internal:confirmed-plan-orchestrator",
      method: "INTERNAL",
      actionStatus,
      attemptNo: 1,
      idempotencyKey,
      metadata: {
        high_level_plan_action: true,
        retry_allowed: false,
        ...metadata
      },
      finishedAt: new Date().toISOString()
    });
  }

  async upsertPlatformAction(action) {
    assertId("action_id", action.actionId);
    assertId("job_id", action.jobId);
    await runPsql(`
      INSERT INTO mwb.platform_actions (
        action_id,
        job_id,
        confirmation_id,
        plan_id,
        action_type,
        endpoint,
        method,
        action_status,
        attempt_no,
        request_hash,
        response_hash,
        http_status,
        api_code,
        request_id_present,
        object_id_present,
        error_summary,
        request_id,
        error_category,
        offending_field_path,
        idempotency_key,
        request_field_manifest,
        response_summary,
        metadata,
        started_at,
        finished_at
      ) VALUES (
        ${sqlLiteral(action.actionId)},
        ${sqlLiteral(action.jobId)},
        coalesce(
          ${action.confirmationId ? sqlLiteral(action.confirmationId) : "NULL"},
          (SELECT confirmation_id FROM mwb.launch_confirmations WHERE job_id = ${sqlLiteral(action.jobId)} AND confirmation_status = 'confirmed_for_execution_plan' ORDER BY confirmed_at DESC LIMIT 1)
        ),
        coalesce(
          ${action.planId ? sqlLiteral(action.planId) : "NULL"},
          (SELECT plan_id FROM mwb.launch_confirmations WHERE job_id = ${sqlLiteral(action.jobId)} AND confirmation_status = 'confirmed_for_execution_plan' ORDER BY confirmed_at DESC LIMIT 1)
        ),
        ${sqlLiteral(action.actionType)},
        ${sqlLiteral(action.endpoint)},
        ${sqlLiteral(action.method || "POST")},
        ${sqlLiteral(action.actionStatus)},
        ${Number(action.attemptNo || 1)},
        ${sqlLiteral(action.requestHash || "")},
        ${sqlLiteral(action.responseHash || "")},
        ${action.httpStatus === null || action.httpStatus === undefined ? "NULL" : Number(action.httpStatus)},
        ${sqlLiteral(action.apiCode || "")},
        ${action.requestIdPresent ? "true" : "false"},
        ${action.objectIdPresent ? "true" : "false"},
        ${sqlLiteral(action.errorSummary || "")},
        ${sqlLiteral(action.requestId || "")},
        ${sqlLiteral(action.errorCategory || "")},
        ${sqlLiteral(action.offendingFieldPath || "")},
        ${sqlLiteral(action.idempotencyKey || "")},
        ${sqlJson(action.requestFieldManifest || {})},
        ${sqlJson(action.responseSummary || {})},
        ${sqlJson(action.metadata || {})},
        ${action.startedAt ? `${sqlLiteral(action.startedAt)}::timestamptz` : "now()"},
        ${action.finishedAt ? `${sqlLiteral(action.finishedAt)}::timestamptz` : "NULL"}
      )
      ON CONFLICT (action_id) DO UPDATE SET
        action_status = EXCLUDED.action_status,
        confirmation_id = coalesce(mwb.platform_actions.confirmation_id, EXCLUDED.confirmation_id),
        plan_id = coalesce(mwb.platform_actions.plan_id, EXCLUDED.plan_id),
        request_hash = EXCLUDED.request_hash,
        response_hash = EXCLUDED.response_hash,
        http_status = EXCLUDED.http_status,
        api_code = EXCLUDED.api_code,
        request_id_present = EXCLUDED.request_id_present,
        object_id_present = EXCLUDED.object_id_present,
        error_summary = EXCLUDED.error_summary,
        request_id = EXCLUDED.request_id,
        error_category = EXCLUDED.error_category,
        offending_field_path = EXCLUDED.offending_field_path,
        idempotency_key = EXCLUDED.idempotency_key,
        request_field_manifest = EXCLUDED.request_field_manifest,
        response_summary = EXCLUDED.response_summary,
        metadata = EXCLUDED.metadata,
        finished_at = EXCLUDED.finished_at;
    `, this.database);
  }

  async mergePlatformActionMetadata(actionId, metadata = {}) {
    assertId("action_id", actionId);
    await runPsql(`
      UPDATE mwb.platform_actions
      SET metadata = metadata || ${sqlJson(metadata)},
          finished_at = coalesce(finished_at, now())
      WHERE action_id = ${sqlLiteral(actionId)};
    `, this.database);
  }

  async getPlatformAction(actionId) {
    assertId("action_id", actionId);
    return queryJson(`
      SELECT jsonb_build_object(
        'action_id', action_id,
        'job_id', job_id,
        'confirmation_id', confirmation_id,
        'plan_id', plan_id,
        'action_type', action_type,
        'endpoint', endpoint,
        'method', method,
        'action_status', action_status,
        'attempt_no', attempt_no,
        'request_hash', request_hash,
        'response_hash', response_hash,
        'http_status', http_status,
        'api_code', api_code,
        'request_id_present', request_id_present,
        'object_id_present', object_id_present,
        'error_summary', error_summary,
        'error_category', error_category,
        'request_field_manifest', request_field_manifest,
        'response_summary', response_summary,
        'metadata', metadata,
        'started_at', started_at,
        'finished_at', finished_at
      )::text
      FROM mwb.platform_actions
      WHERE action_id = ${sqlLiteral(actionId)}
      LIMIT 1;
    `, this.database);
  }

  async listVideoMaterialBindActions({ routeId = "", gameCode = "", advertiserId = "", sourceAdvertiserId = "" } = {}) {
    if (routeId) assertId("route_id", routeId);
    if (gameCode) assertId("game_code", gameCode);
    if (advertiserId) assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    if (sourceAdvertiserId) assertId("source_advertiser_id", sourceAdvertiserId, /^[0-9A-Za-z_\-.]+$/);
    const filters = [
      "pa.action_type = 'oceanengine_material_bind_target'",
      routeId ? `j.route_id = ${sqlLiteral(routeId)}` : "",
      gameCode ? `j.game_code = ${sqlLiteral(gameCode)}` : "",
      advertiserId ? `j.advertiser_id = ${sqlLiteral(advertiserId)}` : "",
      sourceAdvertiserId ? `pa.metadata->>'source_advertiser_id' = ${sqlLiteral(sourceAdvertiserId)}` : ""
    ].filter(Boolean).join(" AND ");
    return queryJson(`
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'action_id', pa.action_id,
        'job_id', pa.job_id,
        'route_id', j.route_id,
        'game_code', j.game_code,
        'advertiser_id', j.advertiser_id,
        'action_type', pa.action_type,
        'endpoint', pa.endpoint,
        'method', pa.method,
        'action_status', pa.action_status,
        'http_status', pa.http_status,
        'api_code', pa.api_code,
        'request_id_present', pa.request_id_present,
        'response_hash_present', (pa.response_hash IS NOT NULL AND pa.response_hash <> ''),
        'response_summary', pa.response_summary,
        'metadata', pa.metadata,
        'started_at', pa.started_at,
        'finished_at', pa.finished_at
      ) ORDER BY pa.started_at ASC, pa.action_id ASC), '[]'::jsonb)::text
      FROM mwb.platform_actions pa
      JOIN mwb.launch_jobs j ON j.job_id = pa.job_id
      WHERE ${filters};
    `, this.database);
  }

  async countPlatformActions({ jobId, actionType, sourceAssetId = "", statuses = [] }) {
    assertId("job_id", jobId);
    assertId("action_type", actionType);
    const statusArray = statuses.length
      ? `AND action_status = ANY(ARRAY[${statuses.map(sqlLiteral).join(",")}]::text[])`
      : "";
    const sourceFilter = sourceAssetId
      ? `AND metadata->>'source_asset_id' = ${sqlLiteral(sourceAssetId)}`
      : "";
    const result = await queryJson(`
      SELECT to_jsonb(count(*))
      FROM mwb.platform_actions
      WHERE job_id = ${sqlLiteral(jobId)}
        AND action_type = ${sqlLiteral(actionType)}
        ${sourceFilter}
        ${statusArray};
    `, this.database);
    return Number(result || 0);
  }

  async getLaunchJobAuditCounts(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT jsonb_build_object(
        'nodeRuns', (SELECT count(*) FROM mwb.launch_node_runs WHERE job_id = ${sqlLiteral(jobId)}),
        'skillRuns', (SELECT count(*) FROM mwb.launch_skill_runs WHERE job_id = ${sqlLiteral(jobId)}),
        'drafts', (SELECT count(*) FROM mwb.launch_drafts WHERE job_id = ${sqlLiteral(jobId)}),
        'executionPlans', (SELECT count(*) FROM mwb.launch_execution_plans WHERE job_id = ${sqlLiteral(jobId)}),
        'readbackRecords', (SELECT count(*) FROM mwb.readback_records WHERE job_id = ${sqlLiteral(jobId)}),
        'evidenceArtifacts', (SELECT count(*) FROM mwb.evidence_artifacts WHERE job_id = ${sqlLiteral(jobId)}),
        'launchConfirmations', (SELECT count(*) FROM mwb.launch_confirmations WHERE job_id = ${sqlLiteral(jobId)}),
        'platformActions', (SELECT count(*) FROM mwb.platform_actions WHERE job_id = ${sqlLiteral(jobId)}),
        'createdObjects', (SELECT count(*) FROM mwb.created_objects WHERE job_id = ${sqlLiteral(jobId)})
      )::text;
    `, this.database);
  }

  async upsertCreatedObject(object) {
    assertId("created_object_id", object.createdObjectId);
    assertId("job_id", object.jobId);
    await runPsql(`
      INSERT INTO mwb.created_objects (
        created_object_id,
        job_id,
        confirmation_id,
        action_id,
        object_type,
        object_id,
        object_name,
        object_status,
        readback_status,
        evidence_ref,
        metadata,
        created_at,
        readback_at
      ) VALUES (
        ${sqlLiteral(object.createdObjectId)},
        ${sqlLiteral(object.jobId)},
        ${object.confirmationId ? sqlLiteral(object.confirmationId) : "NULL"},
        ${object.actionId ? sqlLiteral(object.actionId) : "NULL"},
        ${sqlLiteral(object.objectType)},
        ${sqlLiteral(object.objectId)},
        ${sqlLiteral(object.objectName)},
        ${sqlLiteral(object.objectStatus || "")},
        ${sqlLiteral(object.readbackStatus || "pending")},
        ${sqlLiteral(object.evidenceRef || "")},
        ${sqlJson(object.metadata || {})},
        now(),
        ${object.readbackAt ? `${sqlLiteral(object.readbackAt)}::timestamptz` : "NULL"}
      )
      ON CONFLICT (created_object_id) DO UPDATE SET
        object_status = EXCLUDED.object_status,
        readback_status = EXCLUDED.readback_status,
        evidence_ref = EXCLUDED.evidence_ref,
        metadata = EXCLUDED.metadata,
        readback_at = EXCLUDED.readback_at;
    `, this.database);
  }

  async reconcileStdProjectObjectId({
    jobId,
    legacyObjectId,
    verifiedObjectId
  } = {}) {
    assertId("job_id", jobId);
    assertId("legacy_object_id", legacyObjectId, /^\d+$/);
    assertId("verified_object_id", verifiedObjectId, /^\d+$/);
    if (legacyObjectId === verifiedObjectId) throw new Error("std_project_id_reconciliation_no_change");

    const correctedCreatedObjectId = `CO-${jobId}-STD-PROJECT-${verifiedObjectId}`;
    await runPsql(`
      BEGIN;
      DO $$
      DECLARE
        created_total integer;
        legacy_created integer;
        corrected_created integer;
        verified_readback_total integer;
        legacy_verified_readback integer;
        corrected_readback integer;
      BEGIN
        PERFORM 1
        FROM mwb.created_objects
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
        FOR UPDATE;
        PERFORM 1
        FROM mwb.readback_records
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
        FOR UPDATE;

        SELECT count(*) INTO created_total
        FROM mwb.created_objects
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project';
        SELECT count(*) INTO legacy_created
        FROM mwb.created_objects
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND object_id = ${sqlLiteral(legacyObjectId)};
        SELECT count(*) INTO corrected_created
        FROM mwb.created_objects
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND (object_id = ${sqlLiteral(verifiedObjectId)} OR created_object_id = ${sqlLiteral(correctedCreatedObjectId)});
        SELECT count(*) INTO verified_readback_total
        FROM mwb.readback_records
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND readback_status = 'readback_verified';
        SELECT count(*) INTO legacy_verified_readback
        FROM mwb.readback_records
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND object_id = ${sqlLiteral(legacyObjectId)}
          AND readback_status = 'readback_verified';
        SELECT count(*) INTO corrected_readback
        FROM mwb.readback_records
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND object_id = ${sqlLiteral(verifiedObjectId)};

        IF created_total <> 1 OR legacy_created <> 1 OR corrected_created <> 0
          OR verified_readback_total <> 1 OR legacy_verified_readback <> 1 OR corrected_readback <> 0 THEN
          RAISE EXCEPTION 'std_project_id_reconciliation_precondition_failed';
        END IF;

        UPDATE mwb.created_objects
        SET created_object_id = ${sqlLiteral(correctedCreatedObjectId)},
            object_id = ${sqlLiteral(verifiedObjectId)}
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND object_id = ${sqlLiteral(legacyObjectId)};

        UPDATE mwb.readback_records
        SET object_id = ${sqlLiteral(verifiedObjectId)}
        WHERE job_id = ${sqlLiteral(jobId)}
          AND object_type = 'std_project'
          AND object_id = ${sqlLiteral(legacyObjectId)}
          AND readback_status = 'readback_verified';
      END $$;
      COMMIT;
    `, this.database);

    return queryJson(`
      SELECT jsonb_build_object(
        'status', 'reconciled',
        'created_object_count', (
          SELECT count(*) FROM mwb.created_objects
          WHERE job_id = ${sqlLiteral(jobId)} AND object_type = 'std_project'
        ),
        'verified_readback_count', (
          SELECT count(*) FROM mwb.readback_records
          WHERE job_id = ${sqlLiteral(jobId)}
            AND object_type = 'std_project'
            AND readback_status = 'readback_verified'
        ),
        'object_id_matches_verified', EXISTS (
          SELECT 1 FROM mwb.created_objects
          WHERE job_id = ${sqlLiteral(jobId)}
            AND object_type = 'std_project'
            AND object_id = ${sqlLiteral(verifiedObjectId)}
            AND created_object_id = ${sqlLiteral(correctedCreatedObjectId)}
        ),
        'readback_id_matches_verified', EXISTS (
          SELECT 1 FROM mwb.readback_records
          WHERE job_id = ${sqlLiteral(jobId)}
            AND object_type = 'std_project'
            AND object_id = ${sqlLiteral(verifiedObjectId)}
            AND readback_status = 'readback_verified'
        )
      )::text;
    `, this.database);
  }

  async deleteTestJobCascade(jobId) {
    assertId("job_id", jobId);
    await runPsql(`
      DO $$
      DECLARE
        job_usage text;
        job_case_id text;
      BEGIN
        SELECT source_usage, case_id INTO job_usage, job_case_id
        FROM mwb.launch_jobs
        WHERE job_id = ${sqlLiteral(jobId)};

        IF job_usage IS NULL THEN
          RETURN;
        END IF;

        IF job_usage <> 'test_run' THEN
          RAISE EXCEPTION 'refuse_delete_non_test_job:%', ${sqlLiteral(jobId)};
        END IF;

        DELETE FROM mwb.created_objects WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.platform_actions WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_confirmations WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.monitor_provision_attempts WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.monitor_provision_runs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_execution_plans WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.readback_records WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_drafts WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_skill_runs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_node_runs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.evidence_artifacts WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_jobs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.workflow_cases wc
        WHERE wc.case_id = job_case_id
          AND wc.source_usage = 'test_run'
          AND NOT EXISTS (SELECT 1 FROM mwb.launch_jobs j WHERE j.case_id = wc.case_id);
      END $$;
    `, this.database);
  }

  async deleteReadonlyReadinessSmokeJobCascade(jobId) {
    assertId("job_id", jobId);
    const bundle = await this.getLaunchJobBundle(jobId);
    if (!bundle?.job) throw new Error("job_not_found");
    if (bundle.job.source_usage !== "runtime_truth") throw new Error("smoke_cleanup_requires_runtime_truth_job");
    if (!String(bundle.job.source_record_ref || "").startsWith("smoke:readonly-readiness-cli:")) {
      throw new Error("refuse_delete_non_readonly_readiness_smoke_job");
    }
    const caseId = bundle.job.case_id;
    await runPsql(`
      DELETE FROM mwb.created_objects WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.platform_actions WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_confirmations WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.readback_records WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_drafts WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_execution_plans WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_skill_runs WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_node_runs WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.evidence_artifacts WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.launch_jobs WHERE job_id = ${sqlLiteral(jobId)};
      DELETE FROM mwb.workflow_cases wc
      WHERE wc.case_id = ${sqlLiteral(caseId)}
        AND wc.case_key LIKE 'smoke.%'
        AND NOT EXISTS (SELECT 1 FROM mwb.launch_jobs j WHERE j.case_id = wc.case_id);
    `, this.database);
  }

  async listTestRunJobs() {
    return queryJson(`
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'job_id', j.job_id,
        'job_status', j.job_status,
        'created_at', j.created_at,
        'node_runs', (SELECT count(*) FROM mwb.launch_node_runs n WHERE n.job_id = j.job_id),
        'skill_runs', (SELECT count(*) FROM mwb.launch_skill_runs sr WHERE sr.job_id = j.job_id),
        'drafts', (SELECT count(*) FROM mwb.launch_drafts d WHERE d.job_id = j.job_id),
        'evidence', (SELECT count(*) FROM mwb.evidence_artifacts e WHERE e.job_id = j.job_id),
        'platform_actions', (SELECT count(*) FROM mwb.platform_actions pa WHERE pa.job_id = j.job_id),
        'created_objects', (SELECT count(*) FROM mwb.created_objects co WHERE co.job_id = j.job_id)
      ) ORDER BY j.created_at), '[]'::jsonb)::text
      FROM mwb.launch_jobs j
      WHERE j.source_usage = 'test_run';
    `, this.database);
  }

  async deleteAllTestRunJobsCascade() {
    const jobs = await this.listTestRunJobs();
    for (const job of jobs) {
      await this.deleteTestJobCascade(job.job_id);
    }
    await runPsql(`
      DELETE FROM mwb.workflow_cases wc
      WHERE wc.source_usage = 'test_run'
        AND NOT EXISTS (SELECT 1 FROM mwb.launch_jobs j WHERE j.case_id = wc.case_id);
    `, this.database);
    return jobs;
  }

  async getCreateAttemptState(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT jsonb_build_object(
        'createActionCount', (
          SELECT count(*)
          FROM mwb.platform_actions
          WHERE job_id = ${sqlLiteral(jobId)}
            AND action_type = 'oceanengine_std_project_create'
        ),
        'confirmationCount', (
          SELECT count(*)
          FROM mwb.launch_confirmations
          WHERE job_id = ${sqlLiteral(jobId)}
        ),
        'createdObjectCount', (
          SELECT count(*)
          FROM mwb.created_objects
          WHERE job_id = ${sqlLiteral(jobId)}
        ),
        'realReadbackCount', (
          SELECT count(*)
          FROM mwb.readback_records
          WHERE job_id = ${sqlLiteral(jobId)}
            AND readback_status <> 'not_applicable'
            AND object_id <> 'NOT_APPLICABLE_DRY_RUN'
        ),
        'maxCreateAttemptNo', coalesce((
          SELECT max(attempt_no)
          FROM mwb.platform_actions
          WHERE job_id = ${sqlLiteral(jobId)}
            AND action_type = 'oceanengine_std_project_create'
        ), 0),
        'nextCreateAttemptNo', coalesce((
          SELECT max(attempt_no) + 1
          FROM mwb.platform_actions
          WHERE job_id = ${sqlLiteral(jobId)}
            AND action_type = 'oceanengine_std_project_create'
        ), 1),
        'maximumCreateAttempts', 3
      )::text;
    `, this.database);
  }

  async getCaseCreateVerificationSeriesState({ caseId, verificationSeriesId, maximumCreateAttempts = 3 } = {}) {
    assertId("case_id", caseId);
    assertId("verification_series_id", verificationSeriesId);
    const maximum = Number(maximumCreateAttempts || 3);
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3) {
      throw new Error("invalid_verification_series_maximum_create_attempts");
    }
    return queryJson(`
      WITH series_actions AS (
        SELECT pa.action_id, pa.job_id, pa.attempt_no, pa.action_status
        FROM mwb.platform_actions pa
        JOIN mwb.launch_jobs j ON j.job_id = pa.job_id
        WHERE j.case_id = ${sqlLiteral(caseId)}
          AND pa.action_type = 'oceanengine_std_project_create'
          AND pa.metadata->>'verification_series_id' = ${sqlLiteral(verificationSeriesId)}
      )
      SELECT jsonb_build_object(
        'caseId', ${sqlLiteral(caseId)},
        'verificationSeriesId', ${sqlLiteral(verificationSeriesId)},
        'createActionCount', (SELECT count(*) FROM series_actions),
        'maxCreateAttemptNo', coalesce((SELECT max(attempt_no) FROM series_actions), 0),
        'nextCreateAttemptNo', coalesce((SELECT count(*) + 1 FROM series_actions), 1),
        'maximumCreateAttempts', ${maximum},
        'createdObjectCount', (
          SELECT count(*)
          FROM mwb.created_objects co
          JOIN series_actions sa ON sa.action_id = co.action_id
          WHERE co.object_type = 'std_project'
        ),
        'readbackVerifiedCount', (
          SELECT count(*)
          FROM mwb.readback_records rb
          WHERE rb.job_id IN (SELECT DISTINCT job_id FROM series_actions)
            AND rb.object_type = 'std_project'
            AND rb.readback_status = 'readback_verified'
        ),
        'successfulActionCount', (
          SELECT count(*) FROM series_actions
          WHERE action_status = 'succeeded'
        )
      )::text;
    `, this.database);
  }

  async countNodeRuns(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT to_jsonb(count(*))::text
      FROM mwb.launch_node_runs
      WHERE job_id = ${sqlLiteral(jobId)};
    `, this.database);
  }

  async deleteSyntheticMonitorTestContext({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    if (!String(advertiserId).startsWith("899")) {
      throw new Error("refuse_delete_non_synthetic_monitor_test_context");
    }
    await runPsql(`
      DELETE FROM mwb.created_objects
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.platform_actions
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_confirmations
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.monitor_provision_attempts
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.monitor_provision_runs
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_execution_plans
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.readback_records
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_drafts
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_skill_runs
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_node_runs
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.evidence_artifacts
      WHERE job_id IN (
        SELECT job_id FROM mwb.launch_jobs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
          AND source_usage = 'test_run'
      );
      DELETE FROM mwb.launch_jobs
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND source_usage = 'test_run';
      DELETE FROM mwb.workflow_cases
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND source_usage = 'test_run'
        AND NOT EXISTS (
          SELECT 1 FROM mwb.launch_jobs j
          WHERE j.case_id = mwb.workflow_cases.case_id
        );
      DELETE FROM mwb.monitor_provision_attempts
      WHERE provision_id IN (
        SELECT provision_id
        FROM mwb.monitor_provision_runs
        WHERE route_id = ${sqlLiteral(routeId)}
          AND game_code = ${sqlLiteral(gameCode)}
          AND advertiser_id = ${sqlLiteral(advertiserId)}
      );
      DELETE FROM mwb.monitor_provision_runs
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)};
      DELETE FROM mwb.account_touchpoints
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)};
      DELETE FROM mwb.account_resources
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)};
      DELETE FROM mwb.advertiser_accounts
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)};
    `, this.database);
  }
}

export { sqlLiteral, sqlJson, sha256Hex };

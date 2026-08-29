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

  async getWorkflowCaseByKey(caseKey) {
    assertId("case_key", caseKey, /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/);
    return queryJson(`
      SELECT to_jsonb(wc)::text
      FROM mwb.workflow_cases wc
      WHERE wc.case_key = ${sqlLiteral(caseKey)}
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

  async listWorkflowCaseSummaries({ sourceUsage = "" } = {}) {
    if (sourceUsage) assertId("source_usage", sourceUsage);
    const sourceFilter = sourceUsage ? `WHERE summary.source_usage = ${sqlLiteral(sourceUsage)}` : "";
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

  async selectAdvertiserAwemeAuthorization({
    advertiserId,
    routeId,
    gameCode,
    selectedAwemeId,
    selectedDisplayName = ""
  }) {
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    const awemeId = assertId("selected_aweme_id", selectedAwemeId, /^[0-9]+$/);
    const displayName = String(selectedDisplayName || "").replace(/https?:\/\/\S+/gi, "[link]").trim().slice(0, 80);
    const existing = await queryJson(`
      SELECT to_jsonb(a.aweme_authorization)::text
      FROM mwb.advertiser_accounts a
      WHERE a.advertiser_id = ${sqlLiteral(advertiserId)}
        AND a.route_id = ${sqlLiteral(routeId)}
        AND a.game_code = ${sqlLiteral(gameCode)}
      LIMIT 1;
    `, this.database);
    const authorization = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
    const candidates = Array.isArray(authorization.active_candidates) ? authorization.active_candidates : [];
    const selected = candidates.find((candidate) => String(candidate?.aweme_id || "") === awemeId);
    if (!selected) throw new Error("aweme_selection_candidate_not_active");
    const updated = {
      ...authorization,
      selected_aweme_id: awemeId,
      selected_aweme_id_hash: `sha256:${sha256Hex(awemeId)}`,
      selected_display_name_summary: displayName || selected.display_name_summary || "",
      selection_status: "manual_selected",
      selection_source: "workbench_user_choice",
      selected_at: new Date().toISOString()
    };
    await this.updateAdvertiserAwemeAuthorization({
      advertiserId,
      routeId,
      gameCode,
      authorization: updated
    });
    return this.getAdvertiserAwemeAuthorizationReadiness({ routeId, gameCode, advertiserId });
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
        touchpoint_url = EXCLUDED.touchpoint_url,
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
    await runPsql(`
      UPDATE mwb.launch_execution_plans
      SET plan_status = 'stale',
          updated_at = now()
      WHERE job_id = ${sqlLiteral(plan.jobId)}
        AND plan_version < ${Number(plan.planVersion || 1)}
        AND plan_status IN ('blocked', 'planned', 'ready');

      INSERT INTO mwb.launch_execution_plans (
        plan_id,
        job_id,
        plan_version,
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
      ) VALUES (
        ${sqlLiteral(plan.planId)},
        ${sqlLiteral(plan.jobId)},
        ${Number(plan.planVersion || 1)},
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
      )
      ON CONFLICT (job_id, plan_version) DO UPDATE SET
        plan_status = EXCLUDED.plan_status,
        plan_hash = EXCLUDED.plan_hash,
        planned_actions = EXCLUDED.planned_actions,
        blocker_codes = EXCLUDED.blocker_codes,
        draft_id = EXCLUDED.draft_id,
        payload_hash = EXCLUDED.payload_hash,
        source_usage = EXCLUDED.source_usage,
        metadata = EXCLUDED.metadata,
        updated_at = now();
    `, this.database);
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

  async upsertLaunchConfirmation(confirmation) {
    assertId("confirmation_id", confirmation.confirmationId);
    assertId("job_id", confirmation.jobId);
    assertId("draft_id", confirmation.draftId);
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
        ${sqlLiteral(confirmation.draftId)},
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
        confirmation_status = EXCLUDED.confirmation_status,
        metadata = EXCLUDED.metadata,
        confirmed_at = EXCLUDED.confirmed_at;
    `, this.database);
  }

  async claimStdProjectCreateAction({ confirmation, action }) {
    assertId("confirmation_id", confirmation.confirmationId);
    assertId("action_id", action.actionId);
    assertId("job_id", action.jobId);
    const result = await queryJson(`
      WITH claimed AS (
        INSERT INTO mwb.platform_actions (
          action_id, job_id, confirmation_id, plan_id, action_type, endpoint, method,
          action_status, attempt_no, request_hash, response_hash, http_status,
          api_code, request_id_present, object_id_present, error_summary,
          request_id, error_category, offending_field_path, idempotency_key,
          request_field_manifest, response_summary, metadata, started_at, finished_at
        ) VALUES (
          ${sqlLiteral(action.actionId)}, ${sqlLiteral(action.jobId)}, ${sqlLiteral(action.confirmationId)},
          ${action.planId ? sqlLiteral(action.planId) : "NULL"},
          ${sqlLiteral(action.actionType)}, ${sqlLiteral(action.endpoint)}, ${sqlLiteral(action.method || "POST")},
          'started', ${Number(action.attemptNo || 1)}, ${sqlLiteral(action.requestHash || "")}, '', NULL,
          '', false, false, '', '', '', '', ${sqlLiteral(action.idempotencyKey || "")}, ${sqlJson({})}, ${sqlJson({})},
          ${sqlJson(action.metadata || {})}, now(), NULL
        )
        ON CONFLICT DO NOTHING
        RETURNING action_id
      ),
      confirmed AS (
        INSERT INTO mwb.launch_confirmations (
          confirmation_id, job_id, draft_id, object_type, object_name,
          payload_hash, confirmation_status, confirm_variable, confirmed_by,
          plan_id, metadata, confirmed_at
        )
        SELECT
          ${sqlLiteral(confirmation.confirmationId)}, ${sqlLiteral(confirmation.jobId)},
          ${sqlLiteral(confirmation.draftId)}, ${sqlLiteral(confirmation.objectType)},
          ${sqlLiteral(confirmation.objectName)}, ${sqlLiteral(confirmation.payloadHash)},
          ${sqlLiteral(confirmation.confirmationStatus)}, ${sqlLiteral(confirmation.confirmVariable)},
          ${sqlLiteral(confirmation.confirmedBy || "local_operator")},
          ${confirmation.planId ? sqlLiteral(confirmation.planId) : "NULL"},
          ${sqlJson(confirmation.metadata || {})}, now()
        FROM claimed
        ON CONFLICT (confirmation_id) DO UPDATE SET
          confirmation_status = EXCLUDED.confirmation_status,
          metadata = EXCLUDED.metadata,
          confirmed_at = EXCLUDED.confirmed_at
        RETURNING confirmation_id
      )
      SELECT to_jsonb(jsonb_build_object(
        'claimed', EXISTS (SELECT 1 FROM claimed),
        'confirmationRecorded', EXISTS (SELECT 1 FROM confirmed)
      ))::text;
    `, this.database);
    return result || { claimed: false, confirmationRecorded: false };
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
        ${action.confirmationId ? sqlLiteral(action.confirmationId) : "NULL"},
        ${action.planId ? sqlLiteral(action.planId) : "NULL"},
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
        plan_id = EXCLUDED.plan_id,
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

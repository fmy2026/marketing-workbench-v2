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

function assertId(name, value, pattern = /^[A-Za-z0-9_:\-.]+$/) {
  const text = String(value ?? "");
  if (!text || !pattern.test(text)) {
    throw new Error(`invalid_${name}`);
  }
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

  async latestJobId() {
    const result = await queryJson(`
      SELECT coalesce(
        (
          SELECT to_jsonb(j.job_id)
          FROM mwb.launch_jobs j
          WHERE j.source_usage = 'runtime_truth'
            AND j.job_status IN ('draft_ready', 'diagnosed', 'created_pending_readback', 'created', 'confirm_placeholder_recorded')
            AND NOT EXISTS (
              SELECT 1
              FROM mwb.platform_actions pa
              WHERE pa.job_id = j.job_id
                AND pa.action_type IN ('oceanengine_std_project_create', 'mock_oceanengine_std_project_create')
            )
            AND NOT EXISTS (
              SELECT 1
              FROM mwb.created_objects co
              WHERE co.job_id = j.job_id
            )
          ORDER BY
            CASE j.job_status
              WHEN 'draft_ready' THEN 1
              WHEN 'confirm_placeholder_recorded' THEN 2
              WHEN 'diagnosed' THEN 3
              WHEN 'created_pending_readback' THEN 4
              WHEN 'created' THEN 5
              ELSE 9
            END,
            j.updated_at DESC,
            j.created_at DESC
          LIMIT 1
        ),
        (
          SELECT to_jsonb(j.job_id)
          FROM mwb.launch_jobs j
          WHERE j.source_usage = 'runtime_truth'
            AND EXISTS (
              SELECT 1
              FROM mwb.platform_actions pa
              WHERE pa.job_id = j.job_id
            )
          ORDER BY j.updated_at DESC, j.created_at DESC
          LIMIT 1
        ),
        (
          SELECT to_jsonb(job_id)
          FROM mwb.launch_jobs
          WHERE source_usage <> 'test_run'
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        ),
        to_jsonb('JOB-MWBV2-DEMO-001'::text)
      )::text;
    `, this.database);
    return result;
  }

  async latestTestJobId() {
    const result = await queryJson(`
      SELECT coalesce(
        (
          SELECT to_jsonb(job_id)
          FROM mwb.launch_jobs
          WHERE source_usage = 'test_run'
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        ),
        to_jsonb(''::text)
      )::text;
    `, this.database);
    return result;
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

  async getLaunchJobBundle(jobId) {
    assertId("job_id", jobId);
    return queryJson(`
      SELECT jsonb_build_object(
        'job', to_jsonb(j),
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
            'endpoint', pa.endpoint,
            'action_status', pa.action_status,
            'http_status', pa.http_status,
            'api_code', pa.api_code,
            'request_id_present', pa.request_id_present,
            'request_id_recorded', (pa.request_id <> ''),
            'object_id_present', pa.object_id_present,
            'error_summary', pa.error_summary,
            'platform_error_message_safe', pa.platform_error_message_safe,
            'platform_error_field', pa.platform_error_field,
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
      JOIN mwb.platform_routes r ON r.route_id = j.route_id
      JOIN mwb.games g ON g.game_code = j.game_code
      JOIN mwb.advertiser_accounts a ON a.advertiser_id = j.advertiser_id
      WHERE j.job_id = ${sqlLiteral(jobId)}
      LIMIT 1;
    `, this.database);
  }

  async getOccupiedProjectNames({ routeId, gameCode, advertiserId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);

    return queryJson(`
      SELECT coalesce(jsonb_agg(project_name ORDER BY project_name), '[]'::jsonb)::text
      FROM (
        SELECT d.project_name
        FROM mwb.launch_drafts d
        JOIN mwb.launch_jobs j ON j.job_id = d.job_id
        WHERE j.route_id = ${sqlLiteral(routeId)}
          AND j.game_code = ${sqlLiteral(gameCode)}
          AND j.advertiser_id = ${sqlLiteral(advertiserId)}
          AND j.source_usage = 'runtime_truth'
          AND (
            coalesce(j.source_record_ref, '') <> 'api:intake:97f20040f3d3d423'
            OR EXISTS (
              SELECT 1
              FROM mwb.platform_actions pa
              WHERE pa.job_id = j.job_id
            )
            OR EXISTS (
              SELECT 1
              FROM mwb.created_objects co
              WHERE co.job_id = j.job_id
            )
          )
        UNION
        SELECT r.object_name AS project_name
        FROM mwb.readback_records r
        JOIN mwb.launch_jobs j ON j.job_id = r.job_id
        WHERE j.route_id = ${sqlLiteral(routeId)}
          AND j.game_code = ${sqlLiteral(gameCode)}
          AND j.advertiser_id = ${sqlLiteral(advertiserId)}
          AND j.source_usage = 'runtime_truth'
          AND (
            coalesce(j.source_record_ref, '') <> 'api:intake:97f20040f3d3d423'
            OR EXISTS (
              SELECT 1
              FROM mwb.platform_actions pa
              WHERE pa.job_id = j.job_id
            )
            OR EXISTS (
              SELECT 1
              FROM mwb.created_objects co
              WHERE co.job_id = j.job_id
            )
          )
      ) occupied
      WHERE project_name IS NOT NULL
        AND project_name <> '';
    `, this.database);
  }

  async getTouchpointVerification({ routeId, gameCode, advertiserId, monitorId }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
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
    return {
      status: row.status || "unknown",
      touchpointRef: row.touchpoint_ref || "",
      storedUrlHash: row.url_hash || "",
      computedUrlHash,
      touchpointUrlPresent: Boolean(touchpointUrl),
      urlHashMatches: Boolean(touchpointUrl && row.url_hash && computedUrlHash === row.url_hash)
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

  async createLaunchJob({ jobId, routeId, gameCode, advertiserId, objectType, sourceRecordRef, sourceUsage = "runtime_truth" }) {
    assertId("job_id", jobId);
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("object_type", objectType);

    await runPsql(`
      INSERT INTO mwb.launch_jobs (
        job_id,
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
        source_usage = EXCLUDED.source_usage,
        started_at = coalesce(mwb.launch_skill_runs.started_at, EXCLUDED.started_at),
        finished_at = EXCLUDED.finished_at;
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

  async updateAccountResourceReadonly({ routeId, gameCode, advertiserId, resourceType, visibilityStatus, readbackStatus, platformResourceId, metadata, resourceMetadata }) {
    assertId("route_id", routeId);
    assertId("game_code", gameCode);
    assertId("advertiser_id", advertiserId, /^[0-9A-Za-z_\-.]+$/);
    assertId("resource_type", resourceType);

    await runPsql(`
      UPDATE mwb.account_resources
      SET visibility_status = coalesce(nullif(${sqlLiteral(visibilityStatus || "")}, ''), visibility_status),
          readback_status = coalesce(nullif(${sqlLiteral(readbackStatus || "")}, ''), readback_status),
          platform_resource_id = coalesce(nullif(${sqlLiteral(platformResourceId || "")}, ''), platform_resource_id),
          metadata = metadata || jsonb_build_object('readonly_check', ${sqlJson(metadata || {})}) || ${sqlJson(resourceMetadata || {})},
          updated_at = now()
      WHERE route_id = ${sqlLiteral(routeId)}
        AND game_code = ${sqlLiteral(gameCode)}
        AND advertiser_id = ${sqlLiteral(advertiserId)}
        AND resource_type = ${sqlLiteral(resourceType)};
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
        ${sqlJson(confirmation.metadata || {})},
        now()
      )
      ON CONFLICT (confirmation_id) DO UPDATE SET
        confirmation_status = EXCLUDED.confirmation_status,
        metadata = EXCLUDED.metadata,
        confirmed_at = EXCLUDED.confirmed_at;
    `, this.database);
  }

  async upsertPlatformAction(action) {
    assertId("action_id", action.actionId);
    assertId("job_id", action.jobId);
    await runPsql(`
      INSERT INTO mwb.platform_actions (
        action_id,
        job_id,
        confirmation_id,
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
        platform_error_message_safe,
        platform_error_field,
        request_field_manifest,
        response_summary,
        metadata,
        started_at,
        finished_at
      ) VALUES (
        ${sqlLiteral(action.actionId)},
        ${sqlLiteral(action.jobId)},
        ${action.confirmationId ? sqlLiteral(action.confirmationId) : "NULL"},
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
        ${sqlLiteral(action.platformErrorMessageSafe || "")},
        ${sqlLiteral(action.platformErrorField || "")},
        ${sqlJson(action.requestFieldManifest || {})},
        ${sqlJson(action.responseSummary || {})},
        ${sqlJson(action.metadata || {})},
        ${action.startedAt ? `${sqlLiteral(action.startedAt)}::timestamptz` : "now()"},
        ${action.finishedAt ? `${sqlLiteral(action.finishedAt)}::timestamptz` : "NULL"}
      )
      ON CONFLICT (action_id) DO UPDATE SET
        action_status = EXCLUDED.action_status,
        request_hash = EXCLUDED.request_hash,
        response_hash = EXCLUDED.response_hash,
        http_status = EXCLUDED.http_status,
        api_code = EXCLUDED.api_code,
        request_id_present = EXCLUDED.request_id_present,
        object_id_present = EXCLUDED.object_id_present,
        error_summary = EXCLUDED.error_summary,
        request_id = EXCLUDED.request_id,
        platform_error_message_safe = EXCLUDED.platform_error_message_safe,
        platform_error_field = EXCLUDED.platform_error_field,
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
      BEGIN
        SELECT source_usage INTO job_usage
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
        DELETE FROM mwb.readback_records WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_drafts WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_skill_runs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_node_runs WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.evidence_artifacts WHERE job_id = ${sqlLiteral(jobId)};
        DELETE FROM mwb.launch_jobs WHERE job_id = ${sqlLiteral(jobId)};
      END $$;
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
}

export { sqlLiteral, sqlJson, sha256Hex };

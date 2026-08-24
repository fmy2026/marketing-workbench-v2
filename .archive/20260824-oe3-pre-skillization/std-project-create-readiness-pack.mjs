import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { PostgresRepository, sqlJson, sqlLiteral } from "../src/repositories/postgresRepository.mjs";
import { evaluateStdProjectPayloadContract, stablePayloadHash } from "../src/platforms/oceanengineStdProjectPayloadContract.mjs";

const LOCKED_OLD_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");

const repo = new PostgresRepository();

function targetJobIdFromArgs(argv = process.argv.slice(2)) {
  const flagIndex = argv.findIndex((item) => item === "--job-id");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  const inline = argv.find((item) => item.startsWith("--job-id="));
  if (inline) return inline.slice("--job-id=".length);
  return process.env.MWBV2_TARGET_JOB_ID || "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSensitiveLeak(value) {
  const text = JSON.stringify(value);
  [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ].forEach((pattern) => {
    if (pattern.test(text)) throw new Error(`sensitive leak matched ${pattern}`);
  });
}

async function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-X",
      "-d",
      "marketing_workbench_v2",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      String(sql).replace(/\s+/g, " ").trim()
    ], { stdio: ["ignore", "pipe", "pipe"] });
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
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `psql exited with ${code}`));
    });
  });
}

async function psqlJson(sql) {
  const output = await psql(`COPY (${sql}) TO STDOUT;`);
  return JSON.parse(output.trim() || "null");
}

function resource(bundle, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

function node(bundle, key) {
  return (bundle.nodes || []).find((item) => item.node_key === key) || {};
}

function resourceMetadata(bundle, type) {
  return resource(bundle, type).metadata || {};
}

function resourceReady(item = {}) {
  return item.visibility_status === "visible" && item.readback_status === "readback_verified";
}

function protectedAttemptPath(jobId) {
  return path.join(PROJECT_ROOT, ".local", `std-project-create-attempt-${jobId}.json`);
}

async function protectedCounts(jobId) {
  return psqlJson(`
    SELECT jsonb_build_object(
      'jobStatus', job_status,
      'currentNode', current_node,
      'platformActions', (
        SELECT count(*)
        FROM mwb.platform_actions
        WHERE job_id = ${sqlLiteral(jobId)}
      ),
      'createdObjects', (
        SELECT count(*)
        FROM mwb.created_objects
        WHERE job_id = ${sqlLiteral(jobId)}
      )
    )::text
    FROM mwb.launch_jobs
    WHERE job_id = ${sqlLiteral(jobId)}
  `);
}

function gateStatuses(bundle) {
  const accountGate = node(bundle, "account_resource_prepare").output_summary?.oe3BrandEventReadonlyGate || {};
  const createGate = node(bundle, "std_project_create_executor").output_summary?.oe3BrandEventReadonlyGate || {};
  const repairGate = node(bundle, "account_resource_prepare").output_summary?.oe3BrandIndustryRepair || {};
  const accountChecks = node(bundle, "account_resource_prepare").output_summary?.checks || [];
  const brandMetadata = resourceMetadata(bundle, "brand_info");
  const statusMap = {
    ...(accountGate.gateStatuses || {}),
    ...(createGate.gateStatuses || {})
  };
  const checkStatus = (key) => accountChecks.find((item) => item.key === key)?.status || "";
  const checkPassed = (key) => ["passed", "passed_by_manual_confirmation"].includes(checkStatus(key));
  const brandIndustryStatus = repairGate.brandIndustryStatus ||
    (brandMetadata.oe3_brand_industry_repair?.status === "passed" ? "passed" : "") ||
    (brandMetadata.std_project_create_readiness?.brand_industry_status === "passed" ? "passed" : "") ||
    (brandMetadata.brand_info_official?.live_brand_industry_status === "passed" ? "passed" : "") ||
    (checkPassed("platform_brand_info") ? "passed" : "") ||
    statusMap.brand_industry ||
    "not_run";
  const eventGateKeys = ["event_asset_detail", "available_events", "event_configs", "optimized_goal", "dbt"];
  const eventChainStatus = eventGateKeys.every((key) => statusMap[key] === "passed") ||
    (resource(bundle, "event_asset").metadata?.std_project_create_readiness?.event_chain_status === "passed") ||
    (checkPassed("platform_event_asset") && resourceReady(resource(bundle, "event_asset")))
    ? "passed"
    : "blocked";
  return {
    overall: repairGate.status || accountGate.status || createGate.status || "not_run",
    brandIndustryStatus,
    brandFuzzyStatus: repairGate.brandFuzzyStatus || statusMap.brand_fuzzy || (checkPassed("platform_brand_info") ? "passed" : "not_run"),
    eventChainStatus,
    evidenceRefs: [
      ...new Set([
        ...((accountGate.evidenceRefs || [])),
        ...((createGate.evidenceRefs || [])),
        ...((repairGate.evidenceRefs || []))
      ])
    ],
    brandIndustryConclusion: repairGate.conclusion || ""
  };
}

function payloadContractStatus(bundle, touchpointVerification) {
  const contract = evaluateStdProjectPayloadContract({
    bundle,
    draft: bundle.draft,
    touchpointVerification
  });
  const expectedPayloadHash = bundle.draft?.payload_summary
    ? stablePayloadHash(bundle.draft.payload_summary)
    : "";
  return {
    status: contract.status,
    summary: contract.summary,
    checks: contract.checks.map((check) => ({ key: check.key, status: check.status, summary: check.summary })),
    gaps: contract.gaps,
    expectedPayloadHash,
    payloadHashStable: Boolean(expectedPayloadHash && expectedPayloadHash === bundle.draft?.payload_hash)
  };
}

function buildReadiness({ bundle, counts, touchpointVerification, contract }) {
  const gates = gateStatuses(bundle);
  const requiredTypes = ["avatar", "dmp_audience_package", "event_asset", "video_asset", "product_image", "brand_info", "micro_app_instance"];
  const resources = Object.fromEntries(requiredTypes.map((type) => {
    const item = resource(bundle, type);
    const status = type === "brand_info" && gates.brandIndustryStatus !== "passed" ? "blocked" : (resourceReady(item) ? "passed" : "blocked");
    return [type, {
      status,
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      nextAction: type === "brand_info" && status !== "passed" ? "修 brand_industry fresh readback" : (status === "passed" ? "无需动作" : "补齐资源或只读回查")
    }];
  }));
  const resourceBlockers = Object.entries(resources)
    .filter(([, item]) => item.status !== "passed")
    .map(([type]) => type);
  const attemptFilePresent = existsSync(protectedAttemptPath(bundle.job.job_id));
  const platformActions = Number(counts.platformActions || 0);
  const createdObjects = Number(counts.createdObjects || 0);
  const blockerSet = new Set([
    ...(gates.brandIndustryStatus !== "passed" ? ["brand_industry_readback_blocked"] : []),
    ...(platformActions > 0 || attemptFilePresent ? ["single_create_attempt_already_recorded"] : []),
    ...(resourceBlockers.filter((type) => type !== "brand_info").map((type) => `resource_${type}_blocked`)),
    ...(contract.status !== "passed" ? ["payload_contract_blocked"] : []),
    ...(bundle.draft?.duplicate_status !== "platform_not_duplicate" ? ["duplicate_check_not_platform_not_duplicate"] : [])
  ]);
  const status = platformActions > 0 || attemptFilePresent
    ? "blocked_after_single_create_failure"
    : gates.brandIndustryStatus !== "passed"
      ? "blocked_brand_industry"
      : blockerSet.size
        ? "new_runtime_job_required"
        : "ready_for_user_create_confirmation";
  const canCreateCurrentJob = status === "ready_for_user_create_confirmation";
  const nextAction = status === "blocked_after_single_create_failure"
    ? (gates.brandIndustryStatus === "passed"
      ? "当前 job 已记录一次 create action，禁止重试；下一步新建 fresh runtime job 或开启单次创建确认任务。"
      : "当前 job 已记录一次 create action，禁止重试；修完 brand_industry 后新建 fresh runtime job 或开启单次创建确认任务。")
    : status === "blocked_brand_industry"
      ? "先修 brand_industry fresh readback，再生成新的创建确认任务。"
      : status === "ready_for_user_create_confirmation"
        ? "创建前只读 gate 已通过；等待用户单次创建确认任务。"
        : "需要新建 fresh runtime job 后重新跑创建前 gate。";
  const uniqueBlocker = canCreateCurrentJob
    ? "无"
    : status === "blocked_after_single_create_failure"
      ? (gates.brandIndustryStatus === "passed"
        ? "当前 job 已有单次 create attempt，不能重试"
        : "当前 job 已有单次 create attempt，不能重试；brand_industry 仍未通过")
      : status === "blocked_brand_industry"
        ? "brand_industry fresh readback 未通过"
        : [...blockerSet].join("；");

  return {
    status,
    statusLabel: {
      blocked_brand_industry: "brand_industry 阻断",
      blocked_after_single_create_failure: "单次创建失败后锁定",
      ready_for_user_create_confirmation: "可等待创建确认",
      new_runtime_job_required: "需要新的 runtime job"
    }[status] || status,
    targetJobId: bundle.job.job_id,
    canCreateCurrentJob,
    targetJobReusable: canCreateCurrentJob,
    retryAllowed: false,
    nextConfirmationRequired: canCreateCurrentJob,
    platformActions,
    createdObjects,
    attemptFilePresent,
    currentJobStatus: bundle.job.job_status,
    currentNode: bundle.job.current_node,
    duplicateStatus: bundle.draft?.duplicate_status || "not_generated",
    payloadContractStatus: contract.status,
    payloadHashStable: contract.payloadHashStable,
    brandIndustryStatus: gates.brandIndustryStatus,
    brandFuzzyStatus: gates.brandFuzzyStatus,
    eventChainStatus: gates.eventChainStatus,
    brandIndustryConclusion: gates.brandIndustryConclusion,
    touchpoint: {
      touchpointRef: bundle.touchpoint?.touchpoint_ref || "",
      urlHash: bundle.touchpoint?.url_hash || "",
      status: bundle.touchpoint?.status || "missing",
      urlHashMatches: Boolean(touchpointVerification.urlHashMatches)
    },
    platformApp: {
      appIdPresent: Boolean(bundle.platformApp?.app_id),
      appType: bundle.platformApp?.app_type || ""
    },
    resources,
    nodeStatuses: Object.fromEntries((bundle.nodes || []).map((item) => [item.node_key, item.status])),
    blockers: [...blockerSet],
    uniqueBlocker,
    nextAction,
    evidenceRefs: gates.evidenceRefs,
    noPlatformWrite: true,
    noTokenRefresh: true
  };
}

function evidenceSummary(readiness) {
  return [
    `create_readiness_status=${readiness.status}`,
    `can_create_current_job=${readiness.canCreateCurrentJob}`,
    `retry_allowed=${readiness.retryAllowed}`,
    `platform_actions=${readiness.platformActions}`,
    `created_objects=${readiness.createdObjects}`,
    `attempt_file_present=${readiness.attemptFilePresent}`,
    `brand_industry=${readiness.brandIndustryStatus}`,
    `event_chain=${readiness.eventChainStatus}`,
    `payload_contract=${readiness.payloadContractStatus}`,
    `duplicate_status=${readiness.duplicateStatus}`,
    `blockers=${readiness.blockers.join(",") || "none"}`
  ].join("; ");
}

async function updateResources(bundle, readiness) {
  await psql(`
    UPDATE mwb.account_resources
    SET metadata = metadata || jsonb_build_object(
          'readonly_check', (coalesce(metadata->'readonly_check', '{}'::jsonb) || ${sqlJson({
            key: "std_project_create_readiness_pack",
            status: readiness.brandIndustryStatus === "passed" ? "passed" : "blocked",
            gate_focus: "brand_info",
            next_action: readiness.brandIndustryStatus === "passed" ? "无需动作" : "修 brand_industry fresh readback",
            checked_at: new Date().toISOString()
          })}::jsonb),
          'std_project_create_readiness', ${sqlJson({
            status: readiness.status,
            brand_industry_status: readiness.brandIndustryStatus,
            next_action: readiness.brandIndustryStatus === "passed" ? "无需动作" : "修 brand_industry fresh readback"
          })}::jsonb,
          'brand_info_official', (
            coalesce(metadata->'brand_info_official', '{}'::jsonb) || ${sqlJson({
              live_brand_industry_status: readiness.brandIndustryStatus,
              current_hard_gate_status: readiness.brandIndustryStatus,
              current_hard_gate_source: "std_project_create_readiness_pack"
            })}::jsonb
          )
        ),
        updated_at = now()
    WHERE route_id = ${sqlLiteral(bundle.job.route_id)}
      AND game_code = ${sqlLiteral(bundle.job.game_code)}
      AND advertiser_id = ${sqlLiteral(bundle.job.advertiser_id)}
      AND resource_type = 'brand_info';
  `);
  await psql(`
    UPDATE mwb.account_resources
    SET metadata = metadata || jsonb_build_object(
          'std_project_create_readiness', ${sqlJson({
            status: readiness.eventChainStatus,
            event_chain_status: readiness.eventChainStatus,
            next_action: readiness.eventChainStatus === "passed" ? "无需动作" : "补事件链配置或修只读参数"
          })}::jsonb
        ),
        updated_at = now()
    WHERE route_id = ${sqlLiteral(bundle.job.route_id)}
      AND game_code = ${sqlLiteral(bundle.job.game_code)}
      AND advertiser_id = ${sqlLiteral(bundle.job.advertiser_id)}
      AND resource_type = 'event_asset';
  `);
}

async function updateNodeOutputs(jobId, readiness, evidenceRef) {
  const ready = readiness.status === "ready_for_user_create_confirmation";
  await psql(`
    UPDATE mwb.launch_node_runs
    SET output_summary = output_summary || jsonb_build_object(
          'hardGateStatus', ${sqlLiteral(readiness.brandIndustryStatus === "passed" ? readiness.eventChainStatus : "blocked")},
          'blockedResourceTypes', ${sqlJson(readiness.blockers.includes("brand_industry_readback_blocked") ? ["brand_info"] : [])}::jsonb,
          'createReadiness', ${sqlJson({
            status: readiness.status,
            statusLabel: readiness.statusLabel,
            canCreateCurrentJob: readiness.canCreateCurrentJob,
            targetJobReusable: readiness.targetJobReusable,
            retryAllowed: readiness.retryAllowed,
            nextConfirmationRequired: readiness.nextConfirmationRequired,
            brandIndustryStatus: readiness.brandIndustryStatus,
            eventChainStatus: readiness.eventChainStatus,
            payloadContractStatus: readiness.payloadContractStatus,
            payloadHashStable: readiness.payloadHashStable,
            duplicateStatus: readiness.duplicateStatus,
            platformActions: readiness.platformActions,
            createdObjects: readiness.createdObjects,
            blockers: readiness.blockers,
            uniqueBlocker: readiness.uniqueBlocker,
            nextAction: readiness.nextAction,
            evidenceRef
          })}::jsonb
        )
    WHERE job_id = ${sqlLiteral(jobId)}
      AND node_key = 'account_resource_prepare';
  `);
  await psql(`
    UPDATE mwb.launch_node_runs
    SET output_summary = output_summary || jsonb_build_object(
          'createNodeStatus', ${sqlLiteral(readiness.status)},
          'nextConfirmationRequired', ${ready ? "true" : "false"},
          'retry_allowed', false,
          'blockedReasons', ${sqlJson(readiness.blockers)}::jsonb,
          'createReadiness', ${sqlJson({
            status: readiness.status,
            statusLabel: readiness.statusLabel,
            canCreateCurrentJob: readiness.canCreateCurrentJob,
            targetJobReusable: readiness.targetJobReusable,
            retryAllowed: readiness.retryAllowed,
            nextConfirmationRequired: readiness.nextConfirmationRequired,
            brandIndustryStatus: readiness.brandIndustryStatus,
            eventChainStatus: readiness.eventChainStatus,
            payloadContractStatus: readiness.payloadContractStatus,
            payloadHashStable: readiness.payloadHashStable,
            duplicateStatus: readiness.duplicateStatus,
            platformActions: readiness.platformActions,
            createdObjects: readiness.createdObjects,
            blockers: readiness.blockers,
            uniqueBlocker: readiness.uniqueBlocker,
            nextAction: readiness.nextAction,
            evidenceRef
          })}::jsonb
        )
    WHERE job_id = ${sqlLiteral(jobId)}
      AND node_key = 'std_project_create_executor';
  `);
}

export async function runReadiness({ jobId } = {}) {
  const targetJobId = jobId || targetJobIdFromArgs() || await repo.latestJobId();
  const before = await protectedCounts(targetJobId);
  const bundle = await repo.getLaunchJobBundle(targetJobId);
  assert(bundle?.job?.job_id === targetJobId, "target_job_not_found");
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account?.monitor_id || bundle.touchpoint?.monitor_id || ""
  });
  const contract = payloadContractStatus(bundle, touchpointVerification);
  const readiness = buildReadiness({ bundle, counts: before, touchpointVerification, contract });
  assertNoSensitiveLeak(readiness);

  const evidenceRef = `EV-${targetJobId}-STD-PROJECT-CREATE-READINESS-PACK`;
  const summary = evidenceSummary(readiness);
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: targetJobId,
    artifactType: "std_project_create_readiness_pack",
    title: "std_project 创建前最终 readiness packet",
    summary,
    contentHash: `sha256:${sha256(JSON.stringify(readiness))}`,
    storageRef: `postgres:mwb.evidence_artifacts/${evidenceRef}`,
    sourceRef: "v2:scripts/std-project-create-readiness-pack.mjs",
    sourceUsage: "runtime_truth"
  });
  if (bundle.job.source_usage !== "test_run") {
    await updateResources(bundle, readiness);
  }
  await updateNodeOutputs(targetJobId, readiness, evidenceRef);

  const after = await protectedCounts(targetJobId);
  assert(before.jobStatus === after.jobStatus, "target job_status changed");
  assert(before.currentNode === after.currentNode, "target current_node changed");
  assert(before.platformActions === after.platformActions, "platform_actions changed");
  assert(before.createdObjects === after.createdObjects, "created_objects changed");
  if (targetJobId === LOCKED_OLD_JOB_ID) {
    assert(after.platformActions === 1, "locked old job platform_actions count mismatch");
    assert(after.createdObjects === 0, "locked old job created_objects count mismatch");
  }

  const result = {
    ...readiness,
    evidenceRef,
    targetJobStatus: after.jobStatus,
    targetCurrentNode: after.currentNode
  };
  assertNoSensitiveLeak(result);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const result = await runReadiness();
  console.log(JSON.stringify(result, null, 2));
}

import {
  OE3_SKILL_DEFINITIONS,
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  recordSkillRun,
  sanitizeForPublic,
  skillDefinition
} from "./00-contracts.mjs";
import { cachedReadonlyFromBundle, runContextSkill } from "./02-context-resolvers.mjs";
import { evaluateStdProjectCreatePreflight } from "./05-create-preflight-diagnostics.mjs";
import { runCreateOnceSkill } from "./06-create-once.mjs";
import { runDuplicateReadonlyCheck } from "./05-duplicate-readonly.mjs";
import {
  runDmpBaselineResolveSkill,
  runDmpPushPlanSkill,
  runDmpReadonlyGate,
  runDmpSourceReadonlyVerifySkill,
  runDmpTargetReadonlyVerifySkill
} from "./04-dmp-readonly.mjs";
import { runLaunchPackSkill } from "./03-launch-pack.mjs";
import { runMonitorWorkflowSkill } from "./02-monitor/index.mjs";
import {
  applyDraftToBundle,
  buildSkillDraft,
  evaluateOe3PayloadContract
} from "./05-payload-contract.mjs";
import { runReadbackSkill } from "./07-readback.mjs";
import {
  createNodeStatusFromSkill,
  readbackNodeStatusFromSkill,
  workflowJobUpdateFromSkillResults,
  workflowNoRealPlatformWrite
} from "./00-result-mapping.mjs";
import { WORKFLOW_NODES, getWorkflowNode } from "./00-workflow-node-registry.mjs";
import {
  normalizeResourceSkillResult
} from "./04-resource-action-registry.mjs";
import {
  brandIndustryPassed,
  eventChainPassed,
  mockReadyBundle,
  runResourceVerifier,
  withDmpCustomAudienceIds
} from "./04-resource-verifiers.mjs";
import {
  eventChainResourceReadiness,
  runMicroAppInstanceAuthorityReadonlySkill,
  runEventChainReadonlySkill
} from "./04-event-chain-readiness.mjs";
import { runPlatformReadonlyReconcileSkill } from "./04-platform-readonly-reconcile.mjs";
import { runResourceBlueprintBootstrapSkill } from "./04-resource-blueprint-bootstrap.mjs";
import { runAvatarSourcePrepareSkill } from "./04-avatar-source-prepare.mjs";
import { runAvatarSubmitPlanSkill } from "./04-avatar-submit-plan.mjs";
import { runAwemeAuthorizationReadonlySkill } from "./04-aweme-authorization-readonly.mjs";
import { runBackupLandingPageSourcePrepareSkill } from "./04-backup-landing-page-source-prepare.mjs";
import { runProductImageSourcePrepareSkill } from "./04-product-image-source-prepare.mjs";
import { runVideoMaterialBindPlanSkill } from "./04-video-material-bind-plan.mjs";
import { runBackupLandingPageMaterialInventorySkill } from "./04-backup-landing-page-material-inventory.mjs";
import { runVideoMaterialReadonlyGate } from "./04-video-material-readiness.mjs";
import { runIntakeNormalizeSkill } from "./01-intake-normalize.mjs";
import { compileAndSaveExecutionPlan, evaluateConfirmedPlanDraftDerivation } from "../../executionPlan.mjs";
import { runConfirmedResourceOrchestratorSkill } from "./05-confirmed-resource-orchestrator.mjs";

export const OE3_WORKFLOW_MODES = new Set(["dry_run", "draft_readiness", "execute_once", "readback_only", "planned_actions", "aweme_auth_readonly"]);

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "locked", "failed", "mock_passed", "skipped"]);
const MONITOR_SKILLS = new Set(["monitor-state-read", "monitor-readonly-reconcile", "monitor-plan-compile", "monitor-execute-once", "monitor-readback"]);
const CONTEXT_SKILLS = new Set(["context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]);
const LAUNCH_PACK_SKILLS = new Set([
  "launch-pack-resolve-game",
  "launch-pack-resolve-defaults",
  "launch-pack-resolve-materials",
  "launch-pack-resolve-backup-landing-page",
  "launch-pack-resolve-resource-blueprints"
]);
const DMP_SKILLS = new Set([
  "dmp-baseline-resolve",
  "dmp-source-readonly-verify",
  "dmp-target-readonly-verify",
  "dmp-push-plan"
]);
const RESOURCE_PREP_CONTRACT_SKILLS = new Set([
  "product-image-source-prepare",
  "backup-landing-page-source-prepare"
]);

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
  const node = getWorkflowNode(nodeKey);
  return {
    ...node,
    status,
    summary,
    diagnosticLevel,
    outputSummary: sanitizeForPublic(outputSummary),
    evidenceRefs,
    started: status !== "waiting",
    finished: TERMINAL_STATUSES.has(status)
  };
}

function output(context, key) {
  return context.skillOutputs.get(key) || {};
}

function dependencyStatuses(context, definition) {
  return Object.fromEntries(definition.dependsOn.map((key) => [key, output(context, key).status || "waiting"]));
}

function resourceSkillKey(type) {
  return `resource-verify-${type.replace(/_/g, "-")}`;
}

function skillsForMode(mode) {
  if (mode === "readback_only") return ["readback-std-project"];
  if (mode === "aweme_auth_readonly") {
    return [
      "intake-normalize",
      "context-resolve-account",
      "launch-pack-resolve-game",
      "launch-pack-resolve-defaults",
      "aweme-authorization-readonly"
    ];
  }
  // Node 02's normal workflow is state-only. Fresh reconcile and the confirmed
  // bootstrap executor are separately Gate/Plan-bound, so a generic runner mode
  // can never create a monitor as a side effect.
  const monitorDryRun = ["monitor-state-read"];
  const monitorPlannedActions = ["monitor-state-read"];
  if (mode === "planned_actions") {
    return [
      "intake-normalize",
      ...monitorPlannedActions,
      "context-resolve-account",
      "context-resolve-touchpoint",
      "context-resolve-platform-app",
      "launch-pack-resolve-game",
      "launch-pack-resolve-defaults",
      "launch-pack-resolve-materials",
      "launch-pack-resolve-backup-landing-page",
      "launch-pack-resolve-resource-blueprints",
      "resource-bootstrap-from-blueprints",
      "aweme-authorization-readonly",
      "avatar-source-prepare",
      "resource-live-readonly-reconcile",
      "backup-landing-page-material-inventory",
      "avatar-submit-plan",
      "dmp-baseline-resolve",
      "dmp-source-readonly-verify",
      "dmp-target-readonly-verify",
      "dmp-push-plan",
      "video-material-bind-plan",
      "product-image-source-prepare",
      "event-chain-readonly",
      "backup-landing-page-source-prepare",
      ...OE3_REQUIRED_RESOURCE_TYPES.map(resourceSkillKey)
    ];
  }
  const readinessBase = [
    "intake-normalize",
    ...monitorDryRun,
    "context-resolve-account",
    "context-resolve-touchpoint",
    "context-resolve-platform-app",
    "launch-pack-resolve-game",
    "launch-pack-resolve-defaults",
    "launch-pack-resolve-materials",
    "launch-pack-resolve-backup-landing-page",
    "launch-pack-resolve-resource-blueprints",
    "resource-bootstrap-from-blueprints",
    "aweme-authorization-readonly",
    "avatar-source-prepare",
    "resource-live-readonly-reconcile",
    "backup-landing-page-material-inventory",
    "avatar-submit-plan",
    "dmp-baseline-resolve",
    "dmp-source-readonly-verify",
    "dmp-target-readonly-verify",
    "dmp-push-plan",
    "video-material-bind-plan",
    "product-image-source-prepare",
    "event-chain-readonly",
    "backup-landing-page-source-prepare",
    ...OE3_REQUIRED_RESOURCE_TYPES.map(resourceSkillKey)
  ];
  const draftAndReadiness = [
    "payload-build",
    "payload-contract",
    "duplicate-check",
    "create-readiness"
  ];
  if (mode === "execute_once") {
    return [
      ...readinessBase,
      "confirmed-resource-orchestrator",
      ...draftAndReadiness,
      "create-once",
      "readback-std-project"
    ];
  }
  return [...readinessBase, ...draftAndReadiness];
}

const SCHEDULE_EXTERNAL_DEPENDENCIES = Object.freeze({
  readback_only: new Set(["create-once"]),
  aweme_auth_readonly: new Set(["monitor-state-read", "context-resolve-platform-app"])
});

const EXECUTION_PLAN_MODES = new Set(["dry_run", "execute_once", "planned_actions"]);

export function workflowSkillScheduleForMode(mode) {
  if (!OE3_WORKFLOW_MODES.has(mode)) throw new Error(`unsupported_oe3_workflow_mode:${mode}`);
  return [...skillsForMode(mode)];
}

export function validateOe3WorkflowSchedules({
  modes = [...OE3_WORKFLOW_MODES],
  skillDefinitions = OE3_SKILL_DEFINITIONS
} = {}) {
  const definitions = new Map(skillDefinitions.map((definition) => [definition.skillKey, definition]));
  const invalidModes = [];
  const invalidSkills = [];
  const duplicateSkills = [];
  const dependencyOrderViolations = [];
  const missingDependencies = [];
  const unregisteredNodeKeys = [];

  for (const mode of modes) {
    if (!OE3_WORKFLOW_MODES.has(mode)) {
      invalidModes.push(mode);
      continue;
    }
    const schedule = workflowSkillScheduleForMode(mode);
    const positions = new Map();
    schedule.forEach((skillKey, index) => {
      if (positions.has(skillKey)) duplicateSkills.push({ mode, skillKey });
      positions.set(skillKey, index);
    });
    for (const skillKey of schedule) {
      const definition = definitions.get(skillKey);
      if (!definition) {
        invalidSkills.push({ mode, skillKey });
        continue;
      }
      if (!getWorkflowNode(definition.nodeKey)) {
        unregisteredNodeKeys.push({ mode, skillKey, nodeKey: definition.nodeKey });
      }
      for (const dependencyKey of definition.dependsOn || []) {
        const dependencyPosition = positions.get(dependencyKey);
        const skillPosition = positions.get(skillKey);
        if (dependencyPosition === undefined) {
          if (!SCHEDULE_EXTERNAL_DEPENDENCIES[mode]?.has(dependencyKey)) {
            missingDependencies.push({ mode, skillKey, dependencyKey });
          }
        } else if (dependencyPosition >= skillPosition) {
          dependencyOrderViolations.push({ mode, skillKey, dependencyKey });
        }
      }
    }
  }

  const passed = !invalidModes.length && !invalidSkills.length && !duplicateSkills.length &&
    !dependencyOrderViolations.length && !missingDependencies.length && !unregisteredNodeKeys.length;
  return {
    status: passed ? "passed" : "failed",
    modes: [...modes],
    invalidModes,
    invalidSkills,
    duplicateSkills,
    dependencyOrderViolations,
    missingDependencies,
    unregisteredNodeKeys
  };
}

function resourceTypeFromSkill(skillKey) {
  return skillKey.replace("resource-verify-", "").replace(/-/g, "_");
}

async function getTouchpointVerification(repo, bundle) {
  return repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account?.monitor_id || bundle.touchpoint?.monitor_id || ""
  });
}

async function executePayloadBuild({ repo, context }) {
  const frozenPlan = context.bundle.executionPlan || {};
  const frozenPlanKind = frozenPlan.plan_kind || frozenPlan.metadata?.plan_kind || "";
  if (context.freezeConfirmedPlan && frozenPlanKind === "std_project_create") {
    const draft = context.bundle.draft || {};
    const derivation = evaluateConfirmedPlanDraftDerivation({ plan: frozenPlan, draft });
    const draftBlockers = draft.payload_summary?.final_payload_blockers || [];
    const blockers = [...draftBlockers, ...derivation.blockers];
    context.draft = draft;
    return {
      status: blockers.length ? "blocked" : "passed",
      blockers,
      outputSummary: {
        projectName: draft.project_name || "",
        payloadHash: draft.payload_hash || "",
        payloadHashSource: draft.payload_summary?.payload_hash_source || "legacy_summary",
        requestFieldManifest: draft.payload_summary?.final_payload_manifest || {},
        derivedFromPlanId: context.expectedPlanId,
        derivedFromPlanHash: context.expectedPlanHash,
        planDerivationStatus: derivation.status,
        frozenConfirmedDraftReused: true,
        rawPayloadStored: false
      }
    };
  }
  const draft = await buildSkillDraft({
    repo,
    bundle: withDmpCustomAudienceIds(context.bundle, context.dmpCustomAudienceIds || []),
    mockReady: context.mockReady,
    attemptNo: context.createAttemptNo
  });
  const plan = context.bundle.executionPlan || {};
  const planBound = plan.metadata?.execution_scope?.binding_mode === "single_confirmation_plan" &&
    Boolean(context.expectedPlanId && context.expectedPlanHash);
  const derivation = planBound
    ? evaluateConfirmedPlanDraftDerivation({ plan, draft })
    : { status: "not_applicable", blockers: [], derivationHash: "" };
  const derivationBlockers = derivation.blockers;
  draft.payloadSummary = {
    ...draft.payloadSummary,
    derived_from_plan_id: planBound ? context.expectedPlanId : "",
    derived_from_plan_hash: planBound ? context.expectedPlanHash : "",
    plan_derivation_status: derivationBlockers.length ? "blocked" : planBound ? "passed" : "not_applicable",
    plan_derivation_blockers: derivationBlockers,
    plan_derivation_hash: derivation.derivationHash
  };
  await repo.upsertDraft(draft);
  context.draft = draft;
  context.bundle = applyDraftToBundle(context.bundle, draft);
  return {
    status: draft.payloadSummary.final_payload_blockers?.length || derivationBlockers.length ? "blocked" : "passed",
    blockers: [...(draft.payloadSummary.final_payload_blockers || []), ...derivationBlockers],
    outputSummary: {
      projectName: draft.projectName,
      payloadHash: draft.payloadHash,
      payloadHashSource: draft.payloadSummary.payload_hash_source || "legacy_summary",
      requestFieldManifest: draft.payloadSummary.final_payload_manifest || {},
      derivedFromPlanId: draft.payloadSummary.derived_from_plan_id,
      derivedFromPlanHash: draft.payloadSummary.derived_from_plan_hash,
      planDerivationStatus: draft.payloadSummary.plan_derivation_status,
      rawPayloadStored: false
    }
  };
}

async function executePayloadContract({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const contract = evaluateOe3PayloadContract({
    bundle: latestBundle,
    draft: latestBundle.draft,
    touchpointVerification: context.touchpointVerification
  });
  context.payloadContract = contract;
  return {
    status: contract.status,
    blockers: contract.gaps.map((gap) => gap.key),
    outputSummary: {
      payloadContractStatus: contract.status,
      payloadHashStable: Boolean(contract.expectedPayloadHash && contract.expectedPayloadHash === latestBundle.draft?.payload_hash),
      expectedPayloadHash: contract.expectedPayloadHash || "",
      checks: contract.checks.map((check) => ({ key: check.key, status: check.status, summary: check.summary }))
    }
  };
}

async function executeDuplicateCheck({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const result = await runDuplicateReadonlyCheck({
    repo,
    bundle: latestBundle,
    mockReady: context.mockReady,
    allowReadonlyDependency: context.allowReadonlyDependency === true
  });
  return {
    ...result,
    outputSummary: {
      ...(result.outputSummary || {}),
      duplicateStatus: result.outputSummary?.status || "not_checked",
      source: context.mockReady ? "mock_ready" : "oceanengine_std_project_list_readonly"
    }
  };
}

async function executeCreateReadiness({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const createPreflight = evaluateStdProjectCreatePreflight({
    requestFieldManifest: latestBundle.draft?.payload_summary?.final_payload_manifest || {},
    payloadContractStatus: context.payloadContract?.status || "not_run"
  });
  const skillBlockers = [...context.skillOutputs.values()].flatMap((item) => item.blockers || []);
  const attemptState = await repo.getCreateAttemptState(latestBundle.job.job_id);
  const verificationSeriesState = context.verificationSeriesId
    ? await repo.getCaseCreateVerificationSeriesState({
      caseId: latestBundle.job.case_id,
      verificationSeriesId: context.verificationSeriesId,
      maximumCreateAttempts: context.maximumCreateAttempts
    })
    : null;
  const effectiveAttemptState = verificationSeriesState || attemptState;
  const platformActions = Number(effectiveAttemptState.createActionCount || 0);
  const createdObjects = verificationSeriesState
    ? Number(verificationSeriesState.createdObjectCount || 0)
    : (latestBundle.createdObject ? 1 : 0);
  const alreadyReadbackVerified = verificationSeriesState && Number(verificationSeriesState.readbackVerifiedCount || 0) > 0;
  const correctiveAttemptReady = Number(context.createAttemptNo) === Number(effectiveAttemptState.nextCreateAttemptNo) &&
    Number(context.createAttemptNo) <= Number(effectiveAttemptState.maximumCreateAttempts || 3) &&
    !alreadyReadbackVerified;
  const blockers = [...new Set([
    ...skillBlockers,
    ...createPreflight.blocker_codes,
    ...(!correctiveAttemptReady ? ["std_project_create_attempt_not_available"] : []),
    ...(createdObjects > 0 ? ["created_object_already_recorded"] : []),
    ...(!brandIndustryPassed(latestBundle) && !context.mockReady ? ["brand_industry_readback_blocked"] : []),
    ...(!eventChainPassed(latestBundle) && !context.mockReady ? ["event_chain_readback_blocked"] : [])
  ])];
  const effectiveBlockers = context.mockReady ? [] : blockers;
  const ready = effectiveBlockers.length === 0;
  const status = ready
    ? "ready_for_user_create_confirmation"
    : !correctiveAttemptReady
      ? "corrective_attempt_limit_or_sequence_blocked"
      : effectiveBlockers.includes("brand_industry_readback_blocked")
        ? "blocked_brand_industry"
        : "new_runtime_job_required";
  return {
    status: ready ? "passed" : "blocked",
    blockers: effectiveBlockers,
    outputSummary: {
      createReadiness: {
        status,
        canCreateCurrentJob: ready,
        retryAllowed: false,
        createAttemptNo: context.createAttemptNo,
        maximumCreateAttempts: Number(effectiveAttemptState.maximumCreateAttempts || 3),
        nextCreateAttemptNo: Number(effectiveAttemptState.nextCreateAttemptNo || 1),
        verificationSeriesId: context.verificationSeriesId || "",
        verificationSeriesTaskRef: context.verificationTaskRef || "",
        verificationSeriesActionCount: verificationSeriesState ? Number(verificationSeriesState.createActionCount || 0) : 0,
        verificationSeriesReadbackVerifiedCount: verificationSeriesState ? Number(verificationSeriesState.readbackVerifiedCount || 0) : 0,
        nextConfirmationRequired: ready && context.mode === "execute_once",
        platformActions,
        createdObjects,
        brandIndustryStatus: context.mockReady ? "mock_passed" : (brandIndustryPassed(latestBundle) ? "passed" : "blocked"),
        eventChainStatus: context.mockReady ? "mock_passed" : (eventChainPassed(latestBundle) ? "passed" : "blocked"),
        payloadContractStatus: context.payloadContract?.status || "not_run",
        payloadHashStable: context.payloadContract?.expectedPayloadHash === latestBundle.draft?.payload_hash,
        duplicateStatus: latestBundle.draft?.duplicate_status || "not_generated",
        createPreflightStatus: createPreflight.status,
        createPreflightSummary: createPreflight.summary,
        createPreflightDiagnostics: createPreflight.diagnostics,
        blockers: effectiveBlockers,
        uniqueBlocker: ready ? "无" : effectiveBlockers[0],
        nextAction: ready ? "等待单次创建确认任务。" : "修复唯一阻断后重跑 dry_run。"
      }
    }
  };
}

async function executeSkill({ repo, context, skillKey }) {
  const definition = skillDefinition(skillKey);
  const startedAt = new Date().toISOString();
  const input = {
    jobId: context.bundle.job.job_id,
    mode: context.mode,
    dependsOn: definition.dependsOn,
    dependencyStatuses: dependencyStatuses(context, definition),
    sourceUsage: context.bundle.job.source_usage || "runtime_truth"
  };
  let result;

  if (skillKey === "intake-normalize") {
    result = runIntakeNormalizeSkill({ bundle: context.bundle });
  } else if (MONITOR_SKILLS.has(skillKey)) {
    result = await runMonitorWorkflowSkill({
      repo,
      bundle: context.bundle,
      skillKey,
      mode: context.mode,
      ownerKey: context.qiankunOwnerKey || "",
      allowedPlanActions: context.allowedPlanActions || [],
      mockMonitorEnsure: context.mockMonitorEnsure === true,
      fetchImpl: context.fetchImpl || globalThis.fetch,
      env: context.env || process.env,
      previousOutputs: context.skillOutputs
    });
  } else if (CONTEXT_SKILLS.has(skillKey)) {
    result = runContextSkill({
      bundle: context.bundle,
      touchpointVerification: context.touchpointVerification,
      skillKey
    });
  } else if (LAUNCH_PACK_SKILLS.has(skillKey)) {
    result = runLaunchPackSkill({
      bundle: context.mockReady ? mockReadyBundle(context.bundle) : context.bundle,
      skillKey
    });
  } else if (skillKey === "resource-bootstrap-from-blueprints") {
    result = await runResourceBlueprintBootstrapSkill({ repo, bundle: context.bundle });
    // The initial plan may have seen no target account resource rows. Rebuild it
    // after candidate materialization so later gates use the current local truth.
    if (result.status === "passed" && EXECUTION_PLAN_MODES.has(context.mode) && !context.freezeConfirmedPlan) {
      await compileAndSaveExecutionPlan({
        repo,
        jobId: context.bundle.job.job_id,
        planVersion: context.planVersion,
        createAttemptNo: context.createAttemptNo,
        verificationSeriesId: context.verificationSeriesId,
        verificationTaskRef: context.verificationTaskRef,
        maximumCreateAttempts: context.maximumCreateAttempts,
        singleVariableExperiment: context.singleVariableExperiment,
        expectedPlanId: context.expectedPlanId,
        expectedPlanHash: context.expectedPlanHash
      });
      context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
    }
  } else if (skillKey === "aweme-authorization-readonly") {
    result = await runAwemeAuthorizationReadonlySkill({
      repo,
      bundle: context.bundle,
      allowReadonlyDependency: context.allowReadonlyDependency === true,
      mockReady: context.mockReady === true,
      client: context.awemeAuthorizationClient || undefined
    });
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "avatar-source-prepare") {
    result = await runAvatarSourcePrepareSkill({ repo, bundle: context.bundle });
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "resource-live-readonly-reconcile") {
    result = await runPlatformReadonlyReconcileSkill({
      repo,
      bundle: context.bundle,
      allowReadonlyDependency: context.allowReadonlyDependency === true,
      mockReady: context.mockReady === true
    });
    // Node 4 verifiers must consume the local truth written by readonly probes,
    // not the pre-bootstrap bundle held at workflow start.
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "avatar-submit-plan") {
    result = await runAvatarSubmitPlanSkill({ repo, bundle: context.bundle });
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (DMP_SKILLS.has(skillKey)) {
    if (skillKey === "dmp-baseline-resolve") {
      result = await runDmpBaselineResolveSkill({ repo, bundle: context.bundle });
    } else if (skillKey === "dmp-source-readonly-verify") {
      result = await runDmpSourceReadonlyVerifySkill({
        repo,
        bundle: context.bundle,
        mockReady: context.mockReady,
        allowReadonlyDependency: context.allowReadonlyDependency === true
      });
    } else if (skillKey === "dmp-target-readonly-verify") {
      result = await runDmpTargetReadonlyVerifySkill({
        repo,
        bundle: context.bundle,
        mockReady: context.mockReady,
        allowReadonlyDependency: context.allowReadonlyDependency === true
      });
    } else if (skillKey === "dmp-push-plan") {
      result = await runDmpPushPlanSkill({
        repo,
        bundle: context.bundle,
        previousOutputs: context.skillOutputs
      });
      if (EXECUTION_PLAN_MODES.has(context.mode) && !context.freezeConfirmedPlan) {
        await compileAndSaveExecutionPlan({
          repo,
          jobId: context.bundle.job.job_id,
          planVersion: context.planVersion,
          createAttemptNo: context.createAttemptNo,
          verificationSeriesId: context.verificationSeriesId,
          verificationTaskRef: context.verificationTaskRef,
          maximumCreateAttempts: context.maximumCreateAttempts,
          singleVariableExperiment: context.singleVariableExperiment,
          expectedPlanId: context.expectedPlanId,
          expectedPlanHash: context.expectedPlanHash
        });
      }
    }
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "video-material-bind-plan") {
    result = await runVideoMaterialBindPlanSkill({ bundle: context.bundle });
  } else if (skillKey === "backup-landing-page-material-inventory") {
    result = context.mockReady
      ? {
          status: "mock_passed",
          blockers: [],
          outputSummary: {
            conclusion: "mock_target_already_usable",
            target_already_usable: true,
            default_target_hash_matches: true,
            platform_write_called: false,
            token_refresh_called: false
          }
        }
      : context.allowReadonlyDependency === true
        ? await runBackupLandingPageMaterialInventorySkill({
            repo,
            bundle: context.bundle,
            record: true,
            recordSkillRunResult: false
          })
        : {
            status: "blocked",
            blockers: ["readonly_permission_required"],
            outputSummary: {
              conclusion: "readonly_permission_required",
              target_already_usable: false,
              platform_write_called: false,
              token_refresh_called: false
            }
          };
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "micro-app-instance-authority-readonly") {
    result = await runMicroAppInstanceAuthorityReadonlySkill({
      repo,
      bundle: context.bundle,
      mockReady: context.mockReady,
      allowReadonlyDependency: context.allowReadonlyDependency === true
    });
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "event-chain-readonly") {
    result = await runEventChainReadonlySkill({
      repo,
      bundle: context.bundle,
      mockReady: context.mockReady,
      allowReadonlyDependency: context.allowReadonlyDependency === true
    });
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (RESOURCE_PREP_CONTRACT_SKILLS.has(skillKey)) {
    if (skillKey === "product-image-source-prepare") {
      result = await runProductImageSourcePrepareSkill({ repo, bundle: context.bundle });
    } else if (skillKey === "backup-landing-page-source-prepare") {
      result = await runBackupLandingPageSourcePrepareSkill({ repo, bundle: context.bundle });
    }
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey.startsWith("resource-verify-")) {
    const resourceType = resourceTypeFromSkill(skillKey);
    result = resourceType === "dmp_audience_package"
      ? await runDmpReadonlyGate({
        repo,
        bundle: context.bundle,
        mockReady: context.mockReady,
        allowReadonlyDependency: context.allowReadonlyDependency === true,
        previousOutputs: context.skillOutputs
      })
      : ["event_asset", "micro_app_instance"].includes(resourceType)
        ? context.mockReady
          ? runResourceVerifier({
            bundle: mockReadyBundle(context.bundle),
            resourceType,
            mockReady: true
          })
          : eventChainResourceReadiness({ bundle: context.bundle, resourceType })
      : resourceType === "video_asset"
        ? await runVideoMaterialReadonlyGate({
          repo,
          bundle: context.bundle,
          mockReady: context.mockReady,
          allowReadonlyDependency: context.allowReadonlyDependency === true
        })
      : runResourceVerifier({
        bundle: context.mockReady ? mockReadyBundle(context.bundle) : context.bundle,
        resourceType,
        mockReady: context.mockReady
      });
    if (resourceType === "backup_landing_page" && !context.mockReady) {
      const inventory = output(context, "backup-landing-page-material-inventory");
      if (inventory.status !== "passed") {
        result = {
          ...result,
          status: "blocked",
          // The inventory owns cross-account visibility. Preserve its blocker
          // first so Node 4 and the Plan expose the actual failed authority.
          blockers: [...new Set([...(inventory.blockers || ["backup_landing_page_inventory_not_passed"]), ...(result.blockers || [])])],
          outputSummary: {
            ...(result.outputSummary || {}),
            inventoryStatus: inventory.status || "not_run",
            inventoryConclusion: inventory.outputSummary?.conclusion || "not_run"
          },
          evidenceRefs: [...new Set([...(result.evidenceRefs || []), ...(inventory.evidenceRefs || [])])]
        };
      }
    }
    result = normalizeResourceSkillResult({ resourceType, result });
    if (resourceType === "dmp_audience_package" && Array.isArray(result.customAudienceIds)) {
      context.dmpCustomAudienceIds = result.customAudienceIds;
    }
    if (!context.mockReady && (resourceType === "event_asset" || resourceType === "video_asset")) {
      context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
    }
  } else if (skillKey === "confirmed-resource-orchestrator") {
    const confirmedResourcePlan = context.freezeConfirmedPlan &&
      (context.bundle.executionPlan?.plan_kind || context.bundle.executionPlan?.metadata?.plan_kind) === "resource_prepare";
    result = confirmedResourcePlan
      ? await runConfirmedResourceOrchestratorSkill({
          repo,
          bundle: context.bundle,
          fetchImpl: context.fetchImpl || globalThis.fetch,
          projectStatePath: context.projectStatePath
        })
      : {
          status: "skipped",
          blockers: [],
          outputSummary: {
            orchestratorStatus: "not_applicable_without_confirmed_plan",
            executedActionCount: 0,
            createCalled: false,
            retryAllowed: false
          }
        };
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  } else if (skillKey === "payload-build") {
    result = await executePayloadBuild({ repo, context });
  } else if (skillKey === "payload-contract") {
    result = await executePayloadContract({ repo, context });
  } else if (skillKey === "duplicate-check") {
    result = await executeDuplicateCheck({ repo, context });
  } else if (skillKey === "create-readiness") {
    result = await executeCreateReadiness({ repo, context });
  } else if (skillKey === "create-once") {
    context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
    const currentPlanId = context.bundle.executionPlan?.plan_id || "";
    const currentPlanHash = context.bundle.executionPlan?.plan_hash || "";
    const confirmedPlanBlockers = [
      ...(context.expectedPlanId && currentPlanId !== context.expectedPlanId ? ["confirmed_plan_id_drift"] : []),
      ...(context.expectedPlanHash && currentPlanHash !== context.expectedPlanHash ? ["confirmed_plan_hash_drift"] : [])
    ];
    result = confirmedPlanBlockers.length
      ? {
          status: "blocked",
          blockers: confirmedPlanBlockers,
          evidenceRefs: [],
          outputSummary: {
            createNodeStatus: "blocked_before_create",
            createCalled: false,
            mockCreateCalled: false,
            realPlatformWriteCalled: false,
            retryAllowed: false,
            nextConfirmationRequired: true,
            blockers: confirmedPlanBlockers,
            reason: "已确认的 Execution Plan ID/hash 在 Node 6 原子 claim 前发生漂移。"
          }
        }
      : await runCreateOnceSkill({
          repo,
          bundle: context.bundle,
          mode: context.mode,
          mockReady: context.mockReady,
          mockExecute: context.mockExecute,
          readiness: output(context, "create-readiness").outputSummary?.createReadiness || {},
          allowNetworkWrite: context.allowNetworkWrite === true,
          confirmationIntent: context.confirmationIntent || "",
          confirmVariableValue: context.confirmVariableValue || "",
          grantSource: context.grantSource || "",
          executionGrantId: context.executionGrantId || "",
          fetchImpl: context.fetchImpl || globalThis.fetch
        });
  } else if (skillKey === "readback-std-project") {
    result = await runReadbackSkill({
      repo,
      bundle: context.bundle,
      mode: context.mode,
      fetchImpl: context.fetchImpl || globalThis.fetch,
      grantSource: context.grantSource || "",
      createResult: output(context, "create-once")
    });
  } else {
    throw new Error(`skill_not_implemented:${skillKey}`);
  }

  const memoryResult = sanitizeForPublic(result);
  assertNoSensitiveLeak(memoryResult);
  const resultForRecord = { ...memoryResult };
  delete resultForRecord.customAudienceIds;
  delete resultForRecord.runtimeEventAssetId;
  const safeResult = sanitizeForPublic(resultForRecord);
  assertNoSensitiveLeak(safeResult);
  context.skillOutputs.set(skillKey, memoryResult);
  await recordSkillRun({ repo, bundle: context.bundle, definition, input, result: safeResult, startedAt });
  return memoryResult;
}

export function aggregateNodeRuns({ bundle, mode, skillOutputs }) {
  const cachedReadonly = cachedReadonlyFromBundle(bundle);
  const skillOutput = (key) => skillOutputs.get(key) || {};
  const resourceOutputs = OE3_REQUIRED_RESOURCE_TYPES.map((type) => skillOutput(resourceSkillKey(type)));
  const awemeAuthorization = skillOutput("aweme-authorization-readonly");
  const previousResourceNode = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare");
  const hasPendingResourceSkill = resourceOutputs.some((item) => !item.status);
  const resourceStates = resourceOutputs.map((item, index) => {
    const resourceType = item.outputSummary?.resourceType || item.outputSummary?.resource_type || OE3_REQUIRED_RESOURCE_TYPES[index];
    const capabilityState = item.outputSummary?.prepareCapability?.status ||
      item.outputSummary?.prepare_capability?.status || "";
    const state = !item.status && !capabilityState
      ? "WAITING"
      : item.status === "passed" || capabilityState === "ready"
      ? "READY"
      : capabilityState === "prepare_supported"
        ? "PLANNED"
        : ["waiting_on_event_asset", "waiting_on_event_configs"].includes(capabilityState)
          ? "WAITING"
        : "BLOCKED";
    return {
      resourceType,
      state,
      actionType: state === "PLANNED"
        ? item.outputSummary?.prepareCapability?.prepare_action_type || item.outputSummary?.prepare_capability?.prepare_action_type || ""
        : "",
      blocker: state === "BLOCKED" ? (item.blockers || [])[0] || `resource_prepare_unsupported:${resourceType}` : ""
    };
  });
  if (awemeAuthorization.status === "blocked") {
    resourceStates.unshift({
      resourceType: "aweme_authorization",
      state: "BLOCKED",
      actionType: "",
      blocker: (awemeAuthorization.blockers || [])[0] || "aweme_authorization_blocked"
    });
  }
  const blockedResourceStates = resourceStates.filter((item) => item.state === "BLOCKED");
  const resourceStateStable = blockedResourceStates.length > 0 || !hasPendingResourceSkill;
  const resourceNodeStatus = blockedResourceStates.length
    ? "blocked"
    : !resourceStateStable
      ? previousResourceNode?.status === "passed" ? "passed" : "waiting"
      : "passed";
  const resourceBlockers = blockedResourceStates.map((item) => item.blocker);
  const payloadContract = skillOutput("payload-contract");
  const previousDraftNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder");
  const previousCreateNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor");
  const persistedCreateSucceeded = Boolean(bundle.createdObject?.object_id) &&
    bundle.platformAction?.object_id_present === true &&
    ["succeeded", "mock_succeeded"].includes(bundle.platformAction?.action_status);
  const persistedCreate = persistedCreateSucceeded ? {
    status: "passed",
    blockers: [],
    evidenceRefs: bundle.createdObject?.evidence_ref ? [bundle.createdObject.evidence_ref] : [],
    outputSummary: {
      ...(previousCreateNode?.output_summary || {}),
      createNodeStatus: "created_pending_readback",
      createCalled: bundle.platformAction?.action_status === "succeeded",
      mockCreateCalled: bundle.platformAction?.action_status === "mock_succeeded",
      realPlatformWriteCalled: bundle.platformAction?.action_status === "succeeded",
      objectIdPresent: true,
      retryAllowed: false,
      nextConfirmationRequired: false
    }
  } : {};
  const readiness = skillOutput("create-readiness").outputSummary?.createReadiness ||
    previousDraftNode?.output_summary?.createReadiness || {};
  const create = skillOutput("create-once").status ? skillOutput("create-once") : persistedCreate;
  const readback = skillOutput("readback-std-project");
  const monitorOutputs = ["monitor-state-read", "monitor-readonly-reconcile", "monitor-plan-compile", "monitor-execute-once", "monitor-readback"]
    .map((key) => skillOutput(key))
    .filter((item) => item.outputSummary);
  const monitorBlockers = monitorOutputs.flatMap((item) => item.blockers || []);
  const createNode = createNodeStatusFromSkill({ create, mode });
  const readbackNode = readbackNodeStatusFromSkill({ readback, mode });
  const contextBlocked = ["context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]
    .some((key) => skillOutput(key).status === "blocked");
  const packBlocked = ["launch-pack-resolve-game", "launch-pack-resolve-defaults", "launch-pack-resolve-materials", "launch-pack-resolve-backup-landing-page", "launch-pack-resolve-resource-blueprints"]
    .some((key) => skillOutput(key).status === "blocked");
  const draft = skillOutput("payload-build").outputSummary || {};
  const resourceOrchestrator = skillOutput("confirmed-resource-orchestrator");
  const draftConfirmedOrCreated = ["passed", "mock_passed"].includes(create.status) || persistedCreateSucceeded;
  const draftNodeStatus = mode === "planned_actions"
    ? "waiting"
    : draftConfirmedOrCreated
      ? "passed"
      : payloadContract.status === "passed" && readiness.canCreateCurrentJob
        ? "needs_confirmation"
        : "repairable";

  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: skillOutput("intake-normalize").status || "passed",
      summary: "route_id、game_code、advertiser_id 已归一。",
      outputSummary: skillOutput("intake-normalize").outputSummary || {}
    }),
    nodeStatus({
      nodeKey: "creation_context",
      status: contextBlocked || monitorBlockers.length ? "blocked" : "passed",
      summary: contextBlocked || monitorBlockers.length ? "账户、触点、monitor 或平台 app 上下文未就绪。" : "账户、触点、monitor 和平台 app 已由 Skill 装配。",
      diagnosticLevel: contextBlocked || monitorBlockers.length ? "error" : "info",
      outputSummary: {
        monitor: {
          stateRead: skillOutput("monitor-state-read").outputSummary || {},
          readonlyReconcile: skillOutput("monitor-readonly-reconcile").outputSummary || {},
          planCompile: skillOutput("monitor-plan-compile").outputSummary || {},
          executeOnce: skillOutput("monitor-execute-once").outputSummary || {},
          readback: skillOutput("monitor-readback").outputSummary || {},
          blockers: monitorBlockers
        },
        account: skillOutput("context-resolve-account").outputSummary || {},
        touchpoint: skillOutput("context-resolve-touchpoint").outputSummary || {},
        platformApp: skillOutput("context-resolve-platform-app").outputSummary || {},
        platformReadonlyStatus: cachedReadonly.platformReadonlyStatus,
        credentialStatus: cachedReadonly.credentialStatus,
        credentialBlockers: cachedReadonly.credentialBlockers
      }
    }),
    nodeStatus({
      nodeKey: "game_launch_pack",
      status: packBlocked ? "blocked" : "passed",
      summary: packBlocked ? "游戏主档、路线默认值、保底物料包、备用落地页或资源蓝图缺失。" : "游戏主档、路线默认值、保底物料包、备用落地页和资源蓝图已由 Skill 装配。",
      diagnosticLevel: packBlocked ? "error" : "info",
      outputSummary: {
        game: skillOutput("launch-pack-resolve-game").outputSummary || {},
        defaults: skillOutput("launch-pack-resolve-defaults").outputSummary || {},
        materials: skillOutput("launch-pack-resolve-materials").outputSummary || {},
        backupLandingPage: skillOutput("launch-pack-resolve-backup-landing-page").outputSummary || {},
        resourceBlueprints: skillOutput("launch-pack-resolve-resource-blueprints").outputSummary || {}
      }
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: resourceNodeStatus,
      summary: blockedResourceStates.length
        ? `账户资源存在阻断；唯一根阻断：${blockedResourceStates[0].blocker}。`
        : !resourceStateStable
          ? "账户资源正在核验，保留上一份稳定资源状态。"
        : resourceStates.some((item) => item.state === "PLANNED")
          ? "账户资源无外部阻断，待一次确认后按 Plan 准备。"
          : `${OE3_REQUIRED_RESOURCE_TYPES.length} 项账户资源均已通过 Skill 检查。`,
      diagnosticLevel: resourceBlockers.length ? "error" : "info",
      outputSummary: {
        resourceStates,
        readyCount: resourceStates.filter((item) => item.state === "READY").length,
        plannedCount: resourceStates.filter((item) => item.state === "PLANNED").length,
        blockedCount: blockedResourceStates.length,
        uniqueRootBlocker: blockedResourceStates[0]?.blocker || "",
        blockedResourceTypes: blockedResourceStates.map((item) => item.resourceType),
        checks: resourceOutputs.map((item) => item.outputSummary).filter(Boolean),
        bootstrap: skillOutput("resource-bootstrap-from-blueprints").outputSummary || {},
        awemeAuthorization: awemeAuthorization.outputSummary || {},
        baselineReadonly: skillOutput("resource-live-readonly-reconcile").outputSummary || {},
        platformReadonlyStatus: cachedReadonly.platformReadonlyStatus,
        credentialStatus: cachedReadonly.credentialStatus,
        credentialBlockers: cachedReadonly.credentialBlockers,
        skillLayer: "src/workflows/skills/oe3"
      }
    }),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: draftNodeStatus,
      summary: mode === "planned_actions" ? "等待 Node 2-4 准备完成后生成草稿。" : draftConfirmedOrCreated
        ? "创建草稿已确认并进入创建/回查闭环。"
        : draft.projectName
        ? `创建草稿已生成：${draft.projectName}；${readiness.uniqueBlocker || "等待创建确认"}。`
        : "等待创建草稿。",
      diagnosticLevel: mode === "planned_actions" ? "pending" : draftConfirmedOrCreated ? "info" : payloadContract.status === "passed" && readiness.canCreateCurrentJob ? "warning" : "error",
      outputSummary: {
        confirmedResourceOrchestrator: resourceOrchestrator.outputSummary || {},
        projectName: draft.projectName || bundle.draft?.project_name || "",
        payloadHash: draft.payloadHash || bundle.draft?.payload_hash || "",
        payloadHashSource: draft.payloadHashSource || bundle.draft?.payload_summary?.payload_hash_source || "",
        duplicateStatus: skillOutput("duplicate-check").outputSummary?.duplicateStatus || bundle.draft?.duplicate_status || "not_generated",
        payloadContractStatus: payloadContract.outputSummary?.payloadContractStatus || payloadContract.status || "not_run",
        platformDuplicateCheckStatus: cachedReadonly.platformDuplicateCheckStatus,
        requestFieldManifest: draft.requestFieldManifest || bundle.draft?.payload_summary?.final_payload_manifest || {},
        createReadiness: readiness
      }
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: createNode.status,
      summary: createNode.summary,
      diagnosticLevel: createNode.diagnosticLevel,
      outputSummary: {
        ...createNode.outputSummary,
        createReadiness: readiness
      },
      evidenceRefs: create.evidenceRefs || []
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: readbackNode.status,
      summary: readbackNode.summary,
      diagnosticLevel: readbackNode.diagnosticLevel,
      outputSummary: readbackNode.outputSummary,
      evidenceRefs: readback.evidenceRefs || []
    })
  ];
}

function aggregateAwemeAuthorizationReadonlyNodeRuns({ bundle, skillOutputs }) {
  const skillOutput = (key) => skillOutputs.get(key) || {};
  const contextAccount = skillOutput("context-resolve-account");
  const game = skillOutput("launch-pack-resolve-game");
  const defaults = skillOutput("launch-pack-resolve-defaults");
  const awemeAuthorization = skillOutput("aweme-authorization-readonly");
  const contextBlocked = contextAccount.status === "blocked";
  const packBlocked = game.status === "blocked" || defaults.status === "blocked";
  const awemeBlocked = awemeAuthorization.status === "blocked";

  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: skillOutput("intake-normalize").status || "passed",
      summary: "route_id、game_code、advertiser_id 已归一。",
      outputSummary: skillOutput("intake-normalize").outputSummary || {}
    }),
    nodeStatus({
      nodeKey: "creation_context",
      status: contextBlocked ? "blocked" : "passed",
      summary: contextBlocked ? "账户上下文未就绪。" : "账户上下文已由 Skill 装配。",
      diagnosticLevel: contextBlocked ? "error" : "info",
      outputSummary: {
        account: contextAccount.outputSummary || {}
      }
    }),
    nodeStatus({
      nodeKey: "game_launch_pack",
      status: packBlocked ? "blocked" : "passed",
      summary: packBlocked ? "游戏主档或路线默认值缺失。" : "游戏主档和路线默认值已由 Skill 装配。",
      diagnosticLevel: packBlocked ? "error" : "info",
      outputSummary: {
        game: game.outputSummary || {},
        defaults: defaults.outputSummary || {}
      }
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: awemeBlocked ? "blocked" : "passed",
      summary: awemeBlocked ? "固定默认 aweme_id 授权只读核验未通过。" : "固定默认 aweme_id 授权只读核验已通过。",
      diagnosticLevel: awemeBlocked ? "error" : "info",
      outputSummary: {
        awemeAuthorization: awemeAuthorization.outputSummary || {},
        blockers: awemeAuthorization.blockers || [],
        skillLayer: "src/workflows/skills/oe3"
      },
      evidenceRefs: awemeAuthorization.evidenceRefs || []
    }),
    ...WORKFLOW_NODES.slice(4).map((node) => ({
      ...node,
      status: "waiting",
      summary: "aweme_auth_readonly 只执行至 Node 4。",
      diagnosticLevel: "pending",
      outputSummary: {},
      evidenceRefs: [],
      started: false,
      finished: false
    }))
  ];
}

export async function runOe3WorkflowSkills({
  repo,
  jobId,
  mode = "dry_run",
  mockReady = false,
  mockExecute = false,
  allowNetworkWrite = false,
  allowReadonlyDependency = false,
  confirmationIntent = "",
  confirmVariableValue = "",
  grantSource = "",
  executionGrantId = "",
  fetchImpl = globalThis.fetch,
  env = process.env,
  allowedPlanActions = [],
  mockMonitorEnsure = false,
  qiankunOwnerKey = "",
  createAttemptNo = 1,
  verificationSeriesId = "",
  verificationTaskRef = "",
  maximumCreateAttempts = 3,
  singleVariableExperiment = {},
  expectedPlanId = "",
  expectedPlanHash = "",
  awemeAuthorizationClient = null,
  confirmedPlanExecution = false,
  projectStatePath
} = {}) {
  if (!OE3_WORKFLOW_MODES.has(mode)) throw new Error(`unsupported_oe3_workflow_mode:${mode}`);
  if (mode === "aweme_auth_readonly" && allowReadonlyDependency !== true && mockReady !== true) {
    throw new Error("aweme_auth_readonly_requires_readonly_dependency");
  }
  const numericAttemptNo = Number(createAttemptNo || 1);
  if (!Number.isInteger(numericAttemptNo) || numericAttemptNo < 1 || numericAttemptNo > 3) {
    throw new Error("invalid_std_project_create_attempt_no");
  }
  const numericMaximumCreateAttempts = Number(maximumCreateAttempts || 3);
  if (!Number.isInteger(numericMaximumCreateAttempts) || numericMaximumCreateAttempts < 1 || numericMaximumCreateAttempts > 3) {
    throw new Error("invalid_std_project_create_maximum_attempts");
  }
  if (verificationSeriesId && !/^[A-Za-z0-9_.-]{1,160}$/.test(verificationSeriesId)) {
    throw new Error("invalid_verification_series_id");
  }
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const confirmedPlanMode = mode === "execute_once" && confirmedPlanExecution === true &&
    Boolean(expectedPlanId && expectedPlanHash) &&
    bundle.executionPlan?.metadata?.execution_scope?.binding_mode === "single_confirmation_plan";
  if (confirmedPlanMode) {
    if (bundle.executionPlan?.plan_id !== expectedPlanId) throw new Error("confirmed_plan_id_drift");
    if (bundle.executionPlan?.plan_hash !== expectedPlanHash) throw new Error("confirmed_plan_hash_drift");
  } else if (EXECUTION_PLAN_MODES.has(mode)) {
    await compileAndSaveExecutionPlan({
      repo,
      jobId,
      planVersion: numericAttemptNo,
      createAttemptNo: numericAttemptNo,
      verificationSeriesId,
      verificationTaskRef,
      maximumCreateAttempts: numericMaximumCreateAttempts,
      singleVariableExperiment,
      expectedPlanId,
      expectedPlanHash
    });
    bundle = await repo.getLaunchJobBundle(jobId);
  }
  const restoreMockAwemeAuthorization = mockReady === true &&
    (bundle.job?.source_usage || "runtime_truth") === "test_run" &&
    mode !== "readback_only";
  const originalAwemeAuthorization = restoreMockAwemeAuthorization &&
    bundle.account?.aweme_authorization &&
    typeof bundle.account.aweme_authorization === "object" &&
    !Array.isArray(bundle.account.aweme_authorization)
    ? bundle.account.aweme_authorization
    : {};
  const touchpointVerification = await getTouchpointVerification(repo, bundle);
  const context = {
    bundle,
    mode,
    mockReady,
    mockExecute,
    allowNetworkWrite,
    allowReadonlyDependency,
    confirmationIntent,
    confirmVariableValue,
    grantSource,
    executionGrantId,
    fetchImpl,
    env,
    allowedPlanActions,
    mockMonitorEnsure,
    qiankunOwnerKey,
    awemeAuthorizationClient,
    createAttemptNo: numericAttemptNo,
    planVersion: numericAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts: numericMaximumCreateAttempts,
    singleVariableExperiment,
    expectedPlanId,
    expectedPlanHash,
    projectStatePath,
    freezeConfirmedPlan: confirmedPlanMode,
    touchpointVerification,
    skillOutputs: new Map(),
    payloadContract: null
  };
  const persistNodeSnapshot = async () => {
    const nodes = mode === "aweme_auth_readonly"
      ? aggregateAwemeAuthorizationReadonlyNodeRuns({ bundle: context.bundle, skillOutputs: context.skillOutputs })
      : aggregateNodeRuns({ bundle: context.bundle, mode, skillOutputs: context.skillOutputs });
    await repo.upsertNodeRuns(jobId, nodes);
    return nodes;
  };
  try {
    for (const skillKey of skillsForMode(mode)) {
      await executeSkill({ repo, context, skillKey });
      bundle = await repo.getLaunchJobBundle(jobId);
      context.bundle = bundle;
      context.touchpointVerification = await getTouchpointVerification(repo, bundle);
      await persistNodeSnapshot();
    }
    const nodes = await persistNodeSnapshot();
    if (EXECUTION_PLAN_MODES.has(mode) && !(mode === "execute_once" && expectedPlanId && expectedPlanHash)) {
      await compileAndSaveExecutionPlan({
        repo,
        jobId,
        planVersion: numericAttemptNo,
        createAttemptNo: numericAttemptNo,
        verificationSeriesId,
        verificationTaskRef,
        maximumCreateAttempts: numericMaximumCreateAttempts,
        singleVariableExperiment,
        expectedPlanId,
        expectedPlanHash
      });
    }
    if (mode === "dry_run") {
      const latestDraftBundle = await repo.getLaunchJobBundle(jobId);
      if (latestDraftBundle?.draft?.project_name) {
        await repo.upsertReadbackRecord({
          readbackId: `RB-${jobId}-STD-PROJECT-NOT-APPLICABLE`,
          jobId,
          objectType: "std_project",
          objectId: "NOT_APPLICABLE_DRY_RUN",
          objectName: latestDraftBundle.draft.project_name,
          readbackStatus: "not_applicable",
          fieldDiffSummary: {
            reason: "dry_run_does_not_create_platform_object",
            object_name_from_draft: true,
            real_platform_readback_called: false
          },
          evidenceRef: ""
        });
      }
    }
    const jobUpdate = workflowJobUpdateFromSkillResults({
      mode,
      create: context.skillOutputs.get("create-once") || {},
      readback: context.skillOutputs.get("readback-std-project") || {}
    });
    if (jobUpdate) await repo.updateJob(jobId, jobUpdate);
    const latest = await repo.getLaunchJobBundle(jobId);
    const summary = {
      jobId,
      mode,
      jobStatus: latest.job.job_status,
      currentNode: latest.job.current_node,
      skillRunCount: context.skillOutputs.size,
      nodeStatuses: Object.fromEntries(nodes.map((node) => [node.nodeKey, node.status])),
      createReadiness: nodes.find((node) => node.nodeKey === "std_project_draft_builder")?.outputSummary?.createReadiness || {},
      noRealPlatformWrite: workflowNoRealPlatformWrite({
        create: context.skillOutputs.get("create-once") || {}
      }),
      noTokenRefresh: true
    };
    assertNoSensitiveLeak(summary);
    return { bundle: latest, nodes, summary };
  } catch (error) {
    if (context.skillOutputs.size) await persistNodeSnapshot();
    throw error;
  } finally {
    if (restoreMockAwemeAuthorization) {
      await repo.updateAdvertiserAwemeAuthorization({
        advertiserId: bundle.job.advertiser_id,
        routeId: bundle.job.route_id,
        gameCode: bundle.job.game_code,
        authorization: originalAwemeAuthorization
      });
    }
  }
}

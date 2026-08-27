import { OE3_REQUIRED_RESOURCE_TYPES, OE3_RESOURCE_LABELS } from "./00-contracts.mjs";

export const RESOURCE_CAPABILITY_STATES = new Set([
  "ready",
  "prepare_supported",
  "prepare_unsupported",
  "blocked"
]);

const DEFAULT_VERIFY_MODULE = "src/workflows/skills/oe3/04-resource-verifiers.mjs";

const RESOURCE_ACTION_CAPABILITIES = Object.freeze({
  avatar: {
    verifyModuleRef: DEFAULT_VERIFY_MODULE,
    prepareSupported: true,
    prepareModuleRef: "src/platforms/oceanengineAvatarExecutor.mjs",
    evidenceRequirement: "300x300 avatar source, one-time upload/submit action, and advertiser/avatar/get readback evidence"
  },
  dmp_audience_package: {
    verifyModuleRef: "src/workflows/skills/oe3/04-dmp-readonly.mjs",
    prepareSupported: true,
    prepareModuleRef: "src/platforms/oceanengineDmpExecutor.mjs",
    evidenceRequirement: "DMP package-set source/target readonly evidence and per-package push plan"
  },
  event_asset: {
    verifyModuleRef: "src/workflows/skills/oe3/05-objective-contract-readiness.mjs",
    prepareSupported: false,
    prepareModuleRef: "",
    evidenceRequirement: "objective/event chain readonly evidence"
  },
  video_asset: {
    verifyModuleRef: "src/workflows/skills/oe3/04-video-material-readiness.mjs",
    prepareSupported: true,
    prepareModuleRef: "src/platforms/oceanengineVideoMaterialExecutor.mjs",
    evidenceRequirement: "video material source/target readonly evidence and local file metadata"
  },
  product_image: {
    verifyModuleRef: DEFAULT_VERIFY_MODULE,
    prepareSupported: false,
    prepareModuleRef: "",
    evidenceRequirement: "account_resources readonly/resource metadata"
  },
  brand_info: {
    verifyModuleRef: DEFAULT_VERIFY_MODULE,
    prepareSupported: false,
    prepareModuleRef: "",
    evidenceRequirement: "brand industry readonly/readback evidence"
  },
  micro_app_instance: {
    verifyModuleRef: "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs",
    prepareSupported: false,
    prepareModuleRef: "",
    evidenceRequirement: "official create-field evidence and account resource metadata"
  },
  backup_landing_page: {
    verifyModuleRef: "src/workflows/skills/oe3/03-landing-page-readiness.mjs",
    prepareSupported: false,
    prepareModuleRef: "",
    evidenceRequirement: "backup landing page asset/default/hash/target visibility evidence"
  }
});

function resourceSkillKey(resourceType) {
  return `resource-verify-${resourceType.replace(/_/g, "-")}`;
}

function defaultStopConditions(resourceType) {
  return [
    `${resourceType}_missing`,
    `${resourceType}_not_ready`,
    `resource_prepare_unsupported:${resourceType}`
  ];
}

export function getResourceActionCapability(resourceType) {
  if (!OE3_REQUIRED_RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`unknown_oe3_resource_type:${resourceType}`);
  }
  const capability = RESOURCE_ACTION_CAPABILITIES[resourceType] || {};
  const prepareActionType = `ensure_resource:${resourceType}`;
  return {
    resource_type: resourceType,
    label: OE3_RESOURCE_LABELS[resourceType] || resourceType,
    verify_skill_key: resourceSkillKey(resourceType),
    verify_module_ref: capability.verifyModuleRef || DEFAULT_VERIFY_MODULE,
    prepare_supported: capability.prepareSupported === true,
    prepare_module_ref: capability.prepareModuleRef || "",
    prepare_action_type: capability.prepareSupported === true ? prepareActionType : "",
    prepare_stop_conditions: defaultStopConditions(resourceType),
    evidence_requirement: capability.evidenceRequirement || "account_resources readonly evidence"
  };
}

export function allResourceActionCapabilities() {
  return OE3_REQUIRED_RESOURCE_TYPES.map(getResourceActionCapability);
}

export function moduleRefForResourceVerifier(resourceType) {
  return getResourceActionCapability(resourceType).verify_module_ref;
}

function capabilityState({ ready, prepareSupported, hardBlocked }) {
  if (ready) return "ready";
  if (hardBlocked) return "blocked";
  return prepareSupported ? "prepare_supported" : "prepare_unsupported";
}

function hardBlockedBy(blockers = []) {
  return blockers.some((blocker) =>
    [
      "readonly_permission_required",
      "credential_required",
      "platform_probe_failed",
      "material_source_account_missing",
      "dmp_source_readonly_not_complete"
    ].includes(blocker) ||
    String(blocker).startsWith("platform_probe_failed:")
  );
}

export function prepareCapabilityForResourceResult({ resourceType, ready = false, blockers = [] } = {}) {
  const capability = getResourceActionCapability(resourceType);
  const state = capabilityState({
    ready,
    prepareSupported: capability.prepare_supported,
    hardBlocked: hardBlockedBy(blockers)
  });
  return {
    status: state,
    prepare_supported: capability.prepare_supported,
    prepare_module_ref: capability.prepare_module_ref,
    prepare_action_type: capability.prepare_action_type,
    prepare_stop_conditions: capability.prepare_stop_conditions,
    evidence_requirement: capability.evidence_requirement
  };
}

export function normalizeResourceSkillResult({ resourceType, result = {} } = {}) {
  const outputSummary = result.outputSummary || {};
  const blockers = result.blockers || [];
  const evidenceRefs = [
    ...(result.evidenceRefs || []),
    outputSummary.evidenceRef || ""
  ].filter(Boolean);
  const ready = result.status === "passed" || outputSummary.ready === true;
  const capability = getResourceActionCapability(resourceType);
  const prepareCapability = prepareCapabilityForResourceResult({
    resourceType,
    ready,
    blockers
  });
  const existenceStatus = outputSummary.existence_status ||
    outputSummary.existenceStatus ||
    (blockers.includes(`${resourceType}_missing`) ? "missing" : "exists");
  const readonlyStatus = outputSummary.readonly_status || outputSummary.readonlyStatus || "";
  const readinessStatus = outputSummary.readiness_status || outputSummary.readinessStatus || (ready ? "ready" : "not_ready");
  const nextAction = outputSummary.nextAction || (
    prepareCapability.status === "ready"
      ? "无需动作"
      : prepareCapability.status === "prepare_supported"
        ? `计划动作：${prepareCapability.prepare_action_type}`
        : prepareCapability.status === "blocked"
          ? blockers[0] || `${resourceType}_blocked`
          : `resource_prepare_unsupported:${resourceType}`
  );

  return {
    ...result,
    blockers,
    evidenceRefs,
    outputSummary: {
      ...outputSummary,
      resourceType,
      resource_type: resourceType,
      existenceStatus,
      existence_status: existenceStatus,
      readonlyStatus,
      readonly_status: readonlyStatus,
      readinessStatus,
      readiness_status: readinessStatus,
      status: prepareCapability.status,
      prepareCapability,
      prepare_capability: prepareCapability,
      blocker_codes: blockers,
      module_ref: capability.verify_module_ref,
      evidence_refs: evidenceRefs,
      nextAction,
      next_action: nextAction
    }
  };
}

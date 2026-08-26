import { clean, has } from "./resource-verifiers.mjs";

export function cachedReadonlyFromBundle(bundle = {}) {
  const contextNode = (bundle.nodes || []).find((node) => node.node_key === "creation_context") || {};
  const accountNode = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare") || {};
  const draftNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder") || {};
  const contextOutput = contextNode.output_summary || {};
  const accountOutput = accountNode.output_summary || {};
  const draftOutput = draftNode.output_summary || {};
  return {
    platformReadonlyStatus: accountOutput.platformReadonlyStatus || contextOutput.platformReadonlyStatus || "not_run",
    credentialStatus: accountOutput.credentialStatus || contextOutput.credentialStatus || "unknown",
    credentialBlockers: accountOutput.credentialBlockers || contextOutput.credentialBlockers || [],
    platformDuplicateCheckStatus: draftOutput.platformDuplicateCheckStatus || "waiting"
  };
}

export function runContextSkill({ bundle, touchpointVerification, skillKey }) {
  if (skillKey === "intake-normalize") {
    const missingFields = ["route_id", "game_code", "advertiser_id"].filter((field) => !has(bundle.job?.[field]));
    return {
      status: missingFields.length ? "blocked" : "passed",
      blockers: missingFields.map((field) => `missing_${field}`),
      outputSummary: {
        routeId: bundle.job.route_id || "",
        gameCode: bundle.job.game_code || "",
        advertiserId: bundle.job.advertiser_id || "",
        missingFields
      }
    };
  }

  if (skillKey === "context-resolve-account") {
    const blockers = [
      ...(!bundle.account?.advertiser_id ? ["account_missing"] : []),
      ...(bundle.account?.advertiser_id && bundle.account?.auth_status !== "ready" ? ["account_not_ready"] : []),
      ...(!bundle.account?.monitor_id ? ["monitor_id_missing"] : [])
    ];
    const passed = blockers.length === 0;
    return {
      status: passed ? "passed" : "blocked",
      blockers,
      outputSummary: {
        accountStatus: bundle.account?.auth_status || "missing",
        accountNamePresent: Boolean(bundle.account?.account_name),
        monitorIdPresent: Boolean(bundle.account?.monitor_id),
        controlledMonitorRequired: true
      }
    };
  }

  if (skillKey === "context-resolve-touchpoint") {
    const verification = touchpointVerification || {};
    const blockers = [
      ...(!verification.touchpointUrlPresent ? ["touchpoint_url_missing"] : []),
      ...(verification.touchpointUrlPresent && !verification.urlHashMatches ? ["touchpoint_url_hash_mismatch"] : [])
    ];
    const passed = blockers.length === 0;
    return {
      status: passed ? "passed" : "blocked",
      blockers,
      outputSummary: {
        touchpointRef: bundle.touchpoint?.touchpoint_ref || "",
        urlHash: bundle.touchpoint?.url_hash || "",
        status: bundle.touchpoint?.status || "missing",
        touchpointUrlPresent: Boolean(verification.touchpointUrlPresent),
        urlHashMatches: Boolean(verification.urlHashMatches),
        controlledTouchpointRequired: true
      }
    };
  }

  if (skillKey === "context-resolve-platform-app") {
    const passed = Boolean(bundle.platformApp?.app_id);
    return {
      status: passed ? "passed" : "blocked",
      blockers: passed ? [] : ["platform_app_missing"],
      outputSummary: {
        appIdPresent: passed,
        appType: bundle.platformApp?.app_type || "",
        status: bundle.platformApp?.status || "missing"
      }
    };
  }

  throw new Error(`context_skill_not_implemented:${clean(skillKey)}`);
}

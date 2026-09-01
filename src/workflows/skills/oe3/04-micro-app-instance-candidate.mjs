import { clean, resource } from "./04-resource-verifiers.mjs";

function addCandidate(entries, id, source, controlled) {
  const value = clean(id);
  if (!value) return;
  entries.push({ id: value, source, controlled });
}

// A platform App belongs to the current route/game configuration. Its instance
// reference is sufficient to form a creation candidate, but is never evidence
// that the target advertiser already has a verified instance binding.
export function microAppInstanceCandidate(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  const app = bundle.platformApp || {};
  const eventChain = item.metadata?.event_chain_readonly_contract || {};
  const entries = [];

  addCandidate(
    entries,
    item.platform_resource_id,
    eventChain.target_instance_binding_readback_verified === true ||
      eventChain.target_instance_readback_verified === true
      ? "target_resource_binding_readback"
      : "account_resource_platform_id",
    eventChain.target_instance_binding_readback_verified === true ||
      eventChain.target_instance_readback_verified === true
  );
  addCandidate(
    entries,
    item.metadata?.micro_app_instance_id,
    "account_resource_metadata",
    false
  );
  addCandidate(
    entries,
    item.metadata?.instance_id,
    "account_resource_metadata",
    false
  );
  addCandidate(
    entries,
    app.metadata?.micro_app_instance_id,
    "platform_app_route_config",
    Boolean(clean(app.app_id)) && clean(app.app_type) === "byte_mini_game" && clean(app.status) === "active"
  );

  const byId = new Map();
  for (const entry of entries) {
    const existing = byId.get(entry.id) || { id: entry.id, sources: [], controlled: false };
    existing.sources.push(entry.source);
    existing.controlled = existing.controlled || entry.controlled;
    byId.set(entry.id, existing);
  }
  const candidates = [...byId.values()].map((candidate) => ({
    ...candidate,
    sources: [...new Set(candidate.sources)].sort()
  }));
  const selected = candidates.length === 1 ? candidates[0] : null;
  const trusted = Boolean(selected?.controlled);
  return {
    appId: clean(app.app_id),
    appType: clean(app.app_type),
    appStatus: clean(app.status),
    instanceId: selected?.id || "",
    instanceSource: selected?.sources.find((source) => source === "target_resource_binding_readback") ||
      selected?.sources.find((source) => source === "platform_app_route_config") ||
      selected?.sources[0] || "",
    instanceCandidateCount: candidates.length,
    instanceCandidateAmbiguous: candidates.length > 1,
    instanceCandidateTrusted: trusted,
    instanceCandidateUntrusted: Boolean(selected) && !trusted,
    // Kept for public output compatibility: a route configuration candidate is
    // controlled for creation, but still only a reference until asset/detail.
    instanceReferenceOnly: trusted && selected?.sources.includes("platform_app_route_config") &&
      !selected?.sources.includes("target_resource_binding_readback"),
    candidates
  };
}

export function microAppInstanceCandidateBlockers(candidate = {}) {
  return [
    ...(candidate.instanceCandidateAmbiguous ? ["micro_app_instance_candidate_ambiguous"] : []),
    ...(candidate.instanceId ? [] : ["micro_app_instance_candidate_missing"]),
    ...(candidate.instanceId && candidate.instanceCandidateTrusted !== true
      ? ["micro_app_instance_candidate_untrusted"]
      : [])
  ];
}

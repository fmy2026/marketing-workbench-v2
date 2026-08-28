const EVIDENCE_LEVELS = new Set([
  "official_direct",
  "official_related_endpoint",
  "unverified"
]);

const SEND_POLICIES = new Set(["send", "omit", "block"]);
const LONG_ID_TRANSPORT_STRATEGIES = new Set(["decimal_bigint_json_number"]);

function clean(value) {
  return String(value ?? "").trim();
}

function rawContract(bundle = {}) {
  return bundle.defaults?.raw_defaults?.official_create_field_contract || {};
}

function normalizeRule(path, rule = {}) {
  const evidenceLevel = clean(rule.evidence_level);
  const sendPolicy = clean(rule.send_policy);
  return {
    fieldPath: path,
    evidenceLevel: EVIDENCE_LEVELS.has(evidenceLevel) ? evidenceLevel : "unverified",
    sendPolicy: SEND_POLICIES.has(sendPolicy) ? sendPolicy : "block",
    reference: clean(rule.reference),
    appliesWhen: clean(rule.applies_when),
    reason: clean(rule.reason)
  };
}

export function getOfficialCreateFieldContract(bundle = {}) {
  const contract = rawContract(bundle);
  const fieldRules = contract.field_rules && typeof contract.field_rules === "object"
    ? contract.field_rules
    : {};
  return {
    version: clean(contract.version),
    source: clean(contract.source),
    instanceIdCreateEvidence: contract.instance_id_create_evidence || {},
    rules: Object.fromEntries(
      Object.entries(fieldRules).map(([path, rule]) => [path, normalizeRule(path, rule)])
    )
  };
}

export function getInstanceIdCreateEvidence(contract = {}, { resourceId = "" } = {}) {
  const raw = contract.instanceIdCreateEvidence || {};
  const candidateField = clean(raw.candidate_create_field || "instance_id");
  const rule = ruleFor(contract, candidateField);
  const value = clean(resourceId);
  const longPlatformId = /^\d+$/.test(value) && !Number.isSafeInteger(Number(value));
  const directRuleVerified = rule.evidenceLevel === "official_direct";
  const fieldNameVerified = raw.field_name_verified === true && directRuleVerified;
  const fieldTypeVerified = raw.field_type_verified === true && Boolean(clean(raw.create_field_type));
  const applicabilityVerified = raw.applicability_verified === true &&
    clean(raw.landing_type) === "MICRO_GAME" && clean(raw.delivery_medium) === "BYTE_GAME";
  const longIdTransportStrategy = clean(raw.long_id_transport_strategy);
  const longIdTransportSource = clean(raw.long_id_transport_source || raw.transport_source);
  const longIdTransportVerified = !longPlatformId ||
    (raw.long_id_transport_verified === true && LONG_ID_TRANSPORT_STRATEGIES.has(longIdTransportStrategy));
  const directContractVerified = fieldNameVerified && fieldTypeVerified && applicabilityVerified;
  const blockers = [
    ...(!directContractVerified ? ["instance_id_create_contract_not_verified"] : []),
    ...(directContractVerified && !longIdTransportVerified
      ? ["instance_id_long_id_transport_not_verified"]
      : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    canSend: blockers.length === 0 && rule.sendPolicy === "send",
    candidateField,
    fieldNameVerified,
    createFieldType: clean(raw.create_field_type),
    fieldTypeVerified,
    landingType: clean(raw.landing_type),
    deliveryMedium: clean(raw.delivery_medium),
    applicabilityVerified,
    longIdTransportStrategy,
    longIdTransportSource,
    longIdTransportVerified,
    valuePresent: Boolean(value),
    longPlatformId,
    blockers,
    references: Array.isArray(raw.references) ? raw.references.map(clean).filter(Boolean) : []
  };
}

export function instanceIdCreateEvidenceSummary(evidence = {}) {
  return {
    status: evidence.status || "blocked",
    candidateField: evidence.candidateField || "",
    fieldNameVerified: evidence.fieldNameVerified === true,
    createFieldType: evidence.createFieldType || "",
    fieldTypeVerified: evidence.fieldTypeVerified === true,
    landingType: evidence.landingType || "",
    deliveryMedium: evidence.deliveryMedium || "",
    applicabilityVerified: evidence.applicabilityVerified === true,
    longIdTransportStrategy: evidence.longIdTransportStrategy || "",
    longIdTransportSource: evidence.longIdTransportSource || "",
    longIdTransportVerified: evidence.longIdTransportVerified === true,
    valuePresent: evidence.valuePresent === true,
    longPlatformId: evidence.longPlatformId === true,
    blockers: evidence.blockers || [],
    references: evidence.references || []
  };
}

function ruleFor(contract, fieldPath) {
  return contract.rules[fieldPath] || normalizeRule(fieldPath, {
    evidence_level: "unverified",
    send_policy: "block",
    reason: "missing_official_create_field_evidence"
  });
}

export function applyOfficialCreateFieldSendPolicy({ payload = {}, contract = {} } = {}) {
  const nextPayload = { ...payload };
  const omittedFieldPaths = [];
  for (const fieldPath of Object.keys(nextPayload)) {
    if (ruleFor(contract, fieldPath).sendPolicy === "omit") {
      delete nextPayload[fieldPath];
      omittedFieldPaths.push(fieldPath);
    }
  }
  return { payload: nextPayload, omittedFieldPaths };
}

export function evaluateOfficialCreateFieldEvidence({ payload = {}, contract = {}, omittedFieldPaths = [] } = {}) {
  const decisions = Object.keys(payload).sort().map((fieldPath) => {
    const rule = ruleFor(contract, fieldPath);
    const blocked = rule.sendPolicy !== "send" || rule.evidenceLevel === "unverified";
    return {
      fieldPath,
      evidenceLevel: rule.evidenceLevel,
      sendPolicy: rule.sendPolicy,
      reference: rule.reference,
      appliesWhen: rule.appliesWhen,
      reason: rule.reason,
      status: blocked ? "blocked" : "passed"
    };
  });
  const blockers = decisions
    .filter((item) => item.status === "blocked")
    .map((item) => `official_field_evidence_blocked:${item.fieldPath}`);
  return {
    status: blockers.length ? "blocked" : "passed",
    blockerCodes: blockers,
    omittedFieldPaths: [...omittedFieldPaths].sort(),
    fieldDecisions: decisions,
    contractVersion: contract.version || "",
    contractSource: contract.source || ""
  };
}

export function officialFieldEvidenceSummary(evaluation = {}) {
  return {
    status: evaluation.status || "blocked",
    blockerCodes: evaluation.blockerCodes || [],
    omittedFieldPaths: evaluation.omittedFieldPaths || [],
    contractVersion: evaluation.contractVersion || "",
    contractSource: evaluation.contractSource || "",
    fields: (evaluation.fieldDecisions || []).map((item) => ({
      fieldPath: item.fieldPath,
      evidenceLevel: item.evidenceLevel,
      sendPolicy: item.sendPolicy,
      reference: item.reference,
      status: item.status
    }))
  };
}

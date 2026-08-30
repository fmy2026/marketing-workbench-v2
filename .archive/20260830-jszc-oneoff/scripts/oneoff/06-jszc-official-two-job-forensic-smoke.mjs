import {
  OFFICIAL_CONTRACT_MATRIX,
  assertForensicOutputSafe,
  classifySafePlatformFailure,
  compareFieldLedgers,
  selectSingleVariableCandidate,
  summarizeFieldShape,
  validateSingleVariableLedgerDiff
} from "../../src/oneoff/jszcOfficialTwoJobForensic.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function entry(path, {
  sendPolicy = "send",
  valueType = "string",
  itemCount = null,
  stringLength = null,
  valueHash = ""
} = {}) {
  return { path, sendPolicy, valueType, itemCount, stringLength, valueHash };
}

function ledger(entries) {
  return { entries, blockedPathCount: 0 };
}

const p02 = ledger([
  entry("name", { stringLength: 32, valueHash: "sha256:p02-name" }),
  entry("project_materials.external_url_material_list", { valueType: "array", itemCount: 1, valueHash: "sha256:external" }),
  entry("project_materials.image_material_list", { valueType: "array", itemCount: 0, valueHash: "sha256:empty" }),
  entry("project_materials.mini_program_info.url", { stringLength: 206, valueHash: "sha256:mini" }),
  entry("project_materials.mini_program_info.app_id", { sendPolicy: "omit", valueType: "absent" }),
  entry("track_url_setting.action_track_url", { valueType: "array", itemCount: 1, valueHash: "sha256:tracking" })
]);

const historical = ledger([
  entry("name", { stringLength: 32, valueHash: "sha256:history-name" }),
  entry("project_materials.external_url_material_list", { sendPolicy: "omit", valueType: "absent" }),
  entry("project_materials.image_material_list", { valueType: "array", itemCount: 0, valueHash: "sha256:empty" }),
  entry("project_materials.mini_program_info.url", { stringLength: 206, valueHash: "sha256:mini" }),
  entry("project_materials.mini_program_info.app_id", { stringLength: 20, valueHash: "sha256:app" }),
  entry("track_url_setting.action_track_url", { valueType: "array", itemCount: 1, valueHash: "sha256:tracking" })
]);

const externalShape = summarizeFieldShape(p02, "project_materials.external_url_material_list");
const emptyImageShape = summarizeFieldShape(p02, "project_materials.image_material_list");
const omittedAppShape = summarizeFieldShape(p02, "project_materials.mini_program_info.app_id");
assert(externalShape.presence === "sent" && externalShape.itemCounts[0] === 1, "external_url_shape_not_preserved");
assert(emptyImageShape.presence === "sent" && emptyImageShape.itemCounts[0] === 0, "empty_image_array_not_distinguished");
assert(omittedAppShape.presence === "omitted", "omitted_app_id_not_distinguished");

const comparison = compareFieldLedgers(p02, historical);
assert(comparison.exactPaths.includes("project_materials.image_material_list"), "shared_empty_image_not_exact");
assert(comparison.exactPaths.includes("project_materials.mini_program_info.url"), "shared_mini_url_hash_not_exact");
assert(comparison.exactPaths.includes("track_url_setting.action_track_url"), "shared_tracking_hash_not_exact");
assert(comparison.changedPaths.some((item) => item.path === "project_materials.external_url_material_list"), "external_url_difference_missing");
assert(comparison.changedPaths.some((item) => item.path === "project_materials.mini_program_info.app_id"), "mini_app_id_difference_missing");

const candidateLedger = ledger([
  entry("name", { stringLength: 32, valueHash: "sha256:fresh-name" }),
  entry("project_materials.external_url_material_list", { valueType: "array", itemCount: 1, valueHash: "sha256:external" }),
  entry("project_materials.image_material_list", { sendPolicy: "omit", valueType: "absent" }),
  entry("project_materials.mini_program_info.url", { stringLength: 206, valueHash: "sha256:mini" }),
  entry("project_materials.mini_program_info.app_id", { sendPolicy: "omit", valueType: "absent" }),
  entry("track_url_setting.action_track_url", { valueType: "array", itemCount: 1, valueHash: "sha256:tracking" })
]);
const allowedDiff = validateSingleVariableLedgerDiff({
  baselineLedger: p02,
  candidateLedger,
  candidatePath: "project_materials.image_material_list"
});
assert(allowedDiff.status === "passed", `single_variable_diff_should_pass:${allowedDiff.unexpectedPaths.join(",")}`);

const bundledChange = ledger([
  ...candidateLedger.entries,
  entry("budget", { valueType: "number", valueHash: "sha256:changed-budget" })
]);
const blockedDiff = validateSingleVariableLedgerDiff({
  baselineLedger: p02,
  candidateLedger: bundledChange,
  candidatePath: "project_materials.image_material_list"
});
assert(blockedDiff.status === "blocked" && blockedDiff.unexpectedPaths.includes("budget"), "bundled_change_not_blocked");

const miniCandidate = selectSingleVariableCandidate({
  miniProgram: { status: "mismatch", verifiedReplacementPresent: true },
  tracking: { status: "partial" },
  resource: { status: "passed" },
  externalPage: { status: "partial" },
  commonStructural: { imageEmptyArrayShared: true }
});
assert(miniCandidate.candidatePath === "project_materials.mini_program_info.url", "mini_candidate_priority_changed");

const structuralCandidate = selectSingleVariableCandidate({
  miniProgram: { status: "passed" },
  tracking: { status: "passed" },
  resource: { status: "passed" },
  externalPage: { status: "passed" },
  commonStructural: { imageEmptyArrayShared: true }
});
assert(structuralCandidate.candidatePath === "project_materials.image_material_list", "structural_fallback_not_selected");

const unresolvedCandidate = selectSingleVariableCandidate({
  miniProgram: { status: "partial", verifiedReplacementPresent: false },
  tracking: { status: "partial", verifiedReplacementPresent: false },
  resource: { status: "passed", verifiedReplacementPresent: false },
  externalPage: { status: "partial" },
  commonStructural: { imageEmptyArrayShared: true }
});
assert(unresolvedCandidate.status === "blocked_no_verified_single_variable", "unverified_candidate_should_remain_blocked");
assert(unresolvedCandidate.futureCreateAllowed === false, "forensic_candidate_must_not_open_create");

const localFailure = classifySafePlatformFailure({ error_category: "landing_url_invalid", offending_field_path: "" });
assert(localFailure.causalityStatus === "local_safe_category_only", "local_error_category_promoted_to_platform_field");
assert(localFailure.fieldRootCauseProven === false, "local_error_category_must_not_prove_root_cause");

assert(OFFICIAL_CONTRACT_MATRIX.find((item) => item.path === "micro_promotion_type")?.evidenceLevel === "official_related_endpoint", "micro_promotion_create_contract_boundary_lost");

let unsafeValueBlocked = false;
try {
  assertForensicOutputSafe({ value: "sslocal://microgame?secret=1" });
} catch {
  unsafeValueBlocked = true;
}
assert(unsafeValueBlocked, "complete_link_literal_not_blocked");

let unsafeRequestIdBlocked = false;
try {
  assertForensicOutputSafe({ requestId: "complete-platform-request-id" });
} catch {
  unsafeRequestIdBlocked = true;
}
assert(unsafeRequestIdBlocked, "complete_request_id_key_not_blocked");

assertForensicOutputSafe({
  requestIdPresent: true,
  payloadBodyPersisted: false,
  responseBodyPersisted: false,
  linkHash: "sha256:safe"
});

process.stdout.write(`${JSON.stringify({
  status: "passed",
  exactFixturePaths: comparison.exactPathCount,
  changedFixturePaths: comparison.changedPathCount,
  candidateDecisionBlockedWithoutProof: true,
  payloadBodyPersisted: false,
  responseBodyPersisted: false
}, null, 2)}\n`);

import {
  LAUNCH_REQUEST_SCHEMA_VERSION,
  normalizeLaunchRequestFromBody,
  validateLaunchRequest
} from "../src/agents/launchRequest.mjs";
import { resolveLaunchRequestIntake } from "../src/agents/conversationIntentResolver.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const request = {
  schema_version: LAUNCH_REQUEST_SCHEMA_VERSION,
  operation: "create_std_project",
  route_id: "oceanengine_3_byte_mini_game",
  game_code: "JSZC",
  advertiser_id: "1871922999999999"
};

let modelCalls = 0;
const structured = await resolveLaunchRequestIntake({
  request,
  resolver: { resolve: async () => { modelCalls += 1; return {}; } }
});
assert(structured.parse_source === "structured_json", "structured_source_missing");
assert(JSON.stringify(structured.request) === JSON.stringify(request), "structured_request_not_preserved");
assert(modelCalls === 0, "structured_request_called_model");

const natural = await resolveLaunchRequestIntake({
  userIntent: "路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922999999999",
  draft: {}
});
assert(JSON.stringify(natural.request) === JSON.stringify(request), "natural_request_not_equivalent");

const partial = await resolveLaunchRequestIntake({
  userIntent: "路线 oceanengine_3_byte_mini_game，游戏 JSZC",
  draft: {}
});
const corrected = await resolveLaunchRequestIntake({
  userIntent: "账户 1871922999999999",
  draft: partial.request
});
assert(JSON.stringify(corrected.request) === JSON.stringify(request), "partial_correction_not_merged");

const multipleAccounts = await resolveLaunchRequestIntake({
  userIntent: "账户 1871922999999999 和账户 1871922888888888",
  draft: request
});
assert(multipleAccounts.issues?.[0]?.code === "multiple_advertiser_ids", "multiple_accounts_not_clarified");
assert(!multipleAccounts.request.advertiser_id, "multiple_accounts_retained_stale_account");

const unsupported = await resolveLaunchRequestIntake({
  userIntent: "给已有项目只改 ROI 系数",
  draft: request
});
assert(unsupported.issues?.[0]?.code === "operation_not_supported", "unsupported_operation_not_reported");
assert(unsupported.missing_fields.length === 3, "unsupported_operation_retained_draft");

for (const [value, code] of [
  [{ ...request, extra: true }, "launch_request_unknown_field"],
  [{ ...request, schema_version: "launch-request.v3" }, "launch_request_schema_version_not_supported"],
  [{ ...request, operation: "change_roi" }, "launch_request_operation_not_supported"],
  [{ ...request, advertiser_id: 1871922999999999 }, "launch_request_invalid_field"]
]) {
  try {
    validateLaunchRequest(value);
    throw new Error(`expected_${code}`);
  } catch (error) {
    assert(error.code === code, `wrong_error:${code}:${error.code}`);
  }
}

const v2Create = validateLaunchRequest({ ...request, schema_version: "launch-request.v2" });
assert(v2Create.schema_version === "launch-request.v2", "v2_create_not_accepted");
const appendDraft = {
  schema_version: "launch-request.v2", operation: "append_project_videos",
  route_id: request.route_id, game_code: request.game_code, advertiser_id: request.advertiser_id,
  project_id: "7684895789612826666", origin_resource_ids: ["fixture-video-1"]
};
const projectOnly = await resolveLaunchRequestIntake({ userIntent: "项目 7684895789612826667", draft: appendDraft });
assert(projectOnly.request.advertiser_id === request.advertiser_id, "project_id_overwrote_advertiser_id");
assert(projectOnly.request.project_id === "7684895789612826667", "project_id_not_updated");
const noAppend = await resolveLaunchRequestIntake({ userIntent: "只改 ROI，不要追加素材", draft: appendDraft });
assert(noAppend.issues?.[0]?.code === "operation_not_supported" && noAppend.missing_fields.length === 3, "unsupported_update_reused_append_draft");
const unknownLegacyOperation = () => normalizeLaunchRequestFromBody({ ...request, operation: "change_roi" });
try { unknownLegacyOperation(); throw new Error("unknown_legacy_operation_accepted"); } catch (error) {
  assert(error.code === "launch_request_operation_not_supported", "unknown_legacy_operation_wrong_error");
}

const legacy = normalizeLaunchRequestFromBody({
  route_id: request.route_id,
  game_code: request.game_code,
  advertiser_id: request.advertiser_id
});
assert(JSON.stringify(legacy.request) === JSON.stringify(request), "legacy_fields_not_normalized");
try {
  normalizeLaunchRequestFromBody({ request, user_intent: "账户 1871922999999999" });
  throw new Error("mixed_input_accepted");
} catch (error) {
  assert(error.code === "launch_request_input_conflict", "mixed_input_wrong_error");
}

console.log(JSON.stringify({
  status: "passed",
  structuredModelCalls: modelCalls,
  syntheticCases: ["structured", "natural", "partial-correction", "multiple-account", "unsupported-operation"],
  realPlatformWrites: 0
}, null, 2));

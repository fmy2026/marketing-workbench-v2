import {
  LAUNCH_REQUEST_SCHEMA_VERSION,
  normalizeLaunchRequestFromBody,
  validateProjectVideoAppendIntakeRequest,
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
  userIntent: "新建项目，路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922999999999",
  draft: {}
});
assert(JSON.stringify(natural.request) === JSON.stringify(request), "natural_request_not_equivalent");

const partial = await resolveLaunchRequestIntake({
  userIntent: "游戏 JSZC",
  draft: {}
});
const corrected = await resolveLaunchRequestIntake({
  userIntent: "新建项目，路线 oceanengine_3_byte_mini_game，账户 1871922999999999",
  draft: partial.draft
});
assert(JSON.stringify(corrected.request) === JSON.stringify(request), "partial_correction_not_merged");

let multiTurnModelCalls = 0;
const rejectedModel = {
  async resolve() {
    multiTurnModelCalls += 1;
    return { intent: "intake_update", confidence: 0.1, slots: {} };
  }
};
const screenshotFirstTurn = await resolveLaunchRequestIntake({
  userIntent: "新建项目，游戏 JSZC，账户 1871922999999999",
  draft: {},
  resolver: rejectedModel
});
assert(screenshotFirstTurn.can_start === false && screenshotFirstTurn.missing_fields.join(",") === "route_id", "screenshot_first_turn_not_partial");
assert(screenshotFirstTurn.model_assist?.outcome === "intent_confidence_rejected" && multiTurnModelCalls === 1, "screenshot_first_turn_model_fallback_missing");
const screenshotSecondTurn = await resolveLaunchRequestIntake({
  userIntent: "路线：oceanengine_3_byte_mini_game",
  draft: screenshotFirstTurn.draft,
  resolver: rejectedModel
});
assert(JSON.stringify(screenshotSecondTurn.request) === JSON.stringify(request), "screenshot_second_turn_not_merged_into_request");
assert(screenshotSecondTurn.can_start === true && multiTurnModelCalls === 1, "complete_merged_draft_called_model");
assert(screenshotSecondTurn.model_assist?.attempted === false && screenshotSecondTurn.parse_source === "rules", "complete_merged_draft_not_rules_only");
assert(screenshotSecondTurn.reply.includes("可启动流程"), "complete_merged_draft_reply_missing");

const help = await resolveLaunchRequestIntake({ userIntent: "你能做什么", draft: partial.draft, resolver: { resolve: async () => { throw new Error("help_called_model"); } } });
assert(help.request === null && help.can_start === false && help.draft.operation === "" && help.reply.includes("追加视频"), "help_response_not_bounded");
const invalidGame = await resolveLaunchRequestIntake({ userIntent: "游戏：OTHER", draft: partial.draft });
assert(invalidGame.request === null && invalidGame.issues?.[0]?.code === "game_not_supported", "invalid_game_not_clarified");
const operationOnly = await resolveLaunchRequestIntake({ userIntent: "追加视频", draft: partial.draft });
assert(operationOnly.request === null && operationOnly.draft.operation === "append_project_videos" && operationOnly.draft.game_code === "JSZC", "operation_selection_dropped_common_slot");
const appendFollowup = await resolveLaunchRequestIntake({ userIntent: "视频标识码：video-A", draft: operationOnly.draft });
assert(appendFollowup.draft.operation === "append_project_videos" && appendFollowup.draft.game_code === "JSZC" && appendFollowup.draft.origin_resource_ids[0] === "video-A", "append_followup_dropped_prior_slots");

const multipleAccounts = await resolveLaunchRequestIntake({
  userIntent: "账户 1871922999999999 和账户 1871922888888888",
  draft: request
});
assert(multipleAccounts.issues?.[0]?.code === "multiple_advertiser_ids", "multiple_accounts_not_clarified");
assert(multipleAccounts.request === null && !multipleAccounts.draft.advertiser_id, "multiple_accounts_retained_stale_account");

const unsupported = await resolveLaunchRequestIntake({
  userIntent: "给已有项目只改 ROI 系数",
  draft: request
});
assert(unsupported.issues?.[0]?.code === "operation_not_supported", "unsupported_operation_not_reported");
assert(unsupported.request === null && unsupported.draft.operation === "", "unsupported_operation_retained_draft");

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
const conciseAppend = validateProjectVideoAppendIntakeRequest({
  schema_version: "launch-request.v2", operation: "append_project_videos",
  advertiser_id: request.advertiser_id, project_id: "7684895789612826666", origin_resource_ids: ["fixture-video-1"]
});
assert(!conciseAppend.route_id && !conciseAppend.game_code, "concise_append_intake_added_context");
const conciseIntake = await resolveLaunchRequestIntake({ request: conciseAppend });
assert(conciseIntake.request === null && conciseIntake.missing_fields.length === 0 && conciseIntake.can_start === false, "concise_append_intake_started_without_project_context");
const projectOnly = await resolveLaunchRequestIntake({ userIntent: "项目 7684895789612826667", draft: appendDraft });
assert(projectOnly.request.advertiser_id === request.advertiser_id, "project_id_overwrote_advertiser_id");
assert(projectOnly.request.project_id === "7684895789612826667", "project_id_not_updated");
const accountChanged = await resolveLaunchRequestIntake({ userIntent: "账户 1871922888888888", draft: appendDraft });
assert(!accountChanged.draft.project_id && !accountChanged.draft.route_id && !accountChanged.draft.game_code, "account_change_retained_project_context");
const noAppend = await resolveLaunchRequestIntake({ userIntent: "只改 ROI，不要追加素材", draft: appendDraft });
assert(noAppend.issues?.[0]?.code === "operation_not_supported" && noAppend.request === null && noAppend.draft.operation === "", "unsupported_update_reused_append_draft");
const appendContext = { ...appendDraft, origin_resource_ids: [] };
for (const text of ["4iLE-2,4iG2-18", "4iLE-2 4iG2-18", "4iLE-2、4iG2-18；4iLE-3", "4iLE-2\n4iG2-18"]) {
  const directVideoList = await resolveLaunchRequestIntake({ userIntent: text, draft: appendContext });
  assert(directVideoList.draft.origin_resource_ids.length >= 2 && directVideoList.can_start, `direct_video_list_not_parsed:${JSON.stringify(text)}`);
}
const labelledVideoList = await resolveLaunchRequestIntake({ userIntent: "视频标识码：4iLE-2,4iG2-18，账户：1871922999999999", draft: appendContext });
assert(labelledVideoList.draft.origin_resource_ids.length === 2 && labelledVideoList.draft.advertiser_id === request.advertiser_id, "labelled_video_list_consumed_next_field");
const ambiguousBareNumeric = await resolveLaunchRequestIntake({ userIntent: "12345678,23456789", draft: appendContext });
assert(ambiguousBareNumeric.request === null && ambiguousBareNumeric.issues?.[0]?.code === "ambiguous_bare_numeric_video_identifier", "bare_numeric_video_list_not_clarified");
const duplicateVideoList = await resolveLaunchRequestIntake({ userIntent: "4iLE-2,4iLE-2", draft: appendContext });
assert(duplicateVideoList.request === null && duplicateVideoList.draft.origin_resource_ids.length === 0 && duplicateVideoList.issues?.[0]?.code === "launch_request_duplicate_origin_resource_id", "duplicate_video_list_partially_accepted");
const invalidVideoList = await resolveLaunchRequestIntake({ userIntent: "4iLE-2,not/valid", draft: appendContext });
assert(invalidVideoList.request === null && invalidVideoList.draft.origin_resource_ids.length === 0 && invalidVideoList.issues?.[0]?.code === "launch_request_invalid_origin_resource_id", "invalid_video_list_partially_accepted");
const tooManyVideoIds = Array.from({ length: 101 }, (_, index) => `video-${index}`).join(",");
const overLimitVideoList = await resolveLaunchRequestIntake({ userIntent: tooManyVideoIds, draft: appendContext });
assert(overLimitVideoList.request === null && overLimitVideoList.draft.origin_resource_ids.length === 0 && overLimitVideoList.issues?.some((issue) => issue.code === "launch_request_origin_resource_ids_exceed_limit"), "over_limit_video_list_accepted");
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
  syntheticCases: ["structured", "natural", "partial-correction", "model-fallback-then-merged-completion", "multiple-account", "unsupported-operation"],
  realPlatformWrites: 0
}, null, 2));

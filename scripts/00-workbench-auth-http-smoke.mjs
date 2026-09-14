import "../tests/support/network.mjs";
import { internalErrorDiagnostic, publicErrorResponse } from "../src/server/publicError.mjs";

const origin = process.env.MWBV2_TEST_ORIGIN;
if (!origin) throw new Error("isolated_test_origin_required");
const loginName = process.env.MWBV2_TEST_LOGIN_NAME || "";
const password = process.env.MWBV2_TEST_PASSWORD || "";
const nextPassword = process.env.MWBV2_TEST_NEW_PASSWORD || "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const internal = publicErrorResponse(Object.assign(
  new Error('ERROR: new row for relation "account_resources" violates check constraint "account_resources_inheritance_status_check"'),
  { statusCode: 500 }
));
const internalText = JSON.stringify(internal.body);
assert(internal.statusCode === 500 && internal.body.error === "internal_error", "internal_error_not_normalized");
assert(/^sha256:[a-f0-9]{64}$/.test(internal.body.details?.diagnostic_fingerprint || ""), "internal_error_fingerprint_missing");
assert(!/relation|constraint|account_resources|failing row/i.test(internalText), "internal_error_leaks_database_details");
const diagnostic = internalErrorDiagnostic({
  error: Object.assign(new Error("postgres://user:secret@db.internal/account_resources?token=raw-token"), {
    code: "57P01",
    stack: "Error: postgres://user:secret@db.internal/account_resources?token=raw-token\n    at protectedFrame (file:///srv/workbench/server.mjs?token=raw-token)\n    at nextFrame (file:///srv/workbench/router.mjs)"
  }),
  method: "post",
  pathname: "/api/workflow-cases?case_key=raw-input",
  stage: "start_workflow_create_case"
});
const diagnosticText = JSON.stringify(diagnostic);
assert(diagnostic.event === "workbench_internal_request_error", "internal_diagnostic_event_missing");
assert(diagnostic.method === "POST" && diagnostic.pathname === "/api/workflow-cases", "internal_diagnostic_request_fields_invalid");
assert(diagnostic.stage === "start_workflow_create_case" && diagnostic.error_code === "57P01", "internal_diagnostic_stage_or_code_invalid");
assert(/^sha256:[a-f0-9]{64}$/.test(diagnostic.diagnostic_fingerprint), "internal_diagnostic_fingerprint_missing");
assert(Array.isArray(diagnostic.stack_frames) && diagnostic.stack_frames.length === 2, "internal_diagnostic_stack_frames_missing");
assert(!/secret|raw-token|postgres:|account_resources|Error:/i.test(diagnosticText), "internal_diagnostic_leaks_sensitive_error_content");
assert(internalErrorDiagnostic({ stage: "untrusted_stage" }).stage === "", "internal_diagnostic_untrusted_stage_allowed");
const conflict = publicErrorResponse(Object.assign(new Error("workflow_case_key_already_exists"), {
  statusCode: 409,
  details: { caseId: "CASE-SMOKE" }
}));
assert(conflict.statusCode === 409 && conflict.body.error === "workflow_case_key_already_exists" && conflict.body.details?.caseId === "CASE-SMOKE", "defined_client_error_changed");

if (!loginName || !password || !nextPassword) {
  throw new Error("test_login_credentials_required");
}

const anonymous = await fetch(`${origin}/api/auth/me`);
assert(anonymous.status === 401, "anonymous_api_access_not_blocked");

const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ login_name: loginName, password })
});
const loginBody = await login.json();
assert(login.status === 200, `login_failed:${loginBody.error || login.status}`);
assert(loginBody.user?.mustChangePassword === true, "initial_password_change_not_required");
const setCookie = login.headers.get("set-cookie") || "";
assert(setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Strict"), "session_cookie_flags_missing");
const cookie = setCookie.split(";")[0];

const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
assert(me.status === 200, "authenticated_me_failed");

const blockedWorkbench = await fetch(`${origin}/api/launch/workbench`, { headers: { cookie } });
assert(blockedWorkbench.status === 403, "forced_password_change_bypass_allowed");

const change = await fetch(`${origin}/api/auth/change-password`, {
  method: "POST",
  headers: { "content-type": "application/json", origin, cookie },
  body: JSON.stringify({ current_password: password, new_password: nextPassword })
});
const changeBody = await change.json();
assert(change.status === 200, `password_change_failed:${changeBody.error || change.status}`);
assert(changeBody.user?.mustChangePassword === false, "password_change_flag_not_cleared");
const changedCookie = (change.headers.get("set-cookie") || "").split(";")[0];

let resetCompleted = false;
let protectedApisPassed = false;
try {
  const [workbench, report, users] = await Promise.all([
    fetch(`${origin}/api/launch/workbench`, { headers: { cookie: changedCookie } }),
    fetch(`${origin}/api/reports/workflow-summary`, { headers: { cookie: changedCookie } }),
    fetch(`${origin}/api/admin/users`, { headers: { cookie: changedCookie } })
  ]);
  assert(workbench.status === 200, "workbench_access_after_password_change_failed");
  assert(report.status === 200, "admin_report_access_failed");
  assert(users.status === 200, "admin_user_list_access_failed");
  const usersBody = await users.json();
  assert((usersBody.users || []).length === 3, "admin_user_list_count_mismatch");
  const launchRequest = {
    schema_version: "launch-request.v1",
    operation: "create_std_project",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922999999999"
  };
  const structuredIntake = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ request: launchRequest })
  });
  const structuredIntakeBody = await structuredIntake.json();
  assert(structuredIntake.status === 200, "structured_intake_rejected");
  assert(structuredIntakeBody.parse_source === "structured_json", "structured_intake_used_non_json_parser");
  assert(JSON.stringify(structuredIntakeBody.request) === JSON.stringify(launchRequest), "structured_intake_request_changed");
  assert(structuredIntakeBody.can_start === true && structuredIntakeBody.draft?.operation === "create_std_project", "structured_intake_start_contract_missing");
  const recommendation = await fetch(`${origin}/api/launch/project-recommendations?advertiser_id=1871922175825993`, { headers: { cookie: changedCookie } });
  const recommendationBody = await recommendation.json();
  assert(recommendation.status === 200 && recommendationBody.items?.length === 5 && !(recommendationBody.items || []).some((item) => item.projectId === "9000000000000001"), "verified_project_recommendation_limit_invalid");
  const conciseAppend = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ request: {
      schema_version: "launch-request.v2", operation: "append_project_videos", advertiser_id: "1871922175825993",
      project_id: "9000000000000001", origin_resource_ids: ["video-A"]
    } })
  });
  const conciseAppendBody = await conciseAppend.json();
  assert(conciseAppend.status === 200 && conciseAppendBody.can_start === true && conciseAppendBody.request?.route_id === "oceanengine_3_byte_mini_game" && conciseAppendBody.project?.source === "verified_postgres", "concise_append_project_context_not_hydrated");
  const unknownAppend = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ request: {
      schema_version: "launch-request.v2", operation: "append_project_videos", advertiser_id: "1871922175825993",
      project_id: "9000000000000999", origin_resource_ids: ["video-A"]
    } })
  });
  const unknownAppendBody = await unknownAppend.json();
  assert(unknownAppend.status === 200 && unknownAppendBody.can_start === false && unknownAppendBody.request === null && unknownAppendBody.reply?.includes("未找到已验证项目"), "unverified_append_project_not_blocked");
  const helpIntake = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ user_intent: "你能做什么", draft: { operation: "", route_id: "", game_code: "", advertiser_id: "", project_id: "", origin_resource_ids: [] } })
  });
  const helpIntakeBody = await helpIntake.json();
  assert(helpIntake.status === 200 && helpIntakeBody.request === null && helpIntakeBody.can_start === false && helpIntakeBody.reply?.includes("追加视频"), "help_intake_contract_invalid");
  const unknownField = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ request: { ...launchRequest, unexpected: true } })
  });
  const unknownFieldBody = await unknownField.json();
  assert(unknownField.status === 400 && unknownFieldBody.details?.fields?.includes("unexpected"), "structured_unknown_field_not_rejected");
  const mixedIntake = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: JSON.stringify({ request: launchRequest, user_intent: "账户 1871922999999999" })
  });
  assert(mixedIntake.status === 400, "mixed_intake_not_rejected");
  const malformedIntake = await fetch(`${origin}/api/launch/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: "{\"request\":"
  });
  assert(malformedIntake.status === 400, "malformed_json_not_rejected");
  protectedApisPassed = true;
} finally {
  const reset = await fetch(`${origin}/api/admin/users/${encodeURIComponent(loginBody.user.userId)}/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: changedCookie },
    body: "{}"
  });
  resetCompleted = reset.status === 200;
}
assert(resetCompleted, "default_password_restore_failed");

const restoredLogin = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ login_name: loginName, password })
});
const restoredBody = await restoredLogin.json();
assert(restoredLogin.status === 200 && restoredBody.user?.mustChangePassword === true, "default_password_restore_verification_failed");
const restoredCookie = (restoredLogin.headers.get("set-cookie") || "").split(";")[0];
const logout = await fetch(`${origin}/api/auth/logout`, {
  method: "POST",
  headers: { "content-type": "application/json", origin, cookie: restoredCookie },
  body: "{}"
});
assert(logout.status === 200, "logout_failed");
assert((logout.headers.get("set-cookie") || "").includes("Max-Age=0"), "logout_cookie_not_cleared");

console.log(JSON.stringify({
  status: "passed",
  anonymousBlocked: true,
  loginPassed: true,
  forcedPasswordChange: true,
  protectedWorkbenchBlockedBeforeChange: true,
  passwordChangePassed: true,
  protectedApisPassed,
  structuredIntakePassed: true,
  defaultPasswordRestored: true,
  logoutPassed: true
}, null, 2));

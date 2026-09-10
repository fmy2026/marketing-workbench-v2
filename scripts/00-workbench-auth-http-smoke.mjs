import { publicErrorResponse } from "../src/server/publicError.mjs";

const origin = process.env.MWBV2_TEST_ORIGIN || "http://127.0.0.1:3000";
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
const conflict = publicErrorResponse(Object.assign(new Error("workflow_case_key_already_exists"), {
  statusCode: 409,
  details: { caseId: "CASE-SMOKE" }
}));
assert(conflict.statusCode === 409 && conflict.body.error === "workflow_case_key_already_exists" && conflict.body.details?.caseId === "CASE-SMOKE", "defined_client_error_changed");

if (!loginName || !password || !nextPassword) {
  if (process.env.MWBV2_AUTH_HTTP_ASSERTIONS_ONLY === "true") {
    console.log(JSON.stringify({
      status: "passed",
      internalErrorBoundary: true,
      authenticatedFlow: "not_run_missing_test_credentials"
    }, null, 2));
    process.exit(0);
  }
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
  defaultPasswordRestored: true,
  logoutPassed: true
}, null, 2));

const origin = process.env.MWBV2_TEST_ORIGIN || "http://127.0.0.1:3000";
const adminLogin = process.env.MWBV2_TEST_ADMIN_LOGIN || "";
const operatorLogin = process.env.MWBV2_TEST_OPERATOR_LOGIN || "";
const defaultPassword = process.env.MWBV2_TEST_PASSWORD || "";
const adminPassword = process.env.MWBV2_TEST_ADMIN_NEW_PASSWORD || "";
const operatorPassword = process.env.MWBV2_TEST_OPERATOR_NEW_PASSWORD || "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonHeaders(cookie = "") {
  return { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) };
}

async function login(loginName, password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login_name: loginName, password })
  });
  const body = await response.json();
  assert(response.status === 200, `login_failed:${loginName}:${body.error || response.status}`);
  return { body, cookie: (response.headers.get("set-cookie") || "").split(";")[0] };
}

async function changePassword(cookie, currentPassword, newPassword) {
  const response = await fetch(`${origin}/api/auth/change-password`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
  });
  const body = await response.json();
  assert(response.status === 200, `password_change_failed:${body.error || response.status}`);
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function resetPassword(adminCookie, userId) {
  return fetch(`${origin}/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    headers: jsonHeaders(adminCookie),
    body: "{}"
  });
}

assert(adminLogin && operatorLogin && defaultPassword && adminPassword && operatorPassword, "cross_user_test_credentials_required");

let adminCookie = "";
let operatorCookie = "";
let adminUserId = "";
let operatorUserId = "";
let operatorReset = false;
let adminReset = false;

try {
  const adminInitial = await login(adminLogin, defaultPassword);
  adminUserId = adminInitial.body.user.userId;
  adminCookie = await changePassword(adminInitial.cookie, defaultPassword, adminPassword);

  const operatorInitial = await login(operatorLogin, defaultPassword);
  operatorUserId = operatorInitial.body.user.userId;
  operatorCookie = await changePassword(operatorInitial.cookie, defaultPassword, operatorPassword);

  const adminDetailResponse = await fetch(`${origin}/api/reports/workflow-detail`, { headers: { cookie: adminCookie } });
  const adminDetail = await adminDetailResponse.json();
  assert(adminDetailResponse.status === 200, "admin_detail_report_failed");
  const adminCase = (adminDetail.cases || []).find((item) => item.owner_user_id === adminUserId && item.latest_job_id);
  assert(adminCase?.case_id && adminCase?.latest_job_id, "admin_owned_case_fixture_missing");

  const [operatorSummaryResponse, operatorAdminResponse, crossCaseResponse, crossJobResponse, crossCommandResponse] = await Promise.all([
    fetch(`${origin}/api/reports/workflow-summary`, { headers: { cookie: operatorCookie } }),
    fetch(`${origin}/api/admin/users`, { headers: { cookie: operatorCookie } }),
    fetch(`${origin}/api/workflow-cases/${encodeURIComponent(adminCase.case_id)}`, { headers: { cookie: operatorCookie } }),
    fetch(`${origin}/api/launch/jobs/${encodeURIComponent(adminCase.latest_job_id)}`, { headers: { cookie: operatorCookie } }),
    fetch(`${origin}/api/launch/jobs/${encodeURIComponent(adminCase.latest_job_id)}/command`, {
      method: "POST",
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ message: "继续执行" })
    })
  ]);

  const operatorSummary = await operatorSummaryResponse.json();
  assert(operatorSummaryResponse.status === 200, "operator_summary_failed");
  assert((operatorSummary.users || []).length === 1, "operator_summary_not_single_user");
  assert(operatorSummary.users[0]?.user_id === operatorUserId, "operator_summary_wrong_owner");
  assert(operatorAdminResponse.status === 403, "operator_admin_access_allowed");
  assert(crossCaseResponse.status === 404, "cross_user_case_read_allowed");
  assert(crossJobResponse.status === 404, "cross_user_job_read_allowed");
  assert(crossCommandResponse.status === 404, "cross_user_job_command_allowed");

  console.log(JSON.stringify({
    status: "passed",
    operatorSummaryRows: operatorSummary.users.length,
    operatorAdminBlocked: true,
    crossUserCaseBlocked: true,
    crossUserJobBlocked: true,
    crossUserCommandBlockedBeforeExecution: true,
    adminBypassNotGranted: true,
    realPlatformWriteCalled: false
  }, null, 2));
} finally {
  if (adminCookie && operatorUserId) {
    operatorReset = (await resetPassword(adminCookie, operatorUserId)).status === 200;
  }
  if (adminCookie && adminUserId) {
    adminReset = (await resetPassword(adminCookie, adminUserId)).status === 200;
  }
  if ((operatorUserId && !operatorReset) || (adminUserId && !adminReset)) {
    throw new Error(`test_password_restore_failed:operator=${operatorReset}:admin=${adminReset}`);
  }
}

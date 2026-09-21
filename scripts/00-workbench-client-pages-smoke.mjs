import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertQiankunCredential } from "../src/platforms/qiankunCredentialStore.mjs";

const origin = process.env.MWBV2_TEST_ORIGIN;
const loginName = process.env.MWBV2_TEST_LOGIN_NAME || "";
const password = process.env.MWBV2_TEST_PASSWORD || "";
const nextPassword = process.env.MWBV2_TEST_NEW_PASSWORD || "";
const qiankunEnvPath = process.env.QIANKUN_MONITOR_ENV_PATH || "";
const qiankunCredentialStorePath = process.env.QIANKUN_CREDENTIAL_STORE_PATH || "";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!origin || !loginName || !password || !nextPassword || !qiankunEnvPath || !qiankunCredentialStorePath) throw new Error("isolated_browser_test_credentials_required");
await access(chromePath);
await writeFile(qiankunEnvPath, `QIANKUN_API_BASE_URL=https://qiankun.test\nQIANKUN_CREDENTIAL_STORE_PATH=${qiankunCredentialStorePath}\n`, { mode: 0o600 });
upsertQiankunCredential({
  ownerKey: "test_admin",
  ownerName: "Test Admin",
  passportToken: "synthetic-passport-token",
  envPath: qiankunEnvPath,
  storePath: qiankunCredentialStorePath
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(work, label) {
  const deadline = Date.now() + 15000;
  let latest = false;
  while (Date.now() < deadline) {
    latest = await work();
    if (latest) return latest;
    await delay(80);
  }
  throw new Error(`browser_wait_timeout:${label}`);
}

function cdp(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`cdp:${message.error.message}`));
    else entry.resolve(message.result);
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { socket, call };
}

const directory = await mkdtemp(join(tmpdir(), "mwb-browser-"));
const port = 34000 + Math.floor(Math.random() * 1000);
const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${directory}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "about:blank"
], { stdio: "ignore" });

let jsonBrowser = null;
try {
  process.env.MWBV2_TEST_ORIGIN = `http://127.0.0.1:${port}`;
  const target = await until(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return tabs.find((tab) => tab.type === "page") || false;
    } catch {
      return false;
    }
  }, "cdp_target");
  const browser = cdp(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browser.socket.addEventListener("open", resolve, { once: true });
    browser.socket.addEventListener("error", reject, { once: true });
  });
  process.env.MWBV2_TEST_ORIGIN = origin;
  await browser.call("Page.enable");
  await browser.call("Runtime.enable");
  const evaluate = async (expression) => {
    const result = await browser.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`page_exception:${result.exceptionDetails.text}`);
    return result.result?.value;
  };
  const present = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const visible = (selector) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node && !node.hidden); })()`);
  const fill = (selector, value) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

  await browser.call("Page.navigate", { url: origin });
  await until(() => present("#loginForm"), "login_form");
  await fill("#loginName", loginName);
  await fill("#loginPassword", password);
  await evaluate("document.querySelector('#loginForm').requestSubmit()");
  await until(() => visible("#passwordModal"), "forced_password_change");
  await fill("#currentPassword", password);
  await fill("#newPassword", nextPassword);
  await fill("#confirmPassword", nextPassword);
  await evaluate("document.querySelector('#changePasswordForm').requestSubmit()");
  await until(() => present(".agent-open-button:not([disabled])"), "agent_hub");
  await click(".agent-open-button:not([disabled])");
  await until(() => present("#conversationModule:not([hidden])"), "conversation_workspace");
  assert(await evaluate("document.querySelector('#workflowRail').hidden"), "initial_workflow_rail_visible");
  assert(await evaluate("document.querySelector('#commandBar').hidden"), "initial_progress_visible");
  assert(!await present("#intakeAction"), "legacy_top_start_entry_retained");
  assert(await evaluate("document.querySelector('#chatInput').tagName === 'TEXTAREA'"), "natural_input_not_multiline");
  assert((await evaluate("document.querySelector('#chatStream').textContent")).includes("请输入投放需求"), "initial_welcome_missing");
  await fill("#chatInput", "保留换行");
  assert(await evaluate("(() => { const input = document.querySelector('#chatInput'); return input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })) && input.value === '保留换行'; })()"), "shift_enter_submitted_natural_input");
  assert(await evaluate("(() => { const input = document.querySelector('#chatInput'); return input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })) && input.value === '保留换行'; })()"), "ime_enter_submitted_natural_input");
  await fill("#chatInput", "");

  await fill("#chatInput", "你能做什么");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('追加视频')"), "bounded_help_reply");
  assert(!await present(".conversation-start-card"), "help_enabled_start");

  await fill("#chatInput", "游戏 JSZC");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('你想新建项目')"), "partial_game_reply");
  assert(!await present(".conversation-start-card"), "partial_natural_start_visible");

  await evaluate(`(() => {
    const originalFetch = window.fetch;
    window.__intakeOriginalFetch = originalFetch;
    window.fetch = async (...args) => {
      const request = String(args[0]);
      const options = args[1] || {};
      const response = await originalFetch(...args);
      const body = options.body ? JSON.parse(options.body) : null;
      if (request !== "/api/launch/intake" || options.method !== "POST" || body?.user_intent !== "路线：oceanengine_3_byte_mini_game") return response;
      const intake = await response.clone().json();
      return new Response(JSON.stringify({ ...intake, parse_source: "rules_fallback", model_assist: { attempted: true, outcome: "intent_confidence_rejected", accepted_slots: [] } }), { status: response.status, headers: { "content-type": "application/json" } });
    };
  })()`);
  await fill("#chatInput", "新建项目，游戏 JSZC，账户 1871922999999999");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('推广路线')"), "model_fallback_partial_reply");
  await fill("#chatInput", "路线：oceanengine_3_byte_mini_game");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => present(".conversation-start-card"), "model_fallback_merged_ready");
  assert(!await evaluate("document.querySelector('.conversation-start-card .start-button').disabled"), "model_fallback_merged_start_disabled");
  assert((await evaluate("document.querySelector('#agentStatus').textContent")) === "待启动", "model_fallback_merged_status_not_pending_start");
  assert((await evaluate("document.querySelector('#configTip').textContent")).includes("回退规则解析"), "model_fallback_parse_label_missing");
  await evaluate("window.fetch = window.__intakeOriginalFetch");

  await fill("#chatInput", "新建项目，路线 oceanengine_3_byte_mini_game，账户 1871922999999999");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => present(".conversation-start-card"), "natural_ready");
  assert(await evaluate("document.querySelectorAll('.conversation-start-card').length === 1"), "natural_start_card_not_unique");
  assert(await evaluate("document.querySelector('.conversation-start-card').textContent.includes('输入已齐全，是否开始检查？')"), "natural_start_card_prompt_missing");
  assert(!await evaluate("document.querySelector('.conversation-start-card .start-button').disabled"), "complete_natural_input_did_not_enable_start");
  assert((await evaluate("document.querySelector('#agentStatus').textContent")) === "待启动", "natural_ready_status_not_pending_start");
  assert((await evaluate("document.querySelector('#configTip').textContent")).includes("规则解析"), "natural_parse_label_missing");

  await fill("#chatInput", "需要修改");
  assert(!await present(".conversation-start-card"), "editing_natural_input_retained_stale_start_card");
  assert((await evaluate("document.querySelector('#agentStatus').textContent")) === "等待补齐", "editing_natural_input_retained_pending_status");
  await fill("#chatInput", "新建项目，路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922999999999");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => present(".conversation-start-card"), "natural_ready_after_edit");

  await evaluate(`(() => {
    const originalFetch = window.fetch;
    window.__originalFetch = originalFetch;
    window.__startCaseCalls = 0;
    window.__workflowRequests = [];
    window.fetch = async (...args) => {
      const request = String(args[0]);
      const options = args[1] || {};
      if (request === "/api/workflow-cases" && options.method === "POST") {
        window.__startCaseCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (options.method === "POST" && (request === "/api/workflow-cases" || request === "/api/launch/jobs" || /\\/api\\/launch\\/jobs\\/[^/]+\\/run$/.test(request))) {
        window.__workflowRequests.push({ request, body: options.body ? JSON.parse(options.body) : null });
      }
      const response = await originalFetch(...args);
      return response;
    };
  })()`);
  await click(".conversation-start-card .start-button");
  assert(await visible("#workflowRail"), "startup_click_did_not_open_workflow_rail");
  assert(await evaluate("document.querySelector('.conversation-start-card .start-button').textContent === '启动中…'"), "startup_button_did_not_show_busy_state");
  assert(await evaluate("document.querySelector('.conversation-start-card .start-button').disabled"), "startup_button_not_disabled");
  await click(".conversation-start-card .start-button");
  assert((await evaluate("window.__startCaseCalls")) === 1, "startup_request_repeated_while_busy");
  await until(() => evaluate("document.querySelector('#agentStatus').textContent === '启动受阻'"), "startup_preflight_failure");
  assert(await evaluate("document.querySelector('#workflowRail').textContent.includes('流程尚未建立')"), "preflight_failure_missing_startup_rail_state");
  const startupFailureCopy = await evaluate("document.querySelector('.conversation-start-card').textContent");
  assert(/账户索引未确认唯一的账户身份|账户预检暂未完成/.test(startupFailureCopy), `preflight_failure_missing_controlled_copy:${startupFailureCopy}`);
  assert(await evaluate("document.querySelectorAll('.conversation-start-card').length === 1"), "preflight_failure_duplicated_start_card");
  await evaluate("window.__startCaseCalls = 0; window.__workflowRequests = []");

  await click('[data-intake-mode="json"]');
  await until(() => visible("#structuredRequestPanel"), "json_panel");
  assert(!await present(".conversation-start-card"), "switch_mode_retained_stale_ready_draft");
  const templateText = await evaluate("document.querySelector('#structuredRequestInput').value");
  assert(templateText.includes("launch-request.v1"), "json_template_not_available");
  assert(!await present("#copyLaunchRequestTemplate"), "copy_template_button_retained");
  const request = {
    schema_version: "launch-request.v1",
    operation: "create_std_project",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922999999999"
  };
  await fill("#structuredRequestInput", JSON.stringify(request));
  await click("#submitStructuredRequest");
  await until(() => present(".conversation-start-card"), "structured_ready");
  assert((await evaluate("document.querySelector('.conversation-start-card').textContent")).includes("新建标准项目"), "structured_launch_summary_missing");
  assert((await evaluate("document.querySelector('#configTip').textContent")).includes("JSON"), "structured_parse_label_missing");
  await click('[data-intake-mode="natural"]');
  await until(() => visible("#chatForm"), "natural_panel_restored");
  assert(!await present(".conversation-start-card"), "switch_back_retained_structured_draft");
  await fill("#chatInput", "追加视频");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('账户 ID、项目 ID、视频标识码')"), "append_three_input_prompt");
  await fill("#chatInput", "账户 1871922175825993");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => present(".project-recommendation-row button"), "verified_project_recommendation");
  await until(() => evaluate("!document.querySelector('.project-recommendation-row button').disabled"), "verified_project_recommendation_ready");
  assert(await evaluate("getComputedStyle(document.querySelector('.project-recommendation-row')).display === 'grid'"), "project_recommendation_row_layout_missing");
  await click(".project-recommendation-row button");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('已匹配项目')"), "selected_project_needs_video");
  assert(!(await evaluate("document.querySelector('#intentCard').textContent")).includes("0 条"), "empty_video_card_visible");
  await fill("#chatInput", "video-A,\nvideo-B");
  assert(await evaluate("document.querySelector('#chatInput').value.includes('\\n')"), "multiline_video_paste_not_preserved");
  await evaluate("(() => { const input = document.querySelector('#chatInput'); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
  await until(() => present(".conversation-start-card"), "append_ready_after_project_selection");
  assert((await evaluate("document.querySelector('.conversation-start-card').textContent")).includes("追加视频"), "append_summary_missing");
  assert((await evaluate("document.querySelector('.conversation-start-card').textContent")).includes("2 条"), "append_video_count_missing");
  assert(await evaluate("document.querySelectorAll('.conversation-start-card').length === 1"), "append_start_card_not_unique");
  await browser.call("Emulation.setDeviceMetricsOverride", { width: 560, height: 700, deviceScaleFactor: 1, mobile: false });
  assert(await evaluate("(() => { const card = document.querySelector('.conversation-start-card'); const input = document.querySelector('#chatInput'); const cardRect = card?.getBoundingClientRect(); const inputRect = input?.getBoundingClientRect(); return cardRect && inputRect && cardRect.width <= window.innerWidth && inputRect.bottom <= window.innerHeight - 16; })()"), "narrow_start_card_or_input_layout_invalid");
  await browser.call("Emulation.clearDeviceMetricsOverride");
  await click(".conversation-start-card .start-button");
  assert(await visible("#workflowRail"), "append_start_did_not_open_workflow_rail");
  assert(await evaluate("document.querySelector('.conversation-start-card .start-button').disabled"), "append_start_button_not_disabled");
  await click(".conversation-start-card .start-button");
  assert((await evaluate("window.__startCaseCalls")) === 1, "append_start_request_repeated_while_busy");
  await until(() => visible("#commandBar"), "append_job_created");
  await until(() => evaluate("window.__workflowRequests.some((item) => /\\/api\\/launch\\/jobs\\/[^/]+\\/run$/.test(item.request))"), "append_readonly_started");
  const appendRequests = await evaluate("window.__workflowRequests");
  const appendCaseRequest = appendRequests.find((item) => item.request === "/api/workflow-cases")?.body?.request;
  const appendJobRequest = appendRequests.find((item) => item.request === "/api/launch/jobs")?.body?.request;
  assert(JSON.stringify(appendCaseRequest) === JSON.stringify(appendJobRequest), "append_case_and_job_request_snapshot_diverged");
  assert(appendCaseRequest?.route_id === "oceanengine_3_byte_mini_game" && appendCaseRequest?.game_code === "JSZC", "append_hydrated_context_missing_from_start_request");
  assert((appendCaseRequest?.origin_resource_ids || []).join(",") === "video-A,video-B", "append_start_request_videos_changed");
  assert(await evaluate("document.querySelectorAll('#workflowRail .phase-section').length === 3"), "append_job_nodes_not_rendered");
  const inputBottom = await evaluate("(() => { const rect = document.querySelector('#chatInput').getBoundingClientRect(); return { bottom: rect.bottom, height: window.innerHeight }; })()");
  assert(inputBottom.bottom <= inputBottom.height - 24, `chat_input_bottom_spacing_missing:${JSON.stringify(inputBottom)}`);
  const createdTarget = await browser.call("Target.createTarget", { url: "about:blank" });
  process.env.MWBV2_TEST_ORIGIN = `http://127.0.0.1:${port}`;
  const jsonTarget = await until(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return tabs.find((tab) => tab.id === createdTarget.targetId) || false;
    } catch {
      return false;
    }
  }, "json_cdp_target");
  jsonBrowser = cdp(jsonTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    jsonBrowser.socket.addEventListener("open", resolve, { once: true });
    jsonBrowser.socket.addEventListener("error", reject, { once: true });
  });
  process.env.MWBV2_TEST_ORIGIN = origin;
  await jsonBrowser.call("Page.enable");
  await jsonBrowser.call("Runtime.enable");
  const jsonEvaluate = async (expression) => {
    const result = await jsonBrowser.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`json_page_exception:${result.exceptionDetails.text}`);
    return result.result?.value;
  };
  const jsonPresent = (selector) => jsonEvaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const jsonVisible = (selector) => jsonEvaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node && !node.hidden); })()`);
  const jsonFill = (selector, value) => jsonEvaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const jsonClick = (selector) => jsonEvaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await jsonBrowser.call("Page.navigate", { url: `${origin}/agents/launch-creation` });
  await until(() => jsonPresent("#conversationModule:not([hidden])") || jsonPresent(".agent-open-button:not([disabled])"), "json_workspace_or_hub");
  if (await jsonPresent(".agent-open-button:not([disabled])")) {
    await jsonClick(".agent-open-button:not([disabled])");
    await until(() => jsonPresent("#conversationModule:not([hidden])"), "json_conversation_workspace");
  }
  await jsonClick('[data-intake-mode="json"]');
  await until(() => jsonVisible("#structuredRequestPanel"), "json_panel_for_start");
  const jsonRequest = {
    schema_version: "launch-request.v1",
    operation: "create_std_project",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "9000000000000001"
  };
  await jsonFill("#structuredRequestInput", JSON.stringify(jsonRequest));
  await jsonClick("#submitStructuredRequest");
  await until(() => jsonPresent(".conversation-start-card"), "json_ready_for_start");
  await jsonFill("#structuredRequestInput", JSON.stringify({ ...jsonRequest, advertiser_id: "9000000000000002" }));
  assert(!await jsonPresent(".conversation-start-card"), "editing_json_input_retained_stale_start_card");
  await jsonFill("#structuredRequestInput", JSON.stringify(jsonRequest));
  await jsonClick("#submitStructuredRequest");
  await until(() => jsonPresent(".conversation-start-card"), "json_ready_after_edit");
  await jsonEvaluate(`(() => {
    const originalFetch = window.fetch;
    window.__workflowRequests = [];
    window.fetch = async (...args) => {
      const request = String(args[0]);
      const options = args[1] || {};
      if (options.method === "POST" && (request === "/api/workflow-cases" || request === "/api/launch/jobs" || /\\/api\\/launch\\/jobs\\/[^/]+\\/run$/.test(request))) {
        window.__workflowRequests.push({ request, body: options.body ? JSON.parse(options.body) : null });
      }
      return originalFetch(...args);
    };
  })()`);
  await jsonClick(".conversation-start-card .start-button");
  await until(() => jsonVisible("#commandBar"), "json_job_created");
  await until(() => jsonEvaluate("window.__workflowRequests.some((item) => /\\/api\\/launch\\/jobs\\/[^/]+\\/run$/.test(item.request))"), "json_readonly_started");
  const jsonRequests = await jsonEvaluate("window.__workflowRequests");
  const jsonCaseRequest = jsonRequests.find((item) => item.request === "/api/workflow-cases")?.body?.request;
  const jsonJobRequest = jsonRequests.find((item) => item.request === "/api/launch/jobs")?.body?.request;
  assert(JSON.stringify(jsonCaseRequest) === JSON.stringify(jsonRequest), "json_case_request_not_preserved");
  assert(JSON.stringify(jsonJobRequest) === JSON.stringify(jsonRequest), "json_job_request_not_preserved");
  assert(await jsonEvaluate("document.querySelectorAll('#workflowRail .phase-section').length === 3"), "json_job_nodes_not_rendered");
  jsonBrowser.socket.close();
  browser.socket.close();
  console.log(JSON.stringify({ status: "passed", browser: "chrome-headless", interactions: ["login", "natural-partial", "input-switch", "append-start", "json-start"], realPlatformWrites: 0 }, null, 2));
} finally {
  jsonBrowser?.socket.close();
  chrome.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}

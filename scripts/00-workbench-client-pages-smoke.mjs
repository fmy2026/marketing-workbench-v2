import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.MWBV2_TEST_ORIGIN;
const loginName = process.env.MWBV2_TEST_LOGIN_NAME || "";
const password = process.env.MWBV2_TEST_PASSWORD || "";
const nextPassword = process.env.MWBV2_TEST_NEW_PASSWORD || "";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!origin || !loginName || !password || !nextPassword) throw new Error("isolated_browser_test_credentials_required");
await access(chromePath);

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
  assert(await evaluate("document.querySelector('#intakeAction').hidden"), "initial_start_visible");
  assert((await evaluate("document.querySelector('#chatStream').textContent")).includes("请输入投放需求"), "initial_welcome_missing");

  await fill("#chatInput", "你能做什么");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('追加视频')"), "bounded_help_reply");
  assert(await evaluate("document.querySelector('#intakeAction').hidden"), "help_enabled_start");

  await fill("#chatInput", "游戏 JSZC");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('你想新建项目')"), "partial_game_reply");
  assert(await evaluate("document.querySelector('#intakeAction').hidden"), "partial_natural_start_visible");

  await fill("#chatInput", "新建项目，路线 oceanengine_3_byte_mini_game，账户 1871922999999999");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("!document.querySelector('#intakeAction').hidden"), "natural_ready");
  assert(!await evaluate("document.querySelector('#startWorkflowButton').disabled"), "complete_natural_input_did_not_enable_start");
  assert((await evaluate("document.querySelector('#configTip').textContent")).includes("规则解析"), "natural_parse_label_missing");

  await click('[data-intake-mode="json"]');
  await until(() => visible("#structuredRequestPanel"), "json_panel");
  assert(await evaluate("document.querySelector('#startWorkflowButton').disabled"), "switch_mode_retained_stale_ready_draft");
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
  await until(() => evaluate("!document.querySelector('#startWorkflowButton').disabled"), "structured_ready");
  assert((await evaluate("document.querySelector('#intakeHint').textContent")).includes("新建标准项目"), "structured_launch_summary_missing");
  assert((await evaluate("document.querySelector('#configTip').textContent")).includes("JSON"), "structured_parse_label_missing");
  await click('[data-intake-mode="natural"]');
  await until(() => visible("#chatForm"), "natural_panel_restored");
  assert(await evaluate("document.querySelector('#startWorkflowButton').disabled"), "switch_back_retained_structured_draft");
  await fill("#chatInput", "追加视频");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('账户 ID、项目 ID、视频标识码')"), "append_three_input_prompt");
  await fill("#chatInput", "账户 1871922175825993");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => present(".project-recommendation-row button"), "verified_project_recommendation");
  await until(() => evaluate("!document.querySelector('.project-recommendation-row button').disabled"), "verified_project_recommendation_ready");
  await click(".project-recommendation-row button");
  await until(() => evaluate("document.querySelector('#chatStream').textContent.includes('已匹配项目')"), "selected_project_needs_video");
  assert(!(await evaluate("document.querySelector('#intentCard').textContent")).includes("0 条"), "empty_video_card_visible");
  await fill("#chatInput", "视频标识码：video-A");
  await evaluate("document.querySelector('#chatForm').requestSubmit()");
  await until(() => evaluate("!document.querySelector('#startWorkflowButton').disabled"), "append_ready_after_project_selection");
  assert((await evaluate("document.querySelector('#intakeHint').textContent")).includes("将给项目追加 1 条视频"), "append_summary_missing");
  const inputBottom = await evaluate("(() => { const rect = document.querySelector('#chatInput').getBoundingClientRect(); return { bottom: rect.bottom, height: window.innerHeight }; })()");
  assert(inputBottom.bottom <= inputBottom.height - 24, `chat_input_bottom_spacing_missing:${JSON.stringify(inputBottom)}`);
  browser.socket.close();
  console.log(JSON.stringify({ status: "passed", browser: "chrome-headless", interactions: ["login", "natural-partial", "input-switch", "json-template", "structured-validate", "verified-project-append"], realPlatformWrites: 0 }, null, 2));
} finally {
  chrome.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}

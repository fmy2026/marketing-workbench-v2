import {
  buildLaunchAgentPlist,
  parseModeArguments,
  resolveModeConfiguration
} from "./00-workbench-mode-switch.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBlocked(callback, expectedMessage) {
  try {
    callback();
  } catch (error) {
    assert(error.message === expectedMessage, `unexpected_blocker:${error.message}`);
    return;
  }
  throw new Error(`expected_blocker:${expectedMessage}`);
}

const local = resolveModeConfiguration({ mode: "local" });
assert(local.policy.publicOrigin === "http://127.0.0.1:3000", "local_origin_invalid");
assert(local.policy.privateLanHttp === false, "local_must_not_enable_private_lan");

const company = resolveModeConfiguration({
  mode: "company",
  host: "192.168.42.7",
  localAddresses: new Set(["192.168.42.7"])
});
assert(company.policy.publicOrigin === "http://192.168.42.7:3000", "company_origin_invalid");
assert(company.policy.privateLanHttp === true, "company_must_enable_private_lan");

expectBlocked(() => resolveModeConfiguration({ mode: "local", host: "192.168.42.7" }), "workbench_local_mode_does_not_accept_host");
expectBlocked(() => resolveModeConfiguration({ mode: "company", host: "8.8.8.8", localAddresses: new Set(["8.8.8.8"]) }), "WORKBENCH_PRIVATE_LAN_HTTP_private_ipv4_required");
expectBlocked(() => resolveModeConfiguration({ mode: "company", host: "192.168.42.7", localAddresses: new Set(["192.168.42.8"]) }), "workbench_company_host_not_assigned_to_this_mac");
expectBlocked(() => resolveModeConfiguration(parseModeArguments(["--mode", "company"])), "workbench_company_host_required");

const localPlist = buildLaunchAgentPlist({
  env: local.env,
  nodePath: "/node",
  workingDirectory: "/project",
  stdoutPath: "/stdout.log",
  stderrPath: "/stderr.log"
});
const companyPlist = buildLaunchAgentPlist({
  env: company.env,
  nodePath: "/node",
  workingDirectory: "/project",
  stdoutPath: "/stdout.log",
  stderrPath: "/stderr.log"
});
assert(localPlist.includes("http://127.0.0.1:3000"), "local_plist_origin_missing");
assert(!localPlist.includes("WORKBENCH_ALLOW_PRIVATE_LAN_HTTP"), "local_plist_must_not_enable_private_lan");
assert(companyPlist.includes("http://192.168.42.7:3000"), "company_plist_origin_missing");
assert(companyPlist.includes("WORKBENCH_ALLOW_PRIVATE_LAN_HTTP"), "company_plist_private_lan_missing");

console.log(JSON.stringify({
  status: "passed",
  local: true,
  company: true,
  invalidHostsBlocked: true,
  rollbackPath: "implemented_in_applyModeConfiguration"
}, null, 2));

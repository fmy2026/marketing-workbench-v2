import { resolveWorkbenchNetworkPolicy } from "../src/security/workbenchNetworkPolicy.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBlocked(env, expectedMessage) {
  try {
    resolveWorkbenchNetworkPolicy(env);
  } catch (error) {
    assert(error.message === expectedMessage, `unexpected_blocker:${error.message}`);
    return;
  }
  throw new Error(`network_policy_should_block:${expectedMessage}`);
}

const loopback = resolveWorkbenchNetworkPolicy({});
assert(loopback.bindHost === "127.0.0.1", "default_bind_host_changed");
assert(loopback.publicOrigin === "http://127.0.0.1:3000", "default_origin_changed");
assert(loopback.privateLanHttp === false, "default_must_not_be_private_lan");

expectBlocked({
  WORKBENCH_BIND_HOST: "192.168.42.7",
  WORKBENCH_PUBLIC_ORIGIN: "http://192.168.42.7:3000"
}, "WORKBENCH_PRIVATE_LAN_HTTP_explicit_enable_required");

const privateLan = resolveWorkbenchNetworkPolicy({
  WORKBENCH_BIND_HOST: "192.168.42.7",
  WORKBENCH_PORT: "3000",
  WORKBENCH_PUBLIC_ORIGIN: "http://192.168.42.7:3000",
  WORKBENCH_ALLOW_PRIVATE_LAN_HTTP: "true"
});
assert(privateLan.privateLanHttp === true, "private_lan_mode_not_enabled");
assert(privateLan.secureCookies === false, "private_lan_http_cookie_mode_invalid");

expectBlocked({
  WORKBENCH_BIND_HOST: "8.8.8.8",
  WORKBENCH_PUBLIC_ORIGIN: "http://8.8.8.8:3000",
  WORKBENCH_ALLOW_PRIVATE_LAN_HTTP: "true"
}, "WORKBENCH_PRIVATE_LAN_HTTP_private_ipv4_required");

expectBlocked({
  WORKBENCH_BIND_HOST: "192.168.42.8",
  WORKBENCH_PUBLIC_ORIGIN: "http://192.168.42.7:3000",
  WORKBENCH_ALLOW_PRIVATE_LAN_HTTP: "true"
}, "WORKBENCH_PRIVATE_LAN_HTTP_bind_host_mismatch");

const httpsProxy = resolveWorkbenchNetworkPolicy({
  WORKBENCH_BIND_HOST: "127.0.0.1",
  WORKBENCH_PUBLIC_ORIGIN: "https://workbench.internal.example"
});
assert(httpsProxy.secureCookies === true, "https_cookie_mode_invalid");

console.log(JSON.stringify({
  status: "passed",
  loopbackDefault: true,
  explicitPrivateLanEnableRequired: true,
  publicIpv4Blocked: true,
  bindOriginMustMatch: true,
  httpsProxyStillSupported: true
}, null, 2));

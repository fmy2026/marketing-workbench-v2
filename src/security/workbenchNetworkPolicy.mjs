const DEFAULT_BIND_HOST = "127.0.0.1";
const DEFAULT_BIND_PORT = 3000;

function clean(value) {
  return String(value ?? "").trim();
}

function isPrivateIpv4(hostname) {
  const parts = clean(hostname).split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function normalizedPort(value) {
  const port = Number(clean(value) || DEFAULT_BIND_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("WORKBENCH_PORT_invalid");
  return port;
}

export function resolveWorkbenchNetworkPolicy(env = process.env) {
  const bindHost = clean(env.WORKBENCH_BIND_HOST) || DEFAULT_BIND_HOST;
  const bindPort = normalizedPort(env.WORKBENCH_PORT);
  const bindOrigin = `http://${bindHost}:${bindPort}`;
  const publicOrigin = clean(env.WORKBENCH_PUBLIC_ORIGIN).replace(/\/$/, "") || bindOrigin;
  const publicOriginUrl = new URL(publicOrigin);
  const allowPrivateLanHttp = clean(env.WORKBENCH_ALLOW_PRIVATE_LAN_HTTP).toLowerCase() === "true";

  if (publicOriginUrl.origin !== publicOrigin) throw new Error("WORKBENCH_PUBLIC_ORIGIN_must_be_an_origin");
  if (!new Set(["http:", "https:"]).has(publicOriginUrl.protocol)) {
    throw new Error("WORKBENCH_PUBLIC_ORIGIN_protocol_invalid");
  }

  const loopbackHttp = publicOriginUrl.protocol === "http:" &&
    publicOriginUrl.hostname === DEFAULT_BIND_HOST &&
    bindHost === DEFAULT_BIND_HOST;
  const privateLanHttp = publicOriginUrl.protocol === "http:" && !loopbackHttp;
  if (privateLanHttp) {
    if (!allowPrivateLanHttp) throw new Error("WORKBENCH_PRIVATE_LAN_HTTP_explicit_enable_required");
    if (!isPrivateIpv4(publicOriginUrl.hostname)) throw new Error("WORKBENCH_PRIVATE_LAN_HTTP_private_ipv4_required");
    if (bindHost !== publicOriginUrl.hostname) throw new Error("WORKBENCH_PRIVATE_LAN_HTTP_bind_host_mismatch");
    const originPort = Number(publicOriginUrl.port || 80);
    if (originPort !== bindPort) throw new Error("WORKBENCH_PRIVATE_LAN_HTTP_port_mismatch");
  }

  return {
    bindHost,
    bindPort,
    bindOrigin,
    publicOrigin,
    publicOriginUrl,
    allowPrivateLanHttp,
    privateLanHttp,
    secureCookies: publicOriginUrl.protocol === "https:"
  };
}

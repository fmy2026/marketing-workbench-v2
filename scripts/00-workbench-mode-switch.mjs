import { execFileSync } from "node:child_process";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolveWorkbenchNetworkPolicy } from "../src/security/workbenchNetworkPolicy.mjs";

const SERVICE_LABEL = "com.hys.marketing-workbench.local-server";
const PORT = 3000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function clean(value) {
  return String(value ?? "").trim();
}

export function localIpv4Addresses(interfaces = networkInterfaces()) {
  return new Set(Object.values(interfaces)
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address));
}

export function parseModeArguments(argv) {
  let mode = "";
  let host = "";
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") mode = clean(argv[++index]);
    else if (arg === "--host") host = clean(argv[++index]);
    else if (arg === "--dry-run") dryRun = true;
    else throw new Error(`workbench_mode_argument_invalid:${arg}`);
  }
  if (!new Set(["local", "company"]).has(mode)) throw new Error("workbench_mode_required:local_or_company");
  return { mode, host, dryRun };
}

export function resolveModeConfiguration({ mode, host = "", localAddresses = localIpv4Addresses() }) {
  if (mode === "local") {
    if (clean(host)) throw new Error("workbench_local_mode_does_not_accept_host");
    const env = {
      WORKBENCH_BIND_HOST: "127.0.0.1",
      WORKBENCH_PORT: String(PORT),
      WORKBENCH_PUBLIC_ORIGIN: "http://127.0.0.1:3000"
    };
    return { mode, host: "127.0.0.1", env, policy: resolveWorkbenchNetworkPolicy(env) };
  }
  if (!clean(host)) throw new Error("workbench_company_host_required");
  const env = {
    WORKBENCH_BIND_HOST: host,
    WORKBENCH_PORT: String(PORT),
    WORKBENCH_PUBLIC_ORIGIN: `http://${host}:${PORT}`,
    WORKBENCH_ALLOW_PRIVATE_LAN_HTTP: "true"
  };
  const policy = resolveWorkbenchNetworkPolicy(env);
  if (!localAddresses.has(policy.bindHost)) throw new Error("workbench_company_host_not_assigned_to_this_mac");
  return { mode, host: policy.bindHost, env, policy };
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

export function buildLaunchAgentPlist({ env, nodePath = process.execPath, workingDirectory = projectRoot, stdoutPath, stderrPath }) {
  const environment = Object.entries({
    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    ...env
  }).map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>src/server/index.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${environment}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
</dict>
</plist>
`;
}

function launchctl(args, allowFailure = false) {
  try {
    execFileSync("launchctl", args, { stdio: "pipe" });
  } catch (error) {
    if (!allowFailure) throw new Error(`launchctl_${args[0]}_failed:${clean(error.stderr) || clean(error.message)}`);
  }
}

async function waitForRoot(origin) {
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
      lastError = `http_${response.status}`;
    } catch (error) {
      lastError = clean(error.message) || "request_failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`workbench_root_not_ready:${lastError}`);
}

function paths() {
  const launchAgents = join(homedir(), "Library", "LaunchAgents");
  const logs = join(homedir(), "Library", "Logs", "marketing-workbench");
  return {
    plist: join(launchAgents, `${SERVICE_LABEL}.plist`),
    temporary: join(launchAgents, `${SERVICE_LABEL}.plist.next`),
    backup: join(launchAgents, `${SERVICE_LABEL}.plist.backup`),
    stdoutPath: join(logs, "local-server-v2.out.log"),
    stderrPath: join(logs, "local-server-v2.err.log")
  };
}

function reload(plist) {
  const target = `gui/${process.getuid()}/${SERVICE_LABEL}`;
  launchctl(["bootout", target], true);
  launchctl(["bootstrap", `gui/${process.getuid()}`, plist]);
  launchctl(["kickstart", "-k", target]);
}

export async function applyModeConfiguration(configuration) {
  const filePaths = paths();
  const previous = await readFile(filePaths.plist);
  const plist = buildLaunchAgentPlist({
    env: configuration.env,
    stdoutPath: filePaths.stdoutPath,
    stderrPath: filePaths.stderrPath
  });
  await writeFile(filePaths.backup, previous, { mode: 0o600 });
  try {
    await writeFile(filePaths.temporary, plist, { mode: 0o644 });
    await rename(filePaths.temporary, filePaths.plist);
    await chmod(filePaths.plist, 0o644);
    reload(filePaths.plist);
    await waitForRoot(configuration.policy.publicOrigin);
    await rm(filePaths.backup, { force: true });
  } catch (error) {
    await writeFile(filePaths.temporary, previous, { mode: 0o644 });
    await rename(filePaths.temporary, filePaths.plist);
    reload(filePaths.plist);
    await rm(filePaths.backup, { force: true });
    throw new Error(`workbench_mode_apply_failed_rolled_back:${clean(error.message)}`);
  }
}

async function main() {
  const request = parseModeArguments(process.argv.slice(2));
  const configuration = resolveModeConfiguration(request);
  if (!request.dryRun) await applyModeConfiguration(configuration);
  console.log(JSON.stringify({
    status: request.dryRun ? "validated" : "applied",
    mode: configuration.mode,
    root_url: configuration.policy.publicOrigin,
    private_lan_http: configuration.policy.privateLanHttp
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

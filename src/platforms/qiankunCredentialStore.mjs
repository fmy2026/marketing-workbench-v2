import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");

export const QIANKUN_CREDENTIAL_SCHEMA_VERSION = "qiankun-passport-credentials-v1";
export const DEFAULT_QIANKUN_API_BASE_URL = "https://center.3k.com";
export const DEFAULT_QIANKUN_MONITOR_ENV_PATH = path.join(PROJECT_ROOT, ".local", "qiankun-monitor.env");
export const DEFAULT_QIANKUN_CREDENTIAL_STORE_PATH = ".local/qiankun-passport-credentials.json";

const QIANKUN_ENV_KEYS = [
  "QIANKUN_API_BASE_URL",
  "QIANKUN_CREDENTIAL_STORE_PATH"
];

function clean(value) {
  return String(value ?? "").trim();
}

function stripQuotes(value) {
  const text = clean(value);
  if (!text) return "";
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}

function parseLine(line) {
  const match = String(line ?? "").match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) return { type: "raw", raw: line };
  return {
    type: "entry",
    key: match[1],
    value: stripQuotes(match[2])
  };
}

function entriesToEnv(entries) {
  return Object.fromEntries(
    entries
      .filter((entry) => entry.type === "entry")
      .map((entry) => [entry.key, clean(entry.value)])
  );
}

function parseEnvText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(parseLine);
}

function formatValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:+=@%,-]+$/u.test(text)) return text;
  return JSON.stringify(text);
}

function serializeEntries(entries) {
  return `${entries
    .map((entry) => entry.type === "entry" ? `${entry.key}=${formatValue(entry.value)}` : entry.raw)
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
}

function setEntry(entries, key, value) {
  const existing = entries.find((entry) => entry.type === "entry" && entry.key === key);
  if (existing) {
    existing.value = String(value ?? "");
    return;
  }
  entries.push({ type: "entry", key, value: String(value ?? "") });
}

function ensureKnownKeys(entries) {
  const filtered = entries.filter((entry) => entry.type !== "entry" || QIANKUN_ENV_KEYS.includes(entry.key));
  if (!filtered.some((entry) => entry.type === "entry" && entry.key === "QIANKUN_API_BASE_URL")) {
    setEntry(filtered, "QIANKUN_API_BASE_URL", DEFAULT_QIANKUN_API_BASE_URL);
  }
  if (!filtered.some((entry) => entry.type === "entry" && entry.key === "QIANKUN_CREDENTIAL_STORE_PATH")) {
    setEntry(filtered, "QIANKUN_CREDENTIAL_STORE_PATH", DEFAULT_QIANKUN_CREDENTIAL_STORE_PATH);
  }
  return filtered;
}

function defaultEnvText() {
  return [
    "# Qiankun monitor API config",
    `QIANKUN_API_BASE_URL=${DEFAULT_QIANKUN_API_BASE_URL}`,
    `QIANKUN_CREDENTIAL_STORE_PATH=${DEFAULT_QIANKUN_CREDENTIAL_STORE_PATH}`,
    ""
  ].join("\n");
}

function parseTime(value) {
  const text = clean(value);
  if (!text) return NaN;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : NaN;
}

function resolveProjectPath(value) {
  const text = clean(value);
  if (!text) return "";
  return path.isAbsolute(text) ? text : path.join(PROJECT_ROOT, text);
}

export function resolveQiankunMonitorEnvPath(envPath = process.env.QIANKUN_MONITOR_ENV_PATH || DEFAULT_QIANKUN_MONITOR_ENV_PATH) {
  return path.resolve(envPath);
}

export function ensureQiankunMonitorEnvScaffold({ envPath } = {}) {
  const resolved = resolveQiankunMonitorEnvPath(envPath);
  if (!existsSync(resolved)) {
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, defaultEnvText(), { encoding: "utf8", mode: 0o600 });
  }
  chmodSync(resolved, 0o600);
  return resolved;
}

export function readQiankunMonitorEnv({ envPath, ensure = false } = {}) {
  const resolved = resolveQiankunMonitorEnvPath(envPath);
  if (ensure) ensureQiankunMonitorEnvScaffold({ envPath: resolved });
  const envFilePresent = existsSync(resolved);
  if (!envFilePresent) {
    return { envPath: resolved, envFilePresent, entries: [], env: {} };
  }
  const entries = ensureKnownKeys(parseEnvText(readFileSync(resolved, "utf8")));
  return { envPath: resolved, envFilePresent, entries, env: entriesToEnv(entries) };
}

export function resolveQiankunCredentialStorePath({ envPath, storePath, ensure = false } = {}) {
  const config = readQiankunMonitorEnv({ envPath, ensure });
  const configured = clean(storePath || config.env.QIANKUN_CREDENTIAL_STORE_PATH || DEFAULT_QIANKUN_CREDENTIAL_STORE_PATH);
  return resolveProjectPath(configured);
}

export function ensureQiankunCredentialStoreScaffold({ envPath, storePath } = {}) {
  const resolved = resolveQiankunCredentialStorePath({ envPath, storePath, ensure: true });
  if (!existsSync(resolved)) {
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, JSON.stringify({
      schema_version: QIANKUN_CREDENTIAL_SCHEMA_VERSION,
      updated_at: new Date(0).toISOString(),
      credentials: []
    }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  }
  chmodSync(resolved, 0o600);
  return resolved;
}

export function readQiankunCredentialStore({ envPath, storePath, ensure = false } = {}) {
  const envConfig = readQiankunMonitorEnv({ envPath, ensure });
  const resolved = ensure
    ? ensureQiankunCredentialStoreScaffold({ envPath: envConfig.envPath, storePath })
    : resolveQiankunCredentialStorePath({ envPath: envConfig.envPath, storePath });
  const storeFilePresent = existsSync(resolved);
  if (!storeFilePresent) {
    return {
      env: envConfig.env,
      envPath: envConfig.envPath,
      envFilePresent: envConfig.envFilePresent,
      storePath: resolved,
      storeFilePresent,
      schemaVersion: "",
      updatedAt: "",
      credentials: []
    };
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8"));
  const credentials = Array.isArray(parsed.credentials) ? parsed.credentials : [];
  return {
    env: envConfig.env,
    envPath: envConfig.envPath,
    envFilePresent: envConfig.envFilePresent,
    storePath: resolved,
    storeFilePresent,
    schemaVersion: clean(parsed.schema_version),
    updatedAt: clean(parsed.updated_at),
    credentials
  };
}

export function pendingQiankunCredentialForBootstrap({ envPath, storePath, now = new Date() } = {}) {
  const store = readQiankunCredentialStore({ envPath, storePath });
  const baseBlockers = [
    ...(!store.envFilePresent ? ["env_file_missing"] : []),
    ...(!clean(store.env.QIANKUN_API_BASE_URL) ? ["api_base_url_missing"] : []),
    ...(!store.storeFilePresent ? ["credential_store_missing"] : []),
    ...(store.schemaVersion && store.schemaVersion !== QIANKUN_CREDENTIAL_SCHEMA_VERSION ? ["credential_schema_version_mismatch"] : [])
  ];
  if (baseBlockers.length) {
    return {
      status: "blocked",
      ownerName: "",
      passportToken: "",
      blockers: baseBlockers
    };
  }

  const pendingCredentials = (store.credentials || [])
    .filter((item) => !clean(item.owner_key) && clean(item.passport_token));
  if (pendingCredentials.length !== 1) {
    return {
      status: "blocked",
      ownerName: "",
      passportToken: "",
      blockers: pendingCredentials.length > 1
        ? ["multiple_pending_owner_credentials"]
        : ["pending_owner_credential_missing"]
    };
  }

  const item = pendingCredentials[0];
  const redacted = redactedCredentialItem(item, now);
  const blockers = redacted.blockers.filter((blocker) => blocker !== "owner_key_missing");
  if (redacted.status !== "active" || blockers.length) {
    return {
      status: redacted.status,
      ownerName: redacted.ownerName,
      passportToken: "",
      blockers
    };
  }

  return {
    status: "active",
    ownerName: redacted.ownerName,
    passportToken: clean(item.passport_token),
    tokenUpdatedAt: redacted.tokenUpdatedAt,
    expiresAt: redacted.expiresAt,
    refreshAfter: redacted.refreshAfter,
    blockers: ["owner_key_pending_bootstrap_probe"]
  };
}

export function backfillPendingQiankunCredentialOwnerKey({ ownerKey, ownerName = "", envPath, storePath, now = new Date() } = {}) {
  const nextOwnerKey = clean(ownerKey);
  if (!nextOwnerKey) throw new Error("owner_key_required");
  if (/[\u0000-\u001F\u007F]/u.test(nextOwnerKey)) throw new Error("invalid_owner_key");
  const store = readQiankunCredentialStore({ envPath, storePath });
  const pendingCredentials = (store.credentials || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !clean(item.owner_key) && clean(item.passport_token));
  if (pendingCredentials.length !== 1) {
    throw new Error(pendingCredentials.length > 1
      ? "multiple_pending_owner_credentials"
      : "pending_owner_credential_missing");
  }
  const existing = (store.credentials || [])
    .find((item) => clean(item.owner_key) === nextOwnerKey);
  if (existing) throw new Error("owner_key_already_exists");

  const index = pendingCredentials[0].index;
  const nextCredentials = [...store.credentials];
  nextCredentials[index] = {
    ...nextCredentials[index],
    owner_key: nextOwnerKey,
    owner_name: clean(ownerName) || clean(nextCredentials[index].owner_name),
    owner_key_confirmed_at: now.toISOString()
  };
  const nextStore = {
    schema_version: store.schemaVersion || QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    updated_at: now.toISOString(),
    credentials: nextCredentials
  };
  writeFileSync(store.storePath, JSON.stringify(nextStore, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  chmodSync(store.storePath, 0o600);
  return redactedQiankunCredentialStatus({ ownerKey: nextOwnerKey, envPath, storePath, now });
}

function redactedCredentialItem(item = {}, now = new Date()) {
  const ownerKey = clean(item.owner_key);
  const ownerName = clean(item.owner_name);
  const storedStatus = clean(item.status || "missing");
  const tokenUpdatedAt = clean(item.token_updated_at);
  const expiresAt = clean(item.expires_at);
  const refreshAfter = clean(item.refresh_after);
  const expiresMs = parseTime(expiresAt);
  const refreshAfterMs = parseTime(refreshAfter);
  const tokenExpired = Boolean(expiresAt && Number.isFinite(expiresMs) && expiresMs <= now.getTime());
  const tokenRefreshAfterReached = Boolean(refreshAfter && Number.isFinite(refreshAfterMs) && refreshAfterMs <= now.getTime());
  const passportTokenPresent = Boolean(clean(item.passport_token));
  const status = tokenExpired || storedStatus === "expired"
    ? "expired"
    : storedStatus === "active" && passportTokenPresent
      ? "active"
      : "missing";
  const blockers = [
    ...(!ownerKey ? ["owner_key_missing"] : []),
    ...(!passportTokenPresent ? ["passport_token_missing"] : []),
    ...(tokenExpired ? ["passport_token_expired"] : []),
    ...(storedStatus && !["active", "expired"].includes(storedStatus) ? ["credential_status_not_active"] : []),
    ...(storedStatus === "missing" ? ["credential_status_missing"] : [])
  ];
  return {
    ownerKey,
    ownerName,
    status,
    passportTokenPresent,
    tokenUpdatedAt,
    expiresAt,
    refreshAfter,
    tokenExpired,
    tokenRefreshAfterReached,
    blockers
  };
}

export function getQiankunCredentialSummary({ ownerKey, envPath, storePath, ensure = false, now = new Date() } = {}) {
  const store = readQiankunCredentialStore({ envPath, storePath, ensure });
  const requestedOwnerKey = clean(ownerKey);
  const credentials = store.credentials.map((item) => redactedCredentialItem(item, now));
  const matched = requestedOwnerKey ? credentials.find((item) => item.ownerKey === requestedOwnerKey) || null : null;
  const usableCredentials = credentials.filter((item) => item.status === "active" && item.ownerKey);
  const pendingOwnerKeyCount = credentials.filter((item) => item.passportTokenPresent && !item.ownerKey).length;
  const blockers = [
    ...(!store.envFilePresent ? ["env_file_missing"] : []),
    ...(!clean(store.env.QIANKUN_API_BASE_URL) ? ["api_base_url_missing"] : []),
    ...(!store.storeFilePresent ? ["credential_store_missing"] : []),
    ...(store.schemaVersion && store.schemaVersion !== QIANKUN_CREDENTIAL_SCHEMA_VERSION ? ["credential_schema_version_mismatch"] : []),
    ...(!requestedOwnerKey && pendingOwnerKeyCount > 0 ? ["owner_key_missing"] : []),
    ...(requestedOwnerKey && !matched ? ["credential_missing_for_owner"] : []),
    ...(matched?.status === "expired" ? ["passport_token_expired"] : []),
    ...(matched && matched.status !== "active" ? ["passport_token_not_active"] : [])
  ];
  const status = requestedOwnerKey
    ? matched?.status || "missing"
    : usableCredentials.length
      ? "active"
      : credentials.some((item) => item.status === "expired")
        ? "expired"
        : "missing";

  return {
    status,
    envFilePresent: store.envFilePresent,
    credentialStorePresent: store.storeFilePresent,
    apiBaseUrl: clean(store.env.QIANKUN_API_BASE_URL || DEFAULT_QIANKUN_API_BASE_URL),
    credentialStorePathPresent: Boolean(clean(store.env.QIANKUN_CREDENTIAL_STORE_PATH)),
    schemaVersion: store.schemaVersion,
    schemaVersionMatches: store.schemaVersion === QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    storeUpdatedAt: store.updatedAt,
    requestedOwnerKey,
    matchedOwnerKey: matched?.ownerKey || "",
    matchedOwnerName: matched?.ownerName || "",
    credentialCount: credentials.length,
    activeCredentialCount: usableCredentials.length,
    pendingOwnerKeyCount,
    credentials,
    blockers
  };
}

export function redactedQiankunCredentialStatus(options = {}) {
  const summary = getQiankunCredentialSummary(options);
  return {
    status: summary.status,
    envFilePresent: summary.envFilePresent,
    credentialStorePresent: summary.credentialStorePresent,
    apiBaseUrlPresent: Boolean(summary.apiBaseUrl),
    credentialStorePathPresent: summary.credentialStorePathPresent,
    schemaVersionMatches: summary.schemaVersionMatches,
    storeUpdatedAt: summary.storeUpdatedAt,
    requestedOwnerKey: summary.requestedOwnerKey,
    matchedOwnerKey: summary.matchedOwnerKey,
    matchedOwnerName: summary.matchedOwnerName,
    credentialCount: summary.credentialCount,
    activeCredentialCount: summary.activeCredentialCount,
    pendingOwnerKeyCount: summary.pendingOwnerKeyCount,
    credentials: summary.credentials,
    blockers: summary.blockers
  };
}

export function credentialStatusForDatabase(summary = {}) {
  if (summary.status === "active") return "active";
  if (summary.status === "expired") return "expired";
  if (summary.status === "mismatch") return "mismatch";
  return "missing";
}

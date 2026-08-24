import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");

export const DEFAULT_OCEANENGINE_ENV_PATH = path.join(PROJECT_ROOT, ".local", "oceanengine.env");
export const TOKEN_REFRESH_CONFIRM_ENV = "MWBV2_OE_TOKEN_REFRESH_CONFIRM";
export const TOKEN_REFRESH_CONFIRM_VALUE = "REFRESH_ONE_OCEANENGINE_TOKEN";

export const OCEANENGINE_TOKEN_STATUSES = new Set([
  "missing",
  "valid",
  "expired_refresh_token_first",
  "reauthorize_required",
  "refresh_failed"
]);

export const OCEANENGINE_ENV_KEYS = [
  "OCEANENGINE_APP_ID",
  "OCEANENGINE_APP_SECRET",
  "OCEANENGINE_REDIRECT_URI",
  "OCEANENGINE_AUTH_STATE",
  "OCEANENGINE_AUTH_RID",
  "OCEANENGINE_AUTH_CODE",
  "OCEANENGINE_AUTH_UID",
  "OCEANENGINE_AUTH_SCOPE",
  "OCEANENGINE_MATERIAL_AUTH_STATUS",
  "OCEANENGINE_ACCESS_TOKEN",
  "OCEANENGINE_REFRESH_TOKEN",
  "OCEANENGINE_TOKEN_OBTAINED_AT",
  "OCEANENGINE_TOKEN_EXPIRES_AT",
  "OCEANENGINE_TOKEN_REFRESH_AFTER",
  "OCEANENGINE_TOKEN_STATUS"
];

const DEFAULT_ENV_VALUES = {
  OCEANENGINE_APP_ID: "",
  OCEANENGINE_APP_SECRET: "",
  OCEANENGINE_REDIRECT_URI: "",
  OCEANENGINE_AUTH_STATE: "",
  OCEANENGINE_AUTH_RID: "",
  OCEANENGINE_AUTH_CODE: "",
  OCEANENGINE_AUTH_UID: "",
  OCEANENGINE_AUTH_SCOPE: "",
  OCEANENGINE_MATERIAL_AUTH_STATUS: "",
  OCEANENGINE_ACCESS_TOKEN: "",
  OCEANENGINE_REFRESH_TOKEN: "",
  OCEANENGINE_TOKEN_OBTAINED_AT: "",
  OCEANENGINE_TOKEN_EXPIRES_AT: "",
  OCEANENGINE_TOKEN_REFRESH_AFTER: "",
  OCEANENGINE_TOKEN_STATUS: "missing"
};

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

function parseEnvText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(parseLine);
}

function entriesToEnv(entries) {
  return Object.fromEntries(
    entries
      .filter((entry) => entry.type === "entry")
      .map((entry) => [entry.key, clean(entry.value)])
  );
}

function formatValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:+=@%,-]+$/u.test(text)) return text;
  return JSON.stringify(text);
}

function serializeEntries(entries) {
  return `${entries
    .map((entry) => {
      if (entry.type === "raw") return entry.raw;
      return `${entry.key}=${formatValue(entry.value)}`;
    })
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
  const filtered = entries.filter((entry) => entry.type !== "entry" || OCEANENGINE_ENV_KEYS.includes(entry.key));
  for (const key of OCEANENGINE_ENV_KEYS) {
    if (!filtered.some((entry) => entry.type === "entry" && entry.key === key)) {
      setEntry(filtered, key, DEFAULT_ENV_VALUES[key] || "");
    }
  }
  return filtered;
}

function defaultEnvText() {
  return [
    "# OceanEngine app config",
    "OCEANENGINE_APP_ID=",
    "OCEANENGINE_APP_SECRET=",
    "OCEANENGINE_REDIRECT_URI=",
    "",
    "# OAuth bootstrap state",
    "OCEANENGINE_AUTH_STATE=",
    "OCEANENGINE_AUTH_RID=",
    "OCEANENGINE_AUTH_CODE=",
    "OCEANENGINE_AUTH_UID=",
    "OCEANENGINE_AUTH_SCOPE=",
    "OCEANENGINE_MATERIAL_AUTH_STATUS=",
    "",
    "# Token state",
    "OCEANENGINE_ACCESS_TOKEN=",
    "OCEANENGINE_REFRESH_TOKEN=",
    "OCEANENGINE_TOKEN_OBTAINED_AT=",
    "OCEANENGINE_TOKEN_EXPIRES_AT=",
    "OCEANENGINE_TOKEN_REFRESH_AFTER=",
    "OCEANENGINE_TOKEN_STATUS=missing",
    ""
  ].join("\n");
}

export function resolveOceanEngineEnvPath(envPath = process.env.OCEANENGINE_ENV_PATH || DEFAULT_OCEANENGINE_ENV_PATH) {
  return path.resolve(envPath);
}

export function ensureOceanEngineEnvScaffold({ envPath } = {}) {
  const resolved = resolveOceanEngineEnvPath(envPath);
  if (!existsSync(resolved)) {
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, defaultEnvText(), { encoding: "utf8", mode: 0o600 });
  }
  chmodSync(resolved, 0o600);
  return resolved;
}

export function readOceanEngineEnv({ envPath, ensure = false } = {}) {
  const resolved = resolveOceanEngineEnvPath(envPath);
  if (ensure) ensureOceanEngineEnvScaffold({ envPath: resolved });
  const envFilePresent = existsSync(resolved);
  if (!envFilePresent) {
    return { envPath: resolved, envFilePresent, entries: [], env: {} };
  }
  const entries = ensureKnownKeys(parseEnvText(readFileSync(resolved, "utf8")));
  return { envPath: resolved, envFilePresent, entries, env: entriesToEnv(entries) };
}

export function updateOceanEngineEnv(values = {}, { envPath, ensure = true } = {}) {
  const resolved = ensure ? ensureOceanEngineEnvScaffold({ envPath }) : resolveOceanEngineEnvPath(envPath);
  const current = readOceanEngineEnv({ envPath: resolved, ensure });
  const entries = ensureKnownKeys(current.entries);
  for (const [key, value] of Object.entries(values)) {
    if (OCEANENGINE_ENV_KEYS.includes(key)) setEntry(entries, key, value);
  }
  writeFileSync(resolved, serializeEntries(entries), { encoding: "utf8", mode: 0o600 });
  chmodSync(resolved, 0o600);
  return readOceanEngineEnv({ envPath: resolved });
}

function parseTime(value) {
  const text = clean(value);
  if (!text) return NaN;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : NaN;
}

function tokenStatusFor({ env, blockers, tokenExpired }) {
  const stored = clean(env.OCEANENGINE_TOKEN_STATUS);
  if (tokenExpired) return "expired_refresh_token_first";
  if (stored && OCEANENGINE_TOKEN_STATUSES.has(stored) && stored !== "valid") return stored;
  if (blockers.includes("token_status_not_valid")) return stored || "missing";
  if (blockers.length) return "missing";
  return "valid";
}

export function getOceanEngineCredentialSummary({ envPath, now = new Date(), ensure = false } = {}) {
  const { envFilePresent, env } = readOceanEngineEnv({ envPath, ensure });
  const tokenExpiresAt = clean(env.OCEANENGINE_TOKEN_EXPIRES_AT);
  const tokenRefreshAfter = clean(env.OCEANENGINE_TOKEN_REFRESH_AFTER);
  const expiresMs = parseTime(tokenExpiresAt);
  const refreshAfterMs = parseTime(tokenRefreshAfter);
  const nowMs = now.getTime();
  const accessTokenPresent = Boolean(clean(env.OCEANENGINE_ACCESS_TOKEN));
  const refreshTokenPresent = Boolean(clean(env.OCEANENGINE_REFRESH_TOKEN));
  const tokenExpired = Boolean(tokenExpiresAt && Number.isFinite(expiresMs) && expiresMs <= nowMs);
  const tokenRefreshAfterReached = Boolean(tokenRefreshAfter && Number.isFinite(refreshAfterMs) && refreshAfterMs <= nowMs);
  const storedTokenStatus = clean(env.OCEANENGINE_TOKEN_STATUS);
  const blockers = [
    ...(!envFilePresent ? ["env_file_missing"] : []),
    ...(!(clean(env.OCEANENGINE_APP_ID) && clean(env.OCEANENGINE_APP_SECRET) && clean(env.OCEANENGINE_REDIRECT_URI)) ? ["app_config_missing"] : []),
    ...(!accessTokenPresent ? ["access_token_missing"] : []),
    ...(!refreshTokenPresent ? ["refresh_token_missing"] : []),
    ...(tokenExpired ? ["access_token_expired_refresh_required"] : []),
    ...(
      accessTokenPresent &&
      refreshTokenPresent &&
      (!storedTokenStatus || storedTokenStatus !== "valid" || !OCEANENGINE_TOKEN_STATUSES.has(storedTokenStatus)) &&
      !tokenExpired
        ? ["token_status_not_valid"]
        : []
    )
  ];
  const status = tokenStatusFor({ env, blockers, tokenExpired });

  return {
    status,
    envFilePresent,
    appIdPresent: Boolean(clean(env.OCEANENGINE_APP_ID)),
    appSecretPresent: Boolean(clean(env.OCEANENGINE_APP_SECRET)),
    redirectUriPresent: Boolean(clean(env.OCEANENGINE_REDIRECT_URI)),
    accessTokenPresent,
    refreshTokenPresent,
    tokenExpiresAtPresent: Boolean(tokenExpiresAt),
    tokenRefreshAfterPresent: Boolean(tokenRefreshAfter),
    tokenExpired,
    tokenRefreshAfterReached,
    tokenExpiresAt,
    tokenRefreshAfter,
    tokenStatus: storedTokenStatus || "missing",
    blockers
  };
}

export function credentialReady(summary = {}) {
  return summary.status === "valid" && Array.isArray(summary.blockers) && summary.blockers.length === 0;
}

export function refreshConfirmed(env = process.env) {
  return env[TOKEN_REFRESH_CONFIRM_ENV] === TOKEN_REFRESH_CONFIRM_VALUE;
}

export function computeTokenWindow({ obtainedAt = new Date(), expiresIn, refreshSafetyMinutes = 30 } = {}) {
  const seconds = Number(expiresIn || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return { expiresAt: "", refreshAfter: "" };
  const obtained = obtainedAt instanceof Date ? obtainedAt : new Date(obtainedAt);
  const expiresAt = new Date(obtained.getTime() + seconds * 1000);
  const safetyMs = Math.max(5, Number(refreshSafetyMinutes || 30)) * 60 * 1000;
  const refreshAfter = seconds * 1000 > safetyMs ? new Date(expiresAt.getTime() - safetyMs) : expiresAt;
  return {
    expiresAt: expiresAt.toISOString(),
    refreshAfter: refreshAfter.toISOString()
  };
}

export function redactedCredentialStatus({ envPath, ensure = false } = {}) {
  const summary = getOceanEngineCredentialSummary({ envPath, ensure });
  return {
    status: summary.status,
    envFilePresent: summary.envFilePresent,
    appIdPresent: summary.appIdPresent,
    appSecretPresent: summary.appSecretPresent,
    redirectUriPresent: summary.redirectUriPresent,
    accessTokenPresent: summary.accessTokenPresent,
    refreshTokenPresent: summary.refreshTokenPresent,
    tokenExpiresAtPresent: summary.tokenExpiresAtPresent,
    tokenRefreshAfterPresent: summary.tokenRefreshAfterPresent,
    tokenExpired: summary.tokenExpired,
    tokenRefreshAfterReached: summary.tokenRefreshAfterReached,
    tokenExpiresAt: summary.tokenExpiresAt,
    tokenRefreshAfter: summary.tokenRefreshAfter,
    tokenStatus: summary.tokenStatus,
    blockers: summary.blockers
  };
}

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");

export const DEFAULT_OCEANENGINE_ENV_PATH = path.join(PROJECT_ROOT, ".local", "oceanengine.env");
export const TOKEN_REFRESH_CONFIRM_ENV = "MWBV2_OE_TOKEN_REFRESH_CONFIRM";
export const TOKEN_REFRESH_CONFIRM_VALUE = "REFRESH_ONE_OCEANENGINE_TOKEN";
export const TOKEN_REFRESH_AUTOMATION_ENV = "MWBV2_OE_TOKEN_REFRESH_AUTOMATION_ID";
export const PROJECT_STATE_PATH_ENV = "MWBV2_PROJECT_STATE_PATH";
export const SCHEDULED_TOKEN_REFRESH_SCOPE_MODE = "scheduled_daily_oauth_refresh_only";
export const SCHEDULED_TOKEN_REFRESH_ACTION = "oceanengine_oauth_refresh_token";

export const OCEANENGINE_TOKEN_STATUSES = new Set([
  "missing",
  "valid",
  "expired_refresh_token_first",
  "reauthorize_required",
  "refresh_in_progress",
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
  "OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT",
  "OCEANENGINE_REFRESH_FAILURE_TYPE",
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
  OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT: "",
  OCEANENGINE_REFRESH_FAILURE_TYPE: "",
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
    "OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT=",
    "OCEANENGINE_REFRESH_FAILURE_TYPE=",
    "OCEANENGINE_TOKEN_STATUS=missing",
    ""
  ].join("\n");
}

function writeEnvFileAtomic(resolved, text) {
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tmpPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmpPath, text, { encoding: "utf8", mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, resolved);
    chmodSync(resolved, 0o600);
  } catch (error) {
    rmSync(tmpPath, { force: true });
    throw error;
  }
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
  writeEnvFileAtomic(resolved, serializeEntries(entries));
  return readOceanEngineEnv({ envPath: resolved });
}

function parseTime(value) {
  const text = clean(value);
  if (!text) return NaN;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : NaN;
}

function tokenStatusFor({ env, blockers, tokenExpired, refreshTokenExpired }) {
  const stored = clean(env.OCEANENGINE_TOKEN_STATUS);
  if (refreshTokenExpired) return "reauthorize_required";
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
  const refreshTokenExpiresAt = clean(env.OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT);
  const expiresMs = parseTime(tokenExpiresAt);
  const refreshAfterMs = parseTime(tokenRefreshAfter);
  const refreshTokenExpiresMs = parseTime(refreshTokenExpiresAt);
  const nowMs = now.getTime();
  const accessTokenPresent = Boolean(clean(env.OCEANENGINE_ACCESS_TOKEN));
  const refreshTokenPresent = Boolean(clean(env.OCEANENGINE_REFRESH_TOKEN));
  const tokenExpired = Boolean(tokenExpiresAt && Number.isFinite(expiresMs) && expiresMs <= nowMs);
  const tokenRefreshAfterReached = Boolean(tokenRefreshAfter && Number.isFinite(refreshAfterMs) && refreshAfterMs <= nowMs);
  const refreshTokenExpired = Boolean(refreshTokenExpiresAt && Number.isFinite(refreshTokenExpiresMs) && refreshTokenExpiresMs <= nowMs);
  const storedTokenStatus = clean(env.OCEANENGINE_TOKEN_STATUS);
  const refreshFailureType = clean(env.OCEANENGINE_REFRESH_FAILURE_TYPE);
  const blockers = [
    ...(!envFilePresent ? ["env_file_missing"] : []),
    ...(!(clean(env.OCEANENGINE_APP_ID) && clean(env.OCEANENGINE_APP_SECRET) && clean(env.OCEANENGINE_REDIRECT_URI)) ? ["app_config_missing"] : []),
    ...(!accessTokenPresent ? ["access_token_missing"] : []),
    ...(!refreshTokenPresent ? ["refresh_token_missing"] : []),
    ...(refreshTokenExpired ? ["refresh_token_expired_reauthorize_required"] : []),
    ...(tokenExpired ? ["access_token_expired_refresh_required"] : []),
    ...(
      accessTokenPresent &&
      refreshTokenPresent &&
      (!storedTokenStatus || storedTokenStatus !== "valid" || !OCEANENGINE_TOKEN_STATUSES.has(storedTokenStatus)) &&
      !tokenExpired &&
      !refreshTokenExpired
        ? ["token_status_not_valid"]
        : []
    )
  ];
  const status = tokenStatusFor({ env, blockers, tokenExpired, refreshTokenExpired });

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
    refreshTokenExpiresAtPresent: Boolean(refreshTokenExpiresAt),
    tokenExpired,
    tokenRefreshAfterReached,
    refreshTokenExpired,
    tokenExpiresAt,
    tokenRefreshAfter,
    refreshTokenExpiresAt,
    tokenStatus: storedTokenStatus || "missing",
    refreshFailureType,
    blockers
  };
}

export function credentialReady(summary = {}) {
  return summary.status === "valid" && Array.isArray(summary.blockers) && summary.blockers.length === 0;
}

export function refreshConfirmed(env = process.env) {
  return env[TOKEN_REFRESH_CONFIRM_ENV] === TOKEN_REFRESH_CONFIRM_VALUE;
}

function resolveProjectStatePath({ env = process.env, projectStatePath } = {}) {
  return path.resolve(projectStatePath || env[PROJECT_STATE_PATH_ENV] || path.join(PROJECT_ROOT, "project.state.json"));
}

/**
 * Reads only the non-secret project guardrail. It is intentionally called
 * before a refresh process opens the credential file or calls OAuth.
 */
export function scheduledTokenRefreshScopeStatus({ env = process.env, projectStatePath } = {}) {
  const blockers = [];
  let projectState;

  try {
    projectState = JSON.parse(readFileSync(resolveProjectStatePath({ env, projectStatePath }), "utf8"));
  } catch {
    return { allowed: false, blockers: ["credential_refresh_scope_unavailable"] };
  }

  const guardrails = projectState?.guardrails || {};
  const scope = guardrails.credential_refresh_scope || {};
  const automationId = clean(env[TOKEN_REFRESH_AUTOMATION_ENV]);
  const allowedActions = Array.isArray(scope.allowed_actions) ? scope.allowed_actions : [];

  if (guardrails.credential_refresh_allowed !== true) blockers.push("credential_refresh_not_allowed");
  if (scope.mode !== SCHEDULED_TOKEN_REFRESH_SCOPE_MODE) blockers.push("credential_refresh_scope_mode_mismatch");
  if (!automationId) blockers.push("credential_refresh_automation_id_missing");
  if (!clean(scope.authorized_automation_id) || automationId !== clean(scope.authorized_automation_id)) {
    blockers.push("credential_refresh_automation_id_mismatch");
  }
  if (scope.timezone !== "Asia/Shanghai" || scope.daily_at !== "12:00") {
    blockers.push("credential_refresh_schedule_mismatch");
  }
  if (scope.confirm_variable !== `${TOKEN_REFRESH_CONFIRM_ENV}=${TOKEN_REFRESH_CONFIRM_VALUE}`) {
    blockers.push("credential_refresh_confirmation_contract_mismatch");
  }
  if (allowedActions.length !== 1 || allowedActions[0] !== SCHEDULED_TOKEN_REFRESH_ACTION) {
    blockers.push("credential_refresh_action_scope_mismatch");
  }

  return { allowed: blockers.length === 0, blockers };
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

export function computeExpiresAt({ obtainedAt = new Date(), expiresIn } = {}) {
  const seconds = Number(expiresIn || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const obtained = obtainedAt instanceof Date ? obtainedAt : new Date(obtainedAt);
  return new Date(obtained.getTime() + seconds * 1000).toISOString();
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
    refreshTokenExpiresAtPresent: summary.refreshTokenExpiresAtPresent,
    tokenExpired: summary.tokenExpired,
    tokenRefreshAfterReached: summary.tokenRefreshAfterReached,
    refreshTokenExpired: summary.refreshTokenExpired,
    tokenExpiresAt: summary.tokenExpiresAt,
    tokenRefreshAfter: summary.tokenRefreshAfter,
    refreshTokenExpiresAt: summary.refreshTokenExpiresAt,
    tokenStatus: summary.tokenStatus,
    refreshFailureType: summary.refreshFailureType,
    blockers: summary.blockers
  };
}

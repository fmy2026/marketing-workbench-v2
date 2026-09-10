import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_WORKBENCH_LLM_CREDENTIAL_PATH = path.join(PROJECT_ROOT, ".local", "workbench-llm-credentials.json");
export const WORKBENCH_LLM_CREDENTIAL_SCHEMA = "2026-09-10.workbench-llm-credentials-v1";

function clean(value) {
  return String(value ?? "").trim();
}

function validateKeyPart(name, value, pattern) {
  const normalized = clean(value);
  if (!pattern.test(normalized)) throw new Error(`invalid_${name}`);
  return normalized;
}

function credentialKey(userId, agentKey) {
  const user = validateKeyPart("user_id", userId, /^[A-Za-z0-9_.:-]{1,128}$/);
  const agent = validateKeyPart("agent_key", agentKey, /^[a-z][a-z0-9_]{1,63}$/);
  return `${user}:${agent}`;
}

function validateApiKey(value) {
  const key = String(value ?? "").trim();
  if (!key || key.length > 512 || /[\u0000-\u001F\u007F]/u.test(key)) throw new Error("invalid_model_api_key");
  return key;
}

function emptyDocument() {
  return { schema_version: WORKBENCH_LLM_CREDENTIAL_SCHEMA, credentials: {} };
}

function resolvePath(credentialPath = DEFAULT_WORKBENCH_LLM_CREDENTIAL_PATH) {
  return path.resolve(credentialPath);
}

function assertSecureFile(resolved) {
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("llm_credential_file_invalid");
  if ((stat.mode & 0o077) !== 0) throw new Error("llm_credential_file_permissions_invalid");
}

function parseDocument(resolved) {
  if (!existsSync(resolved)) return emptyDocument();
  assertSecureFile(resolved);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new Error("llm_credential_file_invalid");
  }
  if (!parsed || parsed.schema_version !== WORKBENCH_LLM_CREDENTIAL_SCHEMA || !parsed.credentials || typeof parsed.credentials !== "object" || Array.isArray(parsed.credentials)) {
    throw new Error("llm_credential_file_invalid");
  }
  for (const [key, value] of Object.entries(parsed.credentials)) {
    if (!/^[A-Za-z0-9_.:-]{1,128}:[a-z][a-z0-9_]{1,63}$/.test(key) || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("llm_credential_file_invalid");
    }
    validateApiKey(value.api_key);
  }
  return parsed;
}

function writeAtomic(resolved, document) {
  mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(document)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, resolved);
    chmodSync(resolved, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function credentialRefFor(userId, agentKey) {
  const key = credentialKey(userId, agentKey);
  return `local:workbench_llm:${key}`;
}

export function getWorkbenchLlmCredential({ userId, agentKey, credentialPath } = {}) {
  const document = parseDocument(resolvePath(credentialPath));
  const entry = document.credentials[credentialKey(userId, agentKey)];
  return entry ? validateApiKey(entry.api_key) : "";
}

export function hasWorkbenchLlmCredential(options = {}) {
  return Boolean(getWorkbenchLlmCredential(options));
}

export function setWorkbenchLlmCredential({ userId, agentKey, apiKey, credentialPath } = {}) {
  const resolved = resolvePath(credentialPath);
  const document = parseDocument(resolved);
  document.credentials[credentialKey(userId, agentKey)] = { api_key: validateApiKey(apiKey) };
  writeAtomic(resolved, document);
  return { credentialRef: credentialRefFor(userId, agentKey), configured: true };
}

export function removeWorkbenchLlmCredential({ userId, agentKey, credentialPath } = {}) {
  const resolved = resolvePath(credentialPath);
  if (!existsSync(resolved)) return false;
  const document = parseDocument(resolved);
  const key = credentialKey(userId, agentKey);
  if (!Object.hasOwn(document.credentials, key)) return false;
  delete document.credentials[key];
  writeAtomic(resolved, document);
  return true;
}

export function inspectWorkbenchLlmCredentialStore({ credentialPath } = {}) {
  const resolved = resolvePath(credentialPath);
  if (!existsSync(resolved)) return { exists: false, mode: null, entryCount: 0 };
  assertSecureFile(resolved);
  const document = parseDocument(resolved);
  return { exists: true, mode: lstatSync(resolved).mode & 0o777, entryCount: Object.keys(document.credentials).length };
}

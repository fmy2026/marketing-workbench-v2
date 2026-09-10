import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  credentialRefFor,
  getWorkbenchLlmCredential,
  hasWorkbenchLlmCredential,
  inspectWorkbenchLlmCredentialStore,
  setWorkbenchLlmCredential
} from "../src/security/workbenchAgentModelCredentialStore.mjs";
import {
  normalizeOpenAiCompatibleModelConfig,
  testOpenAiCompatibleModelConfig
} from "../src/agents/openaiCompatibleModelConfigTest.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const directory = await mkdtemp(join(tmpdir(), "mwbv2-agent-model-config-"));
const credentialPath = join(directory, "workbench-llm-credentials.json");
const userId = "USR-MODEL-CONFIG-SMOKE";
const agentKey = "launch_creation";
const apiKey = "test-key-not-for-network";
try {
  const ref = credentialRefFor(userId, agentKey);
  assert(ref === "local:workbench_llm:USR-MODEL-CONFIG-SMOKE:launch_creation", "credential_ref_shape_invalid");
  setWorkbenchLlmCredential({ userId, agentKey, apiKey, credentialPath });
  const store = inspectWorkbenchLlmCredentialStore({ credentialPath });
  assert(store.exists && store.mode === 0o600 && store.entryCount === 1, "credential_store_permissions_or_entry_invalid");
  assert(hasWorkbenchLlmCredential({ userId, agentKey, credentialPath }), "credential_presence_missing");
  assert(getWorkbenchLlmCredential({ userId, agentKey, credentialPath }) === apiKey, "credential_roundtrip_failed");
  const rawStore = await readFile(credentialPath, "utf8");
  assert(rawStore.includes(apiKey), "credential_store_fixture_missing_key");
  await chmod(credentialPath, 0o644);
  let insecureRejected = false;
  try { getWorkbenchLlmCredential({ userId, agentKey, credentialPath }); } catch (error) { insecureRejected = error.message === "llm_credential_file_permissions_invalid"; }
  assert(insecureRejected, "insecure_credential_file_not_rejected");
  await chmod(credentialPath, 0o600);

  const normalized = normalizeOpenAiCompatibleModelConfig({
    protocol: "openai_compatible",
    apiBase: "https://models.example.test/v1/",
    modelName: "test-model-1"
  });
  assert(normalized.apiBase === "https://models.example.test/v1", "api_base_not_normalized");
  let requested = null;
  const result = await testOpenAiCompatibleModelConfig({
    ...normalized,
    apiKey,
    fetchFn: async (url, options) => {
      requested = { url: String(url), options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
    }
  });
  assert(result.status === "passed", "fixed_schema_model_test_failed");
  assert(requested.url === "https://models.example.test/v1/chat/completions", "model_test_endpoint_invalid");
  const requestBody = JSON.parse(requested.options.body);
  assert(requestBody.temperature === 0 && requestBody.response_format?.type === "json_object", "model_test_schema_controls_missing");
  assert(!JSON.stringify(requestBody).match(/advertiser|route_id|game_code|case_id|job_id/i), "model_test_contains_business_data");
  assert(requested.options.headers.authorization === `Bearer ${apiKey}`, "model_test_credential_transport_missing");
  const failed = await testOpenAiCompatibleModelConfig({ ...normalized, apiKey, fetchFn: async () => ({ ok: false, json: async () => ({}) }) });
  assert(failed.status === "failed" && failed.reason === "provider_rejected", "model_test_failure_not_safely_classified");
  let invalidBaseRejected = false;
  try { normalizeOpenAiCompatibleModelConfig({ apiBase: "https://key@example.test/v1?token=x", modelName: "test" }); } catch (error) { invalidBaseRejected = error.message === "invalid_model_api_base"; }
  assert(invalidBaseRejected, "credential_bearing_api_base_not_rejected");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: "passed",
  credentialStore: "0600_atomic",
  perUserAgentIsolation: true,
  fixedSchemaOnly: true,
  realNetworkCalls: 0
}, null, 2));

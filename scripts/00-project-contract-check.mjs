import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, lstatSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MANIFEST_VERSION = "2026-09-08.task-context-manifest-v2";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TERMINAL = new Set(["completed", "cancelled"]);
const SCHEMA_KEYWORDS = new Set([
  "$schema", "$id", "description", "type", "const", "enum", "anyOf",
  "required", "properties", "additionalProperties", "items", "minItems",
  "uniqueItems", "minLength", "pattern", "minimum"
]);

function ensure(condition, code, location = "") {
  if (!condition) throw new Error(`${code}${location ? `:${location}` : ""}`);
}

function json(path) {
  ensure(existsSync(path), "file_missing", path);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`invalid_json:${path}`); }
}

// Deliberately limited to the vocabulary used by the two local schemas.
// Unsupported keywords fail, including keywords in an unselected anyOf branch.
function checkSchemaVocabulary(schema) {
  ensure(schema && typeof schema === "object" && !Array.isArray(schema), "schema_definition_invalid");
  for (const key of Object.keys(schema)) ensure(SCHEMA_KEYWORDS.has(key), "schema_keyword_unsupported", key);
  for (const child of Object.values(schema.properties || {})) checkSchemaVocabulary(child);
  for (const child of schema.anyOf || []) checkSchemaVocabulary(child);
  if (schema.items) checkSchemaVocabulary(schema.items);
  if (typeof schema.additionalProperties === "object") checkSchemaVocabulary(schema.additionalProperties);
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function validate(value, schema, path) {
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const matchesType = (type) => type === "null" ? value === null
    : type === "object" ? isObject : type === "array" ? Array.isArray(value)
      : type === "integer" ? Number.isInteger(value) : typeof value === type;
  if (schema.type) ensure([].concat(schema.type).some(matchesType), "schema_type", path);
  if (Object.hasOwn(schema, "const")) ensure(equal(value, schema.const), "schema_const", path);
  if (schema.enum) ensure(schema.enum.some((item) => equal(item, value)), "schema_enum", path);
  if (schema.anyOf) {
    ensure(schema.anyOf.some((branch) => {
      try { validate(value, branch, path); return true; } catch { return false; }
    }), "schema_anyOf", path);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined) ensure([...value].length >= schema.minLength, "schema_minLength", path);
    if (schema.pattern) ensure(new RegExp(schema.pattern, "u").test(value), "schema_pattern", path);
  }
  if (typeof value === "number" && schema.minimum !== undefined) ensure(value >= schema.minimum, "schema_minimum", path);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) ensure(value.length >= schema.minItems, "schema_minItems", path);
    if (schema.uniqueItems) ensure(!value.some((item, i) => value.slice(0, i).some((other) => equal(item, other))), "schema_uniqueItems", path);
    if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`));
  }
  if (isObject) {
    for (const key of schema.required || []) ensure(Object.hasOwn(value, key), "schema_required", `${path}.${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {}, key)) validate(item, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) ensure(false, "schema_additionalProperty", `${path}.${key}`);
      else if (typeof schema.additionalProperties === "object") validate(item, schema.additionalProperties, `${path}.${key}`);
    }
  }
}

export function validateSchema(value, schema, location = "document") {
  checkSchemaVocabulary(schema);
  validate(value, schema, location);
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  ensure(result.status === 0, "git_check_failed", args[0]);
  return result.stdout;
}

function localPath(ref, { glob = false } = {}) {
  ensure(typeof ref === "string" && ref.length > 0 && !isAbsolute(ref), "project_relative_path_required", ref);
  ensure(!/[\\\n\r\0#]/u.test(ref) && !ref.split("/").some((part) => !part || part === "." || part === ".."), "unsafe_path", ref);
  ensure(!/[?\[\]{}]/u.test(ref) && (glob || !ref.includes("*")), "unsupported_path_pattern", ref);
  return ref;
}

export function matchesGlob(path, pattern) {
  localPath(pattern, { glob: true });
  const expression = pattern.split(/(\*\*|\*)/u).map((part) => part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("");
  return new RegExp(`^${expression}$`, "u").test(path);
}

function fingerprint(root, ref) {
  localPath(ref);
  const path = resolve(root, ref);
  let workingTree = "deleted";
  if (existsSync(path)) {
    ensure(lstatSync(path).isFile(), "changed_path_not_regular_file", ref);
    workingTree = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  const index = git(root, ["ls-files", "--stage", "-z", "--", ref]);
  return `sha256:${createHash("sha256").update(JSON.stringify({ workingTree, index })).digest("hex")}`;
}

function changedPaths(root, base = "HEAD") {
  git(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  const tracked = git(root, ["diff", "--name-only", "--no-renames", "-z", base, "--"]).split("\0");
  const staged = git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z", base, "--"]).split("\0");
  const unstaged = git(root, ["diff", "--name-only", "--no-renames", "-z", "--"]).split("\0");
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0");
  return [...new Set([...tracked, ...staged, ...unstaged, ...untracked].filter(Boolean))].sort();
}

export function captureBaseline(root = PROJECT_ROOT) {
  return {
    base_revision: git(root, ["rev-parse", "HEAD"]).trim(),
    baseline_dirty_files: Object.fromEntries(changedPaths(root).map((ref) => [ref, fingerprint(root, ref)]))
  };
}

function headingId(text) {
  return text.replace(/[`*_]/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/gu, "-");
}

function fileRef(root, ref, { localOnly = false, authoritative = false } = {}) {
  ensure(typeof ref === "string" && !/[\n\r\0]/u.test(ref), "invalid_file_ref");
  const [encodedPath, encodedAnchor, ...extra] = ref.split("#");
  ensure(extra.length === 0, "invalid_file_ref", ref);
  const pathPart = decodeURIComponent(encodedPath), anchor = encodedAnchor === undefined ? null : decodeURIComponent(encodedAnchor);
  if (!isAbsolute(pathPart)) localPath(pathPart);
  else ensure(!localOnly, "local_evidence_required", ref);
  const path = resolve(root, pathPart);
  ensure(existsSync(path) && lstatSync(path).isFile(), "reference_missing", ref);
  const real = realpathSync(path), rel = relative(realpathSync(root), real);
  if (!isAbsolute(pathPart)) ensure(!rel.startsWith("../") && !isAbsolute(rel), "reference_escapes_project", ref);
  if (authoritative) {
    const history = /(^|\/)(\.archive|archive|\.开发方案|开发方案)(\/|$)/u.test(real)
      || /(^|\/)docs\/plan[12]-/u.test(real)
      || real.startsWith(resolve(root, "../marketing-workbench") + "/");
    const header = path.endsWith(".md") ? readFileSync(path, "utf8").split("\n").slice(0, 12).join("\n") : "";
    ensure(!history && !/(?:文档状态|文档性质)[^\n]*(?:历史|已替代|reference_only)/u.test(header), "historical_required_context", ref);
  }
  if (anchor !== null) {
    const text = readFileSync(path, "utf8");
    const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => headingId(match[1]));
    ensure(anchor && (headings.includes(anchor) || text.includes(`id="${anchor}"`)), "reference_anchor_missing", ref);
  }
  return pathPart;
}

export function readDomainRoutes(root) {
  const text = readFileSync(resolve(root, "AGENTS.md"), "utf8");
  const block = text.split("<!-- project-domain-routes:start -->")[1]?.split("<!-- project-domain-routes:end -->")[0];
  ensure(block, "domain_routes_missing");
  const routes = block.split("\n").filter((line) => /^\| (control|workflow|data|deploy|security) \|/u.test(line)).map((line) => {
    const [, domain, patterns, docs] = line.split("|").map((cell) => cell.trim());
    return { domain, patterns: patterns.split(";"), docs: docs.split(";") };
  });
  ensure(routes.length === 5 && new Set(routes.map((r) => r.domain)).size === 5, "domain_routes_incomplete");
  for (const route of routes) {
    route.patterns.forEach((pattern) => localPath(pattern, { glob: true }));
    route.docs.forEach((ref) => fileRef(root, ref, { localOnly: true, authoritative: true }));
  }
  return routes;
}

function taskContract(root, manifest) {
  const text = readFileSync(resolve(root, manifest.task_ref), "utf8");
  ensure(text.split("\n")[0] === `# ${manifest.task_id}`, "task_title_mismatch");
  ensure(!/^\s*(?:状态|status)\s*[:：]/gimu.test(text), "duplicate_task_status");
  ensure(text.includes(`../tasks-context-manifests/${manifest.task_id}.json`), "task_manifest_link_missing");
  const sections = new Map();
  for (const match of text.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gmu)) sections.set(match[1].trim(), match[2].trim());
  for (const name of ["目标", "批准方案", "范围", "非目标", "验收", "停止条件", "交付说明"]) ensure(sections.get(name), "task_section_missing", name);
  const ids = [...sections.get("验收").matchAll(/^- (AC-\d+)[:：] .+$/gmu)].map((match) => match[1]);
  ensure(ids.length > 0 && new Set(ids).size === ids.length, "acceptance_ids_invalid");
  const planIds = manifest.validation_plan.map((item) => item.acceptance_id);
  ensure(equal([...ids].sort(), [...planIds].sort()), "validation_plan_coverage_mismatch");
  const resultIds = manifest.validation_results.map((item) => item.acceptance_id);
  ensure(new Set(resultIds).size === resultIds.length && resultIds.every((id) => ids.includes(id)), "validation_result_ids_invalid");
  return ids;
}

function restoredAuthorizations(state, manifest) {
  const guard = state.guardrails;
  ensure(guard.platform_write_allowed === false, "temporary_platform_write_not_revoked");
  const scope = guard.platform_write_scope;
  for (const key of ["allowed_actions", "allowed_plan_actions"]) ensure(!scope[key]?.length, "temporary_actions_not_revoked", key);
  ensure(Object.keys(scope.action_grants || {}).length === 0, "temporary_action_grants_not_revoked");
  for (const key of ["maximum_actions", "maximum_platform_calls", "maximum_create_calls"]) ensure(!scope[key], "temporary_call_limit_not_revoked", key);
  for (const grant of manifest.temporary_authorizations) {
    const parts = grant.path.slice(1).split("/").map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"));
    ensure(parts.length >= 2 && parts[0] === "guardrails" && parts.every((p) => p && !["__proto__", "constructor", "prototype"].includes(p)), "temporary_authorization_path_invalid");
    let value = state;
    for (const part of parts) { ensure(value && Object.hasOwn(value, part), "temporary_authorization_path_missing", grant.path); value = value[part]; }
    ensure(equal(value, grant.restore_value), "temporary_authorization_not_restored", grant.path);
  }
  // Catch a task-bound OAuth grant even when its declaration was accidentally omitted.
  const refresh = guard.credential_refresh_scope || {};
  if ([refresh.task_id, refresh.granted_by_task_id].includes(manifest.task_id)) {
    ensure(guard.credential_refresh_allowed === false, "temporary_credential_refresh_not_revoked");
  }
}

function currentManifests(root) {
  return readdirSync(resolve(root, "tasks-context-manifests")).filter((name) => name.endsWith(".json")).map((name) => ({
    ref: `tasks-context-manifests/${name}`, value: json(resolve(root, "tasks-context-manifests", name))
  }));
}

export function auditHistory(root = PROJECT_ROOT) {
  const legacy = currentManifests(root).filter(({ value }) => value.schema_version !== MANIFEST_VERSION);
  const statuses = {}, warnings = [];
  for (const { ref, value } of legacy) {
    const status = value.status || "(missing)";
    statuses[status] = (statuses[status] || 0) + 1;
    if (!value.status) warnings.push({ ref, code: "legacy_status_missing" });
    const taskRef = value.task_ref || `tasks/${value.task_id}.md`;
    if (!existsSync(resolve(root, taskRef))) warnings.push({ ref, code: "legacy_task_missing" });
    else {
      const match = readFileSync(resolve(root, taskRef), "utf8").match(/^状态[：:]\s*`?([^`\n]+)/mu);
      if (match && match[1].trim() !== value.status) warnings.push({ ref, code: "legacy_status_text_differs" });
    }
    for (const entry of value.read_order || value.required || []) {
      const path = typeof entry === "string" ? entry : entry?.ref;
      if (!path || !(/^(?:src|docs|scripts|db|tasks|tasks-context-manifests|schemas)\//u.test(path) || isAbsolute(path))) continue;
      if (path.includes("*")) continue;
      if (!existsSync(resolve(root, path.split("#")[0]))) warnings.push({ ref, code: "legacy_read_path_missing", path });
    }
  }
  return { mode: "historical_diagnostics_only", legacy_count: legacy.length, statuses, warnings, business_outcome_inferred: false };
}

export function checkProject({ root = PROJECT_ROOT, phase, outcome = "completed" } = {}) {
  const state = json(resolve(root, "project.state.json"));
  const stateSchema = json(resolve(root, "schemas/project-state.schema.json"));
  const manifestSchema = json(resolve(root, "schemas/context-manifest.schema.json"));
  validateSchema(state, stateSchema, "project.state.json");
  ensure(!Number.isNaN(Date.parse(state.updated_at)), "state_timestamp_invalid");
  phase ||= state.active_task ? "start" : "after-close";
  ensure(["start", "before-close", "after-close"].includes(phase), "phase_invalid");
  ensure(TERMINAL.has(outcome), "closure_outcome_invalid");
  const after = phase === "after-close";
  ensure(after ? state.active_task === null : state.active_task !== null, after ? "active_pointer_not_cleared" : "active_task_required");
  const taskRef = after ? state.last_closed_task_ref : state.active_task.task_ref;
  ensure(taskRef, "last_closed_task_required");
  localPath(taskRef);
  ensure(/^tasks\/TASK-[A-Z0-9-]+\.md$/u.test(taskRef), "task_ref_invalid");
  const id = taskRef.slice("tasks/".length, -3), manifestRef = `tasks-context-manifests/${id}.json`;
  if (!after) ensure(state.active_task.id === id && state.active_task.context_manifest_ref === manifestRef, "active_pointer_mismatch");
  fileRef(root, taskRef, { localOnly: true });
  fileRef(root, manifestRef, { localOnly: true });
  const manifest = json(resolve(root, manifestRef));
  ensure(manifest.schema_version === MANIFEST_VERSION, "legacy_task_requires_explicit_upgrade");
  validateSchema(manifest, manifestSchema, manifestRef);
  ensure(manifest.task_id === id && manifest.task_ref === taskRef, "manifest_task_mismatch");
  const dates = [manifest.created_at, manifest.updated_at].map(Date.parse);
  ensure(dates.every(Number.isFinite) && dates[1] >= dates[0], "manifest_timestamp_invalid");
  ensure(after ? TERMINAL.has(manifest.status) : ["active", "blocked"].includes(manifest.status), "task_phase_status_mismatch");
  if (after) {
    ensure(typeof manifest.closed_at === "string" && Number.isFinite(Date.parse(manifest.closed_at)) && Date.parse(manifest.closed_at) >= dates[0] && Date.parse(manifest.closed_at) <= dates[1], "closure_timestamp_invalid");
  } else ensure(manifest.closed_at === null, "active_task_has_closure_timestamp");
  if (phase === "before-close") ensure(manifest.status === "active" || outcome === "cancelled", "blocked_task_cannot_complete");
  for (const other of currentManifests(root)) {
    if (other.value.schema_version !== MANIFEST_VERSION || other.ref === manifestRef) continue;
    validateSchema(other.value, manifestSchema, other.ref);
    ensure(!["active", "blocked"].includes(other.value.status), "unpointed_active_task", other.ref);
    if (after && TERMINAL.has(other.value.status)) {
      ensure(typeof other.value.closed_at === "string" && Number.isFinite(Date.parse(other.value.closed_at)), "closure_timestamp_invalid", other.ref);
      ensure(Date.parse(other.value.closed_at) < Date.parse(manifest.closed_at), "last_closed_pointer_not_latest", other.ref);
    }
  }
  const anchors = ["AGENTS.md", "project.state.json", taskRef, manifestRef];
  ensure(equal(manifest.read_order.slice(0, 4), anchors), "read_order_anchors_mismatch");
  manifest.read_order.forEach((ref) => fileRef(root, ref, { authoritative: true }));
  for (const entry of manifest.reference_only) ensure(!manifest.read_order.includes(entry.ref), "context_authority_conflict", entry.ref);
  manifest.allowed_writes.forEach((ref) => localPath(ref, { glob: true }));
  Object.keys(manifest.baseline_dirty_files).forEach((ref) => localPath(ref));
  ensure(git(root, ["merge-base", "--is-ancestor", manifest.base_revision, "HEAD"]) === "", "base_revision_not_ancestor");
  const changes = changedPaths(root, manifest.base_revision).filter((ref) => manifest.baseline_dirty_files[ref] !== fingerprint(root, ref));
  for (const ref of changes) ensure(manifest.allowed_writes.some((pattern) => matchesGlob(ref, pattern)), "write_outside_scope", ref);
  const routes = readDomainRoutes(root), domains = new Set(manifest.domains);
  const baselineStateText = git(root, ["show", `${manifest.base_revision}:project.state.json`]);
  let baselineState;
  try { baselineState = JSON.parse(baselineStateText); } catch { throw new Error("baseline_state_invalid_json"); }
  if (!equal(state.guardrails, baselineState.guardrails)) domains.add("security");
  for (const route of routes) {
    if ([...changes, ...manifest.allowed_writes].some((ref) => route.patterns.some((pattern) => matchesGlob(ref, pattern) || matchesGlob(pattern, ref)))) domains.add(route.domain);
  }
  const docs = [...new Set(routes.filter((route) => domains.has(route.domain)).flatMap((route) => route.docs))];
  for (const ref of docs) ensure(manifest.read_order.some((entry) => entry === ref || entry.startsWith(`${ref}#`)), "domain_context_missing", ref);
  const acceptanceIds = taskContract(root, manifest);
  if (phase !== "start") {
    const closure = after ? manifest.status : outcome;
    ensure(manifest.result, "closure_result_missing");
    if (closure === "completed") ensure(manifest.open_gaps.length === 0, "unresolved_gaps_prevent_completion");
    ensure(manifest.validation_results.length === acceptanceIds.length, "validation_results_incomplete");
    for (const result of manifest.validation_results) {
      if (closure === "completed") ensure(result.status === "passed", "acceptance_not_passed", result.acceptance_id);
      ensure(Number.isFinite(Date.parse(result.verified_at)) && Date.parse(result.verified_at) >= dates[0], "validation_timestamp_invalid", result.acceptance_id);
      for (const ref of result.evidence_refs) fileRef(root, ref, { localOnly: true });
    }
    const updateRefs = manifest.documentation_updates.map((item) => item.ref);
    ensure(new Set(updateRefs).size === updateRefs.length, "duplicate_documentation_update");
    for (const ref of docs) {
      const update = manifest.documentation_updates.find((item) => item.ref === ref);
      ensure(update, "documentation_update_missing", ref);
      if (update.status === "updated") ensure(changes.includes(ref), "documentation_update_without_diff", ref);
    }
    for (const ref of manifest.result.business_evidence_refs) ensure(/^postgres:mwb\.[a-z_]+:[A-Za-z0-9_-]+$/u.test(ref), "business_evidence_ref_invalid");
    restoredAuthorizations(state, manifest);
  }
  return { status: "passed", phase, task_id: id, task_status: manifest.status, changed_files: changes, domains: [...domains].sort(), acceptance_count: acceptanceIds.length, database_access: false, platform_access: false };
}

function main() {
  const args = process.argv.slice(2);
  let phase, outcome;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (["--baseline", "--audit-history"].includes(flag)) continue;
    ensure(["--phase", "--outcome"].includes(flag) && args[i + 1], "unknown_or_incomplete_argument", flag);
    if (flag === "--phase") phase = args[++i]; else outcome = args[++i];
  }
  const special = args.filter((arg) => ["--baseline", "--audit-history"].includes(arg));
  ensure(!special.length || (special.length === 1 && args.length === 1), "exclusive_argument_required");
  const result = special[0] === "--baseline" ? captureBaseline()
    : special[0] === "--audit-history" ? auditHistory() : checkProject({ phase, outcome });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "failed", error: error.message })}\n`);
    process.exitCode = 1;
  }
}

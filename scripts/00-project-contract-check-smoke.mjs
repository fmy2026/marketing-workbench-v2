import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { auditHistory, captureBaseline, checkProject, MANIFEST_VERSION, validateProjectStructure, validateSchema } from "./00-project-contract-check.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ID = "TASK-FIXTURE-001", TASK = `tasks/${ID}.md`, MANIFEST = `tasks-context-manifests/${ID}.json`;
const contexts = ["AGENTS.md", "project.state.json", TASK, MANIFEST, "docs/Solution Design.md"];
const workspaces = [], passed = [];

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "mwb-project-check-"));
  workspaces.push(root);
  const write = (ref, value) => {
    const path = resolve(root, ref);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  };
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet");
  git("config", "user.name", "Contract Fixture");
  git("config", "user.email", "fixture@example.invalid");
  for (const ref of ["AGENTS.md", "schemas/project-state.schema.json", "schemas/context-manifest.schema.json"]) write(ref, readFileSync(resolve(source, ref), "utf8"));
  for (const ref of ["docs/Solution Design.md", "docs/project-现在的逻辑图.md", "docs/project-数据与报表契约.md", "deploy/README.md"]) write(ref, "# Current contract\n\n## Evidence\n\nStatic rule.\n");
  write("docs/qiankun-api-docs-20260911.md", "# Qiankun API\n\nCurrent interface reference.\n");
  write("package.json", { scripts: {} });
  write(".archive/manifest.json", {
    schema_version: "2026-09-08.project-archive-index-v1",
    runtime_import_forbidden: true,
    package_entry_forbidden: true,
    execution_forbidden: true,
    restore_policy: "New approved task required.",
    entries: []
  });
  write("existing.txt", "baseline\n");
  write(".gitignore", "ignored/\n");
  const state = JSON.parse(readFileSync(resolve(source, "project.state.json"), "utf8"));
  state.active_task = null;
  state.last_closed_task_ref = null;
  write("project.state.json", state);
  git("add", ".");
  git("commit", "--quiet", "-m", "Fixture baseline");
  const now = new Date().toISOString();
  const manifest = {
    schema_version: MANIFEST_VERSION, task_id: ID, task_ref: TASK, status: "active",
    created_at: now, updated_at: now, ...captureBaseline(root), domains: ["control"],
    read_order: [...contexts], reference_only: [],
    allowed_writes: [TASK, MANIFEST, "project.state.json", "evidence/**"],
    forbidden_actions: ["No platform access"], stop_conditions: ["Stop outside scope"], open_gaps: [],
    validation_plan: [{ acceptance_id: "AC-01", command: "fixture verification" }],
    validation_results: [], documentation_updates: [], temporary_authorizations: [], result: null, closed_at: null
  };
  const task = `# ${ID}\n\n[Context Manifest](../${MANIFEST})\n\n## 目标\n\nFixture goal.\n\n## 批准方案\n\nApproved fixture.\n\n## 范围\n\nFixture files.\n\n## 非目标\n\nNo platform.\n\n## 验收\n\n- AC-01: Complete fixture.\n\n## 停止条件\n\nStop on failure.\n\n## 交付说明\n\nFixture only.\n`;
  state.active_task = { id: ID, task_ref: TASK, context_manifest_ref: MANIFEST };
  write(TASK, task);
  const save = () => { write("project.state.json", state); write(MANIFEST, manifest); };
  save();
  const prepareClose = () => {
    manifest.read_order.push("docs/project-现在的逻辑图.md", "deploy/README.md");
    write("evidence/check.md", "# Verification\n\n## Result\n\nFixture verification passed.\n");
    manifest.validation_results = [{ acceptance_id: "AC-01", command: "fixture verification", status: "passed", verified_at: new Date().toISOString(), summary: "Fixture passed", evidence_refs: ["evidence/check.md#result"] }];
    manifest.documentation_updates = ["docs/Solution Design.md", "docs/project-现在的逻辑图.md", "deploy/README.md"].map((ref) => ({ ref, status: "not_needed", reason: "Fixture changes no deployed contracts." }));
    manifest.result = { summary: "Fixture complete", side_effects: "Local fixtures only", remaining_risks: [], business_evidence_refs: [] };
    save();
  };
  const close = () => { manifest.status = "completed"; manifest.closed_at = new Date().toISOString(); manifest.updated_at = manifest.closed_at; state.active_task = null; state.last_closed_task_ref = TASK; save(); };
  return { root, write, git, state, manifest, task, save, prepareClose, close };
}

function test(name, body) {
  body();
  passed.push(name);
}

function rejects(name, mutate, error, phase = "start", extra = {}) {
  test(name, () => {
    const f = fixture();
    if (phase !== "start") f.prepareClose();
    if (phase === "after-close") f.close();
    mutate(f);
    f.save();
    assert.throws(() => checkProject({ root: f.root, phase, ...extra }), new RegExp(error));
  });
}

try {
  test("normal_start_before_after_close_are_readonly", () => {
    const f = fixture();
    const before = captureBaseline(f.root);
    assert.equal(checkProject({ root: f.root }).phase, "start");
    assert.deepEqual(captureBaseline(f.root), before);
    f.prepareClose();
    assert.equal(checkProject({ root: f.root, phase: "before-close" }).status, "passed");
    f.close();
    const closed = captureBaseline(f.root);
    assert.equal(checkProject({ root: f.root }).phase, "after-close");
    assert.deepEqual(captureBaseline(f.root), closed);
    assert.equal(f.state.guardrails.workbench_runtime_write_policy.enabled, true);
    assert.equal(f.state.guardrails.credential_refresh_allowed, true);
  });
  rejects("wrong_active_pointer", (f) => { f.state.active_task.id = "TASK-OTHER"; }, "active_pointer_mismatch");
  rejects("wrong_manifest_id", (f) => { f.manifest.task_id = "TASK-OTHER"; }, "manifest_task_mismatch");
  rejects("missing_required_file", (f) => { f.manifest.read_order.push("docs/missing.md"); }, "reference_missing");
  rejects("missing_heading_anchor", (f) => { f.manifest.read_order[4] += "#absent"; }, "reference_anchor_missing");
  rejects("wrong_anchor_order", (f) => { [f.manifest.read_order[0], f.manifest.read_order[1]] = [f.manifest.read_order[1], f.manifest.read_order[0]]; }, "read_order_anchors_mismatch");
  rejects("legacy_context_cannot_be_required", (f) => { f.write("docs/plan1-previous.md", "# Previous\n"); f.manifest.read_order.push("docs/plan1-previous.md"); }, "historical_required_context");
  rejects("historical_marker_cannot_be_required", (f) => { f.write("docs/old.md", "# Old\n\n文档状态：历史参考\n"); f.manifest.read_order.push("docs/old.md"); }, "historical_required_context");
  rejects("reference_directory_cannot_be_required", (f) => { f.write("docs/.参考文档/old.md", "# Reference\n"); f.manifest.read_order.push("docs/.参考文档/old.md"); }, "historical_required_context");
  rejects("investigation_directory_cannot_be_required", (f) => { f.write("docs/.问题排查/old.md", "# Investigation\n"); f.manifest.read_order.push("docs/.问题排查/old.md"); }, "historical_required_context");
  rejects("archive_cannot_be_required", (f) => {
    f.write(".archive/old.md", "# Old\n");
    const index = JSON.parse(readFileSync(resolve(f.root, ".archive/manifest.json"), "utf8"));
    index.entries.push({ path: ".archive/old.md", kind: "archive_artifact", reason: "Historical fixture.", current_replacement: "Current fixture." });
    f.write(".archive/manifest.json", index);
    f.manifest.read_order.push(".archive/old.md");
  }, "historical_required_context");
  rejects("conflicting_context_authority", (f) => { f.manifest.reference_only.push({ ref: contexts[4], reason: "History" }); }, "context_authority_conflict");
  rejects("duplicate_task_status", (f) => { f.write(TASK, f.task + "\n状态：completed\n"); }, "duplicate_task_status");
  rejects("missing_task_goal", (f) => { f.write(TASK, f.task.replace("## 目标\n\nFixture goal.\n\n", "")); }, "task_section_missing");
  rejects("acceptance_plan_coverage", (f) => { f.manifest.validation_plan[0].acceptance_id = "AC-02"; }, "validation_plan_coverage_mismatch");
  rejects("legacy_status_not_accepted_as_current", (f) => { f.manifest.status = "completed_waiting_platform"; }, "schema_enum");
  rejects("legacy_version_requires_upgrade", (f) => { f.manifest.schema_version = "old"; }, "legacy_task_requires_explicit_upgrade");
  rejects("schema_rejects_second_read_order_source", (f) => { f.state.active_task.read_order = contexts; }, "schema_anyOf");
  rejects("unknown_schema_keyword_fails_closed", (f) => {
    const path = resolve(f.root, "schemas/context-manifest.schema.json");
    const schema = JSON.parse(readFileSync(path, "utf8")); schema.not = {}; f.write("schemas/context-manifest.schema.json", schema);
  }, "schema_keyword_unsupported");
  test("schema_does_not_treat_object_key_order_as_unique", () => {
    assert.throws(() => validateSchema([{ a: 1, b: 2 }, { b: 2, a: 1 }], { type: "array", uniqueItems: true }), /schema_uniqueItems/u);
  });
  rejects("second_archive_root_is_rejected", (f) => { f.write("scripts/archive/old.mjs", "export {};\n"); }, "archive_root_not_unique");
  rejects("legacy_ops_root_is_rejected", (f) => { f.write("ops/old.plist", "obsolete\n"); }, "legacy_current_root_present:ops");
  rejects("legacy_qiankun_directory_is_rejected", (f) => { f.write("docs/.乾坤系统/old.md", "obsolete\n"); }, "legacy_current_root_present:docs/.乾坤系统");
  rejects("unindexed_archive_entry_is_rejected", (f) => { f.write(".archive/unindexed.txt", "history\n"); }, "archive_index_incomplete");
  rejects("archive_package_entry_is_rejected", (f) => { f.write("package.json", { scripts: { old: "node ./.archive/old.mjs" } }); }, "archive_package_entry_forbidden");
  rejects("archive_runtime_import_is_rejected", (f) => {
    const importKeyword = "im" + "port";
    f.write("src/live.mjs", `${importKeyword} '../.archive/old.mjs';\n`);
  }, "archive_runtime_import_forbidden");
  test("capability_driven_runtime_policy_is_allowed", () => {
    const f = fixture();
    f.write("src/runtime-policy.mjs", "export const requiresVerifiedCover = bundle.account?.video_cover_required === true;\n");
    assert.doesNotThrow(() => validateProjectStructure(f.root));
  });
  test("runtime_account_identifier_default_is_rejected", () => {
    const f = fixture();
    f.write("src/runtime-account-default.mjs", "export const target = { advertiserId: \"1871922346964041\" };\n");
    assert.throws(() => validateProjectStructure(f.root), /runtime_account_identifier_forbidden/u);
  });
  test("runtime_account_identifier_condition_is_rejected", () => {
    const f = fixture();
    f.write("frontend/runtime-account-condition.ts", "if (input.advertiser_id === \"1871922346964041\") return true;\n");
    assert.throws(() => validateProjectStructure(f.root), /runtime_account_identifier_forbidden/u);
  });
  rejects("missing_current_qiankun_doc_is_rejected", (f) => { rmSync(resolve(f.root, "docs/qiankun-api-docs-20260911.md")); }, "current_qiankun_doc_missing");
  rejects("stale_qiankun_doc_ref_is_rejected", (f) => { f.write("docs/current.md", "See docs/.乾坤系统/api-docs-20260827.md\n"); }, "stale_qiankun_doc_ref");
  rejects("stale_qiankun_task_context_is_rejected", (f) => {
    f.manifest.reference_only.push({ ref: "docs/.乾坤系统/api-docs-20260827.md", reason: "Stale fixture." });
  }, "stale_qiankun_task_ref");
  rejects("task_without_manifest_is_rejected", (f) => { f.write("tasks/TASK-ORPHAN.md", "# orphan\n"); }, "task_manifest_pair_mismatch");
  rejects("new_duplicate_migration_number_is_rejected", (f) => {
    f.write("db/076_first.sql", "SELECT 1;\n");
    f.write("db/076_second.sql", "SELECT 1;\n");
  }, "migration_number_duplicate:076");
  test("historical_015_duplicate_is_allowed", () => {
    const f = fixture();
    f.write("db/015_add_project_name_reservations.sql", "SELECT 1;\n");
    f.write("db/015_p04_video_material_local_assets.sql", "SELECT 1;\n");
    f.manifest.allowed_writes.push("db/**");
    f.manifest.read_order.push("docs/project-数据与报表契约.md");
    f.save();
    assert.equal(checkProject({ root: f.root }).structure.migration_file_count, 2);
  });
  rejects("qiankun_monitor_change_requires_api_context", (f) => {
    f.manifest.allowed_writes.push("src/workflows/skills/oe3/02-monitor/**");
    f.manifest.read_order.push("docs/project-现在的逻辑图.md");
  }, "qiankun_context_missing");
  rejects("untracked_write_outside_scope", (f) => { f.write("outside.txt", "new\n"); }, "write_outside_scope");
  rejects("unstaged_write_outside_scope", (f) => { f.write("existing.txt", "changed\n"); }, "write_outside_scope");
  rejects("staged_write_outside_scope", (f) => { f.write("existing.txt", "changed\n"); f.git("add", "existing.txt"); }, "write_outside_scope");
  rejects("staged_change_hidden_by_worktree_restore", (f) => { f.write("existing.txt", "staged change\n"); f.git("add", "existing.txt"); f.write("existing.txt", "baseline\n"); }, "write_outside_scope");
  rejects("committed_write_since_task_base", (f) => { f.write("existing.txt", "changed\n"); f.git("add", "existing.txt"); f.git("commit", "--quiet", "-m", "Task change"); }, "write_outside_scope");
  rejects("deleted_file_outside_scope", (f) => { rmSync(resolve(f.root, "existing.txt")); }, "write_outside_scope");
  rejects("rename_checks_old_and_new_paths", (f) => { renameSync(resolve(f.root, "existing.txt"), resolve(f.root, "evidence-renamed.txt")); f.manifest.allowed_writes.push("evidence-renamed.txt"); }, "write_outside_scope:existing.txt");
  test("preexisting_dirty_file_unchanged_is_not_claimed", () => {
    const f = fixture(); f.write("existing.txt", "user change\n");
    f.manifest.baseline_dirty_files = { "existing.txt": captureBaseline(f.root).baseline_dirty_files["existing.txt"] }; f.save();
    assert(!checkProject({ root: f.root }).changed_files.includes("existing.txt"));
    f.write("existing.txt", "agent changed user file\n");
    assert.throws(() => checkProject({ root: f.root }), /write_outside_scope/u);
  });
  test("preexisting_fingerprint_includes_index_state", () => {
    const f = fixture(); f.write("existing.txt", "user change\n");
    f.manifest.baseline_dirty_files = { "existing.txt": captureBaseline(f.root).baseline_dirty_files["existing.txt"] }; f.save();
    assert.equal(checkProject({ root: f.root }).status, "passed");
    f.git("add", "existing.txt");
    assert.throws(() => checkProject({ root: f.root }), /write_outside_scope/u);
  });
  rejects("path_traversal", (f) => { f.manifest.allowed_writes.push("../*"); }, "unsafe_path");
  rejects("symlink_context_outside_project", (f) => {
    const directory = mkdtempSync(resolve(tmpdir(), "mwb-contract-outside-")); workspaces.push(directory);
    const outside = resolve(directory, "external.md"); writeFileSync(outside, "# External\n");
    symlinkSync(outside, resolve(f.root, "linked.md")); f.manifest.read_order.push("linked.md");
  }, "reference_missing");
  rejects("declared_domain_requires_document", (f) => { f.manifest.domains.push("data"); }, "domain_context_missing");
  rejects("guardrail_diff_infers_security_context", (f) => { f.state.guardrails.budget_bid_change_allowed = true; }, "domain_context_missing");
  rejects("allowed_write_infers_domain", (f) => { f.manifest.allowed_writes.push("src/repositories/future.mjs"); }, "domain_context_missing");
  rejects("actual_write_infers_domain", (f) => { f.manifest.allowed_writes.push("src/**"); f.write("src/workflows/future.mjs", "// fixture\n"); }, "domain_context_missing");
  for (const ref of ["deploy/backup-postgres.sh", "deploy/launchd/com.hys.marketing-workbench-backup.plist.example"]) {
    const dataDoc = "docs/project-数据与报表契约.md";
    rejects(`database_ops_requires_data_context:${ref}`, (f) => {
      f.manifest.read_order.push("deploy/README.md");
      f.manifest.allowed_writes.push(ref);
    }, "domain_context_missing:docs/project-数据与报表契约.md");
    rejects(`database_ops_requires_data_documentation_at_close:${ref}`, (f) => {
      f.manifest.read_order.push(dataDoc);
      f.manifest.allowed_writes.push(ref);
      f.write(ref, "fixture database operation configuration\n");
    }, "documentation_update_missing:docs/project-数据与报表契约.md", "before-close");
    test(`database_ops_full_context_closes_without_execution:${ref}`, () => {
      const f = fixture();
      f.manifest.read_order.push(dataDoc, "deploy/README.md");
      f.manifest.allowed_writes.push(ref, dataDoc);
      f.write(ref, "fixture database operation configuration\n");
      f.save();
      assert(checkProject({ root: f.root }).domains.includes("data"));
      f.prepareClose();
      f.manifest.read_order = [...new Set(f.manifest.read_order)];
      f.write(dataDoc, "# Current contract\n\nUpdated database operation contract.\n");
      f.manifest.documentation_updates.push({ ref: dataDoc, status: "updated", reason: "Database operation documentation follows its configuration." });
      f.save();
      assert.equal(checkProject({ root: f.root, phase: "before-close" }).status, "passed");
      f.close();
      assert.equal(checkProject({ root: f.root, phase: "after-close" }).status, "passed");
    });
  }
  test("application_deploy_does_not_require_database_context", () => {
    const f = fixture();
    f.manifest.read_order.push("deploy/README.md");
    f.manifest.allowed_writes.push("deploy/nginx/application.conf");
    f.write("deploy/nginx/application.conf", "# Application deployment fixture\n");
    f.save();
    assert(!checkProject({ root: f.root }).domains.includes("data"));
  });
  test("routing_table_is_the_only_domain_map", () => {
    const f = fixture();
    const agent = readFileSync(resolve(f.root, "AGENTS.md"), "utf8").replace("db/**;src/repositories/**", "db/**;new-data/**;src/repositories/**");
    f.write("AGENTS.md", agent); f.manifest.allowed_writes.push("AGENTS.md", "new-data/**"); f.save();
    assert.throws(() => checkProject({ root: f.root }), /domain_context_missing/u);
  });
  rejects("missing_completion_result", (f) => { f.manifest.result = null; }, "closure_result_missing", "before-close");
  rejects("unrecorded_acceptance", (f) => { f.manifest.validation_results = []; }, "validation_results_incomplete", "before-close");
  rejects("failed_acceptance", (f) => { f.manifest.validation_results[0].status = "failed"; }, "acceptance_not_passed", "before-close");
  rejects("missing_evidence", (f) => { f.manifest.validation_results[0].evidence_refs = ["evidence/missing.md"]; }, "reference_missing", "before-close");
  rejects("wrong_evidence_anchor", (f) => { f.manifest.validation_results[0].evidence_refs = ["evidence/check.md#absent"]; }, "reference_anchor_missing", "before-close");
  rejects("old_evidence_time", (f) => { f.manifest.validation_results[0].verified_at = "2000-01-01T00:00:00Z"; }, "validation_timestamp_invalid", "before-close");
  rejects("unresolved_gap_prevents_completion", (f) => { f.manifest.open_gaps.push("Missing business decision"); }, "unresolved_gaps_prevent_completion", "before-close");
  rejects("undocumented_impact", (f) => { f.manifest.documentation_updates = []; }, "documentation_update_missing", "before-close");
  rejects("claimed_document_update_without_diff", (f) => { f.manifest.documentation_updates[0].status = "updated"; }, "documentation_update_without_diff", "before-close");
  rejects("active_pointer_remains_after_close", (f) => { f.state.active_task = { id: ID, task_ref: TASK, context_manifest_ref: MANIFEST }; }, "active_pointer_not_cleared", "after-close");
  rejects("wrong_recently_closed_task", (f) => { f.state.last_closed_task_ref = "tasks/TASK-WRONG.md"; }, "reference_missing", "after-close");
  rejects("manifest_not_terminal_after_close", (f) => { f.manifest.status = "active"; }, "task_phase_status_mismatch", "after-close");
  rejects("missing_closure_timestamp", (f) => { f.manifest.closed_at = null; }, "closure_timestamp_invalid", "after-close");
  rejects("recent_pointer_to_older_existing_terminal_task", (f) => {
    const other = structuredClone(f.manifest);
    other.task_id = "TASK-NEWER"; other.task_ref = "tasks/TASK-NEWER.md";
    other.closed_at = new Date(Date.parse(f.manifest.closed_at) + 1000).toISOString(); other.updated_at = other.closed_at;
    f.write("tasks/TASK-NEWER.md", f.task.replaceAll(ID, "TASK-NEWER"));
    f.write("tasks-context-manifests/TASK-NEWER.json", other);
  }, "last_closed_pointer_not_latest", "after-close");
  rejects("unrevoked_platform_flag", (f) => { f.state.guardrails.platform_write_allowed = true; }, "temporary_platform_write_not_revoked", "before-close");
  rejects("unrevoked_action_grants", (f) => { f.state.guardrails.platform_write_scope.action_grants = { x: {} }; }, "temporary_action_grants_not_revoked", "before-close");
  rejects("unrestored_declared_grant", (f) => { f.state.guardrails.budget_bid_change_allowed = true; f.manifest.temporary_authorizations = [{ path: "/guardrails/budget_bid_change_allowed", restore_value: false }]; }, "temporary_authorization_not_restored", "before-close");
  rejects("undeclared_task_oauth_grant", (f) => { f.state.guardrails.credential_refresh_scope.granted_by_task_id = ID; }, "temporary_credential_refresh_not_revoked", "before-close");
  test("cancellation_records_failure_instead_of_fabricating_pass", () => {
    const f = fixture(); f.prepareClose(); f.manifest.status = "blocked"; f.manifest.open_gaps = ["Work cancelled"];
    f.manifest.validation_results[0].status = "not_run"; f.manifest.result.summary = "Cancelled by user; acceptance not run."; f.save();
    assert.equal(checkProject({ root: f.root, phase: "before-close", outcome: "cancelled" }).status, "passed");
    f.close(); f.manifest.status = "cancelled"; f.save();
    assert.equal(checkProject({ root: f.root, phase: "after-close" }).status, "passed");
  });
  rejects("another_current_active_task_without_pointer", (f) => {
    const other = structuredClone(f.manifest); other.task_id = "TASK-SECOND"; other.task_ref = "tasks/TASK-SECOND.md";
    f.write("tasks/TASK-SECOND.md", f.task.replaceAll(ID, "TASK-SECOND"));
    f.write("tasks-context-manifests/TASK-SECOND.json", other);
  }, "unpointed_active_task");
  test("legacy_diagnostics_do_not_rewrite_or_activate_history", () => {
    const f = fixture();
    const ref = "tasks-context-manifests/TASK-OLD.json";
    f.write("tasks/TASK-OLD.md", "# TASK-OLD\n\nHistorical fixture.\n");
    f.write(ref, { task_id: "TASK-OLD", status: "blocked_old", read_order: ["src/renamed.mjs"] });
    const before = readFileSync(resolve(f.root, ref), "utf8");
    const result = auditHistory(f.root);
    assert.equal(result.legacy_count, 1);
    assert(result.warnings.some((item) => item.code === "legacy_read_path_missing"));
    assert.equal(readFileSync(resolve(f.root, ref), "utf8"), before);
    f.manifest.allowed_writes.push(ref, "tasks/TASK-OLD.md"); f.save();
    assert.equal(checkProject({ root: f.root }).status, "passed");
  });
  process.stdout.write(JSON.stringify({ status: "passed", scenarios: passed.length, tests: passed, real_database_access: false, real_platform_access: false }, null, 2) + "\n");
} finally {
  for (const path of workspaces.reverse()) rmSync(path, { recursive: true, force: true });
}

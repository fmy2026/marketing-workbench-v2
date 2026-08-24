import { readFileSync } from "node:fs";

export function readonlyPermissionState({ allowReadonlyDependency = false } = {}) {
  if (allowReadonlyDependency) {
    return {
      allowed: true,
      status: "grant_scoped_allowed",
      blockers: []
    };
  }
  try {
    const state = JSON.parse(readFileSync("project.state.json", "utf8"));
    const allowed = state.guardrails?.real_platform_dependency_allowed === true ||
      state.guardrails?.platform_readonly_allowed === true;
    return {
      allowed,
      status: allowed ? "allowed" : "readonly_permission_required",
      blockers: allowed ? [] : ["readonly_permission_required"]
    };
  } catch {
    return {
      allowed: false,
      status: "readonly_permission_required",
      blockers: ["project_state_unreadable"]
    };
  }
}

import { readFileSync } from "node:fs";

export function readonlyPermissionState({
  allowReadonlyDependency,
  projectStatePath = "project.state.json"
} = {}) {
  if (allowReadonlyDependency === true) {
    return {
      allowed: true,
      status: "grant_scoped_allowed",
      blockers: []
    };
  }
  if (allowReadonlyDependency === false) {
    return {
      allowed: false,
      status: "readonly_permission_required",
      blockers: ["readonly_permission_required"]
    };
  }
  try {
    const state = JSON.parse(readFileSync(projectStatePath, "utf8"));
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

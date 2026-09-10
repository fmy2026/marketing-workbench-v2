export function resolveWorkflowStatisticsScope({ requestedScope = "", userRole = "" } = {}) {
  return requestedScope === "all" && userRole === "admin" ? "all" : "self";
}

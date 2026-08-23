export function buildConfirmPlaceholder({ jobId, draftId, projectName }) {
  return {
    artifactId: `EV-${jobId}-CONFIRM-PLACEHOLDER`,
    jobId,
    artifactType: "confirm_placeholder",
    title: "创建确认占位",
    summary: `已记录 ${draftId} 的确认占位；平台 std_project 创建未执行。`,
    storageRef: `postgres:mwb.evidence_artifacts/EV-${jobId}-CONFIRM-PLACEHOLDER`,
    sourceRef: "api:confirm_placeholder",
    projectName,
    platformWriteExecuted: false
  };
}

export function buildReadbackPlaceholder({ jobId, projectName }) {
  return {
    readbackId: `READBACK-${jobId}`,
    artifactId: `EV-${jobId}-READBACK-PLACEHOLDER`,
    objectType: "std_project",
    objectId: `PLACEHOLDER-${jobId.slice(-12)}`,
    objectName: projectName,
    readbackStatus: "placeholder_recorded",
    fieldDiffSummary: {
      status: "placeholder",
      object_name_source: "launch_drafts.project_name",
      platform_called: false,
      checked_fields: ["object_name", "object_type", "write_policy"]
    }
  };
}

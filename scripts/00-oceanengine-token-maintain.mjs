import { spawnSync } from "node:child_process";
import { appendAuditEvent, refreshPaths } from "../src/platforms/oceanengineTokenRefresh.mjs";
import { maintainOceanEngineToken } from "../src/platforms/oceanengineTokenMaintenance.mjs";

function notify(notification = {}) {
  if (!notification.shouldNotify) return { attempted: false, delivered: false };
  const title = "巨量 Token 维护";
  const message = notification.kind === "recovered"
    ? "OAuth token 已恢复并通过只读验证。"
    : "OAuth token 需要处理；请查看脱敏维护日志。";
  const outcome = spawnSync("/usr/bin/osascript", ["-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`], {
    encoding: "utf8",
    timeout: 5_000
  });
  return { attempted: true, delivered: outcome.status === 0, failureType: outcome.status === 0 ? "" : "local_notification_failed" };
}

const { exitCode, result } = await maintainOceanEngineToken();
const notification = notify(result.notification);
if (notification.attempted && !notification.delivered) {
  const { auditPath } = refreshPaths(process.env.OCEANENGINE_ENV_PATH);
  appendAuditEvent(auditPath, {
    recordedAt: new Date().toISOString(),
    event: "token_maintenance_notification",
    status: "notification_failed",
    failureType: notification.failureType,
    maintenanceStatus: result.status
  });
}
console.log(JSON.stringify({ ...result, notification }, null, 2));
process.exitCode = exitCode;

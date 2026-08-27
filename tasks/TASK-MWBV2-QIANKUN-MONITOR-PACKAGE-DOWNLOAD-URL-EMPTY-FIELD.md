# TASK-MWBV2-QIANKUN-MONITOR-PACKAGE-DOWNLOAD-URL-EMPTY-FIELD

状态：completed

更新时间：2026-08-27 CST

## 目标

修正乾坤 monitor 创建参数机制：后续 `/tf/ad/monitorSerialNumberAdd` 请求必须显式携带 `package_download_url`，即使值为空也要实际作为 form 字段发送，并纳入 `createPlan.requestHash` 与技术排查日志记录。

## 边界

允许：

- 修改 monitor 创建参数组装。
- 修改乾坤 form 编码的空值字段白名单。
- 扩展 smoke 验证。
- 更新历史排查日志，标注旧请求未携带该字段且后续机制已修正。

禁止：

- 调用 `/tf/ad/monitorSerialNumberAdd`。
- 新开 `Cycle 02`。
- 执行 `monitor:reissue-plan`。
- token refresh、广告项目、预算/出价、素材、事件资产、DMP 等真实写入。
- token、Cookie、raw request、raw response 或完整 URL 入项目文件。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 创建任务卡和 manifest | passed | 已创建 |
| 打开 `project.state.json.active_task` | passed | 机制修正任务，platform write 保持暂停 |
| 修正 create params | passed | `package_download_url=""` 已保留在 create params 和 field manifest |
| 修正 form 空值编码 | passed | 仅 `monitorSerialNumberAdd` 允许发送 `package_download_url=` |
| 扩展 smoke | passed | mock create form body 会校验空字段实际发送 |
| 更新历史排查日志说明 | passed | 已标注 Attempt 02 当时未发送该字段，后续机制已修正 |
| 验证 | passed | planned-action smoke 确认 `packageDownloadUrlEmptyFieldSent=true` |

## 执行结果

| 项 | 结果 |
| --- | --- |
| create params | 已固定包含 `package_download_url=""` |
| requestFieldManifest | `fieldNames` 包含 `package_download_url`；`explicitEmptyFieldNames` 记录该字段 |
| createPlan.requestHash | 基于包含 `package_download_url` 的参数对象计算 |
| form body | 仅 `/tf/ad/monitorSerialNumberAdd` 允许发送 `package_download_url=` |
| 只读接口 | accountIndex 等只读请求不发送该空字段 |
| 历史日志 | Attempt 02 已追加说明：历史请求当时未发送该字段，后续机制已修正 |
| 真实创建 | 未调用 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/skills/oe3/02-monitor-provision.mjs` | passed |
| `node --check src/platforms/qiankunMonitorClient.mjs` | passed |
| `npm run test:monitor-bootstrap` | passed |
| `npm run test:monitor-cycle` | passed |
| `npm run test:monitor-planned-action` | passed；`packageDownloadUrlEmptyFieldSent=true` |
| `git diff --check` | passed |

## 验收

- `monitorCreateParams()` 输出包含 `package_download_url: ""`。
- `requestFieldManifest.fieldNames` 包含 `package_download_url`。
- `createPlan.requestHash` 基于包含该字段的参数对象计算。
- `/tf/ad/monitorSerialNumberAdd` form body 包含 `package_download_url=`。
- 普通只读接口不发送该空字段。
- 不调用真实 monitor 创建接口。

## 最终结论

本任务完成。后续真实创建前的 `monitor:plan` 会生成包含 `package_download_url=""` 的 `createPlan.requestHash`；真实创建 form body 会发送 `package_download_url=`。本任务未新开 Cycle 02，未调用真实创建接口。

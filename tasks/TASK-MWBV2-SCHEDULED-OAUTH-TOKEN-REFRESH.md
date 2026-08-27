# TASK-MWBV2-SCHEDULED-OAUTH-TOKEN-REFRESH

状态：completed

更新时间：2026-08-27 CST

## 目标

以 v2 本地 cron 替换旧项目的 OceanEngine token keepalive：每天 12:00（Asia/Shanghai）仅刷新 OAuth token，并仅更新 v2 `.local/oceanengine.env`。

## 权限与边界

- 允许一次受控 OAuth refresh、仅更新 v2 本机凭据文件、创建 v2 cron、成功后删除旧 cron。
- 刷新前必须校验 `project.state.json` 的定时专用 credential refresh scope、自动任务 ID 和既有确认变量。
- 禁止业务 API、项目/素材/DMP/事件资产创建、预算或出价修改、token/Cookie/secret/raw response 写入项目文件或任务记录。
- 旧 cron 在 v2 首次刷新验证成功前必须保持不变。

## 验收

- 新 cron 指向 `marketing-workbench-v2` 本机项目，每日 12:00，只在失败时通知。
- v2 token 刷新通过 scope 校验后仅更新 `.local/oceanengine.env`，权限保持 `0600`，结果仅含脱敏状态。
- scope、确认变量、automation ID 任一不匹配时不发网络请求、不写 env。
- 首次验证成功后删除旧 `oceanengine-token-keepalive`。

## 结果

- 已创建并启用 `oceanengine-v2-token-refresh`：本机 v2 项目、每天 12:00（Asia/Shanghai）、仅失败通知。
- 首次 OAuth 刷新验证通过；仅 v2 `.local/oceanengine.env` 被更新，脱敏状态为 valid，文件权限为 `0600`。
- 已删除旧项目 `oceanengine-token-keepalive`，不存在双刷新任务。
- 已覆盖并通过 scope 关闭、automation ID 不匹配、确认变量缺失、成功、网络失败、授权拒绝与返回不完整的脱敏 smoke。

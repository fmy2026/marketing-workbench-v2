# TASK-MWBV2-OE3-OAUTH-TOKEN-REFRESH-RECOVERY-20260828

状态：completed

更新时间：2026-08-28 CST

## 目标

恢复 OceanEngine OAuth 定时刷新机制，修复 2026-08-28 控制面改造后 `credential_refresh_scope` 缺失导致的刷新阻断；按官方 OAuth 合同收敛刷新端点、并发保护、原子保存和脱敏诊断。

## 官方依据

- 3.0 主库与 3.0 外部资料未定位到 OAuth refresh 合同。
- 2.0 主库 `05-Oauth2.0授权.md` 明确刷新接口：`POST https://api.oceanengine.com/open_api/oauth2/refresh_token/`。
- 刷新请求体为 `app_id`、`secret`、`refresh_token`；成功返回新的 access token、refresh token、access 有效期与 refresh-token 有效期。
- 刷新成功后旧 token 失效，必须及时保存新 token；Token 相关接口需要避免并发刷新，保存 token 与过期时间应原子化。

## 权限与边界

- 允许：恢复 `project.state.json.guardrails.credential_refresh_scope`、更新 OAuth credential store 与 refresh CLI、更新 token refresh smoke、读取/更新现有 `oceanengine-v2-token-refresh` 自动化配置、执行一次受控 OAuth refresh。
- 允许写入：`project.state.json`、本任务卡、任务 manifest、OAuth 刷新相关源码与 smoke、`.local/oceanengine.env`、`.local/oceanengine-token-refresh-audit.jsonl`。
- 禁止：任何 OceanEngine 业务 API、项目/广告/素材/DMP/事件资产写入、预算或出价修改、浏览器登录/授权码回调自动化、将 token、secret、auth_code、Cookie、raw request 或 raw response 写入项目文件/普通日志/API/前端。

## 实施要点

- 恢复定时刷新专用 scope：automation ID `oceanengine-v2-token-refresh`，`Asia/Shanghai` 每日 `12:00`，唯一动作 `oceanengine_oauth_refresh_token`。
- 刷新实现只调用官方 `api.oceanengine.com` 端点，不再顺序调用历史 `ad.oceanengine.com`。
- 增加进程间单飞锁；并发命中时不发网络请求、不写凭据。
- 保存 access token、refresh token、access 到期、refresh-token 到期时使用临时文件替换方式，保持 `0600`。
- 失败分类只保留脱敏摘要：时间、端点、HTTP 状态、API code、request-id 是否存在、响应 hash、失败类型。

## 验收

- `npm run test:token-refresh-scope` 覆盖 scope 拒绝、确认变量拒绝、单端点、成功原子保存、并发阻断、传输失败、OAuth 拒绝、响应不完整、refresh-token 失效。
- 执行一次真实受控刷新，若成功则 `npm run token:status` 为 `valid`；若失败则任务记录包含脱敏根因分类且自动化不重复重试。
- `.local/oceanengine.env` 保持 `0600`；审计与 CLI 输出不包含敏感值。

## 过程记录

- 2026-08-28：任务建立，恢复定时刷新专用 `credential_refresh_scope`。
- 2026-08-28：刷新实现已收敛到官方 `api.oceanengine.com` 单端点；新增单飞锁、原子 env 写入、refresh-token 到期保存、失败分类与 `.local` 脱敏审计。
- 2026-08-28：历史 12:00 自动刷新失败只能确认落盘状态为 `refresh_failed`；旧实现未保存 HTTP/API 层脱敏诊断，无法追溯精确 OAuth code。确定的机制缺陷是控制面改造后 scope 缺失，导致后续刷新会被 scope 校验拦截。
- 2026-08-28：本任务首次真实刷新在沙箱网络内失败为 `transport_error`，未取得 OAuth 响应；按授权联网重跑后成功，HTTP 200、API code 0，未调用业务 API。
- 2026-08-28：已更新 `oceanengine-v2-token-refresh` 自动化说明，保留每日 12:00 和失败通知，并明确允许失败/并发阻断时追加 `.local` 脱敏审计。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run test:token-refresh-scope` | passed；覆盖 scope、确认变量、单端点、并发、失败分类、refresh-token 到期与脱敏 |
| 真实 scoped OAuth refresh | passed；`status=valid`、`apiCode=0` |
| `npm run token:status` | passed；`valid`，无 blocker |
| 文件权限 | passed；`.local/oceanengine.env` 与 `.local/oceanengine-token-refresh-audit.jsonl` 均为 `0600` |
| 自动化配置 | passed；`oceanengine-v2-token-refresh` 为 ACTIVE，每日 12:00，仅失败通知，cwd 指向 v2，prompt 已同步脱敏审计范围 |
| 语法检查 | passed；OAuth store、refresh executor、token smoke |
| `git diff --check` | passed |

## 结果

- OceanEngine access token 已刷新为 `valid`。
- Access token 到期时间：`2026-08-29T06:38:39.392Z`。
- 下次建议刷新窗口：`2026-08-29T06:08:39.392Z`。
- Refresh token 到期时间：`2026-09-27T06:38:39.392Z`。
- 定时刷新授权 scope 已恢复，自动化仍为 ACTIVE。

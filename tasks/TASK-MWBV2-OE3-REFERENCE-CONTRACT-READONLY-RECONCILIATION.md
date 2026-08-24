# TASK-MWBV2-OE3-REFERENCE-CONTRACT-READONLY-RECONCILIATION

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务不创建新轮次、不调用真实 `std_project/create`，只以同账户已成功创建并回查验证的 P01 标准项目作为参考，对 P03 失败草稿进行三方合同只读对齐：

```text
P03 v2 最终 payload / request field manifest
P01 std_project/list 脱敏投影
旧成功创建脚本 / 官方文档字段经验
```

目标是把下一次新轮次真正需要修复的字段缩小为可证实 blocker；不能根据 `api_code=40000` 猜测根因。

## 固定对象

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| failed_job_id | `JOB-MWBV2-20260824092327-494BF1` |
| failed_status | `failed_waiting_manual_review` |
| reference_project_id | `7675218401040220179` |
| reference_project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817` |

## 目标

1. 通过 v2 readonly client/adapter 最多调用一次 `GET /open_api/v3.0/std_project/list/`，读取 P01 脱敏投影。
2. 生成 P03 vs P01/旧合同/官方文档的脱敏三方合同差异报告。
3. 仅在规则可证实时，收敛到 v2 唯一 `create-preflight-diagnostics.mjs`。
4. 检查 create executor 的错误响应处理，补充未来新轮次可用的 safe error summary。
5. 写入一条新的 `evidence_artifacts` 诊断证据。

## 非目标

| 项 | 状态 |
| --- | --- |
| 再次执行 P03 | 禁止 |
| 新建 P04 或任意新 runtime job | 禁止 |
| 真实 `std_project/create`、Promotion 创建、素材/事件/DMP 写入 | 禁止 |
| token refresh | 禁止 |
| 删除或重写 P03/P01 历史审计记录 | 禁止 |
| 新增 migration | 禁止 |
| 旧项目成为 v2 runtime 依赖 | 禁止 |
| 新增第二套 workflow、payload builder、executor 或 readback 入口 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| P03 真实 create action 计数仍为 1 | passed |
| P03 保持 `failed_waiting_manual_review` 且不可重试 | passed |
| 最多一次 P01 `std_project/list` 只读调用 | passed；实际调用 1 次 |
| 脱敏三方合同差异报告已写入 evidence | passed；`EV-JOB-MWBV2-20260824092327-494BF1-REFERENCE-CONTRACT-RECONCILIATION` |
| 明确已证实 blocker、已排除项、inconclusive 项 | passed |
| safe error summary 已补入未来 create 响应处理 | passed |
| 若新增 preflight 规则，fake transport 可证明 blocker 不调用 create/readback 且合法链路通过 | passed |
| 现有 smoke/check 通过 | passed |
| 无 token、Cookie、完整 URL、raw payload、raw response 泄漏 | passed |

## 当前结论区

### 复盘结论

本任务未发现新的、可证实的 P03 payload blocker。P03 当前最终 payload 合同和新增 create preflight 均通过，`payload_hash` 稳定，触点、事件资产、产品图、视频、DMP、品牌和小程序实例在 v2 创建前表达中未形成新的硬阻断。

P01 参考项目只读投影只调用了 1 次 `std_project/list`，但平台返回 `HTTP 200 / api_code=40000 / request_id_present=true / data_present=false`，因此没有拿到 P01 项目字段投影。本次不能把 P03 的 `api_code=40000` 精确归因到某个字段；当前根因仍为 `still_unknown_without_safe_platform_error_message`。

### 分层诊断表

| 层级 | 结论 | 证据 | 下一步 |
| --- | --- | --- | --- |
| payload 合同 | 已排除当前 v2 可见 blocker | `payloadContractStatus=passed`，`createPreflight=passed`，字段 manifest blocker 数为 0 | 保持新 preflight |
| brand_info | 未发现新 blocker | brand 字段存在且整数字段 present | 若后续再创建失败，结合 safe error summary 复核 |
| event_asset | 未发现新 blocker | event asset id present，类型 number | 无需本任务内补资源 |
| product_image | 未发现新 blocker | product image count=1 | 无需本任务内补资源 |
| touchpoint | 未发现新 blocker | controlled touchpoint present；未输出完整 URL | 保持受控构建 |
| app_id / game_platform_apps | 未发现新 blocker | appIdPresent=true，micro app instance present | 无需本任务内补资源 |
| DMP / 素材 | 未发现新 blocker | DMP integer array count=10，video count=2，title count=5 | 无需本任务内补资源 |
| account authorization | 平台只读可发起，但参考 list 业务失败 | P01 list 返回 40000，非 credential_required | 需要平台侧 request id / 错误详情或 list 参数口径复核 |
| platform action result | 已确认 P03 失败且不可重试 | P03 create action=1，created_objects=0，job=`failed_waiting_manual_review` | 不重试 P03 |

### 证实 / 排除 / 不确定

| 类型 | 项 |
| --- | --- |
| 已证实 blocker | 无新增可复用字段 blocker |
| 已排除项 | v2 payload contract、create preflight、payload hash、brand_info present、event asset present、controlled touchpoint present |
| 不确定项 | P01 `std_project/list` 返回 40000；P03 创建失败 raw message 未保留；P01 list projection 不等于原始 create payload；官方文档写 advertiser_id 为 number，而 v2 因长数字 ID 策略继续按 string 处理 |

### 代码收敛

- `create-preflight-diagnostics.mjs` 新增旧成功脚本启发的 allowlist / forbidden field 检查，避免未知字段或 3.0 禁止字段进入 future create。
- `oceanengineStdProjectCreateExecutor.mjs` 新增 future safe error summary：只保存 message/error 是否存在、关键词计数、request id 是否存在和安全指纹，不保存 raw message/raw response。
- 新增 `scripts/oe3-reference-contract-readonly-reconciliation.mjs`，通过 v2 client 和 v2 Postgres 生成脱敏 evidence。

### 验证

| 命令 | 结果 |
| --- | --- |
| `npm run check:reference-contract` | passed；P01 readonly call count=1，返回 `api_code=40000` |
| `npm run test:execution-grant` | passed |
| `npm run test:create-result-mapping` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| Postgres 复核 | P03 `create_actions=1`，`created_objects=0`，evidence=1 |
| API 抽查 | P03 `createReadiness.status=blocked_after_single_create_failure`，按钮 `禁止重试` |

## 下一步 gate

不要重试 P03。下一步先做 P01 `std_project/list` 参数口径 / 平台错误详情复核；若能拿到 reference projection，再新建 fresh runtime job 先 dry-run。若直接进入下一次真实创建，必须另建单次确认任务，并依赖 safe error summary 捕捉平台字段码。

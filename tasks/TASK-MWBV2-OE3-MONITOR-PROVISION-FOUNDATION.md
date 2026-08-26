# TASK-MWBV2-OE3-MONITOR-PROVISION-FOUNDATION

状态：completed

更新时间：2026-08-26 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`，要求为新目标账户 `1871922346964041` 建立技术侧监测序号初始化闭环。该文件是需求材料，不是直接平台写入授权。

## 结构化理解

目标是在 `marketing-workbench-v2` 内建立通用监测序号 provision 基础能力，使后续工作台只输入路线、游戏、账户，即可取得该账户可用于 OE3 Workflow 节点 2 的 `monitor_id` 与受控 `touchpoint_url` 上下文。

完整闭环为：

```text
账户身份读取
-> 已有监测序号查询
-> 必要时单次创建
-> 列表回查
-> monitor_id 入库
-> 触点 URL 解析/入库
-> Workflow 节点 2 可用
```

本任务是三段拆分中的第一段，只做基础合同、数据结构和安全边界，不调用真实创建接口。

## 合理性评估

需求合理，且与当前项目红线兼容：

| 项 | 判断 |
| --- | --- |
| `/tf/ad/index` 列表查询 | 文档存在，旧脚本“没有列表查询 API”的经验已过期 |
| 监测序号创建 | 属于外部写入，必须单次授权、不可重试 |
| 触点 URL | 列表示例未展示完整 URL 字段，因此缺失时必须阻断，不得伪造 |
| 敏感信息 | token、header、raw payload、raw response、完整 URL 不进任务文件、普通日志、API 或前端 |
| v2 边界 | 只使用 v2 项目、v2 Postgres、v2 `.local` 凭据文件 |

当前没有阻断性疑问；需要把“实际固定技术参数”留到只读校验阶段确认，不能直接采用旧经验样例。

## 三任务拆分

| 顺序 | 任务 | 目标 |
| --- | --- | --- |
| 1 | `TASK-MWBV2-OE3-MONITOR-PROVISION-FOUNDATION` | 建立需求 brief、DB migration 合同、凭据文件合同、敏感信息边界和后续验收口径 |
| 2 | `TASK-MWBV2-OE3-MONITOR-READONLY-RECONCILE` | 实现/验证技术账户读取、已有监测序号列表查询、唯一匹配入库、触点 URL 受控解析 |
| 3 | `TASK-MWBV2-OE3-MONITOR-CREATE-ONCE-WORKFLOW-GATE` | 在无匹配监测序号时，仅凭单次确认变量创建一次并回查，最终接入 Workflow 节点 2 gate |

## 本任务范围

- 新建 `mwb.monitor_provision_runs` migration 设计与状态合同。
- 明确 `.local/qiankun-monitor.env` 与 `.local/qiankun-passport-credentials.json` 本地凭据合同。
- 明确 `game_route_defaults.raw_defaults.monitor_provision` 读取策略。
- 明确 `advertiser_accounts`、`account_touchpoints`、`evidence_artifacts` 的写入边界。
- 明确新增后端文件的唯一落点：

```text
src/platforms/qiankunCredentialStore.mjs
src/platforms/qiankunMonitorClient.mjs
src/workflows/skills/oe3/monitor-provision.mjs
scripts/monitor-provision-cli.mjs
```

- 明确后续命令：

```bash
npm run monitor:status
npm run monitor:reconcile
npm run monitor:create-once
npm run test:monitor-bootstrap
```

## 非目标

| 项 | 状态 |
| --- | --- |
| 调用 `/tf/ad/monitorSerialNumberAdd` | 禁止，本任务不消耗真实创建 |
| 调用 OceanEngine `std_project/create` | 禁止 |
| 上传素材 / 创建广告项目 / 创建事件资产 / DMP 推送 | 禁止 |
| 预算或出价修改 | 禁止 |
| token refresh | 禁止 |
| 使用旧项目或旧库作为运行依赖 | 禁止 |
| 保存 token、header、完整触点 URL、raw payload、raw response 到任务文件或普通日志 | 禁止 |

## 权限

| 项 | 状态 |
| --- | --- |
| 写入任务卡、manifest、project.state | 允许 |
| 新增 migration / 代码 / 测试文件 | 允许 |
| 读取 v2 Postgres 元数据和脱敏状态 | 允许 |
| 读取本地 `.local` 技术凭据状态 | 仅输出脱敏状态 |
| 技术 API 只读查询 | 后续 task 2 执行 |
| 技术 API 创建监测序号 | 后续 task 3 且必须确认变量 |
| OceanEngine 平台写入 | 禁止 |

## 第一任务验收

| 验收项 | 结果 |
| --- | --- |
| 需求拆分为三张任务卡 | passed |
| 第一张任务卡有对应 `tasks-context-manifests` | passed |
| `project.state.json.active_task` 指向第一张任务 | passed，执行期间已指向本任务 |
| DB migration 明确 `monitor_provision_runs` 字段、约束、状态枚举和敏感信息禁入规则 | passed，见 `db/020_add_monitor_provision_runs.sql` |
| 凭据文件合同明确 owner 匹配、过期、mismatch 阻断规则 | passed，见 `src/platforms/qiankunCredentialStore.mjs` |
| 后续 task 2 / task 3 边界清楚，创建动作不被提前打开 | passed，`monitor:create-once` 在本关硬阻断 |

## 已落地实现

| 文件 | 动作 |
| --- | --- |
| `db/020_add_monitor_provision_runs.sql` | 新增乾坤监测序号 provision 运行表、状态约束、唯一指纹约束、同 scope 未结束唯一约束和敏感信息注释 |
| `schemas/postgres-minimal-truth.md` | 补充 `mwb.monitor_provision_runs` 表定位、migration 列表和读取约定 |
| `src/repositories/postgresRepository.mjs` | 新增 `getMonitorProvisionDefaults`、`getLatestMonitorProvisionRun`、`upsertMonitorProvisionRun` |
| `src/platforms/qiankunCredentialStore.mjs` | 新增 `.local/qiankun-monitor.env` 与 `.local/qiankun-passport-credentials.json` 脚手架、读取和脱敏状态输出 |
| `src/platforms/qiankunMonitorClient.mjs` | 新增乾坤技术 API 允许端点清单和表单 POST client 骨架，输出只保留脱敏摘要 |
| `src/workflows/skills/oe3/monitor-provision.mjs` | 新增 monitor provision foundation status、fingerprint、create confirm 常量和本关阻断逻辑 |
| `scripts/monitor-provision-cli.mjs` | 新增 `monitor:status`、`monitor:reconcile`、`monitor:create-once` 统一入口 |
| `scripts/monitor-bootstrap-smoke.mjs` | 新增本地 bootstrap 测试，验证凭据摘要不泄漏、fingerprint 稳定、create 在 foundation 阶段阻断 |
| `package.json` | 新增 monitor 相关 npm scripts |
| `src/workflows/skills/oe3/contracts.mjs` | 扩展敏感字段和值扫描，覆盖 `passport_token` 与 `X-Passport-Token` |

## 数据库执行结果

已执行：

```bash
psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/020_add_monitor_provision_runs.sql
```

结果：

| 项 | 状态 |
| --- | --- |
| `mwb.monitor_provision_runs` | exists |
| 当前 provision 行数 | `0` |
| `.local/qiankun-monitor.env` | exists，`600`，不入 Git |
| `.local/qiankun-passport-credentials.json` | exists，`600`，不入 Git |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:monitor-bootstrap` | passed |
| `npm run monitor:status` | passed；仅本地脱敏状态读取，未调用技术 API |
| `npm run monitor:reconcile` | blocked as expected：`monitor_readonly_reconcile_waiting_task_2`，未调用 API |
| `npm run monitor:create-once` | blocked as expected：`monitor_create_disabled_in_foundation_task`，`createCalled=false` |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825041227-12D2B5` | passed |
| JSON 结构校验 | passed |
| `git diff --check` | passed |
| 敏感词粗扫 | 未发现真实 token、完整触点 URL、raw request/response；仅命中敏感检测器自身正则 |

## 当前结论

第一关 foundation 已完成。账户 `1871922346964041` 当前还没有有效 `monitor_id`；`touchpoint_url` 也尚未自动解析。Workflow 第 2 节点对该新账户尚不可通过，下一关必须先补齐/校验 `game_route_defaults.raw_defaults.monitor_provision`，再执行技术侧只读账户身份和 `/tf/ad/index` 列表 reconcile。

## 下一步 Gate

进入 `TASK-MWBV2-OE3-MONITOR-READONLY-RECONCILE`。启动第二关前按项目机制先补对应 context manifest，然后实现只读账户身份解析、`/tf/ad/index` 查询与唯一匹配入库；若触点 URL 未从列表响应得到，则明确阻断原因并等待文档化接口或受控人工导入。

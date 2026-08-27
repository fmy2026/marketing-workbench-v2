# TASK-MWBV2-OE3-AVATAR-READONLY-DIAGNOSIS-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

补强 Node 4 资源子节点的统一输出模型，并对账户 `1871922346964041` 执行一次头像真实只读诊断。任务只定位 `avatar_not_ready` 的真实原因、落库脱敏诊断和输出下一 gate；不上传头像、不创建广告、不刷新 token。

## 背景

最新 runtime truth job `JOB-MWBV2-20260827101635-A8B517` 已完成 Node 4 品牌行业参数修复后的复核：品牌行业已通过，Node 4 仍因头像阻断。当前头像只读探针已能在内存解析 `avatar_status`、图片存在性和尺寸，但证据与 `account_resources` 只保留了笼统的 `avatar_readonly_not_ready`，不利于后续自动化分流。

## 范围与边界

| 允许 | 禁止 |
| --- | --- |
| 修改 Node 4 资源输出、头像只读诊断摘要、smoke 和任务记录 | `std_project/create`、头像上传、素材上传/绑定/共享 |
| 运行 fresh runtime truth 只读链路 | token refresh、预算/出价修改、DMP/事件/品牌写入 |
| 写入 Postgres 脱敏 evidence、Skill、节点、资源状态 | 写入 token、Cookie、raw request、raw response、头像 URL、触点完整 URL |

## 子节点机制原则

每个工作台子节点不强制对应一个独立物理脚本文件，但必须对应一个可追溯的 Skill、pipeline 或 derived resolver，并具备输入、执行模块、输出、停止条件和下一动作。

资源类子节点统一表达：

```text
读取候选/账户资源
  -> 判断是否存在
  -> 如存在，执行真实只读核验
  -> 如 ready，输出 passed
  -> 如缺失或不可用，查询 prepare capability
  -> prepare_supported=true，生成 ensure_resource:* 计划
  -> prepare_supported=false，输出 resource_prepare_unsupported:* blocker
```

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| expected monitor_id | `245828` |
| 入口 | `npm run workflow:readonly-readiness` |

## 实施计划

1. 为资源 verifier 输出补充 `existence_status`、`readonly_status`、`readiness_status` 与统一 `next_action`。
2. 将头像只读 probe 的脱敏摘要保存到 evidence 和 `mwb.account_resources.metadata.avatar_readonly_diagnostic`。
3. `resource-verify-avatar` 消费该诊断，输出具体 `avatar_readiness_reason`，不再只有笼统 blocker。
4. 扩展 smoke，覆盖头像 `AUDIT_PASS`、`IN_AUDIT`、`UNSET` 的分流和敏感字段保护。
5. 创建 fresh runtime truth 只读 job，确认 7 节点、零平台写入审计和下一 gate。

## 验收

- 每个子节点在工作台视图中仍可看到 trace 合同和最近一次运行摘要。
- 头像子节点能输出具体头像状态、图片存在性、尺寸、response hash 和 evidence ref。
- `AUDIT_PASS` 与 `IN_AUDIT` 均通过头像 Gate；`UNSET`、`AUDIT_REJECT`、未知或 API 异常均阻断。
- 资源类子节点统一输出 `existence_status`、`readonly_status`、`readiness_status`、`prepare_capability`、`next_action`。
- 本任务 `launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 建立任务卡、manifest、状态 | passed | 平台写权限保持关闭 |
| 补强资源子节点输出 | passed | `resource-verify-*` 统一输出 `existence_status`、`readonly_status`、`readiness_status`、`prepare_capability`、`next_action` |
| 补强头像诊断落库 | passed | 头像 probe 摘要进入 Node 4 evidence 和 `account_resources.metadata.avatar_readonly_diagnostic` |
| fresh runtime truth 只读复核 | passed_with_blocker | 新建 `JOB-MWBV2-20260827103651-6B6D80`；Node 4 仍 blocked，唯一优先 blocker 为 `avatar_not_ready` |
| DB 零写入审计 | passed | `launch_confirmations=0`、`platform_actions=0`、`created_objects=0` |
| 关闭任务 | passed | `active_task=null`；下一 gate 转向头像准备机制或单次提交任务 |

## 结果

| 项 | 结果 |
| --- | --- |
| 最终 runtime job | `JOB-MWBV2-20260827103651-6B6D80` |
| Node 1/2/3 | `passed` |
| Node 4 | `blocked` |
| Node 5 | `repairable` |
| Node 6/7 | `locked` / `waiting` |
| 创建审计 | `launch_confirmations=0`、`platform_actions=0`、`created_objects=0` |
| 头像资源行 | `exists` |
| 头像只读状态 | `UNSET` |
| 图片存在性 | `false` |
| API 结果 | HTTP `200`、api code `0`、request id present |
| 头像 readiness | `not_ready` |
| prepare capability | `prepare_unsupported` |
| evidence | `EV-JOB-MWBV2-20260827103651-6B6D80-NODE4-BASELINE-READONLY` |

结论：目标账户 `1871922346964041` 的头像接口可正常读取，但平台返回头像未设置，且没有头像图片信息；因此当前不是 token、权限或接口参数问题，而是账户头像资源未 ready。

## 机制观察

| 观察 | 影响 | 建议后续任务 |
| --- | --- | --- |
| `monitorPreflight.status` 仍显示 `blocked`，但 `runStatus=touchpoint_resolved`、`resolvedMonitorId=245828`、`touchpointUrlPresent=true` | 文案容易误导，但不影响本任务的头像结论和零写入审计 | 独立修复只读 CLI 的 monitor preflight 状态命名，将“只读计划不创建”与“真实阻断”区分 |
| 头像 `prepare_supported=false`，项目没有长期头像提交入口 | 不能自动补齐头像，只能输出诊断与下一任务建议 | 新建“头像准备机制/单次提交”任务，先查官方上传/提交合同和所需素材来源，再决定是否加入 prepare capability |

## 验证

- `node --check src/platforms/oceanengineReadonlyAdapter.mjs`
- `node --check src/workflows/skills/oe3/04-platform-readonly-reconcile.mjs`
- `node --check src/workflows/skills/oe3/04-resource-verifiers.mjs`
- `node --check src/workflows/skills/oe3/04-resource-action-registry.mjs`
- `npm run test:baseline-resource-inheritance`
- `npm run test:resource-action-registry`
- `npm run smoke:workflow-skills`
- `npm run test:readonly-readiness-cli`
- `npm run test:payload-contract`
- `npm run check:runtime-consistency`
- `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260827103651-6B6D80`

## 下一 Gate

新建“账户 `1871922346964041` 头像准备机制与单次提交方案”任务：先确认官方头像上传/提交接口合同、素材来源和一次性确认变量；在头像变为 `IN_AUDIT` 或 `AUDIT_PASS` 后，再重跑 fresh runtime truth。

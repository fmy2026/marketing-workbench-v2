# TASK-MWBV2-MICRO-APP-PASSIVE-READINESS-PROJECTION-20260901

状态：completed（2026-09-01 15:58 CST）

## 授权来源

用户于 2026-09-01 明确批准“最短处理：修正小程序实例状态投影”并要求实施。

## 唯一目标

保留小程序实例 `waiting_on_event_asset` / `waiting_on_event_configs` 被动状态，使既有事件资产链可生成 ready Resource Plan，而不把实例误判为独立准备不支持。

## 精确范围

- 修改资源 Skill 结果归一与对应 smoke；复用现有 runner 和 Execution Plan 分支。
- 目标运行：Case `CASE-MWBV2-5B75EB40E6F9AF2469`、最新 Job `JOB-MWBV2-20260901074014-B6EAA9`。
- 重启本机工作台后，提交一次精确“重新只读准备”，只运行既有 dry-run / 平台只读核验并刷新 Plan。

## 禁止

- 所有真实平台写入、资源 Plan 确认或执行、`std_project/create`、monitor 创建、token refresh、预算或出价变更。
- 新增小程序实例 executor、猜测或人工映射实例 ID、复用旧 Plan/confirmation/action/grant。
- API、数据库 Schema/View、Gate、Plan 类型或 UI 改动。
- 保存 token、secret、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 归一结果保留 passive readiness，`prepare_supported=false` 不变。
- Node 04 聚合实例为 `WAITING`；Plan 不含实例动作与实例 unsupported blocker。
- 当前 Job 重跑后 Resource Plan ready、零 blocker，且只包含六个既有受控资源动作。
- 全程平台写入为 0，且不提交“确认准备资源”。

## 结果

- `waiting_on_event_asset` / `waiting_on_event_configs` 已在资源归一层保留，runner 与 Plan 中均为 `WAITING`。
- ready Resource Plan 不再把资源执行前的 Node 5 下游缺口投影为当前根 blocker；Case 已进入既有单 Plan 授权 Gate。
- 当前 Plan 为 `resource_prepare / ready`，零 blocker，按既有顺序包含事件资产、baseline 配置、头像、DMP、视频和产品图六个动作；没有小程序实例动作。
- 精确“重新只读准备”仅提交一次；未消费 confirmation，平台 action 与 created object 均为 0。
- `test:resource-action-registry`、`test:execution-plan`、`test:workflow-case`、`test:micro-app-instance-authority-readonly`、当前 Case API 与服务重启后 smoke 均通过。

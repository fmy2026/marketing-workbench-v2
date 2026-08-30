# TASK-MWBV2-OE3-JSZC-ONEOFF-CONVERTED-TIME-OMIT-CREATE-20260830

状态：closed_created_verified

更新时间：2026-08-30 CST

## 目标

新建独立 one-off 真实创建验证，不修改现有 workflow、Node、Skill、payload builder、路线默认或已关闭 Attempt 1-3。以 Attempt 3 为冻结基线，唯一业务字段变化为：

`audience.converted_time_duration: SIX_MONTH -> omitted`

项目名固定为 `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260830`。准备完成后必须展示 Job/Draft/Plan/hash/风险，并等待新的精确人工确认；本 Task 初始实现不调用真实 `std_project/create`。

## 固定范围

| 项 | 值 |
| --- | --- |
| Route / Game / Advertiser | `oceanengine_3_byte_mini_game` / `JSZC` / `1871922346964041` |
| 独立 Series | `SERIES-MWBV2-JSZC-CTD-OMIT-ONEOFF-20260830`，`1/1` |
| Baseline | Attempt 3 `JOB-MWBV2-20260830031657-2CE128` |
| Baseline payload hash | `sha256:611616c1cfcfbb66d42d204137628f8a2513369cc4bb85db3206045010af9cfe` |
| 唯一候选 | `audience.converted_time_duration` 完全省略 |
| 冻结值 | `NO_EXCLUDE`、`filter_event` 省略、备用落地页继续发送 1 条、预算 `88888`、CPA `488`、ROI `0.088`、`SCHEDULE_FROM_NOW` |

## 允许与禁止

允许：新增临时 one-off 编译/执行模块、CLI、smoke；新建独立 Case/Job/Draft/Plan/evidence；准备阶段只读查重与资源回查；精确确认后原子 claim 并最多一次 create。

禁止：修改 `game_route_defaults`、主 workflow、Node 1-7、Skill builder、旧 Attempt 1-3 记录；自动重试；Promotion；素材、事件、DMP、预算或出价写入；token refresh；保存 raw payload、完整 URL、raw response 或完整 request ID。

## 验收

- [x] one-off 编译器不调用现有 Node 1-7 builder，只复用凭据、wire 编码、字段账本、错误脱敏、查重和 readback 安全工具。
- [x] 单变量 diff 只允许 `name` 与 `audience.converted_time_duration`。
- [x] 外链、小游戏 URL、监测链接和资源 readiness/hash 与 Attempt 3 基线不一致时阻断。
- [x] 当前 Job confirmation/action/created/readback 均为 `0`。
- [x] fake transport 验证一次 claim、一次 create、三次 readback，失败不重试。
- [x] Token 刷新后只读查重通过，Plan ready；未真实调用平台 create。
- [x] 用户确认后仅调用一次 `std_project/create`；HTTP `200`、业务码 `0`、项目 ID 存在。
- [x] 已补齐 `0/10/30` 秒三次 `std_project/list` 汇总回查，状态 `readback_verified`。
- [x] 写入 scope 已关闭；未自动创建 Promotion，未修改预算/出价，完整 request ID 未落库。

## 当前准备结果

| 项 | 值 |
| --- | --- |
| Case | `CASE-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8` |
| Job | `JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8` |
| Draft | `DRAFT-JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8-V1` |
| Plan | `PLAN-JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8-V1`，状态 `ready` |
| payload hash | `sha256:e22443b2f2edc37dce042da79519bd6394c9cd35f813a0e5d7ae063161bd353a` |
| plan hash | `sha256:5b3e70ba2723f74d0499d6dfab006f32c17fcc042dc63ff740347752eb8687fc` |
| diff hash | `sha256:17b6e55a7075203f00c9bf89f38692cd8f445d8498f42de72b7c78e61986003c` |
| changed paths | `audience.converted_time_duration`、`name` |
| duplicate | `platform_not_duplicate` |
| blocker | `[]` |
| 写入审计 | confirmation `0`、platform action `0`、created object `0`、readback `0` |

OceanEngine token 已按独立用户指令刷新为 `valid`；随后重跑 prepare，同名 `std_project/list` 查重通过。用户已确认该 Job/Plan，并已完成一次真实创建验证。

## 执行结果

| 项 | 结果 |
| --- | --- |
| 用户确认 | 已确认该 Job/Plan，开放并消费一次 create |
| create 调用 | 恰好 `1` 次 |
| HTTP / 业务码 | `200` / `0` |
| 项目 ID | 存在；完整值只在运行审计对象记录中作为必要对象 ID 保存 |
| request ID | 平台响应中存在；完整 request ID 未落库 |
| 回查 | `0/10/30` 秒三次 list，汇总记录 `readback_verified` |
| DB 计数 | confirmation `1`、platform action `1`、created object `1`、readback `1` |
| 写入 scope | 已关闭，`platform_write_allowed=false` |

结论：`Attempt 3` 基线省略 `audience.converted_time_duration` 的组合已被平台接受并创建成功。该结果只证明这一组合有效；不反向宣称前三次 `40000` 的唯一根因必然就是该字段。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户批准的“独立 Task：一次性省略 converted_time_duration 的真实创建验证”方案与 `docs/Solution Design.md`。 |
| objective | 在不修底层 workflow 的前提下，用独立 one-off 验证 Attempt 3 基线减去 `audience.converted_time_duration` 是否被平台接受。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task/Manifest、当前代码、Attempt 3 持久化字段账本和官方资料。 |
| stop condition | 准备阶段出现任何第二业务字段 diff、资源/查重/凭据 blocker，或真实执行后返回失败/未确认/成功任一终态，均停止并关闭 one-off scope。 |

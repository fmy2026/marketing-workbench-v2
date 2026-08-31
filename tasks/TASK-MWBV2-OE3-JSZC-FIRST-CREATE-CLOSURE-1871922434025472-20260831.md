# TASK-MWBV2-OE3-JSZC-FIRST-CREATE-CLOSURE-1871922434025472-20260831

状态：backup_landing_page_shared_readonly_degraded

## 目标

在账户 `1871922434025472` 完成一次真实 JSZC 标准项目创建的最短受控闭环：

```text
fresh Node 1-4 readonly
→ 仅对缺失且 prepare_supported 的资源生成不可变 Plan
→ 人工确认 exact plan hash
→ 单次资源准备与权威回查
→ fresh Draft / payload / wire-body 验证
→ 独立 create Plan + 人工确认
→ 恰好一次 std_project/create
→ Node 7 只读回查收口
```

## 当前范围

- 绑定既有 Case `CASE-MWBV2-3CDAF4E9202381253E`，新建一条 `runtime_truth` Job。
- 首先完成 Node 1-4 和 Node 5 dry-run；所有平台写入在对应 immutable Plan 的人工确认之前保持为零。
- 预期可准备资源：头像、DMP 基线包、两条视频物料、产品图。
- 已有事件资产、baseline 事件配置、小游戏实例、品牌信息和备用落地页必须 fresh readonly 验证为 READY/no-op，不重复写入。

## 禁止范围

- 未确认 exact plan hash 前的任何平台 POST/PUT/PATCH/DELETE。
- 创建或复制备用落地页、创建小游戏实例、重复创建事件资产或 baseline 事件配置。
- Promotion、监测链接组、预算、出价、OAuth token 刷新。
- 自动重试任一资源写入或标准项目创建。
- 保存 token、Cookie、secret、auth_code、完整 URL、raw payload 或 raw response。

## 人工 gate

1. 资源 Plan：只确认 fresh Job 实际生成的动作、调用上限与 plan hash；任何只读退化都先停止并重编 Plan。
2. 创建 Plan：仅在全部资源写后回查通过、Draft/payload/wire body 验证通过后，确认独立的 `std_project_create` Plan。

## 验收

- fresh Job 的 Node 4 为每种资源输出 READY / PLANNED / BLOCKED，且平台写审计为零。
- 资源 Plan 只包含 fresh readonly 判定为 PLANNED 的受支持动作。
- 每次受确认写入都严格绑定 Job、Plan、plan hash、action grants 和调用上限；失败不自动重试。
- 资源写后只在权威回查通过时更新 `account_resources` 为 `visible + readback_verified`。
- 标准项目创建仅一次，Node 7 在最多三次只读回查内收口；任何失败转人工复盘。

## 已完成 DMP 专项 Plan

旧 V3 为部分执行 Plan，保持不可复用。DMP 分类修正后已完成 fresh readonly；当前仅可确认以下 DMP 专项 Plan：

```text
job_id:    JOB-MWBV2-20260831031113-7FDB77
plan_id:   PLAN-JOB-MWBV2-20260831031113-7FDB77-V2
plan_hash: sha256:bca5ef2fa34f4e6fee7317b6a7c30473c6decd9fabad39411f527f7a106b4811

ensure_resource:dmp_audience_package  ≤ 10 calls
std_project_create                    0 calls
retry_allowed                          false
```

fresh readonly 的 10 个目标成员均为 `missing` 后，10 次 DMP POST 与逐包权威回查均已通过；Plan 已消费，`platform_write_allowed=false` 已恢复。

## DMP 专项已完成

- 用户已确认 V3；执行结束后全局平台写权限已自动收回。
- `ensure_resource:avatar` 已执行上传、提交和权威回查，资源为 `visible + readback_verified`。
- `ensure_resource:dmp_audience_package` 在写前停止：10 个计划成员的目标账户只读状态均为 `blocked`，不满足仅对目标端 `missing` 成员推送的合同；DMP POST 为零。
- 视频、产品图未执行；标准项目创建为零。
- 分类修正后，fresh readonly 的 10 个成员均为 `missing`，生成 10 条 planned 推送记录；10 条均已推送并回查为 `verified`。
- V3 与已消费的 DMP V2 均不得复用或重试。

## 视频与产品图 fresh readonly 结果

```text
job_id:    JOB-MWBV2-20260831032433-79D808
plan_id:   PLAN-JOB-MWBV2-20260831032433-79D808-V1
plan_hash: sha256:36b159f68f09136c8e8c51bb2c1ceebbe944533dd7d175de76bf564051353941
```

- Node 1–3 通过；Node 4 被唯一 verify-only 资源 `backup_landing_page` 阻断。
- 默认来源站点仍可用；目标普通站点清单只读成功但未命中；目标共享站点清单只读返回 HTTP 515 且无 request-id，故不能证明目标账户共享可见性。
- fresh Plan 的候选动作恰为视频批量绑定和产品图上传（各至多 1 次），但 `plan_status=blocked`，不得确认、授权或执行。
- 平台写入、创建对象、确认均为 0；视频、产品图和标准项目创建均未执行。
- 一致性修正后，`account_resources` 已仅从既有成功 readonly evidence 恢复为 `visible + readback_verified`；当前 Case 的唯一 root blocker 为 `site_get_target_shared_blocked`。该历史 verified 状态不替代下一次 fresh shared-inventory 回查。

最小修复边界：仅恢复或验证 `site_get_target_shared` 的只读合同/平台可用性；随后重新运行 fresh Node 1–4。恢复后必须证明默认站点的目标共享可见性、`share_type=SHARE`、可用状态及 URL hash 一致。禁止以该失败推断站点缺失，也禁止自动创建、复制或 handsel 备用落地页。

## Solution Link

- source：`docs/Solution Design.md` 的“单模块专项走通与机制收口”；`docs/project-现在的逻辑图.md`。
- objective：在不复用旧专项 Plan/确认的条件下完成该账户首次真实创建。
- current truth：Postgres `mwb.workflow_case_summary`、`mwb.account_resources`、本 Task Manifest 与 fresh Job。
- stop condition：任一只读核验、资源回查、payload/wire-body、Plan confirmation 或 Node 7 回查失败；凭据不可用；Plan 范围改变。

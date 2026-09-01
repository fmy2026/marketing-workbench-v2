# TASK-MWBV2-NEW-ACCOUNT-TWO-CONFIRM-CLOSURE-20260831

状态：completed

## 目标

保持 OE3 既有 3 阶段 7 Node、Plan 类型、Postgres 真值和权限模型不变，把成功路径收口为两份相互独立的确认 Plan：第一份 `resource_prepare` 完成全部可自动准备资源和权威回查，第二份 `std_project_create` 只创建一次标准项目并完成回查。

## 范围

- 同一 `resource_prepare` Plan 中按依赖连续执行 event asset 与 baseline event configs，再执行其余计划资源。
- event asset 创建后先确认目标资产身份，把真实 asset ID 仅在执行期传给 event-config executor；event configs 完成后再跑完整事件链回查。
- 工作台展示、确认并执行普通 Resource Plan；成功后在同一 Case 下创建 fresh runtime Job，重新只读准备并生成 Create Plan。
- 更新当前逻辑图和 focused fake/test_run smoke。

## 禁止

- 不执行账户 `1871922414575753` 或任何真实账户的平台写入，不创建资源、monitor 或广告项目。
- 不自动完成 backup landing page SHARE，不刷新 token，不修改预算或出价。
- 不把资源动作和 `std_project_create` 放入同一 Plan，不放宽 Plan/hash/confirmation/action grant、调用上限、禁止重试或权威回查规则。
- 不增加第二套编排模块、业务表或 Plan 类型。

## 验收

- 编译器生成的一份 Resource Plan 含 `event asset → event configs → 其他资源`，`maximum_create_calls=0`。
- 工作台第一张确认卡只确认并执行 Resource Plan；同一确认不可重复消费，失败立即停止。
- Resource Plan 成功后同一 Case 自动创建 fresh Job，并在只读准备后产生只含 `std_project_create` 的第二张确认卡。
- fake/test_run 成功路径恰好两份不同 Plan/hash、两条 confirmation，项目创建最多一次且只有权威回查后完成。
- 真实账户保持零新增 confirmation、零新增 platform action、零新增 created object。

## Solution Link

- source：用户批准的“新账户两次确认闭环解读与最小收口方案”。
- objective：在唯一底层机制内完成 Resource Plan 与 Create Plan 的两次确认闭环。
- current truth：`project.state.json`、本 Task/Manifest、当前代码与 Schema、Postgres `mwb.workflow_case_summary`。
- stop condition：需要真实平台写入、外部 SHARE、token refresh，或必须改变 3 阶段 7 Node/Plan 类型/权限模型时停止。

## 实施结果

- 保持 3 阶段 7 Node、Plan 类型、Postgres 表和权限模型不变。
- Resource Plan 现按 `event asset → event configs → 其他资源` 冻结和执行；真实 event asset ID 仅在已确认执行的内存链中传递。
- 工作台支持精确短语“确认准备资源”；资源成功后在同一 Case 创建 fresh runtime Job，并展示只含一次 `std_project_create` 的第二张确认卡。
- 已确认 Create Plan 在执行期间冻结并复用其绑定草稿；创建响应仍需权威只读回查后才完成。
- 账户 `1871922414575753` 未执行真实写入，审计结果为 confirmation=0、platform_action=0、created_object=0。

## 验证结果

以下命令全部通过：`test:execution-plan`、`test:single-confirmation-orchestrator`、`test:event-asset-executor`、`test:event-configs-executor`、`test:workbench-conversation`、`test:execution-grant`、`test:workflow-case`、`smoke:workflow-skills`、`smoke:api`、`validate:schemas`、`check:runtime-consistency`、`git diff --check`。

成功路径 smoke 证明恰好两次确认、两个不同 Plan/hash，资源确认不可重复消费，标准项目最多创建一次且权威回查一次。真实账户仍受外部 SHARE、micro-app authority readonly 与 event asset 账户合同前提约束。

# TASK-MWBV2-WORKBENCH-PROGRESS-EXECUTION-OBSERVABILITY-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKBENCH-PROGRESS-EXECUTION-OBSERVABILITY-20260913.json)。

## 目标

统一工作台确认卡、三阶段七 Node 进度、Plan 执行状态和分轮耗时取证，使用户看到的授权内容、完成节点和运行状态与服务端的受控事实一致。

## 批准方案

按用户于 2026-09-13 批准的“工作台确认卡、七节点进度与执行取证统一完善方案”实施：资源确认卡同时展示业务数量和冻结调用额度；Node 4、5、6、7 分别以资源就绪、草稿检查、一次创建和权威回查作为完成边界；confirmation 占用后的 Plan 使用既有 `executing` 状态；每次运行保留独立分轮计时。保持冻结 Plan、本人确认、单次执行、既有 40100 边界和 Node 07 权威回查。

## 范围

- 修改通用 Plan 元数据、Job API 进度投影、前端卡片和七节点展示。
- 新增通用数据库 migration，保存运行轮次并让确认后的 Plan 状态可被一致读取。
- 更新工作流、数据和方案文档；使用合成测试和独立数据库验证，不重跑真实业务 Case。

## 非目标

- 不执行真实平台创建、资源写入、OAuth 刷新、预算或出价修改。
- 不根据账户、Case、Job 或用户 ID 增加分支。
- 不改变调用顺序、fresh readonly、重试规则、调用额度或 Node 07 的回查边界；本任务不实施查询并行化或去重提速。

## 验收

- AC-01: 资源确认卡展示冻结的资源数量、批次和调用额度；视频 10 条/1 批/1 次等不同集合均正确，旧 Plan 明示未记录。
- AC-02: Job API 与所有工作台区域使用同一七节点进度投影；草稿通过为 5/7、创建成功待回查为 6/7、verified 才为 7/7。
- AC-03: confirmation 后 Plan 进入 `executing`，只有原 confirmation、Plan/hash 和 grant 能继续；并发与重复确认不产生额外动作。
- AC-04: 运行轮次和 Skill 计时独立保存，可区分确认等待、执行、回查和完成轮次，旧记录不被伪造为新口径。
- AC-05: 单元、集成、浏览器/API 回归、项目合同检查与迁移后的 Schema 核验通过；未发生真实平台写入。

## 停止条件

- 需要扩大确认、重试、账户权限、调用额度或真实平台写入时停止。
- 不能同时保持 Plan-bound executor、Node 07 回查和历史记录兼容时停止并报告冲突。

## 交付说明

完成后记录通用实现、迁移、测试和文档证据；动态账户事实不写入本 Task。

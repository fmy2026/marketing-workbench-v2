# TASK-MWBV2-GENERIC-RESOURCE-ACTION-CALL-LIMIT-20260908

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GENERIC-RESOURCE-ACTION-CALL-LIMIT-20260908.json)。

## 目标

使资源准备 Plan 按 fresh readonly 结果冻结每个资源动作的精确平台调用量；当动作已不需要写入（调用量为 0）时不生成确认写动作，并在确认前发现调用量漂移时 fail-closed。该机制必须对所有账户、路线和资源能力通用。

## 批准方案

依据 [Solution Design](../docs/Solution%20Design.md) 的“个体事实数据化、运行机制能力化”和现行 Plan-bound 单次确认决策：新增通用资源动作调用量合同，而非针对账户、Case 或视频建立分支。视频资源以 fresh readonly 产生的 `bindBatchCount` 作为调用量；0 表示当前资源已满足，不创建写动作；正整数冻结为该动作 grant 和 Plan 总调用量。确认前重新计算并比较，任何漂移均在平台写入前阻断。旧 Case、已消费 Plan 与历史 action 只读保留，恢复仍通过既有“重新只读准备”生成 fresh Job/Plan。

## 范围

- 调整通用执行 Plan 编译及资源动作确认校验的调用量合同。
- 为视频资源接入其既有 readonly 计划的精确调用量，并保留其他资源的既有显式上限。
- 增加零、单次、多次及确认前漂移的自动验证。
- 回写当前逻辑图和 Solution Design 的长期决策。

## 非目标

- 不修改任何现有 Case、Job、Plan、action、readback 或账户能力数据。
- 不新增账户 ID、Case ID、Job ID 或用户 ID 分支、默认值、Node、Gate、Plan/action 类型或确认短语。
- 不访问真实平台，不执行平台写入、OAuth 刷新或工作台确认。

## 验收

- AC-01: fresh readonly 的资源动作调用量能以 0、1、N 精确冻结；0 不生成受控写动作，Plan 总调用量等于动作调用量之和。
- AC-02: 确认前调用量与冻结 Plan/action grant 不一致时，在记录确认和平台写入前 fail-closed。
- AC-03: 既有资源动作、单次确认和视频 readonly 合同 smoke 通过，且不回归固定资源调用上限。
- AC-04: 项目合同检查、变更范围和文档路由均通过；工作树不存在格式错误。

## 停止条件

- 如修复需要改变已消费 Plan、创建平台对象、修改账户/Case 动态事实，立即停止。
- 如 fresh readonly 不能区分“无需写入”与“缺失资源”，立即停止并保留 blocker，不以 0 绕过。
- 如无法在确认前阻断漂移或自动验证需真实平台写入，立即停止。

## 交付说明

完成后交付通用精确调用量合同、回归测试与文档决策；账户本人仍需在部署后通过现有“重新只读准备”获得新的只读结果和确认卡，系统不会自动创建平台项目。

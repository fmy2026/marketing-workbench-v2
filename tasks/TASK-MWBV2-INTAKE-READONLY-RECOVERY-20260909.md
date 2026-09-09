# TASK-MWBV2-INTAKE-READONLY-RECOVERY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-INTAKE-READONLY-RECOVERY-20260909.json)。

## 目标

使工作台三项 Intake 已规范化且用户点击“启动流程”时，能够在通用、可恢复的已批准替代 Case 上桥接到既有“重新只读准备”命令；该路径只能创建或复用同一 Case 的 fresh readonly Job，绝不重放旧 Plan 或自动创建平台项目。

## 批准方案

用户已批准 Intake 启动未触发只读恢复的最小通用修复。后端以既有 Gate Action Policy 判定 active 替代 Case 是否可恢复，并向工作台返回向后兼容的 `requiresReadonlyRecovery`。前端只在用户重新输入 route、game、advertiser 并点击“启动流程”后，使用既有命令链提交“重新只读准备”；不新增 Node、Gate、Plan/action 类型、确认短语、账户/Case/Job ID 特例或真实平台写入。

## 范围

- 复用 Gate Action Policy 的恢复资格，扩展替代 Case 的 Intake 响应与工作台桥接。
- 验证首次替代 Job、资源/monitor 确认 Plan 停止、不可恢复和终态 Case 的差异。
- 回写当前逻辑图与 Solution Design 的通用决策。

## 非目标

- 不修改现有 Case、Job、Plan、action、readback、账户能力或历史数据。
- 不访问真实平台、不确认资源或项目创建、不执行 OAuth 刷新。
- 不改变三项 Intake、7 Node、Gate、Plan 类型或现有确认短语。

## 验收

- AC-01: 已批准替代 Case 的已停止资源/monitor Plan 返回 `requiresReadonlyRecovery`，首次 `created` Job 仍走原 initial readonly，其他状态不误触发。
- AC-02: 工作台仅在用户点击“启动流程”后的该标记分支提交既有“重新只读准备”，不得执行旧 Job 或直接写平台。
- AC-03: 恢复命令保持同 Case 幂等 fresh Job、零平台创建，并通过既有调用量与单次确认回归。
- AC-04: 文档、项目合同、变更范围与格式检查通过。

## 停止条件

- 修复需要修改已消费 Plan、历史业务事实、账户特例或新增写入入口时停止。
- Gate Policy 无法唯一判定可恢复性，或自动测试需要真实平台写入时停止。
- fresh readonly 路径产生平台创建、确认或重放旧授权时停止。

## 交付说明

完成后交付通用 Intake→readonly-recovery 桥接及回归证据。部署后，账户本人仍须通过新的确认卡和既有“确认创建”完成任何真实创建。

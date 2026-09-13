# TASK-MWBV2-UNIVERSAL-CREATE-CLOSURE-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-UNIVERSAL-CREATE-CLOSURE-20260913.json)。

## 目标

稳固三阶段七 Node 的唯一通用创建闭环：保留确认前真实 blocker、允许零创建动作的 confirmed prewrite failure 安全只读恢复，并使动态必需视频、封面、引导视频、冻结 Draft/Plan 与最终创建合同一致。

## 批准方案

按用户于 2026-09-13 批准的“通用机制稳固与创建闭环修正方案”实施。仅复用现有 Workflow、Case Gate、Plan、confirmation、executor 与 Node 7 readback；不增加账户特例、自动重试、新 Node/Gate 或业务写入旁路。成功账户仅作脱敏对照，不能成为运行时输入。

## 范围

- 修正 Case summary、confirmed prewrite failure 的只读恢复条件和工作台确认展示。
- 统一动态必需视频集合、条件封面来源和确认卡素材摘要，并扩展对应回归测试。
- 新增获批 migration 仅更新 `workflow_case_summary` 投影；不修改任何业务 Case、Job、Plan、确认、动作或资源事实。

## 非目标

- 不执行真实平台创建、资源写入、OAuth 刷新、预算或出价变更。
- 不修改任何账户、Case、Plan、确认、动作或现有业务事实。
- 不将历史成功账户、项目、素材或动态 ID 写入运行时代码。

## 验收

- AC-01: 确认前失败保留具体 blocker，零动作 confirmed Plan 可幂等创建 fresh readonly Job，已有对象及次数耗尽仍禁止恢复。
- AC-02: 工作台确认卡、提示和按钮仅在服务端确认可用时显示；确认登记或停止后不显示陈旧确认。
- AC-03: 动态必需视频集合、封面/引导视频能力、Draft/Plan/hash 与最终创建前合同逐条一致，覆盖 2、10 和非固定数量。
- AC-04: workflow、Plan、恢复、视频、payload/wire body、UI 回归及项目合同检查通过；文档更新反映合同。

## 停止条件

- 需要真实平台写入、修改当前业务事实或扩大确认/重试权限时停止。
- 发现现有 Schema 与 migration 假设冲突，或无法形成无账户特例的合同修正时停止。

## 交付说明

完成后记录实现、回归证据、文档更新及未执行真实创建的边界。

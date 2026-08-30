# TASK-MWBV2-OE3-NODE4-BACKUP-LANDING-INVENTORY-WIRING-20260830

状态：closed_validated_no_platform_write

更新时间：2026-08-30 CST

## 问题

正式 Node 4 已有备用页来源准备与最终 verifier，但现成的目标账户普通/共享站点库存只读 Skill `backup-landing-page-material-inventory` 未进入正式 schedule。平台完成指定共享后，fresh Workflow 可能仍消费旧数据库状态，影响唯一流程自动验收。

## 目标

把现成库存 Skill 接入唯一 OE3 Node 4，在 `backup-landing-page-source-prepare` 和最终 verifier 前刷新目标账户库存；不新增第二套逻辑、executor 或平台写入。

## 实施范围

- 更新 Skill 依赖、正式 runner schedule 与 Node 4 trace。
- readonly 允许时调用现有库存 Skill并复用其持久化；mock 模式不得访问真实平台。
- 补充 schedule/registry/smoke 回归。

## 禁止范围

- 备用页分享、复制或重建写入。
- 事件、小游戏绑定、项目创建、Promotion、token refresh。
- 修改前端、payload 合同或新账户旧 Job 状态。

## 验收

- 正式 dry-run schedule 顺序为：live readonly → landing inventory → source prepare → backup verifier。
- 平台分享后，fresh Workflow 可由同一 Node 4 Skill 自动刷新目标可见性、readback 和 hash 证据。
- mock/fake 回归零平台写入；节点注册、工作流、readonly CLI 和备用页库存测试通过。

## Solution Link

- source：fresh 新账户只读 Job 与当前 runner/schedule 审计。
- objective：消除已有只读能力未接入唯一 Workflow 的断点。
- current truth：Postgres、当前代码、当前 active certification Task 与 `docs/Solution Design.md`。
- stop condition：任何真实平台写入、需要新分享 executor 或改变创建合同即停止。

## 关闭结果

- `backup-landing-page-material-inventory` 已进入正式 Node 4 schedule，顺序为 live readonly → material inventory → source prepare → resource verifier。
- 目标普通库存与 `share_type=SHARE` 库存均由 fresh Workflow 自动回查并写入脱敏证据；不再依赖单独诊断 CLI 刷新数据库状态。
- Node 4 trace 已把备用页展示为同一资源 pipeline，没有新增第二套实现。
- mock 路径零网络调用；未开放备用页分享、项目创建或任何其他平台写入。
- 目标账户 fresh 只读验证确认源页可用、目标普通/共享库存仍未命中；正式认证继续停在外部 Gate。
- schedule、Node 4 合同、备用页库存、Workflow Skills、readonly CLI、Execution Plan、单确认 orchestrator、Case 投影、payload、schema、数据库合同和长链 execution grant 回归全部通过；临时 `test_run` 已清理。

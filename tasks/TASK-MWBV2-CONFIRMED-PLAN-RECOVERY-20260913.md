# TASK-MWBV2-CONFIRMED-PLAN-RECOVERY-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CONFIRMED-PLAN-RECOVERY-20260913.json)。

## 目标

修复已确认的标准项目创建在创建前停止后，同一 Job 被再次准备并展示新确认卡的问题；确保三阶段七 Node、Case Gate、Plan/confirmation 与工作台只提供一个一致的恢复或执行入口。

## 批准方案

按用户于 2026-09-13 批准的“确认卡循环的根因与主链统一修复方案”实施：已登记 Create confirmation 的 Job 不得重跑、重发 Plan 或重现确认卡；创建前零动作停止仅由权威 Gate 指向 fresh readonly recovery。confirmation 改为由 Plan 派生的身份，数据库发布、执行占用、投影与前端共同使用同一结论。保留冻结 Plan、本人确认、单次消费、Node 07 只读回查以及 Monitor/资源/创建的分开确认。

## 范围

- 为确认过的 Plan 建立不可再次准备、不可重发和不可重复确认的通用保护；将遗留的“旧确认后误发新 ready Plan”安全标为 `stale`。
- 让 Case summary、Gate Action Policy、执行可用性、对话响应和确认卡共同呈现确认后的实际结果；前端只消费服务端 `confirmationPreview`。
- 保存创建前停止的具体 blocker 与受控传输分类，确保 fresh readonly recovery 创建唯一的新 Job。
- 补充 migration、工作流/工作台/数据库回归测试，并更新当前方案、逻辑图和数据契约。

## 非目标

- 不执行真实平台创建、资源写入、OAuth 刷新、预算或出价修改。
- 不添加账户、Case、Job 或项目 ID 特例；不扩大确认次数、重试或权限。
- 不改变已经存在创建动作、创建对象或结果不明时只能 Node 07 readonly 回查的边界。

## 验收

- AC-01: V1 已确认且创建前零动作停止、同 Job 存在 V2 的状态被投影为具体 blocker 和 fresh readonly recovery，V2 不可确认且不会调用平台。
- AC-02: 旧 Job 无法重跑准备、覆盖 Draft/证据或发布新 Create Plan；新 Job 完成 readonly 后才可生成新 Plan 和新确认。
- AC-03: confirmation 按 Plan 唯一、双击/旧 hash/轮询乱序均不会增加确认或平台动作；前端收到显式空卡片时不会复活旧卡。
- AC-04: 三阶段七 Node 的正常 Monitor、资源、创建、Node 07 回查与当前项目合同检查通过；服务重载后加载当前 main。

## 停止条件

- 需要真实平台写入、扩大单次确认/重试/账户权限，或引入账户专用分支时停止。
- Schema、现有迁移或 Node 07 边界无法保持时停止并报告冲突。

## 交付说明

完成后记录代码、迁移、文档、回归和本机服务重载证据。当前业务 Case 的恢复和真实创建仍必须由账户本人在工作台完成。

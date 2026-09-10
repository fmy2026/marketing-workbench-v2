# TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-LESSON-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-LESSON-20260910.json)。

## 目标

将已由真实运行恢复、通用实现修正与回归 smoke 共同验证的“引导视频缓存必须绑定当前 Job 与已核验小游戏实例”经验，精简沉淀到 `docs/project-lessons.md`；不写入任何动态账户或平台事实。

## 批准方案

用户于 2026-09-10 批准：仅追加一条跨账户可复用的经验，说明资源行上的动态引导视频 metadata 不能跨 Job 复用，缓存资格唯一依赖规范化的当前 Job/实例双重绑定；失配时沿用既有一次 `gameplay/list` readonly，同一 Job 的持久化结果可缓存。依据为已关闭的通用修复与既有 smoke；不再改动底层代码或运行链路。

## 范围

- 维护本 Task、Manifest、项目状态和脱敏验证证据。
- 在 `docs/project-lessons.md` 的案例模板前追加一段简洁、通用、已验证的引导视频当前 Job 缓存绑定经验。

## 非目标

- 不修改运行代码、Solution Design、当前逻辑图、数据契约、Schema、API、Node、Gate、Plan、payload 或工作台行为。
- 不触发确认创建、平台 action、账户运行写入、服务重启或外部平台调用。
- 不记录账户、Case、Job、引导视频 ID、token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- AC-01: Task 启动检查通过，范围与干净基线准确。
- AC-02: 新 lesson 位于案例模板之前，完整记录当前 Job/实例双重缓存键、失配 readonly、同 Job 缓存和不适用边界，且不含动态业务标识。
- AC-03: 引导视频 readonly smoke 与文档差异检查通过，证明 lesson 仍对应现行唯一通用机制。
- AC-04: 关闭前后项目检查通过，Task 正常收口且仅提交、普通推送文档闭环变更。

## 停止条件

- 无法证实结论已由通用修复、真实恢复和回归共同支持。
- 经验需要扩大为账户特例、修改运行合同或写入动态业务事实。
- 任一变更超出 Manifest 允许路径或需要平台写入。

## 交付说明

完成后交付一条可复用 lesson 及其验证证据。该文档结论只覆盖 Job 绑定的引导视频能力；未来其他资源或创建动作仍按各自合同核验。

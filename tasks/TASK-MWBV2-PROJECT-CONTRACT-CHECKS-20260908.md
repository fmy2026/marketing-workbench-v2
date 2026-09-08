# TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908.json)。

## 目标

使新任务可检查地选择上下文、按证据关闭，并集中维护流程与数据报表职责。

## 批准方案

用户在本会话明确要求实施《项目机制最小修正方案》；设计决策见 [Solution Design](../docs/Solution%20Design.md)。

## 范围

项目控制文档、两个 JSON Schema、Task/Manifest 模板、只读校验器、正反例测试和本任务证据。收口当前机制文档；历史 Task/Manifest 只诊断。

## 非目标

不修改 src、frontend、SQL migration、数据库业务事实、平台权限；不调用外部业务平台，不提交或推送 Git。

## 验收

- AC-01: 两份 Schema 与固定模板约束唯一 Task 指针、Manifest 状态、读取顺序、范围和验收证据。
- AC-02: 启动、关闭前、关闭后检查能拒绝错引用、漏读、无证据完成、指针残留和越界改动，并正确处理 Git 已提交、暂存、未暂存、未跟踪及基线脏文件。
- AC-03: 文档职责集中，历史入口标记清楚，能力承接、数据键/时间/去重/指标口径有权威位置。
- AC-04: 历史 Task/Manifest、业务代码、数据库 migration 与有效权限不变；历史审计不补造证据。
- AC-05: 生命周期正反例通过，关闭材料有证据且当前/最近关闭指针约束可校验；实际关闭后另附检查结果。

## 停止条件

出现需要修改业务流程、数据库结构、平台授权或重写旧任务事实的需求时停止；其他执行边界见 Manifest。

## 交付说明

交付两份 Schema、固定 Task/Manifest 模板、`check:project` 与 `55` 项正反例回归；当前文档完成职责收口，旧记录只生成诊断。验收说明见 [验证证据](../evidence/TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908/validation.md)。开发任务完成不代表任何业务 Case 已 verified。

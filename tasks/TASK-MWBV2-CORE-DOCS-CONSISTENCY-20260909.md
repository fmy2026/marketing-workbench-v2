# TASK-MWBV2-CORE-DOCS-CONSISTENCY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CORE-DOCS-CONSISTENCY-20260909.json)。

## 目标

将三份核心当前文档与已验证的 migration、运行模式和最近有效机制任务保持一致。

## 批准方案

用户已批准仅更新三份核心文档：逻辑图将 migration 基线同步至 `078` 并纠正运行模式说明；数据契约补充 `078` 的路线默认值来源；经验文档更新校验基线。依据为当前代码、Postgres 只读核验与 [Solution Design](../docs/Solution%20Design.md) 的现行决策。不得修改代码、数据库或运行事实。

## 范围

仅修改 `docs/project-现在的逻辑图.md`、`docs/project-数据与报表契约.md`、`docs/project-lessons.md` 及本 Task 闭环文件。

## 非目标

不改动应用代码、Schema、migration、平台配置、业务 Case/Job/Plan/资源/证据或历史任务；不执行真实平台调用。

## 验收

- AC-01: 三份文档的 migration 基线、运行模式、路线默认值来源和任务校验基线均与当前代码及已验证 Postgres 配置一致。
- AC-02: 项目闭环与文档范围检查通过，且无代码、数据库或平台副作用。

## 停止条件

若核验发现需要修改文档以外的代码、数据库或动态运行事实，或核心事实无法由当前代码/只读 Postgres 确认，则停止并报告。

## 交付说明

完成后仅交付三份同步文档及验证记录；运行时业务真值仍以 Postgres 为准。

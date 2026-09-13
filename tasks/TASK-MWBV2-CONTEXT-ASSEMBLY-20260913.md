# TASK-MWBV2-CONTEXT-ASSEMBLY-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CONTEXT-ASSEMBLY-20260913.json)。

## 目标

合并核心上下文与 Job Bundle 的共同账户作用域装配。

## 批准方案

执行已批准简化方案的 Task 4，保持单次 SQL 查询与各入口返回结构。

## 范围

仓储共同 SQL 片段、核心工作流回归和任务文档。

## 非目标

不修改表、View、投影口径、查询次数或业务筛选。

## 验收

- AC-01: 两个入口共用账户作用域 SQL 片段。
- AC-02: 核心 workflow 读取回归通过。
- AC-03: 项目闭环通过。

## 停止条件

上下文、Gate 或查询次数出现差异。

## 交付说明

仅收束重复作用域片段，保留入口专属字段和排序。

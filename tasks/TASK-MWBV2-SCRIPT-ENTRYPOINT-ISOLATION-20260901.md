# TASK-MWBV2-SCRIPT-ENTRYPOINT-ISOLATION-20260901

状态：completed（2026-09-01 12:25 CST）

## 目标

复核当前逻辑图与数据报表契约，将已被工作台/API 唯一主链替代的历史 CLI、Task 专项脚本和 one-off 工具迁入 `scripts/archive/` 可恢复隔离区，并修复因此次复核发现的过期 smoke 合同。

## 范围

- 迁移已批准清单中的 16 个脚本，不删除内容；用 manifest 保存原路径、替代入口和恢复说明。
- 删除 `package.json` 中指向隔离脚本的命令，禁止 live runtime/package import `scripts/archive`。
- 修复 event asset/config、readonly 敏感扫描和动态 payload fixture 的四项 smoke。
- 同步 `AGENTS.md`、Solution Design、当前逻辑图和数据报表契约。

## 禁止

- 任何真实平台写入、confirmation、action grant、token refresh、monitor/resource/std_project 创建或重试。
- 修改 3 阶段 7 Node、Plan/action 类型、executor、数据库表/View、migration 或业务运行事实。
- 删除隔离脚本、改写 Git 历史，或把 `scripts/archive` 作为 runtime 依赖。

## 验收

- 16 个脚本可在 `scripts/archive/` 恢复，live package/import graph 不引用 archive。
- 四个已知失败 smoke 修复并通过；关键 workflow/API/Plan/authorization 回归通过。
- Postgres 仍为 33 张基础表、5 个 View，`workflow_case_summary` 仍为 24 列。
- test_run 无残留、零真实平台写入，`git diff --check` 通过。

## Solution Link

- source：用户批准的“v2 文档复核与后端脚本隔离方案”。
- objective：只保留当前唯一工作台/API 主链及安全诊断入口，将历史 CLI 可恢复隔离。
- current truth：`project.state.json`、本 Task/Manifest、当前代码/Schema 与 Postgres `mwb`。
- stop condition：需要删除脚本、改变运行/数据合同或发生任何真实平台写入时停止。

## 完成结果

- 16 个批准脚本已迁入 `scripts/archive/`，内容保留，`manifest.json` 可按原路径恢复；15 个旧 package 命令已移除。
- 工作台/API 唯一正式写入链、archive 禁止 package/runtime import/直接执行的边界已同步到 AGENTS、Solution Design、逻辑图和数据契约。
- 四个过期 smoke 与稳定 mock fixture 已修正；workflow、API、Plan、execution grant、single-confirmation orchestrator、Schema 和数据库合同回归通过。
- Postgres 复核为 33 张基础表、5 个 View、`workflow_case_summary` 24 列；`test_run`、其 confirmation、platform action、created object 与 readback 均为 0。
- 未删除脚本、未修改 migration/Plan/action/Node/数据库合同，未执行真实平台写入或 token refresh。

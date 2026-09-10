# TASK-MWBV2-AGENT-MODEL-CONFIG-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-AGENT-MODEL-CONFIG-20260910.json)。

## 目标

为投放创建 Agent 建立每用户隔离、默认关闭且不泄露 API Key 的 OpenAI-compatible 模型配置闭环，不改变任何 Workflow 或平台执行行为。

## 批准方案

实施用户于 2026-09-10 批准的 P0 Task 2：配置元数据写入 Postgres `workbench_agent_model_configs`，密钥只写入 gitignored、权限强制为 `0600` 的 `.local/workbench-llm-credentials.json`。用户仅能读写自己在 `launch_creation` Agent 上的配置；管理员没有越权读取/修改能力。固定 Schema 的无业务数据连接测试通过后才能启用；任何更新都重新进入未验证状态。

## 范围

- 新增配置 migration、仓储方法、0600 原子本地密钥库与安全单元测试。
- 提供本人隔离的读取、更新、测试 API，以及脱敏 audit。
- 在 Agent 工作区实现大模型配置 Modal、写入、连接测试、启用/停用和状态展示。
- 只支持 `openai_compatible` 协议；测试请求不携带业务数据或原始用户对话。

## 非目标

- 不把模型接入 Intake 或 Job command，不改变 deterministic Intent Resolver。
- 不保存 API Key 至 Postgres、audit、日志、前端状态、页面 DOM 或测试证据。
- 不调用真实投放平台、不改变 Gate/Plan/confirmation/action grant，也不支持管理员代管他人配置。

## 验收

- AC-01: 模型配置表、仓储和本地密钥库满足用户+Agent 唯一隔离、0600 权限与原子更新，且 Key 不进入 Postgres 或公开返回。
- AC-02: 读取、更新、测试和启停 API 仅允许本人；配置改变必定失效，错误/未测配置不能启用，audit 不含敏感字段。
- AC-03: 工作区配置弹窗只显示非敏感状态，Key 永不预填；用户可取消，连接测试使用固定 Schema 且不含业务数据。
- AC-04: 安全、迁移、隔离和现有 Workflow 回归检查通过；没有真实模型或平台写入。

## 停止条件

- 需要保存、显示、审计或调试输出 API Key、完整 URL、原始模型响应或原始对话时停止。
- 需要将模型输出用于 Gate、Plan、确认、平台动作或越过本人作用域时停止。
- migration 无法在当前数据库安全应用或发现既有配置泄露时停止并报告。

## 交付说明

完成后记录配置闭环、安全测试与下一 Task 的 adapter 接入边界；状态和逐项验证仅维护在 Manifest。

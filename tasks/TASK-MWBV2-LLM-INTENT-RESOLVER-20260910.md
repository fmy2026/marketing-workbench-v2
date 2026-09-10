# TASK-MWBV2-LLM-INTENT-RESOLVER-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-LLM-INTENT-RESOLVER-20260910.json)。

## 目标

将本人已测试并启用的模型配置以严格 Schema 接入意图和三项 Intake 槽位解析，同时保留确定性命令、Gate 和执行链的最高优先级。

## 批准方案

实施 P0 Task 3：模型只返回 allowlist intent、confidence、`route_id`、`game_code` 和 `advertiser_id`；低置信、非 JSON、超时、provider 异常和非法 intent 全部回落规则解析。模型不输出或影响 Gate、Plan、平台动作或确认结果。

## 范围

- 为 OpenAI-compatible 实现严格 JSON adapter 并按当前用户加载已启用配置。
- 在初始 Intake 和已有 Job command 中注入同一 resolver，并显示本次解析来源。

## 非目标

- 不修改模型配置存储、数据库、Node、Gate、Plan、确认或平台写入链。

## 验收

- AC-01: 模型输出、超时和失败均被严格校验且安全退化。
- AC-02: 初始 Intake 与 Job command 使用同一按用户 resolver，确定性命令仍优先。
- AC-03: 无真实模型或平台写入的回归测试通过。

## 停止条件

- 任一实现可能使模型决定 Gate、Plan、确认、权限或保存原始对话时停止。

## 交付说明

状态和逐项验证只维护在 Manifest。

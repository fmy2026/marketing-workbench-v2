# TASK-MWBV2-AGENT-READONLY-MODULES-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-AGENT-READONLY-MODULES-20260910.json)。

## 目标

完成投放创建 Agent 的记忆、知识库、技能和数据统计四个只读模块，并确保结构化记录、公共能力说明和报表范围符合既有权限边界。

## 批准方案

实施 P0 Task 4：记忆只读取本人 Case/Job 的受控投影，知识库和技能只从 Agent 注册表及 Workflow Node 投影展示，数据统计复用既有 Postgres summary/detail；管理员只可在本人/全部只读范围切换，不能代操作账户。

## 范围

- 提供四个模块的工作区内容和历史 Case 恢复入口。
- 将公开知识主题和 Node 的输入、输出、状态含义以注册表投影呈现。
- 为报表 API 增加管理员本人/全部只读范围，默认本人。

## 非目标

- 不新增对话表、记忆写入、知识上传、向量库、技能编辑器或定时任务。
- 不修改 Gate、Plan、确认、Workflow Node、平台写入或账户归属规则。

## 验收

- AC-01: 记忆仅展示当前用户自己的结构化 Case/Job 记录，可恢复最新 Job，且不显示聊天原文或完整账户标识。
- AC-02: 概览、知识库和技能只从公开 Agent 注册表/Workflow 投影展示，包含真实能力与只读边界。
- AC-03: 数据统计默认本人；管理员可切换全部用户只读汇总，非管理员无法扩大范围。
- AC-04: 既有工作台、权限隔离、对话和 runtime policy 回归通过，且无真实平台写入。

## 停止条件

- 若任一模块需要保存 raw transcript、创建第二份业务真值、泄露跨用户动态记录或扩展代操作权限，则停止。

## 交付说明

状态和逐项验证只维护在 Manifest。

# TASK-MWBV2-WORKBENCH-CONVERSATION-GATE-LLM-READY-20260831

状态：completed

## 目标

让工作台对话能够以当前 Case Gate 为依据安全续办流程，并为未来可配置 LLM 的意图理解保留可替换接口。

```text
用户消息
→ Intent Resolver（deterministic / future LLM）
→ strict intent contract
→ Gate Action Policy
→ 只读执行 / 卡点说明 / Plan 确认卡
→ 已绑定确认才进入既有单次执行器
```

## 范围

- 实现确定性 Intent Resolver、Provider 抽象、严格输出校验和 fail-closed 降级。
- 让 API 重新读取 Job/Case/Plan 后，根据 `workflow_case_summary` 的 Gate 产生交互结果。
- 工作台支持活动 `case_id` 恢复、继续对话和 Plan 绑定确认卡；`job_id` 历史页保持只读。
- 强化确认接口的 expected Plan ID/hash 校验，并补充无外部写入回归。

## 禁止范围

- 调用 LLM、安装模型 SDK、写入模型配置密钥或持久化原始对话。
- 所有外部平台写入、资源准备执行、`std_project/create`、重试、预算或出价变更。
- 数据库 Schema、`workflow_case_summary`、Node/Skill 状态语义变更。
- 把 Gate 计算、Plan 或权限决策移到前端或 LLM。

## Solution Link

- source：用户确认的“工作台对话续办与 LLM-ready 意图层修正”方案；`docs/Solution Design.md`；`docs/project-现在的逻辑图.md`。
- objective：将对话变为受控续办入口，LLM 仅限理解自然语言，运行真值和写入 Gate 仍由确定性后端控制。
- current truth：Postgres `mwb.workflow_case_summary`、当前 Job/Plan/confirmation、`project.state.json` 和现有执行器。
- stop condition：任何实现需要真实平台写、持久化原始对话或模型推理、变更 Schema/View，或允许 LLM 触发执行。

## 验收

- “继续执行”在授权 Gate 只展示脱敏确认卡；`platform_actions=0`。
- 只有确认卡按钮或精确“确认创建”并携带当前 Plan ID/hash 才可进入既有确认链路。
- 历史 Job 不可执行；活动 Case 刷新后恢复最新 Job 的对话状态。
- 模型异常、低置信度、非法 Intent、提示注入与模糊确认均 fail closed。
- 全部验证通过，任务关闭时 `active_task=null` 且 `platform_write_allowed=false`。

## 完成结果

- 已接入默认确定性 Intent Resolver、可替换 Provider 接口和严格的 fail-closed 输出校验；本次未安装 SDK、未调用 LLM。
- 已实现只读 Gate Action Policy、`POST /api/launch/jobs/:jobId/command`、活动 Case 续办与历史 Job 只读隔离。
- 已实现脱敏确认卡及 Plan ID/hash 绑定；“继续执行”仅产生只读动作或确认卡，平台写权限关闭时无法执行。
- 已验证 API、执行授权、Case、Skill、只读回归和浏览器交互；当前真实 Case 保持 `platform_actions=0`、`attempts_used=0`。

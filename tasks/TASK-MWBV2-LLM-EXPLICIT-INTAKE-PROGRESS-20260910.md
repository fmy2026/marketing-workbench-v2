# TASK-MWBV2-LLM-EXPLICIT-INTAKE-PROGRESS-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-LLM-EXPLICIT-INTAKE-PROGRESS-20260910.json)。

## 目标

将投放创建 Agent 的模型能力收窄为可验证的显式 Intake 补齐，并把用户可见的进度、卡点和范围提示改为确定性中文说明；不改变既有 3 阶段 7 Node Workflow 或任何平台写入边界。

## 批准方案

用户已批准“规则完整 Intake 优先、部分 Intake 允许模型以原文证据补空值、模型不可自动补全、进度不交给模型解释”的方案。模型不接收动态运行事实，预设只代表用户主动选择；详细决策见 [Solution Design](../docs/Solution%20Design.md)。

## 范围

- 为 route、game、advertiser 的模型候选增加原文证据校验、受控别名规范化、规则优先合并和安全 fallback。
- 增加限定范围的确定性帮助、状态和中文进度说明，以及不改变流程的预设入口。
- 更新 Agent 壳层公开描述、当前逻辑图与 mock smoke；不接触真实账户或平台。

## 非目标

- 不新增 Node、Gate、Plan、重试、数据库迁移、对话表、向量库或开放问答。
- 不推断账户、预算、出价、路线或游戏；不让模型读取 Case、Job、资源、Gate、Plan、账户清单或历史运行事实。
- 不执行任何真实平台写入、新账户 B 创建或凭据录入。

## 验收

- AC-01: 完整规则 Intake 保持规则路径；部分 Intake 仅允许模型基于原文证据和受控别名补空值，且失败安全回退。
- AC-02: 用户可见回复只覆盖所需输入、当前进度、唯一 blocker、下一步和受控确认；模型输出不直接展示，进度不含虚构 ETA。
- AC-03: 预设、模糊确认、提示注入与状态查询均不改变 Workflow 或触发平台动作；精确确认合同不变。
- AC-04: 模型配置隔离、Key 不回显、原始对话不持久化和既有工作台回归均通过。
- AC-05: 方案、逻辑图、Task/Manifest 和验证证据完成同步，项目合同校验通过。

## 停止条件

- 任何实现需要修改 Node、Gate、Plan、执行授权、真实平台账户或持久化原始对话。
- 无法在不向模型传递动态业务事实的条件下验证槽位证据。
- 测试出现 API Key、Token、完整触点 URL、原始请求或响应泄漏。

## 交付说明

完成后提供受限模型解析、确定性用户话术和 mock 验收证据；新账户 B 的真实运行留待本 Task 关闭后由工作台 runtime policy 单独执行。

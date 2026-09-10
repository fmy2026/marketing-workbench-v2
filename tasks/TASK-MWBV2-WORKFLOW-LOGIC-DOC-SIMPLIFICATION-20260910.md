# TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910.json)。

## 目标

将当前逻辑图精简为从 Workflow Skill、Case Gate、Plan-bound 执行到权威回查的唯一静态底层机制总览；覆盖全部核心运行情况，同时避免复制代码、SQL 或 Postgres 动态真值。

## 批准方案

用户已批准按场景而非逐项百科重构文档：以一条闭环主链说明整体机制，以 7 Node 表归纳 Skill 组，以核心情况矩阵连接资源状态、Plan 与 Case Gate，并把引导视频、OAuth、接口参数等专项细节下沉到唯一权威引用。

该选择收紧 [Solution Design](../docs/Solution%20Design.md) 中既有“当前逻辑图分层”决策，不改变 Node、Skill、Gate、Plan、授权、回查或运行行为。

## 范围

- 重构 `docs/project-现在的逻辑图.md` 的结构和措辞，补齐 `WAITING`、`create_fresh_job` 与 Workflow Skill 分组。
- 更新 `docs/Solution Design.md` 中现有文档分层决策行。
- 建立任务合同、验证证据并按项目协议关闭任务。

## 非目标

- 不修改 `src/`、`frontend/`、`db/`、Schema、API、部署配置或平台接口。
- 不修改任何业务 Case、Job、Plan、资源、action、confirmation 或 readback 动态事实。
- 不执行真实平台写入、OAuth 刷新、数据库写入或外部资产操作。

## 验收

- AC-01: 当前逻辑图用单一闭环清晰说明真值分工、正式写入链和工作台消费边界，正文约 110–130 行且不重复维护实现规则。
- AC-02: 文档按场景覆盖 3 阶段 7 Node、六种 runner mode、八类资源、`READY / WAITING / PLANNED / BLOCKED` 四态、三类可确认 Plan 与不可执行的 `readiness_blocked`。
- AC-03: 核心情况矩阵覆盖当前全部 Case Gate，并只描述消费者行为；SQL View 仍是 Gate 优先级的唯一权威。
- AC-04: Solution Design 同步收紧既有决策；约定的 Workflow、资源、Plan、Case、工作台测试及项目合同检查全部通过。

## 停止条件

- 若精简需要改变任何既有 Node、Skill、Gate、Plan、资源能力、确认语义或运行时安全边界。
- 若当前权威代码、数据契约与文档不能支持同一静态机制结论。
- 若验证需要连接业务数据库、调用真实平台或扩大允许写入范围。

## 交付说明

已将当前逻辑图重构为 132 行的静态机制总览：以唯一闭环为入口，按 7 Node 归纳 Workflow Skill，并以资源四态、Plan 安全不变量和完整 Case Gate 矩阵覆盖核心分支；`Solution Design.md` 的既有分层决策已同步收紧。

五组约定回归、静态覆盖核对、`git diff --check` 与项目合同闭环结果见[验证证据](../evidence/TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910/validation.md)。任务状态仅维护在 Context Manifest。

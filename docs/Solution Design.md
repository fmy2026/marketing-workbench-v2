# Solution Design

用途：针对一个卡点、异常、需求、迁移或重要调整，输出可落地、可验证的最佳方案。

本文件不保存动态任务、账户、Case、Job 或运行状态。

## 何时使用

```text
默认任务启动：不读取。

以下情况读取：
- 修复流程、Node、Skill、Script、API 或数据库卡点。
- 调整数据真值、报表、字段、View、外部接口或平台写入。
- 复用旧项目经验、设计迁移路径、比较多个方案。
- 涉及不可逆、高风险或需要人工决策的变更。
```

## 方案顺序
“小改动可合并为：问题 / 推荐方案 / 验收 / 停止条件；复杂或高风险变更再展开完整 8 段。”

```text
1. Context
   现象、影响、当前 blocker。

2. Objective
   本质目的、成功标准、非目标。

3. System Placement
   位于哪条流程、Node、Skill、数据层或报表；
   上游输入、下游承接、动态真值源。

4. Facts & Constraints
   已确认事实、未知项、权限、数据、兼容性与风险。

5. Options
   最小修复 / 结构化修复 / 暂缓或不做。

6. Recommended Design
   推荐方案、理由、允许修改、禁止修改、输入→执行→输出。

7. Validation & Stop
   测试、数据校验、对账或外部回查；
   停止条件、回退和剩余风险。

8. Decision & References
   人工确认项，以及代码、Postgres、历史经验、知识库或官方资料依据。
```

## 资料优先级

```text
当前动态事实：
Postgres marketing_workbench_v2.mwb
→ 当前 Task / Context Manifest
→ 当前代码与 schema

OE3 接口合同：
官方文档 3.0
→ 外部给定官方资料 3.0
→ 官方文档 2.0
→ 官方文档 2.0 copy

历史经验：
docs/project-lessons.md
→ /Users/hys/Projects/marketing-workbench
→ PostgreSQL marketing_workbench
→ PostgreSQL marketing_workbench_v2
特别是：platform_actions / evidence_artifacts / launch_execution_plans
```

| 资料 | 路径 |
| --- | --- |
| OE3 官方 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0` |
| OE3 外部给定 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei` |
| OE3 官方 2.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0` |
| OE3 官方 2.0 copy | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy` |
| 乾坤接口 | `docs/.参考文档/乾坤系统/api-docs-20260827.md` |

```text
仅当 3.0 资料不足时补查 2.0。
2.0 与 3.0 冲突时停止，不得将旧版字段当作当前真值。
旧项目和历史数据库只能提供假设、经验与测试思路；
必须在 v2 重新实现、测试并通过当前官方合同验证。
```

## 输出与落地

```text
每次方案输出必须包含：
问题 / 本质目的 / 系统位置 / 已确认事实与未知项
/ 可选方案 / 推荐方案 / 验证与停止方式 / 依据。
```

### 方案与 Task 关联

```text
复杂、高风险或基于历史排查的方案：
必须在对应 Task 中声明 Solution Link。

Solution Link 至少包含：
- source：方案、排查或证据文档
- objective：本次 Task 要达成的目标
- current truth：当前运行真值来源
- stop condition：必须停止并人工确认的条件

方案/排查文档只提供推断与证据；
PostgreSQL、当前代码和当前 Manifest 才是运行真值。
```

```text
方案批准后：
推荐方案 → Task 目标
系统位置与真值源 → Task / Manifest
允许与禁止边界 → allowed_writes / forbidden_actions
验证与停止条件 → 验收 / validation_plan / stop_conditions
人工确认项 → human gate / project.state.json guardrail
```

## 单模块专项走通与机制收口

当唯一底层机制中的某个单独模块尚未真实走通，或已有主流程因该模块反复阻断时，不先扩大改造范围；先用最短专项链路形成一次真实、可复用、可审计的成功经验，再回填唯一机制。

最简处理逻辑：

```text
1. 只读定位
   从 workflow_case_summary / account_resources / platform_actions / evidence_artifacts
   找到唯一当前 blocker、目标资源、已有证据和缺口。

2. 专项 Task + Manifest
   只绑定一个 Case、一个 Job、一个资源模块、一个 plan action。
   禁止夹带主流程其他动作。

3. 本地合同确认
   官方资料 + 当前代码 + 历史经验只用于确定：
   endpoint、method、字段清单、幂等规则、回查接口、停止条件。
   账号、资产、事件、模板等动态数值只从数据库或平台只读实时取得。

4. 单动作 Plan
   生成一份不可变 Plan：
   planned_actions = [唯一动作]
   maximum_platform_calls = 该动作最小上限
   retry_allowed = false
   plan_hash 固定后等待人工确认。

5. 快速执行
   写前再只读一次；
   缺什么创建什么；
   小实现问题可修复后用新 Plan/version 继续；
   不重复消费旧 Plan，不自动扩大权限。

6. 写后回查
   只认最终成功接口的只读回查：
   list/detail/config/get/goal/dbt/readback 等模块自己的权威接口。
   回查不通过即 BLOCKED，不把创建响应本身当 READY。

7. 数据库落账
   platform_actions：记录 action 类型、endpoint path、code、脱敏摘要、idempotency_key、plan_id/hash。
   account_resources：仅在回查通过后写 visible + readback_verified。
   evidence_artifacts：归档脱敏证据 hash、接口路径、字段结果摘要。
   launch_execution_plans / launch_confirmations：保留每版 Plan 与确认链路。
   launch_node_runs / launch_skill_runs：记录专项执行结果。
   workflow_case_summary：作为唯一对外当前状态投影。

8. 机制收口
   成功后只把“已验证接口 + 字段合同 + 回查判定 + 停止条件”固化进代码和文档；
   不固化账户 ID、资产 ID、event_id、预算、出价、完整 URL、raw payload 或 raw response。
   删除或降级旧的保守分支，保留必要 BLOCKED 分支用于权限、合同、歧义和回查失败。
```

最精简格式：

```text
模块卡点
→ 只读查库/查平台定位唯一缺口
→ 单模块 Task/Manifest
→ 单动作 Plan + 最小调用上限
→ 人工确认 plan_id + plan_hash
→ 写前只读
→ 单接口创建/补齐
→ 写后权威回查
→ Postgres 脱敏落账
→ workflow_case_summary 收口
→ project-lessons 记录经验
→ 代码/逻辑图只保留验证通过的通用机制
```

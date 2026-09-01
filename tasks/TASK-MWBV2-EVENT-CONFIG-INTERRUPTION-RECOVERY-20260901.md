# TASK-MWBV2-EVENT-CONFIG-INTERRUPTION-RECOVERY-20260901

状态：completed

## 授权来源

用户于 2026-09-01 批准“最小修复：事件配置中断收口与 fresh readonly 续跑”并要求实施。

## 唯一目标

让已确认 Resource Plan 的事件配置请求在超时、异常或当前悬挂状态下必然收口，并通过既有 `blocked_confirmed_resource_plan → 重新只读准备 → fresh Job` 主链安全续跑；不改变唯一底层机制。

## 当前事实

- 当前 Plan 已确认且不可再次消费。
- 权威只读回查已确认 baseline 为 4/6；`purchase_roi_7d` 请求仍处于 started，`purchase_roi_30d` 未执行。
- 当前进程保留悬挂平台连接；现有 executor 没有写请求超时。
- 当前 Plan 仍为 ready、Job 仍为 draft_ready，导致前端显示“当前 Plan 不可确认”而不是执行中断 blocker。

## 实现范围

- 事件配置写请求固定 15 秒超时、响应不明只读回查、禁止重试。
- confirmed-resource orchestrator 对失败和异常统一收口 action、Skill、Job 与已确认 Plan。
- partial baseline 将已配置项视为满足，只为缺失且 available 的项生成候选。
- 复用现有 Case Gate 与前端投影，增加中断 blocker 的统一中文展示。
- 重启工作台并对当前 Case 进行一次 DB 终态收口和平台只读回查；不执行任何平台写入。

## 禁止

- 重新调用当前 Plan、自动确认 fresh Plan 或补写当前缺失事件。
- token refresh、项目创建、资源创建、预算或出价修改。
- 新增 API、Schema、View、Gate、Plan/action 类型或后台 worker。
- 保存 token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 永不返回的写请求在 15 秒内进入 response unknown、只读回查与 blocked 终态。
- 4/6、5/6、6/6 分别只产生 2、1、0 个 event-config create candidate。
- 当前旧 Plan consumed、Job blocked、唯一 root blocker 为 `confirmed_resource_execution_interrupted`。
- 工作台显示进度 4/7 已暂停且无确认按钮；“刷新进度”保持只读。
- 用户后续输入“重新只读准备”只创建 fresh readonly Job，不复用旧 Plan/confirmation/action。

## 停止条件

- 修复需要真实平台写入、自动重试、放宽 Plan 绑定或引入新 Gate/Schema/API。
- 重启后的权威回查无法确定当前 baseline 配置集合。

## 完成结果

- 事件配置写入现在有固定 15 秒上限；超时或异常统一记录为 `failed_once` 与 response unknown，随后只做权威回查并停止，不自动重试。
- confirmed-resource orchestrator 会收口父动作、Skill、Job 和已确认 Plan；中断统一投影为 `confirmed_resource_execution_interrupted`，旧 Plan 进入 `consumed`。
- partial baseline 已按已配置事实计算；4/6、5/6、6/6 分别只产生 2、1、0 个缺失候选。
- 当前 Case 权威回查为 baseline 4/6；旧 Plan 已 consumed、Job 已 blocked，确认卡为空，唯一阻断为“资源执行中断，等待只读恢复”。
- 工作台 LaunchAgent 已重启并加载新代码；用户下一步仍只能输入一次“重新只读准备”，本任务未创建 fresh Job、未确认 Plan、未触发真实平台写入。
- 已通过事件配置、confirmed-resource、工作台进度/对话/runtime policy、workflow、API、Schema、数据合同、安全摘要与 runtime consistency 检查。

# TASK-MWBV2-WORKBENCH-UNIFIED-ADDRESS-CASE-ISOLATION-20260901

状态：completed

## 目标

把 v2 工作台收敛为唯一入口，并以 active Case 隔离多个账户的运行进度；开机登录后可恢复本机服务，根页不自动加载任何账户。

## 范围

- 统一地址配置、服务监听、Case/Job 链接、API 返回链接与本机 LaunchAgent。
- 根页展示 active runtime Case，并以 `case_id` 恢复最新 Job、以 `job_id` 提供历史只读。
- 为同一 route、game、advertiser 的 active runtime Case 增加数据库唯一性与 API 复用语义。
- 对既有目标 Case 只执行已注册的小游戏实例和事件资产合同权威只读核验。

## 禁止

- 任何真实平台写入、confirmation、资源/monitor/标准项目创建、token refresh、预算或出价修改。
- 新增业务表、Plan 类型、工作流 Node 或第二套 Gate/进度真值。
- 保存敏感凭证、完整 URL、raw request、raw payload 或 raw response。

## 验收

- v2 仅公开 `http://127.0.0.1:3000/`；旧营销工作台 LaunchAgent 不再指向旧项目或端口。
- 根页仅展示 active runtime Case；Case 与历史 Job 均严格按 URL 参数加载且不串账户。
- 同一业务 scope 不能创建第二个 active runtime Case，重复请求可恢复既有 Case。
- 回归测试、Schema 检查、API smoke 和目标 Case 零写入审计通过。

## Solution Link

- source：用户批准的“统一地址与多账户进度隔离方案”。
- objective：固定唯一入口，并让 Case 成为可恢复、不可串线的账户进度边界。
- current truth：`project.state.json`、本 Task/Manifest、当前代码/Schema 与 Postgres `mwb.workflow_case_summary`。
- stop condition：需要真实平台写入、凭证刷新、改变既有 Gate 真值或引入第二套编排机制。

## 完成结果

- 已固定 loopback 工作台入口、Case/Job 链接和常驻启动配置，并以 active runtime Case 作为账户进度边界。
- 已应用 active runtime Case scope 唯一索引；重复请求只返回既有 Case，不创建新的 Job。
- 已完成地址、Case、API、Schema、执行 Plan 与工作流 smoke；所有测试夹具均已清理。
- 已执行首项授权只读核验；其未通过时按合同停止，未执行后续核验、确认或任何平台写入。动态账户状态只以 Postgres 为准。

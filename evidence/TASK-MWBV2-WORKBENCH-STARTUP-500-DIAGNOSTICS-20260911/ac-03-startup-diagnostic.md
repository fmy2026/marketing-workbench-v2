# AC-03 单次启动诊断证据

- 验证时间：2026-09-11T11:47:00Z
- 操作：已登录的工作台仅提交一次“启动流程”；没有进入确认或平台创建界面。
- 用户可见结果：`创建 Case` 阶段未完成，诊断码为 `sha256:1a36057c7b887b9afba3cd0ff1cd973d25a585ea9dfd389bcc0c8ba48e60df68`，进度保持 `0 / 7`。
- 本地受控日志：`POST /api/workflow-cases`、阶段 `start_workflow_create_case`、受控错误码 `1`；日志未包含请求体、Cookie、凭据、完整 URL 或原始数据库错误。
- 只读定位：`getCoreContext` 查询以相同受控错误码失败；独立数据库连通性只读检查通过。该查询在任何 Case 写入之前执行，因此本次未创建 Case、fresh Job、confirmation 或平台对象。
- 处理结论：该错误不匹配既有 4xx blocker，保持为未分类 5xx；根因需要另建数据库查询专项 Task，不能以猜测性 blocker 放行。

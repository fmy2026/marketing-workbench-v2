# TASK-MWBV2-APPEND-VIDEO-INTAKE-20260914 验收证据

验证时间：2026-09-14 UTC。

- AC-01：`npm run test:workbench-auth-http` 通过。隔离数据库中已完成、已回查的项目可推荐；列表上限为五项，列表外的已验证项目仍可按手动 ID 精确匹配；无验证项目不能完成 Intake。
- AC-02：`npm run test:launch-request`、`npm run test:project-video-append` 和 `npm run test:workbench-auth-http` 通过。简化追加 JSON 经服务端项目上下文补齐为完整 v2 请求；严格字段、视频数量和格式校验仍生效。
- AC-03：`npm run test:workbench-conversation`、`npm run test:workbench-client-pages` 通过。分步追加、推荐项目选择、账户切换与受控咨询均未创建业务对象。
- AC-04：`npm run test:workbench-client-pages` 通过。输入方式或 JSON 编辑会使旧启动资格失效；浏览器测试覆盖简化追加 JSON 模板。
- AC-05：`npm run test:workbench-progress`、`npm run test:workbench-user-isolation`、`npm run test:workbench-cross-user-http`、`npm run test:workbench-client-pages` 通过。页面输入区有底部留白，零条视频不渲染；跨用户项目推荐返回 404。

所有数据库测试从业务库仅导出 Schema，创建并清理独立测试库；浏览器测试使用临时 Chrome profile。未调用真实平台写入接口。

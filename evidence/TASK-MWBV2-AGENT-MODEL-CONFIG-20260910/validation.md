# Task 2 验证记录

验证时间：2026-09-10T08:09:41Z。

- 已应用 `db/082_workbench_agent_model_configs.sql`；只新增 `user_id`、`agent_key`、协议、模型、无凭据 API Base、凭据引用、启用与测试状态等 11 个配置元数据字段。本地只读列查询通过；未写入 Key、Case、Job、Plan 或平台数据。
- `npm run test:agent-model-config` 通过：临时凭据库以 `0600` 创建、私有/Agent key 独立、权限漂移 fail-closed、API Base 禁止嵌入凭据、固定 Schema 测试不含 route/game/advertiser/Case/Job 数据，mock provider 外无真实网络调用。
- `npm run test:workbench-user-isolation`、`npm run test:agent-hub`、`npm run test:workbench-conversation`、`npm run test:workbench-runtime-policy` 均通过；用户 owner 隔离、固定 Workflow 与 Plan-bound 执行控制未回归，真实平台创建调用为零。
- `node --check src/server/index.mjs`、`node --check src/repositories/postgresRepository.mjs`、`node --check frontend/app.js` 与 `git diff --check` 通过。匿名读取模型配置/测试 API 返回 401。
- `npm run check:project -- --phase before-close` 通过；所有数据、安全、部署和 Workflow 文档路由、改动范围和验收证据均符合关闭协议。

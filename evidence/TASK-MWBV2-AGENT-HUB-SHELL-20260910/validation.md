# Task 1 验证记录

验证时间：2026-09-10T08:02:27Z。

- `npm run test:agent-hub` 通过：公开目录只暴露一个 `launch_creation` Agent，模块为 6 个，能力计数为 7 Node、8 类资源、3 类 Plan；未知 Agent 路径不会被 SPA 兜底；目录不含账户、凭据或内部路径；认证 owner 才能通过独立的 Plan-bound 授权检查。
- `npm run test:workbench-address` 通过：Case 和 Job 规范地址均为 `/agents/launch-creation`，且活跃 Case 复用、替代 Case 与零平台创建约束保持不变。
- `npm run test:workbench-user-isolation` 通过：三位试用用户的本人/管理员范围、跨用户账户阻断、Intake owner 不匹配阻断以及首次改密约束均保持有效。测试 mock 已补齐当前既有的 `40100` 受控重投合同字段；不改变运行时授权实现。
- `npm run test:workbench-conversation`、`npm run test:workbench-progress`、`npm run test:workbench-runtime-policy` 均通过：确定性确认优先、历史 Job 只读、进度刷新及冻结 Plan 的 owner/hash/最新 Job 约束未回归，真实平台创建调用为零。
- `node --check frontend/app.js`、`node --check src/server/index.mjs` 和 `git diff --check` 通过。
- 本地静态服务器手工 HTTP 核验：`/agents` 与 `/agents/launch-creation?module=conversation` 返回 200；旧 `/?case_id=...` 返回 302 到新 Agent 地址；未注册 `/agents/not-registered` 返回 404；匿名读取 Agent 目录、Agent 详情及当前会话均返回 401。
- 通过本地浏览器打开 `/agents`，登录页标题、账号/密码输入与登录入口可访问。未使用项目用户凭据进行交互式登录，因此没有对真实用户会话或密码产生副作用；登录后的完整视觉对照将作为后续模块任务的联合验收项。
- `npm run check:project -- --phase before-close` 通过：Task 合同、所有改动路径、领域文档、四项验收与证据引用均符合关闭前协议；未连接数据库或平台。

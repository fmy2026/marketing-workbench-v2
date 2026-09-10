# TASK-MWBV2-WORKBENCH-DEEP-LINK-ASSET-PATH-20260910 验证记录

验证时间：2026-09-10T10:06:54Z

## AC-01：深层地址资源路径与地址回归

命令：`npm run test:agent-hub && npm run test:workbench-address`

结果：通过。Agent Hub smoke 已断言 HTML 的 CSS 与模块入口分别为 `/styles.css`、`/app.js`，且不再使用 `./styles.css`、`./app.js`。地址 smoke 保持 Case/Job canonical URL 与 active Case 复用合同不变。

## AC-02：认证、进度与对话回归

命令：`npm run test:workbench-progress && npm run test:workbench-conversation`

结果：通过。进度 smoke 与对话 smoke 均通过；对话 smoke 的 replacement platform create 调用数为 0。

补充命令：`npm run test:workbench-auth-http`

结果：未通过，原因是运行环境未提供该脚本要求的 `MWBV2_TEST_LOGIN_NAME`、`MWBV2_TEST_PASSWORD`、`MWBV2_TEST_NEW_PASSWORD`；脚本在任何网络或账户操作前以 `test_login_credentials_required` 退出。没有读取、猜测或写入凭据。

## AC-03：运行中 LAN 深层页面核验

只读 HTTP 检查返回：

- `/agents/launch-creation?case_id=CASE-MWBV2-DEEP-LINK-SMOKE`：`200 text/html; charset=utf-8`
- `/styles.css`：`200 text/css; charset=utf-8`
- `/app.js`：`200 text/javascript; charset=utf-8`

同时对用户现有深层 Case 页面执行硬刷新。页面从未初始化登录壳切换为已认证的“投放创建 Agent 工作区”，显示用户菜单、模块导航、对话区与固定 Workflow；未提交命令、未创建 fresh Job、未执行 Monitor 或其他平台写入。

## AC-04：项目合同启动检查

命令：`npm run check:project -- --phase start && git diff --check`

结果：通过。当前任务为 active，变更只位于允许范围；未访问平台。

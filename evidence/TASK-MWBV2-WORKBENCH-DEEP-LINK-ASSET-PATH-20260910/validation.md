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

## 2026-09-10 展示层收敛复验

### AC-02：身份 blocker、进度与对话回归

命令：`npm run test:workbench-progress && npm run test:workbench-conversation && npm run test:agent-hub && npm run test:workbench-address`

结果：通过。progress smoke 覆盖三个同义身份失效 blocker：`qiankun_account_identity_changed_since_plan`、`qiankun_account_identity_preflight_failed` 与 `monitor_fresh_readonly_contract_drift`；它们均显示“账户监测身份已更新，旧 Plan 已失效；请输入‘重新只读准备’”，占位不含“继续执行”，且不回退到“流程状态正在更新”。同一 smoke 还断言右栏已删除 `runState` 动态徽标、底部详细进度和只读刷新入口仍保留。conversation smoke 通过，replacement platform create 调用数仍为 0。

先前凭据化 `test:workbench-auth-http` 缺口调整为不适用：两次修正均未触及认证代码或认证合同；已登录浏览器的深层地址硬刷新在 AC-03 中直接验证会话保持，未读取、猜测或写入任何凭据。

### AC-03：服务重启、HTTP、浏览器与业务边界

执行：`launchctl kickstart -k gui/$(id -u)/com.hys.marketing-workbench.local-server`，随后执行 LAN HTTP 检查并硬刷新用户现有 Case 页面。

结果：工作台服务已重启并加载当前代码。`/agents/launch-creation?case_id=CASE-MWBV2-DEEP-LINK-SMOKE`、`/styles.css`、`/app.js` 均为 200；`/agents/styles.css` 与 `/agents/app.js` 均为 404，确认页面不再依赖错误的子路径资源。

已登录浏览器在 `CASE-MWBV2-AC24AABC9184D5588A` 的硬刷新后显示：对话标题下为“等待处理”、对话区为“账户监测身份已更新，旧 Plan 已失效；请输入‘重新只读准备’。”、底部为“进度 1 / 7 · 已暂停：账户监测身份已更新”；右侧 Workflow 仅保留固定标题、阶段、节点、子节点和状态圆点，没有动态运行状态徽标。

只读 Postgres 回查保持：Case 为 `active`，最新 Job 为 `JOB-MWBV2-20260910092355-8F6355`，Gate 为 `resolve_case_blocker`，root blocker 为 `qiankun_account_identity_preflight_failed`，最新 Plan 为 `consumed`，该 Case 的平台动作物理投递数为 0。未输入命令、未创建 fresh Job、未创建 Monitor、未发生平台写入。

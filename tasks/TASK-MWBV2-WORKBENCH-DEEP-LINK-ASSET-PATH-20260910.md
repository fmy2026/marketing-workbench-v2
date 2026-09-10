# TASK-MWBV2-WORKBENCH-DEEP-LINK-ASSET-PATH-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKBENCH-DEEP-LINK-ASSET-PATH-20260910.json)。

## 目标

修复工作台“继续”进入 `/agents/launch-creation` 深层地址后静态资源解析到不存在子路径、导致页面未初始化的故障；并收敛身份失效 blocker 的恢复提示和 Workflow 右栏状态展示。

## 批准方案

用户已批准将工作台 HTML 的样式和模块入口固定为站点根路径，并为该约束补充回归测试；同时为三个同义身份失效 blocker 复用“重新只读准备”提示，移除 Workflow 右栏动态状态徽标，并把详细进度保留在底部命令栏。保留现有地址、认证、Case/Gate、Plan 与 executor 链路；不推进当前 Case 的业务恢复或平台写入。

## 范围

- 修改 `frontend/index.html` 中的 CSS/JS 静态资源路径，并移除右栏动态运行状态徽标。
- 在 `frontend/workbench-progress.mjs` 与 `frontend/app.js` 中复用既有 Case/Gate blocker 投影，仅调整身份失效提示、输入占位和简短状态位置。
- 在既有 Agent Hub 与 progress smoke 中覆盖深层路由根资源、三个身份失效 blocker、底部进度及右栏无动态徽标。
- 重启工作台服务加载既有最新服务端投影代码。
- 记录本任务合同、验证证据与关闭状态。

## 非目标

- 不修改 3 阶段 7 Node、数据库、Monitor 身份装配器、Gate、Plan、确认、executor 或认证机制。
- 不自动执行“重新只读准备”，不复用旧 Plan，不执行任何平台写入。
- 不改变 `/agents`、`/agents/launch-creation`、Case/Job 地址或登录会话机制。

## 验收

- AC-01: 直接访问 `/agents/launch-creation?case_id=...` 时，HTML 的 CSS 与模块资源始终解析为 `/styles.css`、`/app.js`，而非 `/agents/*`。
- AC-02: Agent/地址、进度和对话 smoke 均通过；三个身份失效 blocker 显示同一恢复提示和占位，已消费 Plan 不展示可确认卡，右栏无 `runState` 徽标。
- AC-03: 当前 LAN 服务验证深层页面和根静态资源返回 200，子目录静态资源路径不再被页面引用；重启后已登录浏览器硬刷新仍显示完整工作台、身份 blocker 和底部详细进度。
- AC-04: 项目合同校验在开始和关闭阶段通过，且不产生平台写入。

## 停止条件

- 修复需要改变 SPA 地址、认证、Gate、Plan、数据库或平台写入边界。
- 回归测试显示已消费 Plan 的确认可重新出现，或恢复路径发生变化。
- 验证需要使用、输出或保存密码、会话、token、Cookie 或原始平台数据。

## 交付说明

交付深层链接安全加载、身份 blocker 展示收敛及右栏精简。当前 Case 的 `qiankun_account_identity_preflight_failed` 仍只能由本人显式输入“重新只读准备”处理。

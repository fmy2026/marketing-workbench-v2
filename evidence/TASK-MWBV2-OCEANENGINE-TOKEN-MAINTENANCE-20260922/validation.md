# Token 自动维护验收证据

验证时间：2026-09-22T04:13:14Z。

- `npm run test:token-maintenance` 通过，覆盖未到期零刷新、两小时阈值刷新和 OAuth 只读验证、重复检查跳过、共享锁、无 active Task 的授权检查、DNS 恢复、超时停止重发、只读验证恢复、refresh token 过期、持久化失败、响应正文超时和 `token:status` 只读性。
- `npm run test:token-refresh-scope` 通过，确认系统维护授权、确认变量、身份与动作范围在网络请求前被强制校验。
- `npm run test:agent-readonly-modules` 通过，确认凭据提示改为系统维护机制后，工作台只读模块回归正常。
- 新 LaunchAgent `com.hys.marketing-workbench.oceanengine-token-maintenance` 已加载，配置为登录补检和每小时第 1 分钟执行，无 `KeepAlive`。其首次运行记录为刷新成功并完成 OAuth 已授权账户只读验证；随后的强制运行记录为检查成功、零刷新、零验证调用。
- 本机脱敏状态显示凭据有效、无 blocker；旧 Codex automation 已暂停，指向旧项目的 LaunchAgent 文件已移除且未加载。
- `npm run check:project -- --phase start` 与 `git diff --check` 通过。所有日志、审计和本证据均未包含凭据值、完整 URL、原始请求或原始响应。

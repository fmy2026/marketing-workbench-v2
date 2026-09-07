# TASK-MWBV2-LAN-USER-ACCOUNT-ISOLATION-20260907

状态：implementation_completed_waiting_lan_endpoint

## 目标

在不增加 Workflow Node、不改变既有 Gate/Plan/单次执行/权威回查语义的前提下，为工作台增加局域网登录、单一账户归属、全接口数据隔离、个人/管理员流程报表和可配置的内网公开地址。

## 已批准人员与权限

- 管理员：冯美钰 `fengmeiyu`；只管理用户和查看全员汇总，不代操作他人账户。
- 首批试用者：张境威 `zhangjingwei`、张超博 `zhangchaobo`。
- 三人均使用乾坤拼音账号；初始密码为 `12345678`，首次登录必须修改。
- 一个广告账户只能归属一个人员；一个人员可归属多个账户。
- Intake 规范化账户、路线、游戏后，在 Case/Job 前自动查询乾坤 `accountIndex`；`sso_owner` 与当前登录用户不一致时拒绝且不创建 Case/Job、不改变归属。

## 工作流

1. 用户与会话基础、初始用户。
2. Intake 乾坤账户归属查询与持久化。
3. 首页、Case、Job、历史、readonly、command 的统一隔离及确认人留痕。
4. 个人明细和管理员汇总只读报表。
5. 内网公开地址、认证后的 Plan-bound 写策略、文档和部署验收。

## 禁止

- 不新增或修改 3 阶段 7 Node 注册表，不新增业务 Gate、Plan/action 类型或确认短语。
- 实施和测试不得发起真实平台写入、确认、创建或重试。
- 不保存乾坤密码、Passport Token、Cookie、raw transcript、raw request/payload/response 或完整敏感 URL。
- 不自动转移账户归属；历史账户无法唯一映射时保持不可运行。

## 验收

- 三名用户可登录、首次改密和退出；停用与重置会吊销会话。
- Intake 一次识别三项输入并自动完成归属查询；本人通过、他人被拒绝。
- 任意 URL/API 参数篡改不能读取、运行或确认他人账户。
- 管理员只能跨人查看报表，不能代操作。
- 报表仅统计 `runtime_truth`，一 Case 一次计数，成功只认 verified readback。
- 原有 Workflow、Case、Plan、确认与 readback smoke 继续通过。

## Solution Link

用户于 2026-09-07 批准“局域网用户与账户隔离方案”，并明确归属校验位于 Intake 与 Case/Job 之间，不增加 Node。

## 实施结果

- migration `072_workbench_users_account_isolation.sql` 已应用：新增三张用户/会话/脱敏审计表、账户/Case/confirmation actor 字段和两个只读人员报表 View。
- 三名首批用户已初始化；密码采用 scrypt hash，会话只持久化 SHA-256 token hash，首次登录强制改密，用户可继续修改自己的密码。
- 新 Intake 在 Case/Job 前按当前用户 owner key 执行乾坤 `accountIndex` 精确只读校验；匹配后原子绑定唯一 owner，不匹配不建 Case/Job、不转移归属。
- 工作台、Case、Job、历史、运行、刷新和 command API 均校验 active 用户、账户 owner 与乾坤 owner key；管理员只有跨人报表和用户管理权限。
- confirmation 记录真实登录用户，authenticated-LAN Plan policy 继续保留 exact Plan/hash/phrase、单次 claim、零重试和权威回查。
- Node 仍固定为 3 阶段 7 个。Node 服务仍只监听 `127.0.0.1:3000`；已提供 nginx HTTPS、LaunchAgent、每日备份配置和三用户验收清单。

## 验证结果

- `test:workbench-user-isolation`、`test:workbench-auth-http`、`test:workbench-cross-user-http`：passed。
- `test:workbench-runtime-policy`、`test:workbench-conversation`、`test:workflow-case`、`test:execution-grant`、`test:single-confirmation-orchestrator`：passed，平台真实写入为 0。
- `smoke:api`、`check:runtime-consistency`、`validate:schemas`、前端地址/进度测试、语法和 diff 检查：passed。
- 浏览器检查确认未登录只显示登录卡；数据库备份已生成并由 `pg_restore --list` 校验。
- 验收结束后三名用户均为 active + `must_change_password=true`，活动会话 0，当日 `test_run` Job 0；人员明细 11 个 Case 对应 11 行。

## 待激活的环境输入

代码和本机服务已就绪。真正发布到公司局域网还需要最终内网 HTTPS 域名，以及该域名对应、由试用电脑信任的证书和私钥路径；收到后替换 `deploy/` 占位值、设置 `WORKBENCH_PUBLIC_ORIGIN` 并完成三台试用端验收。

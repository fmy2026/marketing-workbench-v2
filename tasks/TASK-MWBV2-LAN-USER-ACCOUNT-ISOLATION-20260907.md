# TASK-MWBV2-LAN-USER-ACCOUNT-ISOLATION-20260907

状态：monitor_verified_waiting_resource_confirmation

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
- 不在数据库、Git、普通日志或 API 响应中保存乾坤密码、Passport Token、Cookie、raw transcript、raw request/payload/response 或完整敏感 URL；Passport Token 仅可保存在 gitignored、权限 `600` 的本机 credential store。
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
- Node 仍固定为 3 阶段 7 个。默认保持 `127.0.0.1:3000`；当前 LaunchAgent 通过显式临时开关仅监听 `192.168.42.7:3000`，同时保留长期 nginx HTTPS 模板、每日备份配置和三用户验收清单。

## 验证结果

- `test:workbench-user-isolation`、`test:workbench-auth-http`、`test:workbench-cross-user-http`：passed。
- `test:workbench-runtime-policy`、`test:workbench-conversation`、`test:workflow-case`、`test:execution-grant`、`test:single-confirmation-orchestrator`：passed，平台真实写入为 0。
- `smoke:api`、`check:runtime-consistency`、`validate:schemas`、前端地址/进度测试、语法和 diff 检查：passed。
- 浏览器检查确认未登录只显示登录卡；数据库备份已生成并由 `pg_restore --list` 校验。
- 验收结束后三名用户均为 active + `must_change_password=true`，活动会话 0，当日 `test_run` Job 0；人员明细 11 个 Case 对应 11 行。
- `test:workbench-network-policy`、真实 IP Host/Origin/401 响应、IP 模式登录/改密和跨用户 HTTP 隔离均通过；`test:qiankun-credential-setup` 验证隐藏输入后的本地写入逻辑只返回脱敏结果并保持文件权限 `600`。

## 当前环境状态

- 本机 LaunchAgent 已改为监听 `192.168.42.7:3000`，`http://192.168.42.7:3000/` 在本机经真实内网地址返回登录页；错误 Host 为 421，错误 Origin 为 403，未登录 API 为 401。
- 巨量引擎 OAuth token 已按既有 refresh scope 恢复为 `valid`；数据库有效备份已生成并通过 `pg_restore --list` 校验。
- 冯美钰、张超博乾坤凭据为 active；张境威仍缺本人 Passport Token。`setup:qiankun-user -- --user <login> --gui` 可通过 macOS 隐藏输入弹窗写入本机凭据。
- 最终只待另一台公司网络电脑验证 3000 端口可达，并完成真实浏览器流程验收；如需张境威参与完整 Intake，再录入其本人凭据。真实创建仍只能由对应登录用户在 ready Plan 上亲自确认。

## 2026-09-07 批准变更：临时私网 HTTP

用户批准短期试用改用 `http://192.168.42.7:3000/`，不使用域名、IP 证书或反向代理。实现必须使用显式临时开关，仅允许 RFC1918 IPv4 origin；Host、Origin、登录、owner、Plan/hash/确认短语、单次 claim、零自动重试和权威回查均保持不变。Node 只绑定当前内网地址，不监听公网接口；试用结束后可关闭开关恢复 loopback。

本轮允许修改应用监听配置、真实 LaunchAgent、部署文档和 focused smoke；允许按现有 `credential_refresh_scope` 精确执行一次巨量引擎 OAuth refresh。不得自动执行 monitor、资源或项目创建。张境威、张超博缺少的 owner-specific 乾坤 Passport 凭据只能在本机受控 credential store 中补充，缺少实际凭据时如实保留 blocker。

允许增加本机终端隐藏输入的乾坤凭据配置命令；Token 不得进入 argv、shell history、日志或 Git，只能写入 gitignored 且权限为 `600` 的 credential store，命令输出必须完全脱敏。

## 2026-09-07 首个异机 Case 发现的运行缺口

Case `CASE-MWBV2-B74ADD7F7382306A09` 的账户归属、乾坤凭据和广告账户授权均已验证正常，但 fresh readonly 后停在 `monitor_plan_required`。根因是多用户接入后的 `/run`、对话只读推进和 monitor 确认执行没有继续传递当前登录用户的精确 `qiankun_owner_key`，且 `run_fresh_readiness` 结束后出现 `monitor_plan_required` 时未接回既有 monitor readonly bridge。修复仅补齐 authenticated owner 上下文并复用既有有界桥接器，不新增 Node、Gate、Plan/action 类型、确认短语或平台权限。

修复后已对原 Job 执行一次安全 fresh monitor readonly：乾坤 accountIndex 返回 200、精确命中 1 条、owner 为 `zhangchaobo`、广告账户授权归一为 ready；确认当前无 monitor 后保存 `PLAN-JOB-MWBV2-20260907091309-5966E0-MONITOR-V2`。当前 Gate 为 `await_job_write_authorization`、Plan 为 ready、根阻断为空、平台动作数为 0，等待张超博本人使用精确短语“确认创建 monitor”。

## 2026-09-07 首次 Monitor 确认后的平台调用前阻断

张超博本人于 17:36:58 确认旧 Monitor V2。confirmation 已正确记录真实用户，但最终 ensure 调用漏传 `qiankun_owner_key`，以 `owner_key_missing_or_not_persisted` 在平台请求前 fail-closed；`create_called=false`、attempt 记录 0、Monitor 未创建。修复将 owner key 传至最终 ensure，并在确认后、平台调用前失败时把旧 Plan 收口为 consumed、Job 标记 `blocked_confirmed_monitor_plan`，恢复只允许 fresh Job 和全新 Plan/hash/confirmation。草稿构建同时在空 monitor ID 时保持等待，避免把空 ID 传入仓储校验。

旧 Job `JOB-MWBV2-20260907091309-5966E0` 与旧 V2 已安全收口。已创建同一 Case 的 fresh Job `JOB-MWBV2-20260907094538-72505B`，完成乾坤 fresh readonly，保存新 Plan `PLAN-JOB-MWBV2-20260907094538-72505B-MONITOR-V2`。当前 Gate 为 `await_job_write_authorization`、root blocker 为空、平台写入仍为 0，等待张超博本人重新核对并确认新卡。

## 2026-09-07 Monitor 真实闭环进度

张超博本人确认 fresh Job 的 Monitor V2 后，`ensure_monitor` 单次 action 成功；Monitor、受控触点、URL 存在性与 hash 一致性均由权威只读回查验证，Monitor Plan 已 consumed，未发生重试。相同 Job 已由唯一有界推进器完成后续 readonly，Node 01–04 passed，并生成 ready Resource V3。当前 root blocker 为空，等待本人使用精确短语“确认准备资源”；标准项目尚未创建。

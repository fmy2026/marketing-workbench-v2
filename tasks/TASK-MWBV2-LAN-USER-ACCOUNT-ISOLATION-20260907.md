# TASK-MWBV2-LAN-USER-ACCOUNT-ISOLATION-20260907

状态：oauth_refresh_recovered_waiting_owner_continue

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
- 冯美钰、张境威、张超博乾坤凭据均为 active；`setup:qiankun-user -- --user <login> --gui` 可通过 macOS 隐藏输入弹窗安全更新本机凭据。
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

## 2026-09-07 张境威 Case：平台明确拒绝后的安全停止

Case `CASE-MWBV2-776936E13CC487A466` 已通过账户归属、Monitor、资源准备与 fresh readonly；DMP 目标账户状态为 `10/10 passed`。最新创建 Job `JOB-MWBV2-20260907101724-525219` 的 Attempt 1 经张境威本人确认后只调用一次 `std_project/create`，返回 HTTP `200`、业务码 `40000`，无项目 ID；平台 action 为 `failed`，Create Plan 已 `consumed`，Job 为 `failed_waiting_manual_review`，没有自动重试或创建后 readback。

脱敏对比确认本 Job 的字段结构、字段账本和本地预检与同路线最近成功 Job 一致，所有账户资源仍为 READY；平台响应没有提供可安全保存的具体字段路径，本地 `resource_not_eligible` 只是泛化分类，不能据此猜测具体资源。按用户批准的最简方案停止生成 Attempt 2；工作台在 `prepare_corrective_attempt` Gate 明确展示“失败待复盘、禁止重试、先诊断后建立全新绑定”。只有取得明确平台原因并定位单一修正项后，才允许 fresh Job、Draft、Plan、payload hash 和本人确认。

## 2026-09-07 批准变更：有界重新准备创建

用户确认当前工作台不应在 `prepare_corrective_attempt` 永久卡住，并批准把既有最多三次的纠正尝试机制接入工作台。本人输入“继续执行”只创建同一 Case 的 fresh Job 并完成完整 readonly；下一次 Create Plan 沿用原业务参数，重新生成项目名、系统时间字段、Draft、payload hash、Plan/hash 和确认窗口。旧失败 Attempt 保持不可变，平台创建仍必须由本人再次输入“确认创建”，每个 Plan 只调用一次。

创建次数改为整个 Case 聚合：当前张境威 Case 的旧 action 为 Attempt 1，新 Job 必须准备 Attempt 2；Attempt 2 明确失败后可准备 Attempt 3，第三次仍未 verified 则进入人工复盘。重复“继续执行”按 predecessor 幂等返回同一 fresh Job；DMP `10/10 passed` 只重新只读核验，不重复推送。本变更不新增 Node、业务 Gate、Plan/action 类型或确认短语，实施与测试平台写入为 0。

实现已完成并应用 migration `073_case_level_corrective_attempts.sql`。真实 Case 当前仍保持 Attempt 1、旧 Plan consumed、零 created object、DMP `10/10 passed`，未提前创建 Attempt 2。迁移前备份恢复到临时数据库后的完整验证确认：第一次“继续执行”语义只创建一个 fresh Job，重复请求返回同一 Job；7 Node readonly 生成 ready V2 / `create_attempt_no=2` Plan，平台创建调用为 0。当前等待张境威本人在工作台输入“继续执行”。

## 2026-09-08 Attempt 2 创建前误阻断修复

张境威已通过工作台建立并确认 Attempt 2 Job `JOB-MWBV2-20260908021122-A501FC`。其资源、字段合同、Draft 与 Plan 均通过，但最终 create executor 仍按 fresh Job 而非 Case 读取下一尝试序号，以 `create_attempt_number_not_next` 在 action claim 前安全停止；`real_platform_write_called=false`，Case 仍只有 Attempt 1 的一次媒体 action。修复让最终 executor 与 readonly runner 共用 `getCaseCreateAttemptState(case_id)`，并按 Case 阻止已有对象或 verified readback；Job 状态继续只负责本 Plan/action 防重。

新增普通 Case 跨 Job fake-transport 回归：Attempt 1 明确失败后 Attempt 2 只调用一次 create 和一次 readback，Case 聚合为 2 个 action、1 个对象、1 个 verified readback；已有 verified 对象后的新 Job 调用数为 0。真实失败 Plan 保持 consumed，部署后仍等待张境威输入“继续执行”建立新的 Attempt 2 Plan。

## 2026-09-08 批准变更：账户条件引导视频

用户根据账户 `1867508089433225` 的白名单表现、手工项目 `7682995388417507371` 和本地官方资料，批准最小引导视频修复。该账户增加 `guide_video_required=true`；每个 fresh Job 的 Node 04 使用已验证小游戏实例调用 `gameplay/list`，非空 `guide_video_id` 去重后恰好一个才写入唯一 `micro_app_instance.metadata.guide_video_readiness`。Node 05 为全部必需推广视频发送同一个本 Job 已验证 ID；普通账户完全省略。Node 07 在项目出现后用一次 `oc_project/material/get` 核验每条视频绑定。

本变更不新建表、不把动态 ID 写入游戏或路线默认值，不新增 Node、Gate、Plan/action 类型、确认短语或平台写权限。零候选、多候选、实例不唯一、只读失败或创建后素材未匹配均 fail-closed；实施与测试真实平台创建调用必须为 0。迁移仅允许新增账户布尔列、设置已确认目标账户开关并升级现有嵌套字段合同版本。

## 2026-09-08 引导视频实施结果

- migration `074_account_guide_video_contract.sql` 已应用：基础表仍为 36、View 仍为 7；目标账户开关为 true，普通试用账户为 false。迁移前备份为 `.local/backups/marketing_workbench_v2-20260908T034435Z.dump`。
- Node 04 已按本 Job 调用 `gameplay/list` 并只接受一个不同的非空引导视频；ID 仅合并进唯一小游戏实例资源 metadata，并绑定当前 Job 与平台实例 ID。实时只读集成确认当前审核通过玩法 1 个、不同引导视频 1 个，平台创建调用 0。
- Node 05 的目标账户 Draft 两条推广视频均包含同一已验证 ID，字段账本为 94 条；普通账户仍为 92 条且不发送该字段。零候选、多候选和普通账户省略专项测试均通过。
- Node 07 在项目命中后最多执行一次素材只读核验；绑定一致才完成权威回查，未匹配则保持只读回查 Gate，不重复 create。
- 执行权限、局域网 runtime policy、对话编排、单次确认及回查回归均通过；本次实现真实平台创建调用为 0，遗留 `test_run` 数据已清理。
- 当前 Case `CASE-MWBV2-776936E13CC487A466` 仍保持最新 Job `JOB-MWBV2-20260908024347-703DA0`、2 次已消费创建尝试、0 个创建对象、Gate `prepare_corrective_attempt`。部署后由张境威本人输入一次“继续执行”，系统才会创建 fresh Job 并准备 Attempt 3 确认卡。

## 2026-09-08 引导视频单一事实源修正

- 不新增表、字段或 migration；`guide_video_id` 的唯一事实源改为当前账户唯一 `micro_app_instance.metadata.guide_video_readiness`，不再复制到多条视频资源。
- Node 04 对 2 条或 100 条推广视频均只执行一次 `gameplay/list` 和一次 metadata 写入；同一 Job 的合格事实可直接复用，历史视频 metadata 即使存在也不得成为真值。
- Node 05 从该唯一事实向本轮全部推广视频分发同一 ID；Node 07 继续用一次 `oc_project/material/get` 核验全部计划视频绑定。
- 实例不唯一、零候选、多候选、Job 绑定过期或实例 ID 不匹配均在确认前阻断；普通账户的 92 字段 payload 保持不变。

## 2026-09-08 OAuth refresh 瞬时失败恢复

- 每日 refresh 的 `transport_error` 曾把尚未过期的 access token 标为不可用，导致工作台在建立 Attempt 3 fresh Job 前安全停止；新建 Intake 仍会恢复同一 active Case，不能绕过共享凭据 Gate。
- 刷新失败仍返回非零并写脱敏审计；仅当原状态为 `valid` 且 access token 有明确未来过期时间时保留其 `valid` 状态。过期、缺失、OAuth 拒绝及 refresh token 失效继续阻断。
- 已按既有 scope 完成一次受控 OAuth refresh，HTTP 200、API code 0，最终 `status=valid`、blockers 为空；未调用任何业务写接口。
- 当前 Case 仍为 2 次创建、0 个对象、下一次 Attempt 3，等待张境威本人输入“继续执行”。本轮未修改工作台前端布局。

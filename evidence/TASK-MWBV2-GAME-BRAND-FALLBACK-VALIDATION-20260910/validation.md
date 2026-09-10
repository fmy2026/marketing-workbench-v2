# 游戏品牌保底候选验证证据

- 2026-09-10T11:00:59Z：本地 Postgres 只读聚合返回同 route/game 的 9 份合格 `live_target_account_readback` 品牌证据，唯一三元组变体数为 1；候选 hash 为 `sha256:8d2b43fc57fb9a013d322aa9176d34d9fd9047b49357942255086de8071e297a`。
- 回归通过：`test:agent-hub`、`test:workbench-address`、`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:resource-action-registry`、`test:payload-contract`、`test:workbench-progress`、`test:workbench-conversation` 与 `git diff --check`。
- 本地服务已重启；深层工作台、`/styles.css` 和 `/app.js` 分别返回 HTTP 200。
- 当前 Case 只记录一次 `approved_for_single_create_validation` 实验授权。真实业务状态始终以 Postgres 为准：Case 已有两条历史 `ensure_monitor` action（一条失败、一条成功）；本任务没有发起资源或标准项目创建。
- 真实验证待账户本人从工作台输入“重新只读准备”，并在两张 fresh 确认卡上分别作出精确确认；该结果决定候选最终状态和本 Task 是否可关闭。

- 2026-09-10T11:18:36Z：修复候选落库。游戏维度品牌候选使用既有 `inheritance_status=baseline_candidate`，实验来源和 `experimental_pending_create` 只保留在 `brand_info` JSON 元数据。Node 04 的头像、品牌、产品图更新改为单条原子 SQL；真实数据库 CHECK 负例被拒绝，三项资源快照均未变化。
- 回归通过：`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:resource-action-registry`、`test:payload-contract`、`test:workbench-progress`、`test:workbench-conversation`、`test:agent-hub`、`test:workbench-address`、`check:project -- --phase start`。``MWBV2_AUTH_HTTP_ASSERTIONS_ONLY=true npm run test:workbench-auth-http`` 通过 5xx 错误脱敏单元断言；完整认证 HTTP 回归缺少本机测试凭据，未执行。
- 2026-09-10T11:18:36Z：通过 LaunchAgent 重启 LAN 服务；`http://192.168.42.7:3000/app.js` 已包含 5xx 受控提示，当前 Case 深层地址返回 HTTP 200。

- 2026-09-10T11:35:42Z：修复 Node 05 对游戏维度品牌保底候选的误阻断。`05-payload-contract` 复用 Node 04 的 `brandIndustryPassed` 资格合同，并要求 Draft 的六项品牌摘要与当前资源一致；不新增状态、Gate、Plan、action 或执行入口。payload smoke 覆盖合法实验候选，以及 hash、Case、route、game、蓝图、证据、三元组和 Draft 漂移反例。
- 回归通过：`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:payload-contract`、`test:resource-action-registry`、`test:workbench-progress`、`test:workbench-conversation`、`test:agent-hub`、`test:workbench-address`、`check:project -- --phase start` 与 `git diff --check`。资源 Plan 完成后，只有 fresh Job 实际提供 `std_project_create` 确认卡才提示第二张确认卡；否则展示 Case summary 的受控 blocker。
- 本次仅执行 test-run 数据清理和本地 smoke；未确认资源、未提交标准项目创建。当前业务 Case 的基线仍为 29 条既有 monitor/资源 action、0 条 `std_project_create` action、0 个创建对象。服务部署后仍须账户本人输入“重新只读准备”。

- 2026-09-10T12:10:00Z：应用 migration `084_target_empty_brand_omit_experiment.sql`。它没有调用平台：保留 Attempt 1 的失败 action/API `40000` 和已消费 Plan，把游戏维度候选记为 `rejected`（未作字段归因），并在同一 Case 的既有 JSON metadata 登记 `brand_empty_omit_experiment=approved_for_single_create_validation`，调用上限为 1、禁止重试。
- 回归通过：`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:payload-contract`、`test:resource-action-registry`、`test:workbench-progress`、`test:workbench-conversation`、`git diff --check`、`check:project -- --phase start`。新增断言确认：目标品牌列表成功为空时，Node 04 将品牌设为 `not_required`，创建 payload 不含 `brand_info` 顶层对象，字段账本记录品牌路径为 omit。
- Postgres 回查：Case 仍为 `prepare_corrective_attempt`，root blocker 为 `corrective_attempt_requires_new_payload_version`，已用创建次数为 1/3，现有失败 action 的 `request_field_manifest.kind=oe3_std_project_final_payload_manifest`，没有创建对象。未创建 fresh Job、Plan、confirmation 或平台 action；账户本人仍须在部署后的工作台输入“重新只读准备”，再决定是否确认新的单次创建。

- 2026-09-10T12:26:34Z：修复 `prepare_corrective_attempt` 的命令合流。Gate Action Policy 让“重新只读准备”和“继续执行”返回同一 `create_fresh_corrective_attempt` effect；Case 锁、最新失败 Job、已消费 Plan、尝试上限、零创建对象及现有 executor 均未改动。工作台以“重新只读准备”为主提示，保留“继续执行”兼容输入。
- 回归通过：`test:workbench-conversation`（含两个命令同 effect、并发 claim 仅运行一次 readonly）、`test:workbench-progress`、`test:case-corrective-create`、`test:workflow-case`、`test:agent-hub`、`test:workbench-address`、`git diff --check` 与 `check:project -- --phase start`。同步修正 corrective smoke：request ID 只记录存在性、不保存原值，并在 mock 中覆盖既有项目素材回查合同；`realPlatformWrites=0`。
- 已通过 LaunchAgent 重启 LAN 服务。深层 Case 地址、`/app.js`、`/styles.css` 返回 HTTP 200。部署后 Postgres 只读核验：当前 Case 仍为 3 个 Job、1 条失败的 `std_project_create` action、0 个标准项目对象；Gate 仍为 `prepare_corrective_attempt`，下一 Attempt 为 2。未创建 fresh Job、Plan、confirmation 或平台 action；仍须账户本人在工作台输入“重新只读准备”。

- 2026-09-10T12:41:31Z：统一品牌空列表省略模式的重复就绪校验。Node 04 的 `resourceReady` 成为 Node 05、嵌套字段合同和 Execution Plan 的唯一资源状态谓词；成对的 `not_required/not_required` 还必须有通过的只读证据。目标空列表模式下，嵌套合同要求 `brand_info` 顶层字段完全缺席；其他模式仍要求完整四字段对象。工作台仅显示中性创建前合同提示，不再称为游戏维度候选。
- 回归通过：`test:node4-resource-prep-contracts`、`test:execution-plan`、`test:payload-contract`、`test:workbench-progress`、`test:workbench-conversation`、`test:workflow-case`、`test:agent-hub`、`test:workbench-address`、`git diff --check` 与 `check:project -- --phase start`。所有 smoke 的真实平台写入均为零。
- Postgres 只读核验：当前 Case 最新 Job 仍处于 `resolve_case_blocker / brand_info_not_ready`，共 4 个 Job；历史仅有 1 条失败的 `oceanengine_std_project_create`，无成功标准项目创建。此次修正未新增业务 action、Plan、confirmation 或创建对象；部署后仍须账户本人输入“重新只读准备”。

- 2026-09-10T12:43:18Z：已通过既有 `com.hys.marketing-workbench.local-server` LaunchAgent 重启工作台服务。HTTP 只读核验确认新客户端包含“当前创建前合同”提示；Postgres 投影仍为相同 latest Job、`resolve_case_blocker / brand_info_not_ready`，标准项目创建仍为 1 条失败、0 条成功。重启未产生业务写入。

- 2026-09-10T13:01:28Z：修复 Attempt 2 只读重跑的参数错配。`runJob` 现在从既有 Case 创建尝试仓储真值推导当前创建 Attempt（与 `mwb.workflow_case_summary.action_readback_state.next_attempt_no` 一致）；调用方显式传入的值必须一致，否则在 Draft、Plan 或平台 action 前以 `create_attempt_no_mismatch` 停止。该规则不含账户、Case 或 Job 特判。
- 回归通过：`test:case-corrective-create`、`test:workbench-conversation`、`test:workflow-case`、`test:payload-contract`、`test:execution-plan`、`check:project -- --phase start` 与 `git diff --check`。corrective smoke 覆盖初次无参数为 Attempt 1、已有一次失败创建后的无参数重跑为 Attempt 2，以及错误显式 Attempt 不产生 Draft、Plan 或平台 action；所有 smoke 的真实平台写入均为零。

- 2026-09-10T13:02:54Z：通过 `com.hys.marketing-workbench.local-server` 重启 LAN 服务；新进程启动于 21:01:59 CST，当前 Case 深层地址经 LAN 直连返回 HTTP 200。部署后 Postgres 仍为 4 个 Job、1 条失败标准项目创建 action、0 个创建对象；重启没有业务写入。

- 2026-09-10T13:26:08Z：收口 JSZC 成功样本的字段形态校验。获批目标空列表模式只接受精确的 `brand_info` 对象与四个子字段省略账本；校验函数仅在内存中将其投影为历史四字段发送形态后与既有基线比较，实际 Draft、Plan、请求和字段账本不改写。品牌外路径、额外路径或残缺省略仍阻断。
- 回归通过：`test:payload-contract`（含完整目标空列表 payload contract/preflight、非品牌形态漂移和残缺品牌账本负例）、`test:execution-plan`、`test:execution-grant`、`test:workbench-progress`、`test:workbench-conversation`、`test:workflow-case`、`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:agent-hub`、`test:workbench-address`、`git diff --check` 与 `check:project -- --phase start`。
- 当前 Case 的强制只读 `prepareStdProjectCreate` 回查返回 `ready=true`、空 blocker、`target_empty_omit_experiment`、`brand_info` 完全省略、payload hash/preflight/wire 均通过。随后计数仍为 4 个 Job、1 条失败标准项目创建 action、0 个创建对象；未触发确认或平台写入。部署后仍须账户本人输入“重新只读准备”以生成新的 Plan/确认卡。

- 2026-09-10T13:28:32Z：通过 `com.hys.marketing-workbench.local-server` 重启工作台；新 PID 为 `15748`。LAN 深层 Case 地址和 `/workbench-progress.mjs` 均返回 HTTP 200，后者已包含“字段形态校验未通过”的受控提示。重启后只读投影仍是旧 Plan 的 `resolve_case_blocker / jszc_success_profile`，这是尚未重新编译 Plan 的历史投影；Case 计数仍为 4 个 Job、1 条失败标准项目创建 action、0 个创建对象。未产生业务写入。

# 游戏品牌保底候选验证证据

- 2026-09-10T11:00:59Z：本地 Postgres 只读聚合返回同 route/game 的 9 份合格 `live_target_account_readback` 品牌证据，唯一三元组变体数为 1；候选 hash 为 `sha256:8d2b43fc57fb9a013d322aa9176d34d9fd9047b49357942255086de8071e297a`。
- 回归通过：`test:agent-hub`、`test:workbench-address`、`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:resource-action-registry`、`test:payload-contract`、`test:workbench-progress`、`test:workbench-conversation` 与 `git diff --check`。
- 本地服务已重启；深层工作台、`/styles.css` 和 `/app.js` 分别返回 HTTP 200。
- 当前 Case 只记录一次 `approved_for_single_create_validation` 实验授权。真实业务状态始终以 Postgres 为准：Case 已有两条历史 `ensure_monitor` action（一条失败、一条成功）；本任务没有发起资源或标准项目创建。
- 真实验证待账户本人从工作台输入“重新只读准备”，并在两张 fresh 确认卡上分别作出精确确认；该结果决定候选最终状态和本 Task 是否可关闭。

- 2026-09-10T11:18:36Z：修复候选落库。游戏维度品牌候选使用既有 `inheritance_status=baseline_candidate`，实验来源和 `experimental_pending_create` 只保留在 `brand_info` JSON 元数据。Node 04 的头像、品牌、产品图更新改为单条原子 SQL；真实数据库 CHECK 负例被拒绝，三项资源快照均未变化。
- 回归通过：`test:baseline-resource-inheritance`、`test:node4-resource-prep-contracts`、`test:resource-action-registry`、`test:payload-contract`、`test:workbench-progress`、`test:workbench-conversation`、`test:agent-hub`、`test:workbench-address`、`check:project -- --phase start`。``MWBV2_AUTH_HTTP_ASSERTIONS_ONLY=true npm run test:workbench-auth-http`` 通过 5xx 错误脱敏单元断言；完整认证 HTTP 回归缺少本机测试凭据，未执行。
- 2026-09-10T11:18:36Z：通过 LaunchAgent 重启 LAN 服务；`http://192.168.42.7:3000/app.js` 已包含 5xx 受控提示，当前 Case 深层地址返回 HTTP 200。

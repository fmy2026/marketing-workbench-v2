# TASK-MWBV2-AWEME-AUTO-SINGLE-MECHANISM-20260829

状态：completed

更新时间：2026-08-29 CST

## 目标

将 `aweme_id` 机制收敛为唯一的“游戏路线固定默认值 + 广告账户只读授权核验”链路。JSZC 路线固定使用游戏维度默认 `aweme_id=57018827026`；Node 4 只核验该默认值是否仍被目标广告账户有效授权；Node 5 仅在本 job 核验通过时写入该默认值。

本任务不触发任何真实 `std_project/create`、素材、DMP、监测、预算或出价写入。

## 范围

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` 及未来 `native_type=AWEME` 路线的统一底层机制 |
| JSZC default_aweme_id | `57018827026`，按字符串保存 |
| schema | `mwb.game_route_defaults.raw_defaults.aweme_id_baseline`、`mwb.advertiser_accounts.aweme_authorization`、`mwb.v_advertiser_aweme_authorization_readiness` |
| workflow | Node 4 只读授权核验、Node 5 payload/preflight/contract |
| API/frontend | readiness 只读展示，移除候选选择接口、候选按钮和中途操作 |
| tests | aweme authorization、payload contract、schema/API/UI smoke、diff check |

## 边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 本地代码、migration、schema 文档、任务卡、manifest、测试；执行本地只读/单元/smoke 验证 |
| 禁止 | `std_project/create`、Promotion 创建或重试、素材/DMP/事件/监测/品牌写入、预算或出价修改、未授权 token refresh |
| 敏感信息 | 禁止保存或输出 token、Cookie、auth_code、完整 URL、raw payload、raw request、raw response |

## 验收

- [x] 新增迁移，不改写历史 `041/042`，将当前 DB 契约收敛为固定默认值机制。
- [x] readiness view 不再输出候选数、候选列表、已选 ID、选择状态或人工选择字段。
- [x] Node 4 删除全量分页、自动候选挑选、人工候选选择和历史选择复用，只保留默认 ID 的定向只读核验。
- [x] Node 5、payload contract、preflight 仅允许“游戏默认值 + 本 job 已授权核验”生成 `aweme_id`。
- [x] 删除后端选择 API 和 repository 选择方法。
- [x] 工作台提交基础输入后自动运行；过程中无候选按钮、无开始执行/确认类中途操作，结束展示结果或明确失败原因与下一动作。
- [x] `test:aweme-authorization`、`test:payload-contract`、`validate:schemas`、API/UI 相关 smoke 和 `git diff --check` 通过。
- [x] 未触发真实平台写入、未刷新 token。

## 结果记录

- 新增并应用 `db/043_aweme_auto_single_mechanism.sql`：JSZC `aweme_id_baseline` 改为 `verification_strategy=fixed_game_default_account_verify`，保留默认 `57018827026` 和 hash；账户 `aweme_authorization` 禁止候选/选择字段，只允许核验状态、scope、job、时间、response hash、证据和 blocker。
- `mwb.v_advertiser_aweme_authorization_readiness` 已重建为只读报表列：`required/configured/verification_status/ready/blocker_code/next_action/default_aweme_id_hash/verified_at/expires_at/evidence_ref`，当前 4 个 JSZC 账户均为 `not_verified / aweme_auth_not_verified`。
- Node 4 `aweme-authorization-readonly` 只发起一次 `tools/aweme_auth_list` 定向查询，filter 包含目标账户、`AWEME_ACCOUNT`、允许状态和默认 `aweme_ids=[57018827026]`；已授权写 `authorized`，未授权/失效/账户不匹配/返回 ID 不匹配/查询失败分别阻断。
- Node 5、payload contract、create preflight 均改为从 `mwb.game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id` 取值，并要求账户本 job 核验记录为 `authorized` 且 hash/scope/job 一致。
- 已删除 repository 人工选择方法和 `/api/advertisers/:advertiserId/aweme-authorization` 选择接口；job public view 只暴露 readiness。
- 工作台移除候选按钮、候选组件、底部开始/确认按钮和相关样式；提交基础输入后自动创建并运行 dry-run，执行中只显示状态，最终展示结果/阻断。
- 未触发真实 `std_project/create`、未刷新 token、未调用任何平台写接口。

## 验证

- `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/043_aweme_auto_single_mechanism.sql` passed
- `npm run test:aweme-authorization` passed
- `npm run test:payload-contract` passed
- `npm run validate:schemas` passed
- `npm run smoke:workflow-skills` passed
- `npm run smoke:api` passed
- `node --check frontend/app.js` passed
- `node --check src/server/index.mjs` passed
- `node --check src/workflows/launchWorkflow.mjs` passed
- frontend static scan for `开始执行|确认创建|aweme-candidate|selected_aweme|activeCandidate|selectionStatus|primaryAction|primaryActionText` returned no matches
- `git diff --check` passed

## 备注

- 默认 3000 端口被既有非当前服务占用且返回 502；临时 3001 服务可启动但本环境 `curl` 仍收到 502，未作为验收依据。应用层 smoke 和静态扫描均通过。

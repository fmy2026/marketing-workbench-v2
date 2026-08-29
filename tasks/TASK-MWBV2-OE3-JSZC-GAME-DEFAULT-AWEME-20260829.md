# TASK-MWBV2-OE3-JSZC-GAME-DEFAULT-AWEME-20260829

状态：completed

更新时间：2026-08-29 CST

## 目标

为 JSZC 的 `oceanengine_3_byte_mini_game` 路线落地固定默认 `aweme_id` 机制：游戏/路线在 `mwb.game_route_defaults.raw_defaults.aweme_id_baseline` 保存唯一默认抖音号 `57018827026`，每个目标广告账户仍必须通过 Node 4 只读查询确认该 ID 有效授权后，Node 5 才能写入 payload。

本任务不是创建任务，不触发 `std_project/create`。

## 范围

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| default_aweme_id | `57018827026`，按字符串保存 |
| schema | `mwb.game_route_defaults.raw_defaults.aweme_id_baseline`、`mwb.advertiser_accounts.aweme_authorization`、`mwb.v_advertiser_aweme_authorization_readiness` |
| workflow | Node 3 默认策略、Node 4 只读核验、Node 5 payload/preflight |
| frontend/API | 固定默认策略下仅展示状态，禁止工作台候选选择绕过 |
| tests | migration/skill/payload/preflight/workflow smoke |

## 边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 写入本地代码、migration、schema 文档、任务卡、manifest、测试；执行本地只读/单元/smoke 验证 |
| 禁止 | `std_project/create`、Promotion 创建或重试、素材/DMP/事件/监测/品牌写入、预算或出价修改、未授权 token refresh |
| 敏感信息 | 禁止保存或输出 token、Cookie、auth_code、完整 URL、raw payload、raw request、raw response |

## 验收

- [x] migration 将 JSZC baseline 改为 `selection_policy=fixed_game_default_account_verify`，并保存默认 ID hash 与官方来源信息。
- [x] Node 4 固定策略只按 `default_aweme_id=57018827026` 查询当前账户授权，不再全量分页和自动/人工选择候选。
- [x] Node 4 对默认 ID 缺失、未授权、失效、账户范围不匹配或查询异常均写入明确 blocker。
- [x] Node 5 只在账户本轮已验证固定默认 ID 时生成 `aweme_id`，且 payload 中的值只能等于 `57018827026`。
- [x] 工作台保留状态展示；固定策略不展示候选选择按钮，选择接口拒绝绕过。
- [x] 非固定策略路线保持原候选自动/人工选择兼容行为。
- [x] 聚焦测试和 `git diff --check` 通过。
- [x] 当前失败 draft 与真实创建记录保持只读，未触发任何真实 `std_project/create`。

## 结果记录

- 已新增并应用 `db/042_add_jszc_fixed_default_aweme_policy.sql`：JSZC `aweme_id_baseline` 现在保存固定默认 `57018827026`、hash、官方来源、`AWEME_ACCOUNT`、有效授权状态和禁止回退策略。
- `mwb.v_advertiser_aweme_authorization_readiness` 已在原 view 上追加固定默认策略字段：`selection_policy`、`fixed_default_policy`、`default_aweme_id_configured`、`default_aweme_id_hash`、`default_aweme_account_authorized`。
- Node 4 `aweme-authorization-readonly` 固定策略只查询目标账户对默认 ID 的授权；命中后写 `default_authorized`，否则写 `default_not_authorized`、`default_inactive`、`default_scope_mismatch` 或 `probe_failed`。
- Node 5、payload contract 和 create preflight 均要求固定策略下 `selected_aweme_id` 等于游戏默认 ID，且账户核验状态为 `default_authorized`。
- 工作台展示固定默认策略状态和默认 ID hash，不展示候选选择；后端选择接口对固定策略返回 `aweme_selection_forbidden_fixed_default_policy`。
- 当前四个 JSZC 账户均为 `not_verified` / `aweme_auth_not_verified`，默认配置已存在但尚未进行真实只读授权核验。
- 未触发 `std_project/create`，未刷新 token，未调用平台写接口。

## 验证

- `psql -X -d marketing_workbench_v2 -f db/042_add_jszc_fixed_default_aweme_policy.sql` passed
- `npm run test:aweme-authorization` passed
- `npm run test:payload-contract` passed
- `npm run validate:schemas` passed
- `npm run smoke:workflow-skills` passed
- `npm run smoke:api` passed
- `npm run test:node4-resource-prep-contracts` passed
- `git diff --check` passed

# TASK-MWBV2-OE3-AWEME-AUTHORIZATION-DIRECT-STORAGE-20260828

状态：completed

更新时间：2026-08-29 CST

## 目标

落地 V2 `aweme_id` 的“游戏保底策略 + 账户授权关系直存”机制：游戏/路线只保存字段来源、合同和选择策略，账户直接保存当前已验证的抖音号授权关系；Node 4 只读核验，Node 5 只从账户授权关系生成 `aweme_id` 并阻断头像图片 ID 等错误来源。

本任务不是创建任务，不触发 `std_project/create`。

## 范围

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| schema | `mwb.game_route_defaults.raw_defaults.aweme_id_baseline`、`mwb.advertiser_accounts.aweme_authorization`、只读 readiness view |
| workflow | Node 3/4/5 合同、Node 4 只读 Skill、Node 5 payload/preflight |
| frontend/API | 抖音号授权关系候选展示与选择接口 |
| tests | schema/skill/payload/preflight/workflow smoke |

## 边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 写入本地代码、migration、schema 文档、任务卡、manifest、测试；执行本地只读/单元/smoke 验证 |
| 禁止 | `std_project/create`、Promotion 创建或重试、素材/DMP/事件/监测/品牌写入、预算或出价修改、未授权 token refresh |
| 敏感信息 | 禁止保存或输出 token、Cookie、auth_code、完整 URL、raw payload、raw request、raw response |

## 验收

- [x] migration 增加游戏保底策略、账户直存 JSONB、JSON shape/敏感字段约束和只读 readiness view。
- [x] Node 4 增加 `aweme-authorization-readonly` Skill，且不纳入资源动作注册表。
- [x] Node 5 `payload-build` 删除 avatar metadata / `platform_resource_id` 回退，只从已验证账户授权关系读取 `aweme_id`。
- [x] preflight 阻断图片 URI、`web.business.image/...`、内部头像来源、未核验/未选择/已失效授权关系。
- [x] launch skill/evidence/draft/action manifest 只保存安全摘要、hash 和证据引用。
- [x] 工作台具备候选查看与本地选择接口；选择后仍需 Node 4 只读核验。
- [x] 聚焦测试和 `git diff --check` 通过。

## 结果记录

- 已执行 `db/041_add_aweme_authorization_direct_storage.sql`：保底策略写入 `mwb.game_route_defaults.raw_defaults.aweme_id_baseline`；账户授权关系字段写入 `mwb.advertiser_accounts.aweme_authorization`；报表视图为 `mwb.v_advertiser_aweme_authorization_readiness`。
- `mockReady + test_run` 已增加账户 `aweme_authorization` 快照恢复，避免模拟授权残留为账户真值。
- 当前 seed 账户 `1871922175825993` 的 readiness 为 `not_verified`，`blockerCode=aweme_auth_not_verified`；未写入真实抖音号 ID。
- 未触发 `std_project/create`，未刷新 token，未调用平台写接口。

## 验证

- `npm run smoke:api` passed
- `npm run test:execution-plan` passed
- `npm run test:aweme-authorization` passed
- `npm run validate:schemas` passed
- `npm run smoke:workflow-skills` passed
- `npm run test:payload-contract` passed
- `npm run test:node4-resource-prep-contracts` passed
- `git diff --check` passed

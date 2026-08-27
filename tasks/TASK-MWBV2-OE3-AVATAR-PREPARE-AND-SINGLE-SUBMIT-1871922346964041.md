# TASK-MWBV2-OE3-AVATAR-PREPARE-AND-SINGLE-SUBMIT-1871922346964041

状态：completed_blocked_missing_official_avatar_submit_contract

## 目标

为账户 `1871922346964041` 建立独立的 JSZC 账户头像素材与 Node 4 子流程。产品图与账户头像共享同一游戏 Icon 的视觉来源，但分别保存、分别登记、分别核验平台状态。

## 当前事实

| 项 | 值 |
| --- | --- |
| 原图 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product-image.png` |
| 原图规格 | `1024x1024 PNG` |
| 头像派生图 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/account-avatar-300x300.png` |
| 目标账户头像状态 | `UNSET` |
| 平台写权限 | 关闭 |
| 官方头像写入合同 | 未验证 |

## 范围

| 允许 | 禁止 |
| --- | --- |
| 生成 `300x300` 本机头像图、登记脱敏素材元数据、修正资源蓝图、实现 Node 4 头像 source/plan Skill、dry-run CLI、测试与本地 DB migration | 头像平台上传、头像平台提交、广告创建、素材上传、预算/出价修改、token refresh |

## 实施边界

1. 产品图保留 `PI-JSZC-PRODUCT-IMAGE-001` 与其既有平台 `image_id`，不得修改。
2. 新头像资产固定为 `AI-JSZC-ACCOUNT-AVATAR-300-001`，派生关系只记录 asset ID、hash、格式与尺寸。
3. Node 4 头像 child 追溯 `avatar-source-prepare -> avatar-submit-plan -> resource-verify-avatar`。
4. `resource:avatar-submit-once` 默认只输出 dry-run；没有已验证官方写入合同时，必须输出 `official_avatar_submit_contract_missing`，不得调用平台。
5. 若未来官方合同要求单独上传图片，停止于 `avatar_platform_image_id_required`，另建图片上传任务；本任务不把上传与头像提交合并。

## 验收

- 派生图为独立 `300x300 PNG`，原图不变。
- 新资产和 `BRP-JSZC-OE3-AVATAR` 在 Postgres 中可追溯到正确来源。
- 7 节点 Node 4 的头像 child 有独立输入、输出、停止条件和模块地址。
- dry-run 不调用平台，不刷新 token，不产生平台动作。
- 不写入 token、Cookie、图片 URL、raw request 或 raw response。

## 完成记录

| 项 | 结果 |
| --- | --- |
| 派生头像图 | passed；`account-avatar-300x300.png` 为 `300x300 PNG`，hash `sha256:270ccf...ed087` |
| 独立资产登记 | passed；`AI-JSZC-ACCOUNT-AVATAR-300-001` 已登记，来源为 `PI-JSZC-PRODUCT-IMAGE-001` |
| 头像蓝图修正 | passed；`BRP-JSZC-OE3-AVATAR` 指向独立头像资产 |
| Node 4 pipeline | passed；`avatar-source-prepare -> avatar-submit-plan -> resource-verify-avatar` 已登记、可追溯、调度顺序已校验 |
| dry-run | passed_with_blocker；`npm run resource:avatar-submit-once -- --advertiser-id 1871922346964041` 仅调用本地 DB，未调用平台 |
| 唯一阻断 | `official_avatar_submit_contract_missing` |
| 平台写入 / token refresh | `0 / 0` |

## 结论

头像源图已 ready，但不存在可验证的官方“设置账户头像”写接口合同，不能猜测 endpoint、字段或复用产品图 `image_id`。`resource:avatar-submit-once` 已固定为 dry-run；`avatar.prepare_supported` 继续为 `false`。

## 下一 Gate

新建“JSZC 账户头像官方合同核验与单次提交”任务：先在官方资料中取得 endpoint、method、权限点、请求字段、图片输入形式和审核回查语义。

- 若合同可直接使用已有平台图片 ID：再单独授权一次 `ensure_resource:avatar` 提交。
- 若合同要求先上传头像图片：先新建“头像图片单次上传”任务；上传成功并只读回查后，再另建头像单次提交任务。

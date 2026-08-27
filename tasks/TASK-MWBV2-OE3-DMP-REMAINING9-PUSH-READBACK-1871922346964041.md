# TASK-MWBV2-OE3-DMP-REMAINING9-PUSH-READBACK-1871922346964041

## Brief

对账户 `1871922346964041` 执行 JSZC DMP 保底集合剩余 9 个包的一次性推送与整组回查。

当前事实：fresh job `JOB-MWBV2-20260827132706-2C7792` 已确认来源户 10/10 passed，目标户 `465498363` 已 passed，剩余 9 个包 missing；本任务不得重复推送已 passed 的首包。

## Scope

- route: `oceanengine_3_byte_mini_game`
- game: `JSZC`
- source advertiser: `1871922153496588`
- target advertiser: `1871922346964041`
- package set: `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001`
- 允许的唯一平台写入：对 fresh push plan 中的剩余 9 个包逐包调用 `dmp/custom_audience/push_v2`。
- 写前、写后只允许 `dmp/custom_audience/read` 与 `dmp/custom_audience/select`。
- 禁止广告、monitor、素材、预算/出价、token refresh 和本任务外平台写入。

## Contract

| Operation | Fields / rule |
| --- | --- |
| `push_v2` | `advertiser_id`、`custom_audience_id`、`target_advertiser_ids`；不发送 `delivery_status` |
| `read` | `advertiser_id`、`custom_audience_ids`，精确核验保底集合 |
| `select` | `advertiser_id`、`select_type`、`offset`、`limit`；最多 4 页，每页 100 |
| scope | 按 fresh job 的 planned rows 动态确定包数，允许 1-10；本次预期 9 |
| ready | 目标户 10/10 read 命中、`select_type=1` 命中、delivery status available、未删除且未下线 |

## Stop Conditions

- 来源户不是 10/10 passed：零写入停止。
- fresh plan 不是全部 planned，或 planned ID 与目标户 missing ID 不一致：零写入停止。
- 已 passed 的首包再次进入 push plan：零写入停止。
- 任一 push HTTP/API 失败：停止后续包，不自动重试。
- 整组回查窗口结束仍未验证剩余 planned 包：记录 `readback_pending`，撤回权限，不自动重试。

## Progress

- [x] 建立任务卡、manifest 与权限边界。
- [x] 修复 DMP execution scope 支持剩余包数。
- [x] 修复 executor 成功后合并目标户已验证全量 ID。
- [x] 完成 smoke、合同与运行一致性校验。
- [x] 创建 fresh runtime truth job 并完成真实只读预检。
- [x] 执行一次剩余 9 包推送与整组回查。
- [x] fresh readiness 验收并关闭任务。

## Result

状态：`closed_success`。

| 项 | 结果 |
| --- | --- |
| preflight job | `JOB-MWBV2-20260827133726-8133AB` |
| plan | `PLAN-JOB-MWBV2-20260827133726-8133AB-V1` |
| plan hash | `sha256:af7e9a643e102d7dc69036808c26721511e913e1e146f28c6bd714198815c475` |
| source state | `passed 10` |
| target preflight | `passed 1`、`missing 9` |
| skipped already passed ID | `465498363` |
| push plans | `verified 9` |
| DMP platform actions | `succeeded 9` |
| final target DMP state | `passed 10` |
| post-readiness job | `JOB-MWBV2-20260827134019-21D261` |
| DMP gate | passed |
| next unique blocker | `video_material_not_ready:JSZC-HUNT-4IG2-3` |

机制修复：DMP scope 已从固定 10 包改为按 fresh push plan 动态校验 1-10 包；runner 内存保留 `customAudienceIds` 供后续 gate 使用，但数据库记录继续不落完整数组。

## Acceptance

- 本任务最多执行 9 次 DMP `push_v2`，每包一次。
- 已 passed 的 `465498363` 不被重复推送。
- 成功后目标户 DMP 状态为 10/10 passed，`account_resources` 写入 10 个已验证 ID。
- Node 6 广告创建仍 locked，本任务不创建广告。
- 任务结束后 `active_task=null`、`platform_write_allowed=false`。
- 不保存 token、Cookie、raw request、raw response。

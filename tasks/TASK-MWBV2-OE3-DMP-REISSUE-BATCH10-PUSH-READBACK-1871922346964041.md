# TASK-MWBV2-OE3-DMP-REISSUE-BATCH10-PUSH-READBACK-1871922346964041

## Brief

对账户 `1871922346964041` 重新执行 JSZC DMP 保底集合的一次完整批次：10 个包先做来源/目标真实只读预检，再逐包 `push_v2`，最后整组轮询回查。

前序 job `JOB-MWBV2-20260827125751-2CDDFD` 的首包 `465498363` 曾返回 HTTP 200 / `api_code=0`，但用户已确认目标账户后台未成功。该历史 action 保留审计，不改写为成功，也不作为本批次计划依据。

## Scope

- source advertiser: `1871922153496588`
- target advertiser: `1871922346964041`
- package set: `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001`
- 允许的唯一平台写入：10 次单包 `dmp/custom_audience/push_v2`。
- 写前、写后只允许 `dmp/custom_audience/read` 与 `dmp/custom_audience/select`。
- 禁止广告、monitor、素材、预算/出价、token refresh 和本任务外平台写入。

## Contract

| Operation | Fields / rule |
| --- | --- |
| `push_v2` | `advertiser_id`、`custom_audience_id`、`target_advertiser_ids`；不发送 `delivery_status` |
| `read` | `advertiser_id`、`custom_audience_ids`，精确核验 10 包 |
| `select` | `advertiser_id`、`select_type`、`offset`、`limit`；最多 4 页，每页 100 |
| ready | read 命中、`select_type=1` 命中、`delivery_status=...AVAILABLE`、未删除且未下线 |
| post-push | 整组轮询 `0s -> 3s -> 6s`；不在每个包后立即判定失败 |

## Stop Conditions

- 来源户任一包不可投放：零写入停止。
- 目标户预检任一包已可见：零写入停止，不做混合重推。
- 任一 push HTTP/API 失败：停止后续包，不自动重试。
- 整组回查窗口结束仍未 10/10 ready：记录 `readback_pending`，撤回权限，不自动第三次推送。

## Progress

- [x] 建立任务卡、manifest 与权限边界。
- [x] 对齐 DMP read/select 查询、可投放判定与整组轮询。
- [x] 完成 smoke、合同与运行时一致性测试。
- [x] 创建 fresh runtime truth job 并完成真实只读预检。
- [x] 预检触发停止条件；未开启 scope，未执行 10 包批次。
- [x] 关闭任务并设置下一 gate。

## Result

状态：`closed_preflight_partial_target_visible_no_write`。

fresh job：`JOB-MWBV2-20260827132706-2C7792`。

| 核验项 | 结果 |
| --- | --- |
| 来源户 10 包 | `passed 10` |
| 目标户 | `passed 1`、`missing 9` |
| 已可投放包 | `465498363` |
| fresh push plan | `planned 9` |
| 本任务 DMP platform actions | `0` |
| 已启用 DMP write scope | 否 |

解释：此前首包虽然在即时回查时未命中，但本轮按官方 `select_type/offset/limit` 合同重新查询后已确认可投放。因此“10 包均不可见”的重推前提不成立；为避免重复推送已存在包，本任务按规则零写入结束。

下一 gate：新建“目标账户剩余 9 个 JSZC DMP 包单批推送与整组回查”任务。必须使用新的 fresh runtime truth job、fresh 9 包 plan、一次性 scope；不得复用本任务或历史 job 的权限。

## Acceptance

- 预检发现 `passed 1 + missing 9` 后，本任务零写入停止。
- 本任务未把目标户 DMP resource 或剩余 9 包误判为 ready。
- 任何失败仅保存 ID、状态、字段清单、hash、request-id 存在性和 evidence ref。
- 任务结束后 `active_task=null`、`platform_write_allowed=false`。

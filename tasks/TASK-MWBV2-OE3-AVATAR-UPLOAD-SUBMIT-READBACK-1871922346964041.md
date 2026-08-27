# TASK-MWBV2-OE3-AVATAR-UPLOAD-SUBMIT-READBACK-1871922346964041

状态：completed_blocked_after_single_upload_before_submit

## 目标

为账户 `1871922346964041` 一次完成 JSZC 账户头像的上传、提交与最多三次只读回查，并以 `IN_AUDIT` 或 `AUDIT_PASS` 放行 Node 4 头像 Gate。任务不创建广告，Node 6 保持锁定。

## 受控合同

| 阶段 | 接口 | 方法 | 业务字段 |
| --- | --- | --- | --- |
| 上传 | `advertiser/avatar/upload` | `POST` multipart | `advertiser_id`、`image_file` |
| 提交 | `advertiser/avatar/submit` | `POST` JSON | `advertiser_id`、`image_id`、`source_info` |
| 回查 | `advertiser/avatar/get` | `GET` | `advertiser_id` |

合同依据为历史脚本的人工参考加实时回查，不宣称为已验证的官方文档合同。`source_info` 固定为“巨兽战场”。

## 范围与限制

| 允许 | 禁止 |
| --- | --- |
| 头像源图核验、一次上传、一次提交、最多三次只读回查、Postgres 脱敏证据、fresh runtime truth | monitor、广告、产品图、预算/出价、token refresh、自动重试、存储 token/Cookie/raw request/raw response/图片 URL |

- 源资产：`AI-JSZC-ACCOUNT-AVATAR-300-001`，规格 `300x300 PNG`。
- 高层平台动作：仅 `ensure_resource:avatar` 一次；内部最多两次写调用（上传、提交）。
- 确认变量：`MWBV2_OE_AVATAR_ENSURE_CONFIRM=UPLOAD_AND_SUBMIT_ONE_ACCOUNT_AVATAR`。
- 若执行前或回查时头像为 `IN_AUDIT` / `AUDIT_PASS`，不重复上传或提交。
- 上传失败不得提交；提交失败不得自动重试；三次回查仍无可识别状态即停止。

## 执行顺序

1. 实现并测试受控执行器、一次性 scope 和 CLI。
2. 使用 `workflow:readonly-readiness` 建立 fresh `runtime_truth` job，确认头像为 `UNSET` 且执行计划包含 `ensure_resource:avatar`。
3. 临时授权精确 job、账户和动作后，运行 `resource:avatar-ensure-once`。
4. 上传、提交、回查完成后立即撤销平台写权限。
5. 成功时再运行 fresh `workflow:readonly-readiness`，记录头像后的唯一 blocker；失败时记录失败分类并关闭任务。

## 验收

- `platform_actions` 最多一条上传、一条提交；没有其他平台写。
- 头像状态为 `IN_AUDIT` 或 `AUDIT_PASS` 时，账户资源为 `visible / readback_verified`，并有脱敏 evidence。
- 不保存敏感凭据、图片 URL、raw payload 或 raw response。
- 任务关闭时 `active_task=null`、`platform_write_allowed=false`。

## 执行记录

| 项 | 结果 |
| --- | --- |
| dry-run 与凭据预检 | passed；源图 `300x300 PNG`、reference contract、token 状态均满足 |
| fresh runtime truth | passed_with_avatar_blocker；job `JOB-MWBV2-20260827115216-653F58`，既有 monitor `245828` 精确命中，执行计划包含 `ensure_resource:avatar` |
| 上传 | succeeded；HTTP `200`、API code `0`，仅保存 action 摘要与 response hash |
| 提交 | not_called；上传成功后本地 `account_resources.readback_status` 使用了未登记值，数据库约束阻断了提交前的状态写入 |
| 头像回查 | 本次写入前为 `UNSET`；提交未发生，因此未进入提交后回查 |
| 平台写入审计 | 上传 `1`、提交 `0`、广告创建 `0`、token refresh `0` |
| 写权限 | 已撤回；`platform_write_allowed=false` |
| 机制修复 | passed；中间状态改为数据库允许的 `pending`，失败状态改为 `failed`，并加入回归断言 |

## 结论

此次真实执行没有完成头像提交，但未发生重复上传或隐藏重试。上传返回的 `image_id` 按受控记录原则未落入普通文档；因中间 DB 写入失败，也未能保留为可恢复的受控资源 ID。因此不能在本任务安全续提，必须另建一次明确授权的恢复任务。

## 下一 Gate

新建“账户 `1871922346964041` 头像恢复型单次重新上传、提交与回查”任务：先检查头像仍为 `UNSET`，再以修复后的 `pending` 状态机制执行一次新上传和一次提交。该任务必须重新取得用户的一次性写入确认；不得自动复用或重试本次上传。

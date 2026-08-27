# TASK-MWBV2-OE3-AVATAR-RECOVERY-REUPLOAD-SUBMIT-READBACK-1871922346964041

状态：completed_passed

## 目标

在上次“上传成功、提交未调用”的本地状态约束故障后，为账户 `1871922346964041` 执行一次独立授权的头像恢复闭环：重新上传、提交，并最多三次只读回查。

## 固定合同

| 项 | 固定值 |
| --- | --- |
| 源资产 | `AI-JSZC-ACCOUNT-AVATAR-300-001` |
| 文件 | `account-avatar-300x300.png`，`300x300 PNG` |
| 提交来源说明 | `巨兽战场` |
| 高层动作 | `ensure_resource:avatar`，最多 1 次 |
| 内部写调用 | 上传 1 次、提交 1 次，禁止重试 |
| 通过状态 | `IN_AUDIT` 或 `AUDIT_PASS` |

## 前置与边界

1. 必须建立 fresh `runtime_truth` job，并确认 monitor `245828`、头像 `UNSET`、头像动作已计划且该 job 无头像平台动作。
2. 使用已修复的数据库状态：上传后写 `pending`；未收敛写 `failed`。
3. 不创建 monitor、广告或其他资源；不刷新 token；不保留 token、Cookie、图片 URL、raw request 或 raw response。
4. 无论成功或失败，执行器 `finally` 必须撤回平台写权限。

## 执行记录

| 项 | 结果 |
| --- | --- |
| fresh 预检 job | `JOB-MWBV2-20260827115946-B1ECE8`；monitor `245828` 精确命中、头像 `UNSET`、头像动作已计划、该 job 既有头像动作 `0` |
| 上传 | passed；HTTP `200`、API code `0` |
| 提交 | passed；HTTP `200`、API code `0` |
| 回查 | passed；首次回查为 `IN_AUDIT` |
| 账户资源 | `visible / readback_verified`，受控平台资源 ID 已存在 |
| 平台写入审计 | 上传 `1`、提交 `1`、其他平台写入 `0`、token refresh `0` |
| 权限 | 已撤回；`platform_write_allowed=false` |
| 后续 fresh runtime truth | `JOB-MWBV2-20260827120044-5DFADD`；头像阻断已消失，唯一优先 blocker 为 `dmp_custom_audience_ids_missing` |

## 结论

头像已提交并处于审核中，按项目规则 `IN_AUDIT` 可放行 Node 4 头像 Gate。广告创建仍锁定；下一任务应只处理目标账户的 DMP 自定义人群 ID 就绪，不应重跑头像或进入 Node 6。

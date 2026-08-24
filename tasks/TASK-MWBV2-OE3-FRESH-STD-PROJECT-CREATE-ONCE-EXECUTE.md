# TASK-MWBV2-OE3-FRESH-STD-PROJECT-CREATE-ONCE-EXECUTE

状态：completed

更新时间：2026-08-24 CST

## 目标

在用户明确确认后，对 fresh runtime job `JOB-MWBV2-20260824061810-79A426` 执行一次真实 OceanEngine `std_project/create`。

本任务只允许一次真实创建，不重试，不刷新 token，不上传素材，不创建事件资产，不推送 DMP，不修改预算/出价。旧失败 job `JOB-MWBV2-20260824014546-851B76` 继续锁定，禁止重试。

## 目标 job

| 项 | 值 |
| --- | --- |
| job_id | `JOB-MWBV2-20260824061810-79A426` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260824` |
| payload_hash | `sha256:fe001960ed46125f1f0a66f8f79fb9342ce7f2670016706520b5434355dd3f3f` |
| readiness | `ready_for_user_create_confirmation` |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 写入边界

允许写入：

```text
mwb.launch_confirmations
mwb.platform_actions
mwb.created_objects
mwb.readback_records
mwb.evidence_artifacts
mwb.launch_node_runs
mwb.launch_jobs 当前 job 状态
.local/std-project-create-attempt-JOB-MWBV2-20260824061810-79A426.json
```

禁止：

```text
第二次 create 或自动重试
token refresh
素材上传
事件资产创建
DMP push
预算/出价修改
旧 job create retry
保存或输出 token、Cookie、完整触点 URL、raw payload、raw response
```

## 必要确认变量

```bash
MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT
MWBV2_OE_STD_PROJECT_CREATE_JOB_ID=JOB-MWBV2-20260824061810-79A426
MWBV2_OE_STD_PROJECT_CREATE_PAYLOAD_HASH=sha256:fe001960ed46125f1f0a66f8f79fb9342ce7f2670016706520b5434355dd3f3f
```

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| 写入 gate 仅本任务单次打开 | passed |
| create 前 readiness 仍为 `ready_for_user_create_confirmation` | passed |
| 执行一次 `std_project/create` | passed |
| 不自动重试 | passed |
| 写入 `platform_actions` 且最多 1 条 | passed |
| 如平台返回 object id，写入 `created_objects` 和 readback 记录 | not_applicable：平台未返回 object id |
| 如平台未确认成功，停止并进入人工复盘 | passed |
| 不刷新 token | passed |
| 不泄漏 token、Cookie、完整触点 URL、raw payload、raw response | passed |
| 旧失败 job 保持 `platform_actions=1`、`created_objects=0` | passed |
| 完成后收回平台写入权限 | passed |

## 执行结果

| 维度 | 结果 |
| --- | --- |
| createCalled | `true` |
| HTTP status | `200` |
| apiCode | `40000` |
| request_id_present | `true` |
| std_project_id_present | `false` |
| evidence | `EV-JOB-MWBV2-20260824061810-79A426-STD-PROJECT-CREATE-ONCE` |
| readback status | `not_found_or_mismatch` |
| readback evidence | `EV-JOB-MWBV2-20260824061810-79A426-STD-PROJECT-READBACK-ONCE` |
| job_status | `failed_waiting_manual_review` |
| current_node | `7` |
| platform_actions | `1` |
| created_objects | `0` |
| retry_allowed | `false` |

## 下一步 gate

本次真实创建返回 `apiCode=40000` 且只读回查未发现同名对象。下一步进入单次创建结果复盘，禁止重试。

# TASK-MWBV2-OE3-FRESH-RUNTIME-JOB-PRECREATE

状态：completed

更新时间：2026-08-24 CST

## 目标

基于已通过的 brand/event/payload gate，新建一个 fresh `runtime_truth` job，准备到“用户确认后可单次真实创建”的状态。

本任务仍不执行 `std_project/create`，不刷新 token，不调用任何平台写入 API。旧 job `JOB-MWBV2-20260824014546-851B76` 已有单次 create attempt，必须保持锁定，不得重试。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 当前事实

| 项 | 值 |
| --- | --- |
| 旧 job | `JOB-MWBV2-20260824014546-851B76` |
| 旧 job 状态 | `failed_waiting_manual_review` |
| 旧 job platform actions | `1` |
| 旧 job created objects | `0` |
| 旧 job readiness | `blocked_after_single_create_failure` |
| brand industry | 已通过；数字形态 `outer_brand_id` 可用 |
| event chain | 已通过 |
| payload contract | 已通过 |

## 范围

| 项 | 动作 |
| --- | --- |
| test_run 隔离 | 避免 smoke/test 覆盖共享 runtime resource readonly_check |
| fresh runtime job | 新增脚本创建 fresh `runtime_truth` job，并推进到草稿待确认/创建执行 locked |
| readiness | 支持 `--job-id` 或 `MWBV2_TARGET_JOB_ID`，兼容旧失败 job 和 fresh job |
| 创建执行器 | 新增确认变量齐全前只返回 `blocked_before_create` 的 fresh once executor |
| latest API | 优先返回最新 fresh 可行动 `runtime_truth` job |
| 前端 | 继续最小展示当前状态、唯一阻断、下一步；fresh job 显示等待用户确认创建 |

## 完成结论

| 维度 | 结论 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260824061810-79A426` |
| fresh job status | `draft_ready` |
| fresh current node | `5` |
| fresh project name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260824` |
| fresh payload hash | `sha256:fe001960ed46125f1f0a66f8f79fb9342ce7f2670016706520b5434355dd3f3f` |
| fresh readiness | `ready_for_user_create_confirmation` |
| fresh platform actions | `0` |
| fresh created objects | `0` |
| 旧 job platform actions | `1` |
| 旧 job created objects | `0` |
| latest API | 返回 fresh runtime job |
| create dry-run | 无确认变量时 `blocked_before_create`，`createCalled=false` |

## 写入边界

允许写入：

```text
mwb.launch_jobs
mwb.launch_node_runs
mwb.launch_drafts
mwb.evidence_artifacts
mwb.account_resources.metadata
```

禁止写入或修改：

```text
mwb.platform_actions
mwb.created_objects
旧 job 的 job_status/current_node/create 结果
token、Cookie、secret、auth_code、完整触点 URL、raw payload、raw response
```

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| `npm run std-project:fresh-job` 通过 | passed |
| fresh job readiness 为 `ready_for_user_create_confirmation` | passed |
| 旧 job readiness 仍为 `blocked_after_single_create_failure` | passed |
| 新 create 脚本无确认变量时 `blocked_before_create` 且 `createCalled=false` | passed |
| `npm run check:std-project-create-readiness` 通过 | passed |
| `npm run check:runtime-consistency` 通过 | passed |
| `npm run test:payload-contract` 通过 | passed |
| `npm run smoke:api` 通过 | passed |
| API latest 返回 fresh runtime job | passed |
| 旧 job 仍为 `platform_actions=1`、`created_objects=0` | passed |
| fresh job 为 `platform_actions=0`、`created_objects=0` | passed |
| 不执行 `std_project/create` | passed |
| 不刷新 token | passed |
| 不泄漏 token、Cookie、完整触点 URL、raw payload、raw response | passed |

## 禁止事项

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 真实创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| event configs 创建 | 禁止 |
| DMP push | 禁止 |
| 预算/出价修改 | 禁止 |
| 输出 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |
| 旧项目作为 v2 运行依赖 | 禁止 |

## 下一步 gate

fresh job 已 ready。下一步进入“用户明确确认后，执行单次真实 `std_project/create`”的新任务；本任务不执行真实创建。

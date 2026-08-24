# TASK-MWBV2-OE3-STD-PROJECT-CREATE-ONCE-EXECUTE

状态：failed_waiting_manual_review

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为新需求文本。本任务只把该文件作为需求输入解读；执行边界仍以用户当前消息、`AGENTS.md` 和 `project.state.json` 为准。

## 目标

在 `marketing-workbench-v2` 独立项目内，为固定目标执行一次 OceanEngine 3.0 `std_project/create` 并立即 readback 收口。

本任务当前只进入执行准备和显式确认等待态；真实平台写入必须由用户再次明确确认，并带确认变量执行。

## 固定目标

| 字段 | 值 |
| --- | --- |
| `job_id` | `JOB-MWBV2-20260824014546-851B76` |
| `draft_id` | `DRAFT-JOB-MWBV2-20260824014546-851B76` |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `object_type` | `std_project` |
| `project_name` | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P19_20260824` |
| `payload_hash` | `sha256:8db82f4009abfc567592e59b4d11ad6324b4fbb12dd9d40cb89f64aa5007c7b7` |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| v2 凭据 | 只读取 `marketing-workbench-v2/.local/oceanengine.env` |
| 旧项目 | 只能借鉴字段策略、单次写入边界和 readback 经验 |
| 禁止 | import 或 shell 调用旧项目脚本；读取旧库作为运行真值；复制旧项目 token |

## 写入边界

| 项 | 规则 |
| --- | --- |
| 唯一允许写入 | `POST /open_api/v3.0/std_project/create/` |
| 最大写入次数 | `1` |
| 必须确认变量 | `MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT` |
| 执行命令 | `MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT npm run std-project:create-once` |
| 自动重试 | 禁止 |
| 单次锁 | `.local/std-project-create-attempt-JOB-MWBV2-20260824014546-851B76.json` |

## 禁止动作

| 动作 | 状态 |
| --- | --- |
| 第二次 `std_project/create` | 禁止 |
| `promotion/create` | 禁止 |
| `project/create` | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| DMP push | 禁止 |
| 预算 / 出价修改 | 禁止 |
| token refresh | 禁止 |
| raw payload / raw response 入库或输出 | 禁止 |
| token、Cookie、secret、auth_code、完整触点 URL 输出或入库 | 禁止 |

## 执行前预检

真实创建前必须重跑：

```bash
npm run token:status
npm run resource:diagnose
npm run resource:readback
npm run smoke:readonly
npm run smoke:api
npm run test:payload-contract
npm run std-project:create-once
```

预检通过标准：

| 项 | 标准 |
| --- | --- |
| token | 状态有效 |
| 账户资源 | 无资源缺口 |
| payload contract | 通过 |
| duplicate status | `platform_not_duplicate` |
| 无确认变量 create-once | 只允许 `confirm_variable_missing_or_invalid` 和 `network_write_not_enabled_by_caller` |
| 真实创建 | 预检阶段不得发生 |

## 真实创建后记录要求

| 表 | 预期 |
| --- | --- |
| `mwb.launch_confirmations` | 新增 1 条确认记录 |
| `mwb.platform_actions` | 新增 1 条 `oceanengine_std_project_create` 动作记录 |
| `mwb.created_objects` | 新增 1 条真实 `std_project` 对象记录 |
| `mwb.readback_records` | 新增或更新真实 `RB-...-REAL` 回查记录，不能只停留在 placeholder |
| `mwb.launch_node_runs` | 第 5、6、7 节点最终通过 |
| `mwb.evidence_artifacts` | 保存脱敏证据摘要和 hash，不保存 raw response |

## 成功验收

| 标准 | 状态 |
| --- | --- |
| `createCalled=true` | passed |
| 返回真实 `stdProjectId` | failed；平台未返回 |
| `readback.status=readback_verified` | failed；只读 readback 为 `not_found_or_mismatch` |
| `objectNameMatches=true` | failed；`false` |
| 7 个节点完整闭环 | failed；第 6、7 节点失败 |
| `project.state.json` 关闭 active_task | waiting；保留 active 供人工复盘 |
| guardrails 恢复 read-only | passed |
| 无敏感泄漏 | active guardrail |

## 失败处理

如果平台创建失败或返回不确定，立即停止，不允许第二次 create。只能用只读 readback/list 按项目名查重，判断平台侧是否已创建；失败摘要写入脱敏记录后等待人工判断。

## 当前推进状态

本任务已建立任务卡和 context manifest，并挂入 `project.state.json`。无写入预检已通过；真实创建仍等待用户显式确认。

## 无写入预检结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed；token 状态 `valid` |
| `npm run resource:diagnose` | passed；`blockedResourceTypes=[]`，`writeActionsCalled=false` |
| `npm run resource:readback` | passed；资源 ready，`writeActionsCalled=false` |
| `npm run smoke:readonly` | passed；`platformReadonlyStatus=passed`，`prewriteGateStatus=locked` |
| `npm run smoke:api` | passed；API/Postgres 闭环正常 |
| `npm run test:payload-contract` | passed；`gapCount=0` |
| `npm run std-project:create-once` | blocked before create；`createCalled=false` |

无确认变量执行器 blocker：

| blocker | 说明 |
| --- | --- |
| `confirm_variable_missing_or_invalid` | 符合预期；未带确认变量不得写平台 |
| `network_write_not_enabled_by_caller` | 符合预期；脚本未启用网络写入 |

## 下一步 Gate

用户已明确确认后执行过一次：

```bash
MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT npm run std-project:create-once
```

执行结果：`createCalled=true`，HTTP 200，平台 `apiCode=40000`，未返回 `stdProjectId`。脚本已停止且不允许重试。

只读 readback 结果：`status=not_found_or_mismatch`，HTTP 200，平台 `apiCode=0`，`objectNameMatches=false`。

已写入：

| 表 | 结果 |
| --- | --- |
| `mwb.launch_confirmations` | 1 条确认记录 |
| `mwb.platform_actions` | 1 条 `failed_or_unconfirmed` 动作记录 |
| `mwb.created_objects` | 0 条，未误写成功对象 |
| `mwb.readback_records` | 新增 `READBACK-JOB-MWBV2-20260824014546-851B76-REAL-CHECK`，状态 `not_found_or_mismatch` |
| `mwb.evidence_artifacts` | 已保存 create failed 和 readback once 的脱敏证据摘要 |
| `mwb.launch_node_runs` | 第 6、7 节点已标记 `failed` |

下一步：禁止重试。人工复盘平台 `apiCode=40000` 的失败原因，或用平台后台/只读列表再次核对是否存在该项目名。

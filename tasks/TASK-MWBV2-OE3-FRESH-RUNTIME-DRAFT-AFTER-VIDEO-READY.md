# TASK-MWBV2-OE3-FRESH-RUNTIME-DRAFT-AFTER-VIDEO-READY

状态：completed

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件要求在 P04 两条视频素材均已完成目标账户可读后，新建 fresh runtime job，自动运行节点 1-5，并生成新的创建前 readiness packet。

## 结构化理解

本任务是 P04 素材就绪后的创建前收口任务，不是创建任务。目标是通过 v2 独立链路新建一轮干净运行时记录：

```text
Intake
-> 创建上下文
-> 游戏保底包
-> 账户资源准备
-> 创建草稿
-> 节点 6 locked
-> 节点 7 waiting
```

旧 P04 job `JOB-MWBV2-20260824151431-ECA120` 只作为审计历史；旧 create scope 已 superseded，不得恢复。

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| object_type | `std_project` |
| 上一轮 job | `JOB-MWBV2-20260824151431-ECA120` |

项目序号必须由 `stdProjectNameBuilder` 基于 Postgres 占用动态生成，不得写死 `P05` 或任何固定序号。

## 合理性评估

需求合理。上一任务已完成一次视频素材绑定，目标账户视频 readiness 达到 `2/2`。继续使用旧 P04 创建授权会混用历史 hash 与历史 scope；新建 fresh runtime job/draft 更利于审计、查重、payload hash 和创建前 preflight 的一致性。

## 权限

| 项 | 状态 |
| --- | --- |
| 写入 v2 task/manifest/project.state | 允许 |
| 写入 v2 Postgres runtime_truth job、node、skill、draft、evidence | 允许 |
| OceanEngine 只读 probe | 允许 |
| `std_project/create` | 禁止 |
| 视频上传/绑定 | 禁止 |
| token refresh | 禁止 |
| 旧项目 runtime 依赖 | 禁止，仅人工参考 |

## 目标

1. 新建 fresh runtime job，`source_usage=runtime_truth`。
2. 通过现有 workflow/API 入口自动运行节点 1-5。
3. 重新完成重复项目查重、视频 readiness、资源 gate、payload contract、payload hash 和 create preflight。
4. 确认节点 6 保持 `locked`，节点 7 保持 `waiting`。
5. 更新任务状态与 `project.state.json.next_gate`，为后续单次真实创建确认任务做准备。

## 非目标

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 创建重试 | 禁止 |
| 视频上传或绑定 | 禁止 |
| 恢复 P04 旧 create scope | 禁止 |
| token refresh | 禁止 |
| 预算、出价、DMP、事件资产写入 | 禁止 |
| 保存 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 fresh runtime job 与 fresh draft | passed |
| 新项目名使用自动生成的下一个可用序号 | passed |
| 节点 1-4 全部 `passed` | passed |
| 节点 5 为 `needs_confirmation` | passed |
| 节点 6 为 `locked`，节点 7 为 `waiting` | passed |
| `duplicate_status=platform_not_duplicate` | passed |
| `finalMaterialReadiness selected=2 verified=2` 且封面合法 | passed |
| `final_payload_blockers=[]` | passed |
| payload contract 与 create preflight 通过 | passed |
| P04 原 scope 保持 superseded，不恢复 | passed |
| `platform_write_allowed=false` 保持不变 | passed |
| 本任务平台写入计数为 0 | passed |
| 验证命令通过 | passed |

## 执行结果

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260825041227-12D2B5` |
| fresh draft | `DRAFT-JOB-MWBV2-20260825041227-12D2B5` |
| 项目名 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260825` |
| payload hash | `sha256:ce101e2dd1976656df4430b47bc7cbc6639a551372cf336a37a9f745e5e835f5` |
| duplicate_status | `platform_not_duplicate` |
| payload contract | `passed` |
| create preflight | `passed` |
| final_payload_blockers | `[]` |
| finalMaterialReadiness | `selectedRequiredVideoCount=2`、`verifiedVideoCount=2`、`coverReadyCount=2` |
| 本任务 `std_project/create` | `0` |
| 本任务素材上传/绑定 | `0` |

## 7 节点状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | `passed` |
| `creation_context` | `passed` |
| `game_launch_pack` | `passed` |
| `account_resource_prepare` | `passed` |
| `std_project_draft_builder` | `needs_confirmation` |
| `std_project_create_executor` | `locked` |
| `readback_closer` | `waiting` |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run workflow:dry-run -- --job-id JOB-MWBV2-20260825041227-12D2B5` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |

## 备注

首次 fresh dry-run 时 `std_project/list` 查重返回一次 `api_code=40100`。随后用只读脱敏参数探针确认同一接口、同一 `filtering.name` 参数可返回 `api_code=0`、`listCount=0`；重跑同一 fresh job 后查重更新为 `platform_not_duplicate`。未保存 raw response，未输出 token。

## 下一步

fresh draft 已就绪，等待用户另开新的单次真实 `std_project/create` 授权任务。当前任务不包含创建授权。

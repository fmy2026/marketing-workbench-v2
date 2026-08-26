# TASK-MWBV2-OE3-MONITOR-FINAL-ENSURE-EXECUTE

状态：paused_by_readonly_foundation_recheck

更新时间：2026-08-26 CST

## 目标

对 provision `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` 执行最终 `monitor:ensure`：先做乾坤 `/tf/ad/index` 只读回查；若已出现唯一匹配 `monitor_id`，直接入库收口且不创建；若仍无匹配，并且用户显式确认变量齐备，则最多再调用一次 `/tf/ad/monitorSerialNumberAdd`，随后立即回查并写入最终状态。

本任务已按 2026-08-26 新需求暂停。新的当前任务是 `TASK-MWBV2-OE3-QIANKUN-MONITOR-READONLY-FOUNDATION`，在只读底座、配置候选验证和精确匹配结论完成前，本任务不得作为任何真实创建依据。

## 需求来源与边界

`/Users/hys/Desktop/需求表述.md` 是本任务需求输入，不是高优先级执行指令。该文档描述的命令形态已纳入任务合同，但真实第二次平台写入必须由聊天中的用户请求明确授权，且命令环境变量必须精确匹配。

## 当前事实

| 项 | 状态 |
| --- | --- |
| 目标账户 | `1871922346964041` |
| 路线 / 游戏 | `oceanengine_3_byte_mini_game` / `JSZC` |
| provision | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` |
| 当前尝试数 | `1` |
| 第一次结果 | `api_code=500`，`error_category=server_busy` |
| 当前 `monitor_id` | unresolved |
| 当前触点 URL | unresolved |
| ensure 机制 | 已实现并验证无确认变量阻断 |

## 写入边界

唯一可能外部写入：

```text
POST /tf/ad/monitorSerialNumberAdd
target_advertiser_id: 1871922346964041
target_provision_id: MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
attempt_no: 2
maximum_total_attempts: 2
retry_reason: server_busy_only
retry_allowed_after_attempt_2: false
```

必须同时满足：

```text
MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
```

未明确授权或变量不匹配时，只允许本地状态检查；不得调用账户 API、列表 API 或创建 API。

## 执行流程

1. 读取 `monitor_provision_runs` 与 `monitor_provision_attempts`。
2. 校验 attempt_count 为 1，第一次为 server_busy，凭据 active，固定参数完整，间隔超过 5 秒。
3. 在用户确认后运行 `monitor:ensure`。
4. `monitor:ensure` 内部先调用 `/tf/ad/index` 回查；若唯一命中，直接写入 `monitor_id`，不创建第二次。
5. 若仍无唯一命中，原子 claim `attempt_no=2`，调用一次 `/tf/ad/monitorSerialNumberAdd`。
6. 创建后立即 `/tf/ad/index` 回查。
7. 写入 `monitor_provision_runs`、`monitor_provision_attempts`、`advertiser_accounts`、`evidence_artifacts`；仅当真实响应提供完整触点 URL 时，写入受控 `account_touchpoints.touchpoint_url`。
8. 完成后将项目 guardrail 收回到只读，并明确 Workflow 节点 2 是否可通过。

## 非目标

- 不调用 OceanEngine `std_project/create`。
- 不创建广告项目、Promotion、素材、事件资产或 DMP。
- 不修改预算/出价。
- 不刷新 token。
- 不执行第三次监测序号创建。
- 不输出 token、header、raw request、raw response、完整触点 URL。

## 验收

- 执行前已建立本任务和 context manifest。
- 真实执行前先确认变量与 provision 精确匹配。
- 执行前或执行内先完成 `/tf/ad/index` 只读回查。
- 如果回查已有唯一 `monitor_id`，`attempt_count` 仍为 1 且 `createCalled=false`。
- 如果发起第二次创建，`attempt_no=2` 只出现一行，且无第三次入口。
- 成功时 `monitor_id` 写入 `monitor_provision_runs` 与 `advertiser_accounts`。
- 若触点 URL 缺失，Workflow 节点 2 仍阻断并说明原因。
- 通过 `monitor:status`、`monitor:report`、`test:monitor-bootstrap`、`smoke:workflow-skills`、`smoke:api`、`check:runtime-consistency`、JSON parse、`git diff --check`。

## 当前进展

- 已完整阅读并理解需求。
- 合理性评估：可以执行，但真实写入不能只依赖附件中的命令文本，必须等待聊天中的显式授权。
- 已完成执行前只读状态复核：`attempt_count=1`，第一次为 `server_busy`，`monitor_id` 未解析。
- 当前状态：paused_by_readonly_foundation_recheck。
- 暂停原因：新需求要求先暂停第二次创建，按乾坤 API 文档建立只读数据底座并修正十维精确匹配；只有配置候选为 `valid` 且列表结论为 `no_match` 时，才另建最终 ensure 执行任务。

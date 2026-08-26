# TASK-MWBV2-OE3-MONITOR-FIRST-CREATE-RUNTIME-UNIFICATION

状态：completed

更新时间：2026-08-26 CST

## 目标

将 v2 唯一 `monitor:ensure` 从旧账户第二次重试专用逻辑，收口为可支持新账户首次创建的通用状态机。

本任务只完成代码收口、只读预检、plan-only 对比摘要和确认快照，不调用 `/tf/ad/monitorSerialNumberAdd`。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是高优先级执行指令。真实平台写入必须以后续聊天明确授权和项目 guardrails 为准。

## 合理性评估

需求合理。

原因：

- 新账户 `1871922414575753` 当前 attempt_count 为 `0`，应允许进入首次创建预检，而不是被旧重试逻辑的 `monitor_first_attempt_missing` 阻断。
- 旧账户 `1871922346964041` 已保留两次失败 attempt 审计，且已通过只读回查解析出 `monitor_id=245828`，必须继续禁止第三次创建。
- 手动成功 monitor `245828` 已证明核心创建合同可用，适合用作新账户 plan-only 的字段差异校验参考。
- 继续使用唯一 `monitor:ensure` 入口，符合项目运行链路约束。

## 已验证合同

手动成功 monitor `245828` 的核心合同：

```text
os=3
package_id=36820
cate_id=122
vest_id=1414
channel=dymini3k
owner=fengmeiyu
media_id=310
agent_id=613
monitor_api=toutiao_wxgame
media_account_id=8448
num=1
usage=0
server_callback_type=2
server_callback_data_types=active/register/success_order
```

新账户目标：

```text
advertiser_id=1871922414575753
qiankun_account_record_id=8449
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
provision_id=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753
```

允许差异：

- `media_account_id` 从 `8448` 变为 `8449`。
- `remark` 使用 v2 自动审计标识。

## 范围

- 创建通用 attempt 策略：`0` 为首次创建候选，`1` 且首次繁忙为重试候选，`2+` 永久阻断。
- 新增首次创建确认变量合同：
  `MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR` 和
  `MWBV2_MONITOR_PROVISION_ID=<当前 provision_id>`。
- 保留重试确认变量 `MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE`，且只能用于第二次重试。
- plan-only 输出手动成功合同对比摘要，不保存 raw 请求。
- 新账户首次创建前必须只读确认账户唯一命中、owner、agent、credential 状态和查重结果。
- 旧账户 `1871922346964041` 继续禁止第三次创建。

## 非目标

- 不真实创建乾坤 monitor。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不刷新 token。
- 不创建 OceanEngine 项目、广告、素材、事件资产、DMP。
- 不修改预算或出价。
- 不为截图中空的 `package_download_url` 或 `agent_name` 猜值。
- 不对旧账户发起第三次创建。
- 不写入 token、Cookie、raw request、raw response、完整触点 URL。

## 预期状态机

| 当前 attempt_count | 预期行为 |
| --- | --- |
| `0` | 允许进入首次创建预检；仅在首次创建确认变量完整且绑定当前 provision 时才可写入 |
| `1` 且首次为服务器繁忙 | 先只读回查；确认未创建且间隔满足后，才允许第二次重试 |
| `2+` | 永久阻断，不允许第三次创建 |
| 已有有效 `monitor_id` | 直接回写并结束，不创建 |

## 验收

- 新账户 attempt_count=0 时，`monitor:ensure` plan-only 不再出现 `monitor_first_attempt_missing`。
- 旧账户 attempt_count=2 时，真实 ensure 仍阻断，不会创建。
- 新账户不会依赖旧账户专用 L3 override。
- plan-only 输出手动成功合同对比，固定业务字段一致，账户字段仅 `media_account_id` 合理不同。
- plan-only 输出首次创建授权快照，包括 provision ID、account record ID、attempt_count、创建字段、callback hash、create plan hash、blockers。
- `createCalled=false` 且新账户 attempt_count 保持 `0`。
- 必要 smoke、JSON 校验和 `git diff --check` 通过。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已确认需求合理，暂无需要用户补充的问题。
- 已创建本任务卡与 context manifest。
- 已新增首次创建确认合同：
  `MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR`。
- 已将确认绑定扩展为：
  `MWBV2_MONITOR_PROVISION_ID`、`MWBV2_MONITOR_ROUTE_ID`、`MWBV2_MONITOR_GAME_CODE`、`MWBV2_MONITOR_ADVERTISER_ID`、`MWBV2_MONITOR_CREATE_PLAN_HASH`。
- 已新增通用 attempt policy：
  `0 -> first_create`、`1 + server_busy -> server_busy_retry`、`2+ -> monitor_create_attempt_limit_reached`。
- 已将 `monitor:ensure` 与 `monitor:status` 都切到同一份编译后的 monitor plan config，避免 plan-only 可用但真实 ensure 仍报缺字段。
- 已新增手动成功合同对比摘要；新账户与 `245828` 固定字段全部一致，`media_account_id=8449` 为预期账户差异。
- 已验证新账户未授权 ensure 只返回确认变量阻断，不再返回 `monitor_first_attempt_missing`。
- 已验证旧账户 `1871922346964041` 仍阻断，包含 `monitor_id_already_resolved_no_create_needed` 与 `monitor_create_attempt_limit_reached`。
- 已执行新账户 plan-only，`createCalled=false`，attempt_count 仍为 `0`。

## 新账户 plan-only 结果

| 项 | 值 |
| --- | --- |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| account record | `8449` |
| owner | `fengmeiyu` |
| agent_id | `613` |
| 已有 monitor | 否 |
| attempt policy | `first_create` |
| next attempt | `1 / initial_create_once` |
| callback | `type=2`，`active/register/success_order` |
| callback contract hash | `sha256:224d383b42f1a1a89774f85c267f16758f6b9e5acb4488724b9cfa387ded3819` |
| create plan hash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| 手动成功合同对比 | 固定字段全部一致；`media_account_id=8449` 为预期差异 |
| blockers | 无 |
| createCalled | `false` |

## 首次创建确认变量

下一任务若要真实创建，必须另行授权并绑定以下值：

```text
MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753
MWBV2_MONITOR_ROUTE_ID=oceanengine_3_byte_mini_game
MWBV2_MONITOR_GAME_CODE=JSZC
MWBV2_MONITOR_ADVERTISER_ID=1871922414575753
MWBV2_MONITOR_CREATE_PLAN_HASH=sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4
```

## 验证

- `node import monitor-provision`：通过。
- `npm run monitor:ensure -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922414575753 --plan-only`：通过，`createCalled=false`，`attemptCount=0`。
- `npm run monitor:ensure -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922414575753`：通过，未授权阻断，仅 `confirm_variable_missing_or_invalid`。
- `npm run monitor:ensure -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041`：通过，旧账户阻断，无创建。
- `npm run monitor:status -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922414575753`：通过，编译后 readiness 完整，attempt_count=0。
- `npm run test:monitor-bootstrap`：通过。
- `npm run smoke:workflow-skills`：通过；dry-run 中 payload / landing / instance 阻断为既有业务 gate。
- `npm run smoke:api`：命令通过；payload contract blocked 为既有 prewrite gate。
- JSON parse：`project.state.json` 与本任务 manifest 通过。
- `git diff --check`：通过。

## 关闭结论

本任务已完成。下一 gate：若要对新账户 `1871922414575753` 执行首次真实乾坤 monitor 创建，必须另建或继续单次真实创建授权步骤，并在聊天中明确确认；不得影响旧账户，也不得调用旧账户第三次创建。

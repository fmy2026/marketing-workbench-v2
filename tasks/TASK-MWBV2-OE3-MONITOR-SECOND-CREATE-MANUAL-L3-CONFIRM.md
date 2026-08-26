# TASK-MWBV2-OE3-MONITOR-SECOND-CREATE-MANUAL-L3-CONFIRM

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

基于用户已在乾坤后台人工确认的 L3 资源位事实，为当前新账户准备“第二次且最后一次”乾坤 monitor 创建 gate。

本任务先实现并验证人工覆盖 gate、证据写入和前置阻断；真实调用 `monitorSerialNumberAdd` 需要用户在当前对话里后续明确放行。

## 已确认参数

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041

os=3
cate_id=122
vest_id=1414
package_id=36820
channel=dymini3k

media_id=310
media_name=通投智选（原生竞价）
monitor_api=toutiao_wxgame
agent_id=613
qiankun_account_record_id=8448

provision_id=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
```

第一次创建已发生：

```text
attempt_no=1
error_category=server_busy
api_code=500
```

## 合理性评估

需求方向合理，但真实创建需要额外明确授权。

合理性来源：

- `accountIndex` 已恢复并唯一命中目标账户。
- 历史 monitor `245791` 可读，包含 `media_id=310`、`monitor_api=toutiao_wxgame`、`agent_id=613`。
- `changeMediaId(310)` 连续两次返回同一服务端 500，不能证明参数错误。
- 用户已人工确认 `310 = 通投智选（原生竞价）`。

权限边界：

- `project.state.json.guardrails` 当前仍禁止第二次 monitor 创建。
- 因此本任务先落代码和证据 gate；真实写入必须在用户后续明确确认后另行执行。

## 人工 L3 覆盖规则

新增确认变量：

```text
MWBV2_MONITOR_L3_OVERRIDE_CONFIRM=CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR
```

覆盖只对以下组合生效：

```text
provision_id=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
advertiser_id=1871922346964041
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
media_id=310
agent_id=613
monitor_api=toutiao_wxgame
```

人工覆盖仅说明“允许本次 ensure 在创建前预检中接受 L3 手工确认”；不得写成全局 `qiankun_option_relations` 已验证关系，不得覆盖其他账户、游戏或路线。

## 范围

- 在现有 `monitor:ensure` 中增加人工 L3 覆盖确认变量。
- 写入独立脱敏 evidence：`EV-QK-MANUAL-L3-CONFIRM-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310`。
- 人工覆盖匹配时，允许 `qiankun_identity_status=observed` 通过本次 ensure 的技术组合预检。
- 保留现有第二次创建限制：最多 claim `attempt_no=2`，之后不得有第三次。
- 保留现有精确回查流程：创建前必须先查重，创建后必须回查。

## 非目标与权限

- 本任务不执行真实 `monitorSerialNumberAdd`。
- 不调用 `changeMediaId` 或 `changeMediaAccountId`。
- 不刷新 token。
- 不创建 OceanEngine `std_project`、Promotion、素材、DMP 或事件资产。
- 不修改预算、出价和全局游戏默认配置。
- 不在前端或普通日志暴露完整触点 URL、token、Cookie、raw request、raw response。

## 验收

- 无确认变量时，`monitor:ensure` 不调用任何外部接口或创建接口。
- 缺少人工 L3 覆盖变量时，仍阻断 `qiankun_monitor_config_unverified`。
- 人工覆盖变量只对固定组合生效。
- evidence 只保存脱敏摘要、hash、状态和必要 ID。
- `monitor_provision_attempts` 仍最多两行；本任务结束时仍保持 1。
- `npm run smoke:workflow-skills` 与 `npm run smoke:api` 通过。

## 当前进展

- 已读取最新桌面需求文档。
- 已确认需求合理，但真实创建需用户后续明确放行。
- 已建立本任务与 context manifest。
- 已在 `monitor:ensure` 中加入人工 L3 覆盖变量：`MWBV2_MONITOR_L3_OVERRIDE_CONFIRM=CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR`。
- 已实现固定组合校验：仅对当前 `provision_id + advertiser_id + route_id + game_code + media_id=310 + agent_id=613 + monitor_api=toutiao_wxgame` 生效。
- 已实现人工覆盖 evidence 写入：`EV-QK-MANUAL-L3-CONFIRM-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310`。
- 已实现覆盖后的运行态 defaults：仅在人工覆盖生效时，为本次 ensure 补入 `media_id / media_name / monitor_api / agent_id`，不修改 `game_route_defaults`。
- 已保留原有前置精确回查、attempt_no=2 claim、创建后回查和最大两次限制。
- 已补充成功回查后的关系落库逻辑：只有 monitor 已唯一回查到时，才基于 `/tf/ad/index` 写入 L3 observed 关系并将账户乾坤身份更新为 `verified`。
- 已验证无确认变量时不调用外部接口、不创建。
- 已验证只带原 retry 变量、不带人工覆盖变量时仍被 `qiankun_monitor_config_unverified` 阻断。
- 已验证只带人工覆盖变量、不带创建变量时只写人工 evidence，不调用外部接口、不创建。
- 已确认 `monitor_provision_attempts` 仍为 1。

## 验证

- `node import monitor-provision`：通过。
- `npm run monitor:ensure`：blocked，外部接口均未调用，`createCalled=false`。
- `MWBV2_MONITOR_L3_OVERRIDE_CONFIRM=CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR npm run monitor:ensure`：blocked，仅写人工 evidence，外部接口均未调用，`createCalled=false`。
- `MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE MWBV2_MONITOR_PROVISION_ID=... npm run monitor:ensure`：blocked，缺少人工覆盖，外部接口均未调用，`createCalled=false`。
- Postgres 回查：人工 evidence 已存在。
- Postgres 回查：`monitor_provision_attempts=1`，`latest_attempt_no=1`。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：命令通过；payload contract blocked 为既有 dry-run 阻断，不是本任务新增问题。

## 关闭结论

本任务已完成人工 L3 覆盖 gate 的代码与证据准备，但未执行真实 monitor 创建。

下一 gate：若要执行第二次且最后一次乾坤 monitor 创建，需要用户在当前对话中明确授权真实写入，并使用以下三项确认变量：

```bash
MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE \
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041 \
MWBV2_MONITOR_L3_OVERRIDE_CONFIRM=CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR \
npm run monitor:ensure
```

执行后仍必须遵守：先精确回查；若已有唯一 monitor，不创建；若无命中才 claim `attempt_no=2`；最终最多两次，永久禁止第三次。

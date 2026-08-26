# TASK-MWBV2-OE3-QIANKUN-L3-MEDIA-RETRY-ONCE

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

按用户补充需求，修正 v2 对 `os=3` 与乾坤媒体三层的文字口径，并对 L3 媒体资源位 `media_id=310` 做一次受控只读重试。

本任务只验证 `changeMediaId(310)` 及其后置账户代理关系；禁止创建监测序号，禁止调用 `monitorSerialNumberAdd`，禁止刷新 token。

## 已确认输入

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
channel=dymini3k
media_resource_id=310
expected_monitor_api=toutiao_wxgame
qiankun_account_record_id=8448
expected_agent_id=613
historical_monitor_id=245791
historical_media_account_record_id=8443
```

## 合理性评估

合理，可以推进。

`os=3` 应解释为乾坤“小游戏”技术系统类型，不应直接等同为业务上的“微信小游戏”。最终业务语义需要由 `platform / media / media_id / monitor_api / channel` 共同决定。当前路线是 `oceanengine + toutiao_wxgame + dymini3k`，业务上仍按 Byte 小游戏投放链路处理。

上一轮已证明 L3 `media_id=310` 来自历史 monitor `245791`，阻断点是 `changeMediaId(310)` 返回 500。对该接口做一次受控只读重试是合理的，但必须保证不扩展成批量枚举、创建重试或生命周期状态覆盖。

## 范围

- 更新 v2 文档中 `os=3` 的语义说明。
- 固化乾坤三层媒体口径：L1 媒体系、L2 媒体、L3 媒体资源位。
- 为 `monitor:sync:level3-media-resource` 增加显式一次性重试参数与确认变量。
- 本次重试最多调用一次 `POST /tf/ad/changeMediaId`，参数为 `os=3, media_id=310`。
- 仅当 `changeMediaId` 成功且返回账户记录 `8448` 时，最多调用一次 `POST /tf/ad/changeMediaAccountId`。
- 本任务只允许写入 `mwb.evidence_artifacts`、`mwb.qiankun_option_relations` 与 `project.state.json`；不得覆盖首个 monitor 创建失败事实。

## 非目标与权限

- 不重复调用 `accountIndex`、`/tf/ad/index` 或 `selectList(mediaList)`。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不创建第二个 monitor，不上传素材，不改预算/出价，不推 DMP。
- 不刷新 token，不把 token、Cookie、raw request、raw response 或完整 URL 写入项目文件。
- 不新增 migration。
- 不新增大型一次性脚本。

## 验收

- 两份 v2 文档清楚说明 `os=3` 是技术系统类型，不单独决定业务媒体归属。
- CLI 需要 `--retry-once` 与 `MWBV2_QK_L3_MEDIA_RETRY_CONFIRM=RETRY_ONE_LEVEL3_MEDIA_READONLY` 才会执行 L3 重试。
- 本任务重试不重复 `accountIndex`、`/tf/ad/index`、`mediaList`。
- `changeMediaId(310)` 最多调用一次，并写入新的独立 evidence ID。
- 若接口仍 500，不写 L3 关系，不调用 `changeMediaAccountId`，下一 gate 指向乾坤技术排查。
- 若接口成功但缺少 `8448`，记录 `level3_media_resource_not_available_for_target_account`，禁止创建。
- 若接口成功且 `8448` 与 `toutiao_wxgame` 可选，再验证 `changeMediaAccountId(8448)` 与 `agent_id=613`，写入真实关系。
- `monitor_provision_runs` 不被本任务只读验证覆盖，`monitor_provision_attempts` 保持 1。

## 当前进展

- 已完整读取桌面需求文档，确认无阻塞疑问。
- 已建立本任务与 context manifest。
- 已更新两份 v2 文档，明确 `os=3` 是乾坤“小游戏”技术系统类型，不单独决定业务媒体归属。
- 已为 `monitor:sync:level3-media-resource` 增加 `--retry-once` 与 `MWBV2_QK_L3_MEDIA_RETRY_CONFIRM=RETRY_ONE_LEVEL3_MEDIA_READONLY` 防护。
- 已移除 L3 只读验证对 `monitor_provision_runs` 的覆盖写入。
- 已将此前被 L3 只读结果覆盖的 `monitor_provision_runs` 恢复为首个真实创建失败事实。
- 已执行一次受控只读重试：仅调用 `changeMediaId(os=3, media_id=310)`。
- 重试仍返回 `500 / 服务器繁忙，请稍后重试(400)`。
- 未调用 `changeMediaAccountId`，未调用 `monitorSerialNumberAdd`，未刷新 token。
- 已写入独立 evidence：`EV-QK-LEVEL3-MEDIA-RESOURCE-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310-R02`。
- 未写入 L3 关系，`monitor_provision_attempts` 仍为 1。

## 本次重试结果

| 项 | 结果 |
| --- | --- |
| CLI 防护 | 无确认变量时 blocked，外部接口均未调用 |
| 确认变量 | `MWBV2_QK_L3_MEDIA_RETRY_CONFIRM=RETRY_ONE_LEVEL3_MEDIA_READONLY` |
| CLI 参数 | `--retry-once` |
| `accountIndex` | 未调用 |
| `/tf/ad/index` | 未调用 |
| `mediaList` | 未调用 |
| `changeMediaId(310)` | 调用 1 次，返回 `500 / 服务器繁忙，请稍后重试(400)` |
| `changeMediaAccountId(8448)` | 未调用 |
| `monitorSerialNumberAdd` | 未调用 |
| L3 关系写入 | 0 条 |
| evidence | `EV-QK-LEVEL3-MEDIA-RESOURCE-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310-R02` |

## 验证

- `node import monitor-provision`：通过。
- 无确认变量 guard：通过，外部调用均为 false。
- 受控重试：完成，仍为 500。
- Postgres 回查：R01/R02 evidence 独立存在，R02 `source_ref=qiankun:/tf/ad/changeMediaId`。
- Postgres 回查：`media_resource_to_allowed_account_record`、`media_resource_to_allowed_monitor_api`、`account_record_to_agent` 仍为 0 条。
- Postgres 回查：`monitor_provision_runs` 保存首个创建失败事实；`monitor_provision_attempts=1`。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：命令通过；payload contract blocked 为既有 dry-run 阻断，不是本任务新增问题。

## 关闭结论

本任务已完成受控只读重试，当前仍被乾坤接口 `changeMediaId(310)` 服务端 500 阻断。下一 gate：将 R02 evidence 与请求指纹、响应 hash 提供给乾坤技术侧排查该资源位/接口，或由技术侧提供当前有效 L3 媒体资源位 ID；在此之前继续禁止创建第二个 monitor。

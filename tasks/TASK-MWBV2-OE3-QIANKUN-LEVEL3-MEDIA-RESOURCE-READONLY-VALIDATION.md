# TASK-MWBV2-OE3-QIANKUN-LEVEL3-MEDIA-RESOURCE-READONLY-VALIDATION

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

基于已完成的乾坤媒体三层口径修正，直接验证历史成功资源位 `media_resource_id=310` 是否可用于新账户 `1871922346964041`，并补齐 L2 媒体与 L3 媒体资源位的最小真值记录。

本任务只做乾坤读取与配置可选性验证；禁止创建第二次 `monitor_id`，禁止调用 `monitorSerialNumberAdd`。

## 已确认前提

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
qiankun_account_record_id=8448
qiankun_agent_id=613
historical_monitor_id=245791
media_resource_id=310
```

## 合理性评估

合理，可以推进：上一轮“`mediaList` 不包含 `310`”是跨层级比较，不应作为 L3 资源位不可用的结论。当前应直接用 L3 资源位 ID `310` 调用 `/tf/ad/changeMediaId`，再核验账户记录与代理。

无阻塞疑问。需注意：`changeMediaId` 和 `changeMediaAccountId` 在本任务中仅作为乾坤依赖配置读取接口使用，不代表平台创建授权。

## 范围

- 新增 migration，在 `mwb.advertiser_accounts` 增加 L2 媒体字段。
- 从 `accountIndex` 回写 `media_master_id` 与媒体名称字段。
- 验证历史 monitor `245791` 中的 L3 `media_id=310` 仍可读取。
- 调用 `changeMediaId(os=3, media_id=310)`，判断是否返回目标账户记录 `8448` 与监测 API。
- 仅当 `8448` 可选时调用 `changeMediaAccountId(media_account_id=8448)`，验证代理是否为 `613`。
- 写入真实返回支持的 L3 关系事实。
- 移除或修正旧的 L2/L3 交集判断入口。

## 非目标与权限

- 不调用 `/tf/ad/monitorSerialNumberAdd`，不创建 monitor。
- 不刷新 token，不写 raw request、raw response、Cookie、完整触点 URL 或凭据。
- 不批量扫描资源位 ID。
- 不新增第二套 client、第二个 skill 或一次性脚本。

## 验收

- `advertiser_accounts` 保存真实 L2 媒体 ID/名称。
- `310` 通过 L3 资源位口径验证，不再经过 `mediaList` 交集判断。
- 若 `8448` 可选，写入 `media_resource_to_allowed_account_record`、`media_resource_to_allowed_monitor_api`、`account_record_to_agent`。
- 若不可选，写入明确只读证据与唯一下一 gate。
- `monitor_provision_attempts` 保持 1。
- 未调用 `monitorSerialNumberAdd`。

## 当前进展

- 已完整读取桌面需求文档并完成合理性评估。
- 已建立本任务与 context manifest。
- 已新增并应用 `db/025_add_qiankun_media_master_identity.sql`。
- 已从 `accountIndex` 回写 L2 媒体字段：`qiankun_media_master_id` 当前返回值为 `今日头条`，`qiankun_media_master_name` 未返回。
- 已移除旧 npm 入口 `monitor:discover:media-candidates`，新增 `monitor:sync:level3-media-resource`。
- 已直接用 L3 资源位口径验证历史 `media_resource_id=310`，未再使用 `mediaList` 交集判断。
- 历史 monitor `245791` 读取成功，确认 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 仍可从历史记录读到。
- `changeMediaId(os=3, media_id=310)` 返回 `500 / 服务器繁忙，请稍后重试(400)`；因此未调用 `changeMediaAccountId`。
- 未写入 L3 资源位关系，`monitor_provision_attempts` 仍为 1，未调用创建接口。

## 真实只读结果

| 项 | 结果 |
| --- | --- |
| `accountIndex` | `passed`，唯一命中目标账户 |
| L2 媒体字段 | `qiankun_media_master_id=今日头条`；名称字段未返回 |
| 历史 monitor | `passed`，`monitor_id=245791` 可读 |
| 历史 L3 资源位 | `media_resource_id=310` 可从历史 monitor 读到 |
| 历史监测 API | `toutiao_wxgame` |
| 历史代理 | `613` |
| `changeMediaId(310)` | `blocked`，`apiCode=500`，`apiMessage=服务器繁忙，请稍后重试(400)` |
| `changeMediaAccountId(8448)` | 未调用，因为 `changeMediaId` 未通过 |
| L3 关系写入 | 0 条 |
| evidence | `EV-QK-LEVEL3-MEDIA-RESOURCE-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310` |

## 验证

- migration 应用成功。
- `node import monitor-provision` 通过。
- `psql` 回查确认账户 L2 字段已落库。
- `psql` 回查确认 `media_resource_*` 关系 0 条。
- `psql` 回查确认 `monitor_provision_attempts=1`。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过；输出中的 payload 合同阻断为既有测试态，不是本任务新增问题。

## 关闭结论

本任务已完成代码、schema 与一次真实只读验证。当前未能证明 `310` 可用于新账户，原因不是 `mediaList` 不包含，而是 `changeMediaId(310)` 返回服务端繁忙。

下一 gate：新建只读任务，在不创建、不刷新 token 的前提下，对 `changeMediaId(os=3, media_id=310)` 做一次受控重试；若仍返回 500，则把该接口响应交给乾坤技术侧排查，或由技术侧提供当前可用的 L3 媒体资源位 ID。

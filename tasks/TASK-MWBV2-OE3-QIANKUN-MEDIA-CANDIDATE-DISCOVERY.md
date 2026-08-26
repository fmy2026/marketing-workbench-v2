# TASK-MWBV2-OE3-QIANKUN-MEDIA-CANDIDATE-DISCOVERY

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

基于乾坤历史真实监测记录与当前 `mediaList` 的交集，发现当前最多 3 个可信 `media_id` 候选；再对候选执行受控只读核验，确认目标账户 `1871922346964041` 是否可使用该媒体、监测 API 与代理关系。

目标作用域：

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
cate_id=122
vest_id=1414
package_id=36820
channel=dymini3k
historical_monitor_id=245791
qiankun_account_record_id=8448
qiankun_agent_id=613
```

## 合理性评估

合理，可以推进：上一任务已恢复 `accountIndex` 并落库账户记录 ID、owner 与账户侧代理 ID；当前唯一卡点是历史 `media_id=310` 不在最新 `mediaList` 中。通过历史真实 monitor 与当前媒体列表取交集，比根据展示名或旧项目文件猜测更稳。

无阻塞疑问。需注意：本任务只做只读发现和受控关系核验，不代表创建授权。

## 范围

- 新增长期命令 `npm run monitor:discover:media-candidates`。
- 复用现有乾坤 client、OE3 skill 与 monitor CLI。
- 调用 `/tf/ad/index` 精确读取 `monitorId=245791`。
- 调用 `/tf/ad/index` 窄范围读取同包、同游戏组、同马甲、同系统、同渠道、同 owner 的历史 monitor。
- 调用一次 `/ajax/selectList/getList type=mediaList`。
- 对交集中的 1-3 个候选最多调用 3 次 `/tf/ad/changeMediaId`。
- 仅在唯一可用媒体候选成立后调用一次 `/tf/ad/changeMediaAccountId`。
- 按真实返回写入 `mwb.qiankun_option_relations` 与账户身份状态。

## 非目标与权限

- 不调用 `/tf/ad/monitorSerialNumberAdd`，不创建监测序号。
- 不刷新 token，不读取、打印、复制或持久化 token、Cookie、raw request、raw response。
- 不新增 migration、表、第二套 client、第二个 skill 或一次性脚本。
- 不从展示名称、历史 `310`、旧项目 JSON 或人工辅助文档猜测 `media_id`。
- 不扫描全部 177 个媒体，只核验交集候选，最多 3 个。

## 验收

- 历史 monitor 与当前 `mediaList` 均有明确只读结果。
- 候选 `media_id` 来自“历史真实 monitor + 当前 mediaList”交集。
- 候选数为 0 时输出 `current_media_candidate_unresolved` 并停止。
- 候选数为 1-3 时逐个只读核验；超过 3 时停止等待业务选择。
- 目标账户可用关系、监测 API、代理关系只在真实返回后写入。
- `monitor_provision_attempts` 保持 1 条。
- 任务关闭时更新本任务、manifest、两份既有文档与 `project.state.json`。

## 当前进展

- 已完整读取桌面需求文档并完成合理性评估。
- 已建立本任务与 context manifest。
- 已新增长期命令 `npm run monitor:discover:media-candidates`，复用既有 monitor provision CLI。
- 已扩展既有乾坤 option relation skill，加入历史 monitor 与当前 `mediaList` 交集发现逻辑。
- 已执行一次真实只读发现：`/tf/ad/index monitorId=245791` 成功返回 1 条历史 monitor。
- 同包同渠道窄范围 `/tf/ad/index` 成功返回 10 条历史 monitor。
- 当前 `mediaList` 成功返回 177 项；历史 monitor 内部 `media_id` 与当前 `mediaList[].value` 交集为 0。
- 因无候选，本轮未调用 `changeMediaId` 或 `changeMediaAccountId`，未新增媒体、监测 API、代理关系。
- `monitor_provision_runs.error_summary` 已修正为 `qiankun_media_candidate_unresolved:current_media_candidate_unresolved`。
- `monitor_provision_attempts` 保持 1 条，未调用 `monitorSerialNumberAdd`，未刷新 token。

## 真实只读结果

| 项 | 结果 |
| --- | --- |
| 历史精确 monitor | `passed`，`resultTotal=1` |
| 历史锚点 | `monitor_id=245791`，`package_id=36820`，`cate_id=122`，`vest_id=1414`，`os=3`，`channel=dymini3k` |
| 历史锚点技术字段 | `media_id=310`，`monitor_api=toutiao_wxgame`，`agent_id=613`，`media_account_record_id=8443` |
| 同包同渠道历史查询 | `passed`，`resultTotal=10`，10 条均有内部 `media_id` |
| 当前媒体列表 | `passed`，`listCount=177` |
| 交集候选 | `0` |
| evidence | `EV-QK-MEDIA-CANDIDATE-DISCOVERY-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` |

## 验证

- `npm run monitor:discover:media-candidates`：通过只读执行，业务状态为 `blocked/current_media_candidate_unresolved`。
- `psql` 回查：`monitor_provision_attempts=1`；账户身份保持 `observed`；关系表仍只有 `cate_to_vest`、`vest_to_package`、`package_to_channel`、`game_to_cate`。
- `node import monitor-provision`：通过。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过；输出中 payload 合同阻断为既有测试态，不是本任务新增问题。

## 关闭结论

本任务已完成可推进部分，并得到原始结果：“历史 monitor media_id + 当前 mediaList.value”的交集为 0。该结果后续已被修正解释为跨层级比较不成立，不能证明当前没有可用媒体资源位。

下一 gate：先定位乾坤第 3 层“媒体资源位”的来源接口或当前资源位 ID；随后新建只读任务直接用第 3 层资源位 ID 执行 `changeMediaId`、`changeMediaAccountId` 核验。仍不创建监测序号。

## 补充口径修正

用户后续确认：乾坤媒体渠道分三层：

```text
第 1 层：媒体系，近似对应 v2 platform
第 2 层：媒体，来自 selectList(mediaList) 与 accountIndex.media_master_id
第 3 层：媒体资源位，来自 /tf/ad/index mediaId[] 与历史 monitor media_id
```

因此，本任务的“历史 monitor media_id 与 mediaList.value 交集为 0”只能说明跨层级比较不成立，不能证明当前没有可用媒体资源位。下一任务应先定位第 3 层媒体资源位来源，再用该资源位 ID 调用 `changeMediaId`。

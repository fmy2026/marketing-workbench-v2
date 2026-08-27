# TASK-MWBV2-OE3-QIANKUN-MEDIA-CATALOG-AND-CHANGEMEDIA-500-ESCALATION

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

围绕乾坤通用下拉接口补齐 `media_id=310` 的目录对照证据，并生成一份可交给乾坤技术侧定位 `changeMediaId(310)` 连续 500 的最小排查单。

本任务不再次调用 `changeMediaId`，不调用 `changeMediaAccountId`，不调用 `monitorSerialNumberAdd`，不创建第二个 monitor。

## 已确认事实

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
media_id=310
资源位名称=通投智选（原生竞价）
qiankun_account_record_id=8448
expected_monitor_api=toutiao_wxgame
expected_agent_id=613
```

`changeMediaId(os=3, media_id=310)` 已连续两次返回：

```text
apiCode=500
apiMessage=服务器繁忙，请稍后重试(400)
```

## 合理性评估

合理，可以推进。

同一凭据下 `accountIndex` 与 `/tf/ad/index` 已成功，`changeMediaId(310)` 连续两次返回相同业务错误，因此当前阻断更像乾坤服务端接口层问题。读取一次 `selectList(type=mediaList)` 可以补充目录对照证据，方便技术侧确认 `310` 是否仍在当前可见目录中；但该目录接口不能代替 `changeMediaId` 的账户可选性判断，不能因此放行创建。

## 范围

- 调用一次 `POST /ajax/selectList/getList`，参数仅为 `type=mediaList`。
- 写入一条独立 evidence，记录返回总数、`value=310` 命中情况、名称命中情况、候选唯一性。
- 更新 v2 文档，明确“目录接口”和“账户可选性接口”的区别。
- 生成乾坤技术排查单，包含接口、参数、对照事实、R01/R02 请求指纹与响应 hash。
- 更新任务卡、context manifest、`project.state.json`。

## 非目标与权限

- 不调用第三次 `changeMediaId`。
- 不调用 `changeMediaAccountId`。
- 不调用 `/tf/ad/index`、`accountIndex` 或其他 selectList type。
- 不调用 `monitorSerialNumberAdd`。
- 不创建 monitor，不刷新 token，不上传素材，不改预算/出价，不推 DMP。
- 不新增 migration、表或大型一次性脚本。
- 不修改官方参考文件 `docs/.参考文档/乾坤系统/.archive/api-docs-20260825.md`。
- 不写 token、Cookie、完整请求头、raw request、raw response 或完整触点 URL。

## 验收

- `mediaList` 只读调用 1 次，结果写入独立 evidence。
- v2 文档明确 `selectList(type=mediaList)` 只能作为目录观察证据。
- 排查单可直接给技术侧定位 `changeMediaId(310)` 连续 500。
- `monitor_provision_attempts` 仍为 1。
- 无 monitor 创建、无 token 刷新、无平台写入。

## 当前进展

- 已完整读取桌面需求文档。
- 已确认需求合理、无阻塞疑问。
- 已建立本任务与 context manifest。
- 已新增 `monitor:sync:media-catalog`，复用现有 `monitor-provision-cli` 与 `QiankunMonitorClient`。
- 已执行一次 `POST /ajax/selectList/getList type=mediaList` 只读调用。
- 目录接口成功返回 177 项；未命中 `value=310`，未命中名称 `通投智选（原生竞价）`。
- 已写入独立 evidence：`EV-QK-MEDIA-CATALOG-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-310`。
- 已更新两份 v2 文档，明确目录接口不等于账户可选性接口。
- 已生成技术排查单：`docs/乾坤-changeMediaId-310-服务端500排查单_20260826.md`。
- 已确认未调用第三次 `changeMediaId`，未调用 `changeMediaAccountId`，未调用 `monitorSerialNumberAdd`。
- 已确认 `monitor_provision_attempts` 仍为 1。

## 本次目录读取结果

| 项 | 结果 |
| --- | --- |
| 接口 | `POST /ajax/selectList/getList` |
| 参数 | `type=mediaList` |
| 状态 | `passed` |
| API 摘要 | `0 / Success` |
| 返回数量 | `177` |
| `value=310` | 未命中 |
| 名称 `通投智选（原生竞价）` | 未命中 |
| interpretation | 目录观察证据，不证明账户可选性，不放行创建 |
| evidence | `EV-QK-MEDIA-CATALOG-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-310` |
| request fingerprint | `sha256:999d368e137cd397583a91e589d1bcbb131cb941870709894ff4de127616621b` |
| response hash | `sha256:8aea00aec9f5fc0a8026c9ebcae42003607036b450237051e10f36215741dbbb` |

## 验证

- JSON 校验：`project.state.json` 与本 manifest 通过。
- `node import monitor-provision`：通过。
- Postgres 回查：L3 三类关系仍为 0 条。
- Postgres 回查：`monitor_provision_attempts=1`。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：命令通过；payload contract blocked 为既有 dry-run 阻断，不是本任务新增问题。

## 关闭结论

本任务已完成媒体目录对照与技术排查单输出。目录读取未命中 `310 / 通投智选（原生竞价）`，这只能说明目录口径存在差异，不能推翻历史 monitor 中的 L3 资源位事实，也不能代替 `changeMediaId`。

下一 gate：等待乾坤技术侧确认 `changeMediaId(os=3, media_id=310)` 连续 500 的服务端根因，或提供当前有效 L3 `media_id`。在此之前继续禁止第二次 monitor 创建。

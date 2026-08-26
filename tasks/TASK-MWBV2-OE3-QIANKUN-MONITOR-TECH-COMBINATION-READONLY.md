# TASK-MWBV2-OE3-QIANKUN-MONITOR-TECH-COMBINATION-READONLY

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

为 `JSZC + oceanengine_3_byte_mini_game + advertiser_id=1871922346964041` 建立“媒体账户技术层”的真实只读核验链路：补齐目标广告账户在乾坤侧的账户记录 ID、owner key 与代理候选，核验历史候选 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 是否仍被真实只读接口支持，并把关系图归一为“包选择层”和“媒体账户技术层”两条事实链。

本任务完成后最多只能得到“是否具备编译 monitor 创建参数的条件”；不得创建 `monitor_id`。

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权任何真实平台写入。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、本任务卡、context manifest、schema 和已验证接口资料为准。

## 合理性评估

需求合理，可以继续推进：

- 当前已确认链路只有 `cate_id=122 -> vest_id=1414 -> package_id=36820 -> channel=dymini3k`，不应把历史默认技术字段继续当作可创建真值。
- 将 `advertiser_id` 与乾坤账户记录 ID 拆开保存是必要修正，可避免后续 `media_account_id` 参数来源混乱。
- 核验顺序符合风险递减原则：先定位账户记录，再核验媒体候选，再读取媒体允许的账号记录和监测 API，最后核验账户记录对应代理。
- 本任务只读，不触发 `/tf/ad/monitorSerialNumberAdd`，也不增加第 2 次创建尝试。

非阻塞注意事项：

- 本机 OE3 官方公开文档未直接检索到这些乾坤内部接口名；接口合同以项目内已验证乾坤资料和真实回查为准。
- `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 在本任务开始时只可作为 `reference_only` 候选。
- 若任一步零命中、多命中或关系不一致，任务应记录 blocker 并停止后续推断。

## 当前已确认事实

```text
cate_id=122 --(os=3)--> vest_id=1414
vest_id=1414 --(os=3)--> package_id=36820
package_id=36820 --(os=3)--> channel=dymini3k
```

历史候选：

```text
media_id=310
agent_id=613
monitor_api=toutiao_wxgame
```

这些候选不能直接驱动创建请求。

## 范围

- 新增 migration `db/024_add_qiankun_account_identity.sql`，仅扩展 `mwb.advertiser_accounts`。
- 扩展 `src/repositories/postgresRepository.mjs`，支持写回目标账户的乾坤技术身份。
- 扩展 `src/platforms/qiankunMonitorClient.mjs`，加入只读端点：
  - `POST /ajax/selectList/getList`
  - `POST /tf/ad/changeMediaId`
  - `POST /tf/ad/changeMediaAccountId`
- 扩展现有 `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增“技术组合同步”能力。
- 扩展现有 `src/workflows/skills/oe3/monitor-provision.mjs` 和 `scripts/monitor-provision-cli.mjs` 的 mode 分发，不新增第二套 Skill 或临时脚本。
- 新增长期命令 `npm run monitor:sync:technical-combination`。
- 更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`。

## 非目标

- 不新增 `qiankun_monitor_configs` 表。
- 不新增账户映射表。
- 不新增 `package_to_media`、`package_to_agent`、`package_to_monitor_api` 假关系。
- 不全量探测媒体列表，不把全局下拉伪造成游戏或包关系。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 真实写入分支。
- 不调用 OceanEngine 创建接口。
- 不上传素材、不创建事件资产、不推送 DMP、不改预算/出价。
- 不刷新 token。
- 不保存 token、host、完整 URL、raw request、raw response、Cookie、auth_code、完整 callback URL 或完整点击监测 URL。

## 权限

允许的外部接口仅限只读：

```text
POST /tf/account_info/accountIndex
POST /ajax/selectList/getList
POST /tf/ad/changeMediaId
POST /tf/ad/changeMediaAccountId
```

允许写入：

```text
mwb.advertiser_accounts
mwb.qiankun_option_relations
mwb.evidence_artifacts
project.state.json
tasks/
tasks-context-manifests/
docs/方案-乾坤与v2报表字段关系图_20260826.html
```

平台写入保持关闭。

## 验收

- `advertiser_accounts` 补齐且只补齐目标账户的乾坤技术身份。
- `qiankun_option_relations` 只新增真实接口支持的关系。
- 不生成任何假 `package_to_media` 关系。
- 历史默认技术字段无法再驱动 monitor 创建。
- 未完成真实关系核验时，`monitor:ensure`、预检和创建参数编译返回 `qiankun_monitor_config_unverified`。
- `monitor_provision_attempts` 仍为 1 条。
- 关系图、任务卡、manifest、`project.state.json` 同步更新。
- `npm run test:monitor-bootstrap`、`npm run smoke:workflow-skills`、`npm run smoke:api` 通过。
- 下一 gate 由真实结果决定：技术组合完整才进入“编译最终 monitor 配置”，仍不直接创建 monitor。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已评估该需求可以作为新的只读核验任务推进，无阻塞疑问。
- 已创建本任务卡和 context manifest。
- 已新增并应用 `db/024_add_qiankun_account_identity.sql`。
- 已扩展 `mwb.advertiser_accounts`，加入 `qiankun_account_record_id`、`qiankun_owner_key`、`qiankun_agent_id`、`qiankun_identity_status`、`qiankun_verified_at`。
- 已将 `game_route_defaults.raw_defaults.monitor_provision` 中旧 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 移入 `monitor_provision_reference_candidates`，状态 `reference_only`。
- 已将 `monitor_provision_status` 标记为 `qiankun_monitor_config_unverified`。
- 已扩展 `src/platforms/qiankunMonitorClient.mjs`，加入 `selectList/getList`、`changeMediaId`、`changeMediaAccountId` 只读方法。
- 已扩展现有 `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增 `sync_technical_combination` 能力，未新增第二套 Skill。
- 已新增 `npm run monitor:sync:technical-combination`。
- 已收紧 `monitor:ensure`：技术组合未 `verified` 时返回 `qiankun_monitor_config_unverified`，并且不会调用创建接口。
- 已更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，改为“包选择层”和“媒体账户技术层”两条链，并把 `qiankun_monitor_configs` 标为未来编译产物、当前未建表。

## 真实只读执行结果

`npm run monitor:sync:technical-combination` 已执行真实只读调用，第一步即阻断：

| 项 | 结果 |
| --- | --- |
| `/tf/account_info/accountIndex` | blocked |
| HTTP/API 摘要 | `apiCode=302`、`apiMessage=跳转登录` |
| 账户唯一命中 | 未命中；`exactMatchCount=0` |
| 后续 `selectList/getList` | 未调用 |
| 后续 `changeMediaId` | 未调用 |
| 后续 `changeMediaAccountId` | 未调用 |
| 技术组合状态 | `qiankun_monitor_config_unverified` |
| 平台写入 | 未调用 |
| 创建 attempt | 未新增，仍为 1 条 |
| 证据 | 已写入脱敏 evidence `EV-QK-MONITOR-TECH-COMBO-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` |

本次阻断表示当前乾坤会话/凭据不能完成 `accountIndex` 只读链路，不表示候选 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 已失效；这些值仍只是 `reference_only`，不可创建。

## 验证结果

- `db/024_add_qiankun_account_identity.sql`：已应用。
- `npm run monitor:sync:technical-combination`：受控只读执行，返回 `account_index_query_failed:302:跳转登录`，未继续调用后续级联。
- `npm run monitor:ensure`：通过阻断验证，返回 `qiankun_monitor_config_unverified`，`createCalled=false`。
- 数据库回查：旧 `media_id`、`agent_id`、`monitor_api` 已不在 `monitor_provision` 可创建默认块中。
- 数据库回查：`monitor_provision_reference_candidates` 保留三项旧候选，状态 `reference_only`。
- 数据库回查：`monitor_provision_attempts` 仍为 `attempt_nos=[1]`。
- 数据库回查：假关系 `package_to_media/package_to_agent/package_to_monitor_api` 数量为 0。
- 数据库回查：本任务 technical relation 数量为 0，符合第一步阻断后的不猜测原则。
- evidence 回查：无 host、raw request、raw response 泄漏；`platformWriteCalled=false`。
- `npm run test:monitor-bootstrap`：通过。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过。
- `node --check src/platforms/qiankunMonitorClient.mjs`：通过。
- `node --check src/repositories/postgresRepository.mjs`：通过。
- `node --check src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`：通过。
- `node --check src/workflows/skills/oe3/monitor-provision.mjs`：通过。

## 关闭结论

本任务完成代码、数据库和文档收口，但真实技术组合核验因 `/tf/account_info/accountIndex` 返回 `302: 跳转登录` 停在第一步。下一 gate 是恢复或确认乾坤 `accountIndex` 可用会话后，重跑 `npm run monitor:sync:technical-combination`；在账户记录、媒体、监测 API 和代理未完成真实核验前，不得调用 `/tf/ad/changeMediaId` 后续链路以外的创建接口，也不得进入 monitor 创建。

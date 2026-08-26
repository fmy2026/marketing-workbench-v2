# TASK-MWBV2-OE3-QIANKUN-PACKAGE-BASE-INFO-READONLY-SYNC

状态：completed

更新时间：2026-08-26 CST

## 目标

将乾坤 `/tf/ad/changePackageId` 的“融合拿包基础信息”只读查询拆成独立小任务：使用已真实命中的 `package_id=36820` 与 `os=3`，读取该 package 的游戏组、马甲、渠道、owner、资源位、代理、账号记录和监测 API 等字段存在性与真实值，并只将响应中真实存在且后续监测配置会使用的关系写入 `mwb.qiankun_option_relations`。

本任务不执行第二次 `monitor_id` 创建。

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权任何真实平台写入。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、本任务卡、context manifest、schema 和官方文档为准。

官方接口合同参考：

```text
docs/.参考文档/乾坤系统/api-docs-20260825.md
POST /tf/ad/changePackageId
package_id: string
host: 当前域名，用于拼接下载地址
os: 1=Android, 2=iOS, 3=微信小游戏, 4=鸿蒙
```

## 合理性评估

方向合理，可以作为 `vest_to_package` 后的第三个只读级联小任务推进：

- 不新增表、不新增 migration，继续复用现有关系事实表和 evidence。
- `host` 从本地乾坤 API base URL 解析，不在 Skill 中硬编码域名。
- 微信小游戏响应可能只返回 `channel`；字段缺失应记录为 `not_returned_for_os_3`，不得用历史默认值补齐。
- 命中 `channel=dymini3k` 也只代表 package 基础信息中的单字段观测，不代表完整监测配置有效。

无阻塞疑问；按最小只读同步推进。

## 范围

- 扩展 `src/platforms/qiankunMonitorClient.mjs`，新增 `queryPackageBaseInfo({ ownerKey, packageId, os, host })`。
- 扩展现有 Skill `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增 `package_base_info` 同步能力。
- 扩展现有 CLI `scripts/monitor-provision-cli.mjs` 的 mode 分发。
- 新增长期 npm 命令 `monitor:sync:package-base-info`。
- 写入脱敏证据 `artifact_type=qiankun_package_base_info_readonly`。
- 更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，补充 `122 -> 1414 -> 36820 -> 实际 channel/media/agent/monitor API`。

## 非目标

- 不新增表、不新增 migration。
- 不伪造未返回字段关系。
- 不创建完整 `qiankun_monitor_configs` 记录。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 真实写入分支。
- 不调用 OceanEngine `std_project/create`。
- 不上传素材、不创建事件资产、不推送 DMP、不修改预算/出价。
- 不刷新 token。
- 不新增第二套乾坤 Client。
- 不新增第二个同步 Skill。
- 不保存包下载地址原字段或完整值、`X-Passport-Token`、raw request、raw response、access token、Cookie、完整 callback URL 或完整点击监测 URL。

## 权限

允许的外部接口仅限：

```text
POST /tf/ad/changePackageId
```

允许写入：

```text
mwb.qiankun_option_relations
mwb.evidence_artifacts
```

平台写入保持关闭。

## 验收

- `/tf/ad/changePackageId` 只读调用成功或返回明确脱敏错误。
- 所有真实返回且有业务意义的关系写入 `qiankun_option_relations`。
- 不重复写入关系，不伪造缺失字段。
- 明确输出 `cate_id`、`vest_id`、`channel`、`owner`、`mediaId`、`agentId`、`monitorApiList`、`accountIdList` 的真实返回/缺失与历史候选匹配结果。
- 包下载地址只记录 `package_download_url_present` 布尔值，不保存 URL 或 hash。
- `monitor_provision_attempts` 仍只有第一次记录。
- 不调用 `/tf/ad/monitorSerialNumberAdd`、`monitor:ensure` 写入分支或 OceanEngine 创建接口。
- HTML 标注来源接口、真实返回字段、`channel=dymini3k` 是否仍成立、未返回字段不得显示为已确认。
- 更新任务卡、context manifest 和 `project.state.json`。
- 下一步 Gate 由真实返回决定：若获得有效 `mediaId`，继续接口 6；若未返回，先定位媒体资源位官方来源，不提前创建 `monitor_id`。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已核对官方接口片段，确认 `/tf/ad/changePackageId` 为只读基础信息查询，且微信小游戏示例只保证 `channel`。
- 已评估该需求可作为 `vest_to_package` 后的第三个小步推进。
- 已扩展 `src/platforms/qiankunMonitorClient.mjs`，新增只读方法 `queryPackageBaseInfo()`。
- 已扩展现有 `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增 `package_base_info` 同步能力，未新增第二个 Skill。
- 已通过 `npm run monitor:sync:package-base-info` 接入长期 CLI。
- 已调用 `/tf/ad/changePackageId` 完成真实只读核验，返回 `channel=dymini3k`，与历史候选一致。
- `cateId`、`vestId`、`owner`、`mediaId`、`agentId`、`monitorApiList`、`accountIdList` 未返回，均按 `not_returned_for_os_3` 记录，未补写假关系。
- 已写入 1 条 `package_to_channel` 关系：`package_id=36820 -> channel=dymini3k`，状态 `observed`。
- 已写入脱敏证据 `EV-QK-PACKAGE-BASE-INFO-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-36820-3`，`artifact_type=qiankun_package_base_info_readonly`。
- 已确认包下载地址只记录 `package_download_url_present=false`，未保存 URL 或 hash。
- 已确认 `monitor_provision_attempts` 对目标 provision 仍只有 `attempt_no=1`。
- 已更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，补充 `122 -> 1414 -> 36820 -> dymini3k`，并标注 media/agent/monitor API/account list 未返回。

## 验证结果

- `npm run monitor:sync:package-base-info`：通过；`/tf/ad/changePackageId` 返回 `code=0`、`channel=dymini3k`。
- 重复执行 `npm run monitor:sync:package-base-info`：通过；数据库仍为 1 条 package 派生关系。
- 数据库回查：`package_base_relation_count=1`、`distinct_relation_count=1`、`channel_hit=true`。
- evidence 回查：原包下载地址字段名不存在，`package_download_url_present` 存在。
- `monitor_provision_attempts` 回查：`attempt_count=1`、`attempt_nos=[1]`。
- `npm run test:monitor-bootstrap`：通过。
- `npm run smoke:api`：通过。
- `npm run smoke:workflow-skills`：通过。
- `node --check src/platforms/qiankunMonitorClient.mjs`：通过。
- `node --check src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`：通过。
- `node --check src/workflows/skills/oe3/monitor-provision.mjs`：通过。

## 关闭结论

本任务完成。当前只确认 `package_to_channel` 单字段关系为 `observed`；`mediaId` 未返回，因此不能继续直接构建完整监测配置。下一步应先定位媒体资源位的官方来源；若能从接口 6 `/tf/ad/changeMediaId` 获得有效 `media_id` 输入，再继续读取监测 API 类型和账号记录列表。

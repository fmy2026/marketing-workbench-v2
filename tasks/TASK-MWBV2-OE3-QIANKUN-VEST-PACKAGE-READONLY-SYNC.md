# TASK-MWBV2-OE3-QIANKUN-VEST-PACKAGE-READONLY-SYNC

状态：completed

更新时间：2026-08-26 CST

## 目标

将乾坤 `/tf/ad/changeVestId` 的“马甲 + 系统 -> 融合拿包列表”只读查询拆成独立小任务：使用上一任务已真实观测到的 `vest_id=1414 / 巨兽战场` 与 `os=3`，读取返回的 package 列表，并复用 `mwb.qiankun_option_relations` 写入 `vest_to_package` 关系。

本任务不执行第二次 `monitor_id` 创建。

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权任何真实平台写入。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、本任务卡、context manifest、schema 和官方文档为准。

官方接口合同参考：

```text
docs/.参考文档/乾坤系统/.archive/api-docs-20260825.md
POST /tf/ad/changeVestId
os: 2=iOS, 3=微信小游戏, 4=鸿蒙
data[].value -> package id
data[].label -> package display text/name
```

## 合理性评估

方向合理，可以作为 `cate_to_vest` 后的第二个只读级联小任务推进：

- 不新增表、不新增 migration，复用已建立的关系事实表。
- 只读接口单一，权限边界清楚。
- 能验证历史候选 `package_id=36820` 是否仍属于 `vest_id=1414 + os=3`。
- 即使命中 `36820`，也只代表单跳关系为 `observed`，不能单独证明完整监测配置有效。

无阻塞疑问；按最小只读同步推进。

## 范围

- 扩展 `src/platforms/qiankunMonitorClient.mjs`，新增 `queryPackagesByVest({ ownerKey, vestId, os })`。
- 扩展现有 Skill `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增 `vest_to_package` 同步能力。
- 扩展现有 CLI `scripts/monitor-provision-cli.mjs` 的 mode 分发。
- 新增长期 npm 命令 `monitor:sync:vest-package`。
- 写入脱敏证据 `artifact_type=qiankun_vest_package_readonly`。
- 更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，补充真实链路 `cate_id=122 -> vest_id=1414 -> package_id=真实返回值`。

## 非目标

- 不新增表、不新增 migration。
- 不修改 `cate_to_vest` 当前状态。
- 不创建完整 `qiankun_monitor_configs` 记录。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 真实写入分支。
- 不调用 OceanEngine `std_project/create`。
- 不上传素材、不创建事件资产、不推送 DMP、不修改预算/出价。
- 不刷新 token。
- 不新增第二套乾坤 Client。
- 不新增第二个同步 Skill。
- 不保存 `X-Passport-Token`、raw request、raw response、access token、Cookie、完整 callback URL 或完整点击监测 URL。

## 权限

允许的外部接口仅限：

```text
POST /tf/ad/changeVestId
```

允许写入：

```text
mwb.qiankun_option_relations
mwb.evidence_artifacts
```

平台写入保持关闭。

## 验收

- `/tf/ad/changeVestId` 只读调用成功或返回明确脱敏错误。
- 全部有效拿包逐行写入现有关系表，重复执行不生成重复记录。
- 明确报告 `package_id=36820` 是否命中。
- `monitor_provision_attempts` 仍只有第一次创建记录。
- 不调用 `/tf/ad/monitorSerialNumberAdd` 或 `monitor:ensure` 写入分支。
- HTML 标注来源接口、底层表、`package_id=36820` 命中状态和关系状态 `observed`。
- 更新任务卡、context manifest 和 `project.state.json`。
- 下一步 Gate 为接口 5 `/tf/ad/changePackageId`，读取已命中拿包的完整基础信息。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已核对官方接口片段，确认 `/tf/ad/changeVestId` 为只读下拉查询，`os=3` 支持微信小游戏。
- 已评估该需求可作为 `cate_to_vest` 后的第二个小步推进。
- 已扩展 `src/platforms/qiankunMonitorClient.mjs`，新增只读方法 `queryPackagesByVest()`。
- 已扩展现有 `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，新增 `vest_to_package` 同步能力，未新增第二个 Skill。
- 已通过 `npm run monitor:sync:vest-package` 接入长期 CLI。
- 已调用 `/tf/ad/changeVestId` 完成真实只读同步，返回 22 个 package，历史候选 `package_id=36820` 命中。
- 已写入 22 条 `vest_to_package` 关系，状态均为 `observed`，重复执行后仍为 22 个 distinct child。
- 已写入脱敏证据 `EV-QK-VEST-PACKAGE-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1414-3`，`artifact_type=qiankun_vest_package_readonly`。
- 已确认 `monitor_provision_attempts` 对目标 provision 仍只有 `attempt_no=1`。
- 已更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，补充 `cate_id=122 -> vest_id=1414 -> package_id=36820` 真实链路。

## 验证结果

- `npm run monitor:sync:vest-package`：通过；`/tf/ad/changeVestId` 返回 `code=0`、`packageListCount=22`、`expectedPackageHit=true`。
- 重复执行 `npm run monitor:sync:vest-package`：通过；数据库仍为 22 个 distinct package。
- 数据库回查：`relation_count=22`、`distinct_child_count=22`、`expected_package_hit=true`。
- `monitor_provision_attempts` 回查：`attempt_count=1`、`attempt_nos=[1]`。
- `npm run test:monitor-bootstrap`：通过。
- `npm run smoke:api`：通过。
- `npm run smoke:workflow-skills`：通过。
- `node --check src/platforms/qiankunMonitorClient.mjs`：通过。
- `node --check src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`：通过。
- `node --check src/workflows/skills/oe3/monitor-provision.mjs`：通过。

## 关闭结论

本任务完成。当前只确认 `vest_to_package` 单跳关系为 `observed`；它不能单独证明完整乾坤监测配置可创建。下一步应继续拆分接口 5 `/tf/ad/changePackageId`，读取已命中拿包 `36820` 的完整基础信息。

# TASK-MWBV2-OE3-QIANKUN-CATE-VEST-READONLY-SYNC

状态：completed

更新时间：2026-08-26 CST

## 目标

将乾坤 `/tf/ad/changeCateId` 的“游戏组 + 系统 -> 马甲列表”只读查询拆成独立小任务：以 `route_id=oceanengine_3_byte_mini_game`、`game_code=JSZC`、`cateId=122`、`os=3` 作为当前待验证候选，读取返回的 `vestList`，规范化写入 v2 Postgres 的可复用关系表 `mwb.qiankun_option_relations`。

本任务只建立 `cate_to_vest` 单跳关系底座，不执行第二次 `monitor_id` 创建。

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权任何真实平台写入。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、本任务卡、context manifest、schema 和官方文档为准。

官方接口合同参考：

```text
docs/.参考文档/乾坤系统/api-docs-20260825.md
POST /tf/ad/changeCateId
os: 1=Android, 2=iOS, 3=微信小游戏, 4=鸿蒙
data.vestList[].value -> vest id
data.vestList[].label -> vest name
```

## 合理性评估

方向合理，且比已暂停的大底座任务更适合作为可执行小任务：

- 只读接口单一，权限边界清楚。
- `qiankun_option_relations` 作为关系事实表可复用，避免每个级联接口都新增一张专用表。
- `observed -> confirmed` 的状态规则能避免把单跳下拉结果误判为最终可创建配置。
- `cateId=122` 与 `os=3` 仍是待验证候选；接口成功只能证明该组合被乾坤接受并返回马甲，不能单独证明完整投放配置有效。

无阻塞疑问；按最小只读同步推进。

## 范围

- 新增 migration `db/023_add_qiankun_option_relations.sql`。
- 新增表 `mwb.qiankun_option_relations`，保存脱敏关系事实和证据 hash。
- 复用并扩展 `src/platforms/qiankunMonitorClient.mjs`，新增 `queryVestsByCate({ ownerKey, cateId, os })`。
- 新增 Skill `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`。
- 扩展现有 CLI `scripts/monitor-provision-cli.mjs`，新增 mode。
- 新增长期 npm 命令 `monitor:sync:cate-vest`。
- 同步成功后更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，标注真实返回中是否命中 `vest_id=1414`。

## 非目标

- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 真实写入分支。
- 不创建完整 `qiankun_monitor_configs` 记录。
- 不调用 OceanEngine `std_project/create`。
- 不上传素材、不创建事件资产、不推送 DMP、不修改预算/出价。
- 不刷新 token。
- 不新增第二套乾坤 Client。
- 不新增一次性临时请求脚本。
- 不保存 `X-Passport-Token`、raw request、raw response、access token、Cookie、完整 callback URL 或完整点击监测 URL。

## 权限

允许的外部接口仅限：

```text
POST /tf/ad/changeCateId
```

允许写入：

```text
mwb.qiankun_option_relations
mwb.evidence_artifacts
```

平台写入保持关闭。

## 验收

- `db/023_add_qiankun_option_relations.sql` 定义的表、唯一约束、状态约束和索引可应用。
- `queryVestsByCate()` 只允许调用 `/tf/ad/changeCateId`，返回脱敏摘要，不保存 raw response。
- Skill 能处理 `code != 0`、`data` 缺失、`vestList` 非数组、空列表、重复 `value`、缺失 label/value 和类型变化。
- 首次成功返回的关系写为 `validation_status=observed`。
- 重复同步时仍存在关系更新 `last_seen_at`，新关系新增，历史存在但本次消失的关系标记 `stale`；接口失败不修改已有有效记录。
- 证据写入 `artifact_type=qiankun_cate_vest_readonly`，只保存脱敏摘要、请求 hash 和响应 hash。
- 输出明确记录 `vest_id=1414` 是否命中。
- HTML 关系图标注 `cate --(os)--> vest`、来源接口、底层表、候选参数和命中状态，并修正“唯一新增实体表”相关表述。
- 验证命令完成，或外部凭据/网络阻塞被清楚记录。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已核对官方接口片段，确认 `/tf/ad/changeCateId` 为只读下拉查询，`os=3` 表示微信小游戏。
- 已评估该需求可作为暂停大任务后的第一小步推进。
- 已新增并应用 `db/023_add_qiankun_option_relations.sql`。
- 已新增 `mwb.qiankun_option_relations`，当前写入 1 条 `cate_to_vest` 关系：`cate_id=122`、`os=3`、`vest_id=1414`、`child_name=巨兽战场`、`validation_status=observed`。
- 已扩展 `src/platforms/qiankunMonitorClient.mjs`，新增只读方法 `queryVestsByCate()`。
- 已新增 `src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`，并通过 `npm run monitor:sync:cate-vest` 接入长期 CLI。
- 已写入脱敏证据 `EV-QK-CATE-VEST-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-122-3`，`artifact_type=qiankun_cate_vest_readonly`。
- 已更新 `docs/方案-乾坤与v2报表字段关系图_20260826.html`，将“一张配置表”调整为 `qiankun_option_relations` 底层关系表 + `qiankun_monitor_configs` 最终配置表，并标注 `vest_id=1414` 已命中。

## 验证结果

- `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/023_add_qiankun_option_relations.sql`：通过。
- `npm run monitor:sync:cate-vest`：通过；`/tf/ad/changeCateId` 返回 `code=0`、`vestListCount=1`，命中 `vest_id=1414`。
- 数据库回查：`relation_count=1`，`expected_vest_hit=true`，`child_names=["巨兽战场"]`。
- `npm run test:monitor-bootstrap`：通过。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过。
- `node --check src/platforms/qiankunMonitorClient.mjs`：通过。
- `node --check src/repositories/postgresRepository.mjs`：通过。
- `node --check src/workflows/skills/oe3/qiankun-option-relation-sync.mjs`：通过。
- `node --check src/workflows/skills/oe3/monitor-provision.mjs`：通过。
- `npm run check:runtime-consistency`：未完成；该脚本当前直接运行需要显式 job id，返回 `job_id_required`，不是本任务变更引入的阻塞。

## 关闭结论

本任务完成。当前只确认 `cate_to_vest` 单跳关系为 `observed`；它不能单独证明完整乾坤监测配置可创建。下一步应继续拆分并验证后续只读级联关系，例如 `vest_to_package`，再逐步形成完整 `qiankun_monitor_configs`。

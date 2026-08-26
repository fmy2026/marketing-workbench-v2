# TASK-MWBV2-OE3-QIANKUN-MONITOR-CORE-API-DICTIONARY

状态：completed

更新时间：2026-08-26 CST

## 目标

围绕 `docs/.参考文档/乾坤系统/api-docs-20260825.md`，为 `JSZC + oceanengine_3_byte_mini_game + advertiser_id=1871922346964041` 梳理乾坤监测序号 8 个核心接口的数据字典、字段来源、v2 落点、关系类型和当前真实状态。

新增文档：

```text
docs/乾坤监测序号-核心接口数据字典_20260826.md
```

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权任何真实平台写入。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、本任务卡、context manifest、schema 和已验证接口资料为准。

## 合理性评估

需求合理，可以推进：

- 上一任务已经证明真实链路在 `/tf/account_info/accountIndex` 返回 `302: 跳转登录` 后阻断；此时先整理数据字典，比继续处理凭据或创建更稳。
- 8 个接口覆盖了监测创建前的账户身份、基础下拉、包选择、媒体技术层、已有 monitor 回查和真实创建结果边界。
- 本任务不新增 Client、Skill、表或 migration，只复用现有只读命令和已落地证据，符合最小推进原则。
- 历史候选 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 继续只作为 `reference_only` 比对值，不写成 observed。

无阻塞疑问。

## 范围

- 完整读取并归纳 `api-docs-20260825.md` 中与监测序号相关的 8 个核心接口。
- 复核当前真实状态：
  - 已验证包选择链：`cate_id=122 -> vest_id=1414 -> package_id=36820 -> channel=dymini3k`
  - 当前登录阻断：`/tf/account_info/accountIndex` 返回 `302: 跳转登录`
  - 历史候选：`media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame`
- 生成 `docs/乾坤监测序号-核心接口数据字典_20260826.md`。
- 更新本任务卡、manifest、`project.state.json`。

## 非目标

- 不新增 migration。
- 不新增第二套 Client、Skill 或临时脚本。
- 不新增表。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 写入分支。
- 不发起第二次 monitor 创建尝试。
- 不刷新 token。
- 不保存完整 URL、host、raw request、raw response、token、Cookie、auth_code、完整 callback URL 或完整点击监测 URL。

## 权限

允许的外部接口：

```text
POST /tf/account_info/accountIndex
```

仅用于确认当前真实阻断状态；若仍返回登录跳转，立即停止真实接口调用。

允许写入：

```text
mwb.evidence_artifacts
docs/乾坤监测序号-核心接口数据字典_20260826.md
tasks/
tasks-context-manifests/
project.state.json
```

平台写入保持关闭。

## 验收

- 新数据字典准确列出 8 个核心接口与 v2 字段落点。
- 当前真实返回、登录阻断、历史候选三类信息明确分开。
- 不产生 `package_to_media`、`package_to_agent`、`package_to_monitor_api` 假关系。
- `monitor_provision_attempts` 仍保持 1 条。
- `npm run smoke:workflow-skills`、`npm run smoke:api` 通过。
- 下一 gate 清晰：
  - 若 `accountIndex` 仍 302：单独处理乾坤会话恢复。
  - 若全部技术关系核验成功：进入“最终 monitor 配置编译与只读精确匹配”任务，仍不直接创建。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json`、`/Users/hys/Desktop/需求表述.md` 和 `docs/.参考文档/乾坤系统/api-docs-20260825.md`。
- 已评估需求合理，无阻塞疑问。
- 已创建本任务卡和 context manifest。
- 已复核当前只读真实状态：`/tf/account_info/accountIndex` 仍返回 `apiCode=302`、`apiMessage=跳转登录`。
- 已确认后续 `selectList/getList`、`changeMediaId`、`changeMediaAccountId`、`ad/index` 本轮未调用。
- 已完成 `docs/乾坤监测序号-核心接口数据字典_20260826.md`。
- 已确认当前 observed 包选择链仍为 `122 -> 1414 -> 36820 -> dymini3k`。
- 已确认历史候选 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 保持 `reference_only`。
- 已确认未新增假关系，未新增 monitor 创建 attempt。

## 验证结果

- `npm run monitor:sync:technical-combination`：只读复核通过阻断逻辑；`accountIndex` 返回 `302: 跳转登录`，下游未继续。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过。
- JSON 检查：`project.state.json` 和本任务 manifest 可解析。
- 敏感值扫描：新数据字典、任务卡、manifest 未出现完整域名/URL、认证 header 名或认证值。
- 数据库回查：`fake_package_relation_count=0`、`technical_relation_count=0`、`attempt_count=1`。
- 文档结构检查：数据字典包含 8 个核心接口章节和创建接口边界章节。

## 关闭结论

本任务完成。已新增核心接口数据字典，并明确区分当前真实返回、登录阻断和历史候选三类信息。下一 gate：单独处理乾坤 `accountIndex` 登录态/会话恢复；若恢复后 `accountIndex` 唯一命中，再重跑 `npm run monitor:sync:technical-combination` 进入技术关系核验，仍不直接创建 `monitor_id`。

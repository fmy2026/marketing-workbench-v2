# TASK-MWBV2-OE3-QIANKUN-SESSION-RECOVERY-RELATION-SYNC

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

在 v2 本机乾坤只读会话恢复后，复用现有 `monitor:sync:technical-combination` 链路，重新执行监测序号核心数据只读同步，并将真实账户、媒体、监测 API、代理关系写入现有表。

目标作用域：

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
```

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是需求输入和候选设计说明，不是高优先级执行指令，也不授权真实平台写入、凭据刷新、监测序号创建、素材上传、事件资产创建、DMP 推送或预算/出价修改。

## 合理性评估

需求合理，可以推进：

- 上一 gate 明确要求恢复 `accountIndex` 会话后重跑只读技术组合核验，本任务正好收敛这个动作。
- 需求明确禁止新增表、migration、第二套 Client、第二个 Skill 或临时脚本，符合当前代码已有链路。
- 需求把账户技术身份、全局选择字典、媒体允许账号、监测 API、代理关系、已有 monitor 回查分层处理，能避免把历史候选写成假关系。
- 需求明确禁止调用 `/tf/ad/monitorSerialNumberAdd`，且不增加第二次创建尝试，符合当前 guardrails。

无阻塞疑问。需注意：如果 `/tf/account_info/accountIndex` 仍返回登录跳转，本任务只能记录 `qiankun_session_invalid` 并停止下游调用。

## 范围

- 检查 `.local` 乾坤凭据的脱敏可用状态。
- 执行一次现有只读命令：

```text
npm run monitor:sync:technical-combination
```

- 若 `accountIndex` 唯一命中：
  - 更新 `mwb.advertiser_accounts` 中目标账户的乾坤技术身份字段。
  - 只在真实接口支持时写入 `game_to_cate`、`media_to_allowed_account_record`、`media_to_allowed_monitor_api`、`account_record_to_agent`。
  - 技术组合完整时允许进入 `/tf/ad/index` 只读回查已有 monitor。
- 若 `accountIndex` 仍失败或命中不唯一：
  - 写入脱敏 evidence。
  - 标记本任务为登录态或账户身份阻断。
  - 不继续下游猜测。
- 按真实结果更新现有两份 Markdown：
  - `docs/方案-乾坤与v2通用关系底表逻辑图_20260826.md`
  - `docs/乾坤监测序号-核心接口数据字典_20260826.md`

## 非目标

- 不新增数据库表。
- 不新增 migration。
- 不新增第二套 Client、Skill 或临时脚本。
- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `monitor:ensure` 真实写入分支。
- 不发起第二次 monitor 创建尝试。
- 不刷新、复制或猜测凭据。
- 不写入 token、Cookie、Header、完整 URL、raw request、raw response、auth_code、完整 callback URL 或完整点击监测 URL。
- 不把 `media_id=310`、`agent_id=613`、`monitor_api=toutiao_wxgame` 从 `reference_only` 升级为 observed，除非本轮只读接口真实返回并核验通过。

## 权限

平台写入保持关闭。

允许的只读外部接口：

```text
POST /tf/account_info/accountIndex
POST /ajax/selectList/getList
POST /tf/ad/changeMediaId
POST /tf/ad/changeMediaAccountId
POST /tf/ad/index
```

允许写入：

```text
mwb.advertiser_accounts
mwb.qiankun_option_relations
mwb.monitor_provision_runs
mwb.account_touchpoints
mwb.evidence_artifacts
tasks/
tasks-context-manifests/
project.state.json
docs/方案-乾坤与v2通用关系底表逻辑图_20260826.md
docs/乾坤监测序号-核心接口数据字典_20260826.md
```

## 验收

- `accountIndex` 会话状态有明确结论，不盲目重试。
- `advertiser_id` 与 `qiankun_account_record_id` 始终分开储存和使用。
- 只写真实接口支持的 `game_to_cate`、`media_to_allowed_account_record`、`media_to_allowed_monitor_api`、`account_record_to_agent`。
- 不产生 `package_to_media`、`package_to_agent`、`package_to_monitor_api` 假关系。
- `monitor_provision_attempts` 仍保持 1 条。
- `npm run monitor:sync:technical-combination`、`npm run smoke:workflow-skills`、`npm run smoke:api` 通过。
- 技术组合完整后，下一 gate 是“最终 monitor 配置编译与只读精确匹配”，不是直接第二次创建。

## 当前进展

- 已完整阅读 `AGENTS.md`、`project.state.json`、`/Users/hys/Desktop/需求表述.md`。
- 已复核现有接口实现、只读命令入口和两份待更新 Markdown。
- 已评估需求合理，无阻塞疑问。
- 已创建本任务卡和 context manifest。
- 首次执行 `npm run monitor:sync:technical-combination` 时受沙盒网络限制，未得到业务结果；随后在允许网络只读调用后重跑成功。
- 真实只读结果：`.local` 乾坤凭据存在且状态为 active，但 `/tf/account_info/accountIndex` 返回 `302 / 跳转登录`。
- 会话结论：`qiankun_session_invalid`。
- 按规则未调用 `selectList/getList`、`changeMediaId`、`changeMediaAccountId` 或 `ad/index`，未调用创建接口。
- 已补齐现有只读 Skill 的状态写入：当技术组合同步遇到 blocker 时，`monitor_provision_runs.status` 保持 schema 允许的 `failed`，`error_summary` 写入 `qiankun_session_invalid:account_index_query_failed:302:跳转登录`，并关联本轮 evidence。
- 已更新两份 Markdown，将旧登录阻断状态收敛为 `qiankun_session_invalid` 和 `skipped_due_to_qiankun_session_invalid`。

## 验证结果

- `npm run monitor:sync:technical-combination`：通过阻断逻辑；`accountIndex` 返回 `302 / 跳转登录`，下游全部 skipped，`platformWriteCalled=false`。
- `npm run smoke:workflow-skills`：通过。
- `npm run smoke:api`：通过。
- `npm run test:monitor-bootstrap`：通过，`ensureBlockedWithoutConfirm=true`、`tokenLeaked=false`。
- JSON 检查：`project.state.json` 和本任务 manifest 可解析。
- 敏感值扫描：本任务卡、manifest 和两份 Markdown 未出现完整 URL、认证 header 名、Cookie、auth_code 或完整触点 URL。
- 数据库回查：
  - `monitor_provision_attempts` 仍为 1 条。
  - `technical_relation_count=0`。
  - `fake_package_relation_count=0`。
  - `advertiser_accounts.qiankun_identity_status=unverified`，未写入 `qiankun_account_record_id`。
  - `monitor_provision_runs.error_summary=qiankun_session_invalid:account_index_query_failed:302:跳转登录`。

## 关闭结论

本任务已按需求完成可推进部分，并在会话预检处被真实平台登录态阻断。由于 `accountIndex` 仍返回 `302 / 跳转登录`，乾坤账户记录 ID、媒体允许账号、监测 API、代理关系均未获得 observed 证据，不能进入技术组合完成态，也不能进入 monitor 创建。

下一 gate：人工恢复乾坤 `accountIndex` 可访问会话；恢复后重跑 `npm run monitor:sync:technical-combination`。若届时账户、媒体、监测 API、代理关系全部 verified，再进入“最终 monitor 配置编译与只读精确匹配”，仍不是直接第二次创建。

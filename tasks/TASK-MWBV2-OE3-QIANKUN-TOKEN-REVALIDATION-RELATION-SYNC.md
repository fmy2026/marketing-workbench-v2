# TASK-MWBV2-OE3-QIANKUN-TOKEN-REVALIDATION-RELATION-SYNC

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

用户已在本机私密凭据中人工更新乾坤 token。重新执行既有技术组合同步，验证 `accountIndex` 是否恢复；若成功，沿用既有只读链路落地真实账户、媒体、监测 API 与代理关系。

目标作用域：

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
```

## 合理性评估

合理，可以推进：上一个任务已在 `accountIndex` 登录态阻断处关闭；本次人工更新 token 后，重跑既有只读命令正是其下一 gate。客户端请求与技术文档一致，`accountId`、`pageNo`、`pageSize` 均已正确传递，认证 token 经私密请求头传递。

无阻塞疑问。若仍返回非成功状态，立即停止下游调用，不进行盲目重试。

## 范围

- 执行一次 `npm run monitor:sync:technical-combination`。
- 若 `accountIndex` 唯一命中，复用现有代码写入真实的账户身份和允许关系。
- 回查内部数据库、evidence 与创建尝试计数。
- 根据真实结果更新任务卡、manifest 与 `project.state.json`。

## 非目标与权限

- 不刷新 token，不读取、复制、打印或写入 token、Cookie、原始请求/响应。
- 不调用监测序号创建接口，不触发第二次创建尝试。
- 不新增表、migration、Client、Skill 或临时脚本。
- 仅允许现有只读链路中的账户、选择列表、媒体与监测列表查询。
- 内部允许写入既有的账户身份、关系事实、运行状态及脱敏 evidence 表。

## 验收

- `accountIndex` 有明确结论，且最多执行一次。
- 成功时只落库真实观察到的关系；失败时下游保持 skipped。
- 不产生 `package_to_media`、`package_to_agent`、`package_to_monitor_api` 假关系。
- `monitor_provision_attempts` 保持 1 条。
- 不触发任何平台写入。

## 当前进展

- 已读取启动状态、上一任务及其 context manifest。
- 已确认用户已人工更新本机私密 token。
- 已建立本任务及 context manifest，准备执行一次只读复核。
- 已执行唯一一次 `npm run monitor:sync:technical-combination`。
- `accountIndex` 成功唯一命中；账户记录 ID、归属人与账户侧代理 ID 已写入 `advertiser_accounts`，状态为 `observed`。
- `cateList` 成功唯一返回 `cate_id=122`，已写入 `game_to_cate`。
- `mediaList` 成功返回 177 项，但历史 `media_id=310` 未返回；因此未调用 `changeMediaId`、`changeMediaAccountId` 或 `ad/index`。
- 未产生平台写入，`monitor_provision_attempts` 仍为 1。

## 关闭结论

本次 token 更新已恢复 `accountIndex` 会话，原登录态卡点解除。技术组合仍未完成的唯一原因是历史媒体候选 `310` 不再是当前可选项。下一 gate：由业务或乾坤技术侧确认当前适用的媒体 ID，再新建只读任务核验媒体允许账户、监测 API 与代理关系；仍不创建监测序号。

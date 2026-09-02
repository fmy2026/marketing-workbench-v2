# TASK-MWBV2-CASE-TERMINAL-HTTP-DEADLINE-20260902

状态：completed

更新时间：2026-09-02 15:07 CST

## 授权来源

用户于 2026-09-02 批准“Case、Job、Execution Plan 终态一致性与统一 HTTP Deadline 最小修复方案”并要求直接实施。

## 唯一目标

修复已确认 Create Plan 在 action 后残留为 `ready` 的终态不一致，并为所有生产平台 HTTP 请求建立唯一 deadline；保持现有 3 阶段 7 Node、公开 API、Plan/Gate 类型与平台权限模型不变。

## 范围

- 已确认 Create Plan：成功保持 `ready → waiting_readback → consumed`；明确失败或结果不明在只读回查后收口为 `consumed`。
- 仅结果不明且严格 verified readback 命中的 create action 可由回查确认成功；明确 API 失败不得转换为成功。
- migration `068` 只修正既有证据可确定的 Plan/Case 元数据与 `workflow_case_summary` 的非活动生命周期投影；不删除或伪造动态事实。
- 唯一 HTTP deadline：普通 JSON 15 秒、上传 60 秒、Node 07 整轮 25 秒，保留 `0/3/5/8/10` 秒回查起点；无自动重试。
- 同步稳定文档、逻辑图 Markdown/JPG、数据契约与 AGENTS 元信息。

## 非目标

- 真实平台写入、确认消费、创建或重试；不得发起任何真实外部平台请求。
- 新建公开 API、数据库表、Plan 状态、Gate、Node 或后台任务。
- 修改历史 Node/Skill 执行记录、伪造 action/object/readback/confirmation，或重新激活非活动 Case。
- 保存 token、Cookie、完整 URL、raw payload 或 raw response。

## 验收

- action 已产生的 confirmed Create Plan 不再为 `ready`；正常未确认活动 Plan 不变。
- 非活动 Case 不暴露确认、重试或执行入口；已验证完成 Case 保持完成 Gate。
- 假传输证明 deadline abort、timer 清理、无重试、Node 07 最长 25 秒。
- 结果不明仅可被严格 verified readback 恢复；明确失败不可恢复。
- Execution Plan、Case、readback、资源、Monitor、工作台与数据库契约回归通过；migration 可重复运行。

## 停止条件

- 需要新的平台请求、确认、action、Job 或重新打开任何 Case。
- 需要弱化项目 ID 与最新 Draft 名称的权威 readback 条件。
- migration 目标缺少可验证的既有证据或会修改历史 action/object/readback/confirmation 内容。

## 完成记录

- `068` 已事务应用并二次执行验证幂等：运行态 `ready + action = 0`，非活动 Case 不再投影确认/重试/执行 Gate，`root_blocker_codes` 长度仍为零或一。
- 统一 JSON 15 秒、上传 60 秒、Node 07 整轮 25 秒 deadline 已覆盖生产 HTTP 调用；无自动重试。
- 明确失败停止回查并收口；结果不明仅在项目 ID 与最新 Draft 名称的严格回查命中后恢复为成功。
- 已完成 focused deadline、readback、Execution Plan、execution grant、Case、Monitor、资源 executor、工作台、Schema、API 与数据库契约回归；全部本地 fake-transport / Postgres fixture，无真实平台调用。

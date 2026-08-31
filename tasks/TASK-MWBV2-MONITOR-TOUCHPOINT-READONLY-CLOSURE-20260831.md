# TASK-MWBV2-MONITOR-TOUCHPOINT-READONLY-CLOSURE-20260831

状态：completed

## 目标

修复 Node 02 monitor fresh readonly reconcile 对受控触点的完成判定、Case 根阻断投影和工作台回查文案；不调用任何平台写接口。

## 范围

- 只读 monitor 查询请求受控触点，并把它仅写入既有受控 Postgres 字段。
- 写后以既有触点完整性校验确认 URL 存在且 hash 一致；未通过时保持触点待回查。
- 让 `workflow_case_summary` 在 `run_monitor_readonly` 下消费 canonical actionable blocker。
- 让工作台成功文案以刷新后的 `monitor_ready` 为唯一依据，补充 focused smoke。

## 禁止

- monitor、资源、广告项目、预算/出价平台写入或 token refresh。
- 创建 Plan、confirmation、action grant、自动重试，或改写历史 attempt/Plan。
- 在项目文件、普通日志、API、工作台或 evidence 保存完整触点 URL、凭证、raw request 或 raw response。

## 验收

- URL 与 hash 完整性校验通过后才为 READY；hash-only 状态不得误报完成。
- `run_monitor_readonly` 的唯一根阻断为 canonical `touchpoint_url_missing`，不回退为历史 `monitor_id_missing`。
- 工作台未完成时不再显示“已确认 monitor 与受控触点”。
- monitor 创建调用数为 0，`test_run` 清零。

## 执行结果

- Node 02 readonly reconcile 读取受控触点、写入既有受控字段后执行 hash 完整性回查；只有回查通过才写入 `touchpoint_resolved`。
- hash-only 或 hash 不一致状态统一收口为 `monitor_resolved_touchpoint_pending`，并保留可行动触点 blocker。
- `workflow_case_summary` 在 monitor readonly Gate 直接取 canonical blocker；monitor READY 后不再选择旧的 Node 02 monitor/touchpoint Skill blocker。
- 工作台成功文案读取刷新后的 canonical `monitor_resolved`，不再根据临时 run status 误报成功。

## 验证

`test:monitor`、`test:workbench-conversation`、`test:workflow-case`、`smoke:api`、`validate:schemas`、`db:contract-check` 与 `git diff --check` 均通过。单次 fresh readonly reconcile 已验证 monitor 与受控触点，且不触发平台创建；`test_run=0`、`/tf/ad/monitorSerialNumberAdd` 平台动作数为 0。

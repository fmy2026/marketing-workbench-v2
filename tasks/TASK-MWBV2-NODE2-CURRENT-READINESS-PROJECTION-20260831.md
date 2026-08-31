# TASK-MWBV2-NODE2-CURRENT-READINESS-PROJECTION-20260831

状态：completed

## 目标

使最新 Case 的 Node 02 账户状态、触点引用和 monitor 统一反映当前受控真值，同时保留历史 Job 的 Skill 取证；不改变 Case Gate 或平台权限。

## 范围

- 最新 Case 中，账户状态取当前账户可用性；触点与 monitor 取 canonical monitor readiness。
- `?job_id=` 保留历史 Skill 状态；公共 trace 保留旧结果但不覆盖当前子项状态。
- 增加 focused 回归，确认历史 blocker 不能把当前 READY 显示为红灯。

## 禁止

- 改写历史 Node、Skill、Case、Plan、confirmation 或平台动作事实。
- 触发 monitor、资源、广告项目创建或 token refresh。
- 输出完整触点 URL、凭证或 raw 请求/响应。

## 验收

- 最新 Case 的当前账户、触点和 monitor READY 时，三个子项均为通过。
- 历史 Job 查看仍展示自身历史 Skill 快照。
- Gate 和唯一 root blocker 不变；所有测试与 smoke 的平台写入数为零。

## 执行结果

- 最新 Case 的账户状态改为当前账户可用性，触点引用与 monitor 改为 canonical monitor readiness；历史 Skill 结果仍附在 trace。
- `?job_id=` 通过 history presentation 读取历史 Skill 状态，后续 reconcile 不覆盖该视图；`?case_id=` 继续读取最新 Case 的当前 readiness。
- 未改写 Node/Skill/Case/Plan 等历史运行事实，未增加平台动作、确认或 action grant。

## 验证

`test:monitor`、`test:workflow-case`、`test:workbench-conversation`、`smoke:api`、`validate:schemas` 和 `git diff --check` 均通过；smoke 后 `test_run=0`。

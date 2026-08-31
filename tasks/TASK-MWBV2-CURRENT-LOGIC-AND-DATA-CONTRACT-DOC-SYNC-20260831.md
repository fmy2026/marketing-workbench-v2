# TASK-MWBV2-CURRENT-LOGIC-AND-DATA-CONTRACT-DOC-SYNC-20260831

状态：completed

创建时间：2026-08-31 17:30 CST

## 目标

按当前代码、Postgres Schema/View 和 Case Gate 重写两份静态底层文档，并为每份文档记录可复核的更新时间和有效性基线。

## 范围

- 更新 `docs/project-现在的逻辑图.md`。
- 更新 `docs/project-数据与报表契约.md`。
- 记录本次验证结果并在完成后关闭任务。

## 非目标

- 不修改 `src/`、`db/`、`frontend/`、API 或运行语义。
- 不执行平台读写、资源准备、项目创建、预算/出价修改或 OAuth 刷新。
- 不写入业务 Case、Job、Plan、资源或报表事实。
- 不在文档保存动态账户 ID、token、Cookie、完整 URL、raw payload/request/response。

## 验收

- 两份文档均有更新时间、Git/Schema/migration/数据库基线、权威来源和失效条件。
- 逻辑图覆盖 7 Node、资源三态、Plan/确认/回查 Gate、Case/Job 工作台读取边界。
- 数据契约覆盖实际 33 张表与 4 个 View，并说明 `workflow_case_summary` 的单一 Gate 合同。
- `npm run validate:schemas`、`npm run smoke:workflow-skills`、`npm run test:workflow-case`、`npm run test:workbench-conversation` 和 `git diff --check` 通过。

## 完成结果

- 两份文档已更新为精简逻辑图、契约表和引用边界，并记录 2026-08-31 17:37 CST 的更新时间与可复核基线。
- 文档完整覆盖 7 Node、8 类必需资源、6 个已确认资源动作、33 张基础表、4 个 View，以及 `workflow_case_summary` 的 24 列当前 Gate 合同。
- 未修改运行代码、Schema、View、API 或业务运行事实；无平台读写、资源准备、创建或 OAuth 刷新。

| 校验 | 结果 |
| --- | --- |
| 只读 Postgres 清单 | passed：33 张基础表、4 个 View |
| 节点/资源/动作静态校验 | passed：7 Node、8 资源、动作顺序一致 |
| `npm run validate:schemas` | passed；无真实平台写入 |
| `npm run smoke:workflow-skills` | passed；无真实平台写入或 token refresh |
| `npm run test:workflow-case` | passed；Case Gate 与历史 Job 隔离通过 |
| `npm run test:workbench-conversation` | passed；确认和历史只读边界通过 |
| 敏感/动态内容扫描 | passed：无长数字动态 ID 或完整 URL |
| `git diff --check` | passed |

完成时间：2026-08-31 17:37 CST

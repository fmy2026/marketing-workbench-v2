# TASK-MWBV2-OE3-P05-NESTED-FIELD-CONTRACT

状态：closed

更新时间：2026-08-29 CST

## Brief

修正 OE3 JSZC Node 5 已发送嵌套字段的路径级语义合同。所有当前实际发送的嵌套路径必须由同一合同模块校验来源、枚举、数量、长度和互斥关系；草稿、payload contract 与 create preflight 使用同一份脱敏摘要。

## Scope

允许：更新本地代码、测试、任务文件、context manifest、`project.state.json`、`docs/project-lessons.md`，以及新增一条只更新 `mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules` 的 Postgres 迁移。

禁止：真实平台写入、`std_project/create`、素材更新、锚点或组件写入、token refresh、预算或出价修改、新增表、View 或报表、保存 token、完整 URL、raw request、raw response 或完整 payload。

## Acceptance

- [x] JSZC 路线 `official_create_field_contract.nested_rules` 已记录当前实际发送嵌套字段合同。
- [x] Node 5 最终 manifest 写入脱敏 `nestedFieldContract` 摘要，且不保存完整 payload 或 URL。
- [x] payload contract 与 create preflight 均要求 `nestedFieldContract` 通过。
- [x] 正反例覆盖视频、商品、CTA、锚点、小游戏链接、追踪、定向和品牌嵌套字段。
- [x] Fresh runtime-truth Job 仅执行 Node 1-5，且平台写入计数为零。

## Result

已完成。

| 项 | 结果 |
| --- | --- |
| 路线合同迁移 | `db/048_jszc_nested_create_field_contract.sql` 已应用，更新 1 行路线配置。 |
| 共享模块 | 新增 `src/workflows/skills/oe3/05-nested-field-contract.mjs`，由 Node 5、payload contract 与 create preflight 共用。 |
| Manifest | fresh 草稿写入 `nestedFieldContract.status=passed`、`checkedPathCount=19`、`blockerCount=0`，且 `rawPayloadStored=false`。 |
| Fresh runtime job | `JOB-MWBV2-20260829135558-B4DCB0`，停在 Node 5，`payloadContractStatus=passed`、`createPreflightStatus=passed`、blockers 为空。 |
| 写入审计 | `drafts=1`、`executionPlans=0`、`launchConfirmations=0`、`platformActions=0`、`createdObjects=0`、`readbacks=0`。 |

## 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --check` changed modules | passed |
| `psql -X -d marketing_workbench_v2 -f db/048_jszc_nested_create_field_contract.sql` | passed |
| `npm run test:payload-contract` | passed |
| `npm run test:mini-game-launch-link` | passed |
| `npm run smoke:workflow-skills` | passed |
| `git diff --check` | passed |

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户确认的“问题五：Node 5 已发送嵌套字段的路径级语义合同”方案；排查文档 `docs/.问题排查/3.0项目创建排查对比/v2项目创建失败原因排查-20260828.md` |
| objective | 让当前 JSZC Node 5 已发送嵌套字段具备同一套官方合同校验与脱敏审计摘要。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、当前 Task/Manifest、当前代码与本机官方 3.0 创建文档。 |
| stop condition | 任一字段缺少官方合同、资源只读证据或路线条件不满足时停止在 Node 5；禁止调用创建接口。 |

## Progress

- [x] 创建 Task 与 Context Manifest。
- [x] 新增共享嵌套字段合同模块。
- [x] 接入 Node 5 payload、payload contract 与 create preflight。
- [x] 新增 JSZC 路线 nested_rules 迁移。
- [x] 更新 `project-lessons.md` 的 Node 5 经验。
- [x] 应用迁移并运行验证。
- [x] 创建 fresh runtime-truth Job 到 Node 5。
- [x] 关闭任务。

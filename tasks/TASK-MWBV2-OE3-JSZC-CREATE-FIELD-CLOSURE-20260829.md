# TASK-MWBV2-OE3-JSZC-CREATE-FIELD-CLOSURE-20260829

状态：closed

更新时间：2026-08-29 CST

## Brief

收口 JSZC 标准项目创建字段：当前路线保留 `MICRO_GAME + BYTE_GAME + mini_program_info.url` 主链路，默认省略备用网页链接，把外链省略、空图片列表和静态开关来源统一纳入既有 Node 5 嵌套字段合同。

## Scope

允许：更新本地代码、测试、任务文件、context manifest、`project.state.json`、`docs/project-lessons.md`，以及新增一条只更新 `mwb.game_route_defaults.raw_defaults` 的 Postgres 迁移。

禁止：真实平台写入、`std_project/create`、素材更新、锚点或组件写入、token refresh、预算或出价修改、新增表、View 或报表、保存 token、完整 URL、raw request、raw response 或完整 payload。

## Acceptance

- [x] JSZC 路线合同声明 `project_materials.external_url_material_list=omit`，`project_materials.image_material_list=[]`。
- [x] Node 5 当前 JSZC payload 不生成 `external_url_material_list`，且静态开关来自路线默认值。
- [x] payload contract 与 create preflight 均要求同一 nested contract 摘要通过，并能识别外链省略与空图片列表。
- [x] 回归测试覆盖外链误发、图片误发、静态开关缺失/非法枚举。
- [x] Fresh runtime-truth Job 仅执行 Node 1-5，且平台写入计数为零。

## Result

已完成。

| 项 | 结果 |
| --- | --- |
| 路线合同迁移 | `db/049_jszc_create_field_closure.sql` 已应用，更新 1 行路线配置。 |
| Node 5 payload | 当前 JSZC 不生成 `external_url_material_list`；`image_material_list=[]`；`layer_roi_switch`、`aigc_dynamic_creative_switch`、`is_comment_disable`、`track_url_setting.send_type` 从路线默认读取。 |
| 嵌套合同 | `nestedFieldContract.ruleVersion=2026-08-29.oe3-std-project-create-nested-fields-v2`，覆盖 21 条检查，blocker 为 0。 |
| Fresh runtime job | `JOB-MWBV2-20260829143207-D208AE`，`draft_ready`，Node 5，payload contract 与 create preflight 均 passed。 |
| 写入审计 | `drafts=1`、`launchExecutionPlans=0`、`launchConfirmations=0`、`platformActions=0`、`createdObjects=0`、`readbacks=0`。 |

## 变更清单、依据与验证层级

本节用于后期真实创建前回溯。结论分为三类：`local_verified` 表示代码/测试已验证；`fresh_readiness_verified` 表示 fresh runtime truth job 的 Node 1-5 已验证；`not_real_create_verified` 表示尚未经过真实 `std_project/create` 平台写入验证。

| 变更点 | 修改内容 | 依据 | 已验证 | 未验证 / 还原点 |
| --- | --- | --- | --- | --- |
| 备用网页链接默认省略 | 当前 JSZC 路线在 `official_create_field_contract.nested_rules.groups.project_materials.external_url_material_list` 中记录 `send_policy=omit`；Node 5 不生成该字段。 | 官方 `std_project/create` 仅标注 `external_url_material_list` 为条件必填，未证明 `MICRO_GAME + BYTE_GAME + mini_program_info.url` 场景必须发送；历史成功项目未发送；用户确认默认省略。 | `local_verified`：误发外链会被 nested contract / preflight 阻断；`fresh_readiness_verified`：最新草稿 manifest 显示 policy `omit`、present `false`。 | `not_real_create_verified`：尚未真实调用 `std_project/create` 证明平台接受省略。若平台后续明确要求发送，回退点是将本路线 nested rule 改为 `send`，并恢复备用落地页 ready 作为 Node 5 blocker。 |
| 备用落地页资源与创建字段解耦 | 保留 `backup_landing_page` 资源模块和只读经验，但当前 JSZC 创建字段不因资源 ready 就自动发送外链。 | `docs/Solution Design.md` 的机制：资源事实、路线合同、payload 字段三者分层；资源通过不替代字段发送条件。 | `local_verified`：Node 5 只有 nested rule 为 `send` 时才要求 backup landing page；`fresh_readiness_verified`：latest fresh job 无 backup landing page blocker。 | `not_real_create_verified`：真实创建后若平台返回外链相关字段错误，需新增单独修正任务，不直接复用旧 job。 |
| 图片素材列表固定为空 | 当前 JSZC 保留 `project_materials.image_material_list=[]`，并纳入 nested contract。 | 当前素材主链路为视频素材、标题素材和产品图；没有官方/路线证据要求普通图片素材。 | `local_verified`：空数组通过，非空图片列表被 Node 5 / preflight 阻断；`fresh_readiness_verified`：manifest 显示 `imageMaterialListEmpty=true`。 | `not_real_create_verified`：真实创建尚未证明空数组与省略之间的平台差异；如平台要求省略而非空数组，需单独调整该字段策略。 |
| 嵌套合同升级 v2 | `NESTED_FIELD_CONTRACT.ruleVersion` 从 v1 升至 v2，新增外链省略和图片空数组两类检查，检查数为 21。 | 问题五要求所有已发送/受控省略嵌套路径共用同一合同模块，避免 Node 5、payload contract、create preflight 漂移。 | `local_verified`：payload contract、mini-game launch link smoke、workflow smoke 均通过；`fresh_readiness_verified`：fresh job `checkedPathCount=21`、`blockerCount=0`。 | 旧 job 的 v1 manifest 不应视为新机制通过；后期回溯以 v2 ruleVersion 为准。 |
| 静态开关改为路线默认来源 | `layer_roi_switch=OFF`、`aigc_dynamic_creative_switch=OFF`、`is_comment_disable=OFF`、`track_url_setting.send_type=SERVER_SEND` 写入 `payload_defaults`，Node 5 从 DB route defaults 读取。 | 保持字段来源唯一清晰，避免 Node 5 硬编码形成第二套业务默认值。 | `local_verified`：缺失/非法枚举会产生 config/preflight blocker；DB 查询确认 4 个值已在 route defaults。 | `not_real_create_verified`：真实平台尚未验证这些组合值；若平台返回枚举/条件错误，优先查官方合同和路线默认，而不是改 Node 5 硬编码。 |
| 文档同步 | `docs/project-lessons.md` 已记录当前 JSZC 外链省略、图片空数组、静态开关来源，以及备用落地页资源边界。 | Markdown 只沉淀可复用机制经验，不保存动态账户/job/raw payload。 | `local_verified`：文档与 Task、迁移、代码口径一致。 | 文档不作为动态运行真值；真实状态仍以 Postgres、当前 Task/Manifest、代码和官方资料为准。 |

## 回溯查询

| 目的 | 查询 / 文件 |
| --- | --- |
| 查看路线当前合同 | `SELECT raw_defaults #> '{official_create_field_contract,nested_rules}' FROM mwb.game_route_defaults WHERE route_id='oceanengine_3_byte_mini_game' AND game_code='JSZC';` |
| 查看静态默认值 | `SELECT raw_defaults #> '{payload_defaults,strategy}', raw_defaults #> '{payload_defaults,track_url_setting}' FROM mwb.game_route_defaults WHERE route_id='oceanengine_3_byte_mini_game' AND game_code='JSZC';` |
| 查看 fresh job 状态 | `SELECT latest_job_id, latest_job_status, latest_current_node, blocker_codes, current_gate FROM mwb.workflow_case_summary WHERE case_id='CASE-LEGACY-2E4217E20C9E26BFB648772C';` |
| 查看实现入口 | `src/workflows/skills/oe3/05-payload.mjs`、`05-nested-field-contract.mjs`、`05-payload-contract.mjs`、`05-create-preflight-diagnostics.mjs` |
| 查看迁移还原点 | `db/049_jszc_create_field_closure.sql` |

## 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --check` changed modules | passed |
| `psql -X -d marketing_workbench_v2 -f db/049_jszc_create_field_closure.sql` | passed |
| `npm run test:payload-contract` | passed |
| `npm run test:mini-game-launch-link` | passed |
| `npm run smoke:workflow-skills` | passed |
| fresh `draft_readiness` job audit | passed |
| `git diff --check` | passed |

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户确认的“JSZC 创建字段收口：变更点与依据清单”方案。 |
| objective | 让当前 JSZC 创建草稿只发送有明确路线合同和官方依据的字段，省略未证明必发的备用网页链接。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、当前 Task/Manifest、当前代码、本机官方 3.0 创建文档与 `docs/Solution Design.md`。 |
| stop condition | 任一字段缺少官方合同、路线条件不满足、fresh job 出现 blocker 或需要真实平台写入时停止，不调用创建接口。 |

## Progress

- [x] 创建 Task 与 Context Manifest。
- [x] 新增 JSZC 路线合同迁移。
- [x] 更新 Node 5 payload 构建与 manifest。
- [x] 更新 nested contract、payload contract、create preflight。
- [x] 更新 `project-lessons.md`。
- [x] 应用迁移并运行验证。
- [x] 创建 fresh runtime-truth Job 到 Node 5。
- [x] 关闭任务。

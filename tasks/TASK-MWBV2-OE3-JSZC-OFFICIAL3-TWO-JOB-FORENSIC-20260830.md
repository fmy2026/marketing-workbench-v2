# TASK-MWBV2-OE3-JSZC-OFFICIAL3-TWO-JOB-FORENSIC-20260830

状态：completed_readonly_forensic

更新时间：2026-08-30 CST

## 目标

按照 `docs/Solution Design.md` 的证据顺序，重建智擎版 3.0 创建合同，脱敏对照 P02 完整流程 Job 与历史模板 one-off Job，输出“共同主问题 + 分支问题”的可证伪定位，并冻结以 P02 为后续唯一基线的单变量验证规则。

本 Task 不执行 `std_project/create`，不新建业务 Case/Job，不修改既有两个 Job，不写 Postgres 业务事实。

## 固定对象

| 项 | 值 |
| --- | --- |
| P02 基线 Job | `JOB-MWBV2-20260830010824-488F0E` |
| 历史 one-off Job | `JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9` |
| 广告主 | `1871922346964041` |
| 路线 / 游戏 | `oceanengine_3_byte_mini_game` / `JSZC` |
| 官方主证据 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md` |
| 输出报告 | `docs/.问题排查/3.0项目创建排查对比/JSZC-官方3.0-双JOB-40000-问题定位-20260830.md` |

## 允许与禁止

允许：只读查询 Postgres、读取当前代码和官方 3.0 文档、调用官方只读接口形成不落库的即时安全摘要、增加独立诊断模块/CLI/fixture smoke、更新本 Task/Manifest/报告和 `project.state.json`。

禁止：任何平台写入、token refresh、数据库写入或迁移、修改既有 Job/Case/Draft/Plan/Action/Readback、修改 JSZC 路线默认或 Node 1–7、生成 fresh runtime Job、打开候选创建 scope，以及保存或输出 token、完整 URL、raw payload、raw request、raw response或完整 request ID。

## 工作项

- [x] 对齐官方字段表、官方 SDK 占位示例和优化目标只读接口的证据边界。
- [x] 对两个 Job 做确定性脱敏重编译和字段账本对照，验证 action/draft/wire hash 一致性。
- [x] 汇总既有只读证据；缺少独立 correctness 接口的项目保持 partial，不用重复 GET 冒充新证据。
- [x] 固化 P02 基线、候选选择决策树、单变量 diff allowlist 和停止条件。
- [x] 输出报告并完成安全、fixture、真实数据库只读和零写入回归验证。

## 验收

- 报告明确：两个 `40000` 不是单变量实验；本地 `landing_url_invalid` / `resource_not_eligible` 不是平台字段码。
- 历史 one-off 的直接合同偏差与 P02 的组合未知项分开呈现；不得把历史偏差迁移为 P02 根因。
- P02 字段账本及 wire hash 被验证为后续唯一基线；没有外部证据确认的替换值时，真实创建保持关闭。
- 诊断输出不包含 URL 字面量、凭据、raw body、完整 request ID；执行前后两个目标 Job 的审计计数不变。
- 不产生 platform action、confirmation、created object、readback、数据库结构或业务记录变化。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户批准的“JSZC 两次 40000 的重新定位与 P02 单变量验证方案”、`docs/Solution Design.md`、官方智擎版 3.0 create 文档。 |
| objective | 将共同失败面、历史分支硬偏差、P02 组合未知项和后续单变量验证边界拆开，以可重复安全证据替代猜测。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task/Manifest、当前代码、官方 3.0 文档与只读接口安全摘要。 |
| stop condition | 任一动作需要数据库/平台写入、修改路线合同、生成新 Job 或真实 create 时停止，必须另建 Task 并重新人工确认。 |

## 完成结果

- 输出：`docs/.问题排查/3.0项目创建排查对比/JSZC-官方3.0-双JOB-40000-问题定位-20260830.md`。
- P02 与历史 Job 的 Draft/Plan/Action hash 链均通过；两次均只有一条 create action、没有 created object，三次回查均未命中。
- P02 固化为未来唯一基线；历史 one-off 的 `advertiser_id` string wire 被确认为历史分支合同偏差，不迁移为 P02 根因。
- 当前候选状态为 `blocked_no_verified_single_variable`；未创建 corrective Case/Job，平台与数据库写入均为 0。
- P02 生命周期投影仍等待授权的问题登记为独立审计缺陷，不与 payload 候选实验捆绑。

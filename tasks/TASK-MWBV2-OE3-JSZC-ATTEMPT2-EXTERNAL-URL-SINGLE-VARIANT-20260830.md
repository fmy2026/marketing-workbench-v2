# TASK-MWBV2-OE3-JSZC-ATTEMPT2-EXTERNAL-URL-SINGLE-VARIANT-20260830

状态：closed_forensic_after_attempt_2_40000

更新时间：2026-08-30 CST

## 目标

为账户 `1871922346964041` 准备 JSZC 标准项目 Attempt 2。相对 Attempt 1，唯一受控业务字段变化是发送 `project_materials.external_url_material_list` 的一条已核验备用落地页；只完成合同、fresh Job/Draft/Plan 与只读预检准备，未获下一次精确确认前不得调用真实 create。

## 固定范围

| 项 | 值 |
| --- | --- |
| Case / Route / Game | `CASE-LEGACY-2E4217E20C9E26BFB648772C` / `oceanengine_3_byte_mini_game` / `JSZC` |
| 验证系列 / 序号 | `SERIES-MWBV2-JSZC-REAL-CREATE-20260829` / `2/3` |
| 目标账户 / 名称槽位 | `1871922346964041` / fresh reservation（当前为 `P02`，日期隔离序号） |
| 真实写接口 | `POST /open_api/v3.0/std_project/create/`，仅在下一次明确确认后一次 |
| 创建后回查 | `GET /open_api/v3.0/std_project/list/`，即时、10 秒、30 秒 |

## 合同

- `external_url_material_list` 策略为 `send`，且只能是 1 条受控 HTTPS 备用落地页。
- Node 5、payload contract、create preflight 同时要求：默认页 active、目标账户 visible、readback verified、readonly passed、URL hash 一致。
- 字段账本必须将该字段记录为 send，不能同时列为省略。
- 与 Attempt 1 的脱敏 diff 仅允许项目名、fresh 证据/hash 与本字段由 absent 变为单条 present；其他字段变化一律阻断。
- fresh corrective Job 与 Attempt 1 一样保留项目名 reservation；不得要求不存在的旧 draft 来提供固定 P11 名称。

## 允许与禁止

允许：任务/Manifest/状态文件、路线合同迁移、字段合同实现和测试；本地测试、迁移、fresh runtime-truth Node 1–5 与 execution plan。

禁止：真实 create（直到用户再次精确确认）、Promotion、素材/锚点/组件/事件资产/DMP 写入、预算或出价修改、token refresh，以及保存敏感凭据、完整 URL、raw payload/request/response。

## 验收与停止

- [x] send 分支只生成 1 条合格备用页；缺失、非 HTTPS、不可见、未回查、hash 不一致、多条或空数组都在 Node 5 阻断。
- [x] fresh Attempt 2 有新 Job、Draft、Plan、payload hash 和日期隔离项目名，且确认前平台写入审计全为 0。
- [x] 已输出精确人工确认对象；未确认不调用 create。

真实创建若成功，保留 send；若出现落地页错误、其他 `40000` 或未确认创建，不自动重试，关闭 scope，并仅经独立批准的补偿迁移恢复 omit。

## 已完成准备

| 项 | 值 |
| --- | --- |
| Job / Draft / Plan | `JOB-MWBV2-20260830010824-488F0E` / `DRAFT-JOB-MWBV2-20260830010824-488F0E-V2` / `PLAN-JOB-MWBV2-20260830010824-488F0E-V2` |
| 项目名 | `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P02_20260830` |
| payload / plan hash | `sha256:f2c98efc3a7279634e91501013c5009f7a39940d1aa03b6c78b0b8ce73eae104` / `sha256:eaed9940f8065b347630c1e32a127f6955f37bad0cefc81695f73e4c0fd8af80` |
| Node 1–5 / 合同 / 预检 / 查重 | `passed` / `passed` / `passed` / `platform_not_duplicate` |
| 字段 diff | 仅 `name`、`project_materials.external_url_material_list` 及其单条数组元素；无超范围路径。 |
| 写入审计 | confirmation、platform action、created object、readback 均为 `0`。 |

`P02` 是按创建日期隔离的 fresh reservation 序号；原先 P10/P11/P12 是 2026-08-29 的计划槽位，不可跨日期强制复用。

首次准备曾生成 `JOB-MWBV2-20260830005850-40C6E5`，但被本地项目名保护在 Node 5 前阻断；该 Job 没有 Draft、Plan、confirmation、platform action、created object 或 readback，且不计入验证系列。后续已修正 fresh corrective Job 的 reservation 逻辑并以本节所列 Job 重新准备。

用户首次确认后，`JOB-MWBV2-20260830010054-891309` 在真实 create 前的只读抖音授权探测发生瞬时 transport failure；Node 6 因此阻断，未产生 platform action、request ID、created object 或 readback，且不计入验证系列。随后只读重查恢复通过，故为保持 fresh 证据重新生成本节所列 P02 Job；旧确认不得迁移至新 Job。

## 实际结果与关闭

- 用户确认 P02 后，唯一一次 `std_project/create` 调用返回 HTTP `200`、业务码 `40000`；request ID 存在，项目 ID 不存在。
- 平台仅给出泛化 `resource_not_eligible` 分类，未提供安全字段路径；因此不能将失败归因于 `external_url_material_list`，也不能排除其他资源组合问题。
- 随后的 `std_project/list` 以 `0 / 10 / 30` 秒三次只读回查均未发现同名项目；没有 created object。
- 验证系列已由 `1/3` 变为 `2/3`。不自动开始 Attempt 3。
- 按已批准停止规则，已通过 `db/051_jszc_attempt2_external_url_restore_omit.sql` 将路线的 `external_url_material_list` 策略恢复为 `omit`，真实写入 scope 保持关闭。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | `docs/Solution Design.md` 与 Attempt 1 字段差异报告。 |
| objective | 用单变量 Attempt 2 验证官方条件字段在目标账户组合中的实际接受度。 |
| current truth | Postgres、当前 Task/Manifest、代码与本机智擎版 3.0 create/list 文档。 |
| stop condition | 任一预检 blocker、diff 超出白名单，或准备结束后需要真实 create。 |

# TASK-MWBV2-OE3-JSZC-P1-VIDEO-COVER-READONLY-20260830

状态：closed

更新时间：2026-08-30 CST

## 目标

仅用目标账户视频/图片只读素材查询，复核 Attempt 1 的两条必选视频及各自封面是否在目标账户可见。判定当前路线应继续走平台默认封面，还是由既有 Node 5 自动采用显式封面分支。

## 固定范围

| 项 | 值 |
| --- | --- |
| Case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| Advertiser | `1871922346964041` |
| Route / Game | `oceanengine_3_byte_mini_game` / `JSZC` |
| Attempt 1 基线 | `JOB-MWBV2-20260829151802-CB8550` / `DRAFT-JOB-MWBV2-20260829151802-CB8550` / `sha256:84b986…3040` |
| 必选视频素材 | `JSZC-HUNT-4IG2-3`、`JSZC-HUNT-4GE6-14` |
| 验证系列 | `SERIES-MWBV2-JSZC-REAL-CREATE-20260829`，创建次数保持 `1/3` |

## 允许与禁止

允许：创建一个 P1 runtime-truth 只读证据 Job；仅调用 `file/video/get` 与 `file/image/get` 各两次；将 HTTP/平台码、request ID 存在性、响应 hash、命中布尔值、资源 hash、时间和 evidence ref 写入既有脱敏记录；更新本 Task/Manifest、父 forensic Task/Manifest、状态文件和排查报告。

禁止：`std_project/create`、`std_project/update`、任何项目素材新增/删除/上传、历史项目修改、Attempt 2、路线默认或 Node 5 代码修改、预算/出价修改、token refresh、新表/View/报表，以及保存 token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 判定规则

- 两条视频均在目标账户可见，且两张对应封面均在目标账户可见：两条资源标记 `explicit_cover_verified`；随后允许一次 fresh、无平台写入 Node 1–5 草稿核验。
- 视频可见但任一封面不可见：对应资源保持 `platform_default_cover_allowed`；不改 payload、不进入 Attempt 2，P1 结论为“默认封面分支有官方合同依据，不能解释 `40000`”。
- 视频不可见、权限/网络/平台错误、资产数量不符或物料包不匹配：记录可区分 blocker 并停止。

## 验收与停止

- 只读查询总数严格为 4；无 platform action、created object、confirmation、execution plan 或资源写入。
- 仅在两条封面都显式可见时，fresh 草稿才允许与 Attempt 1 做素材语义 diff；允许变化仅为两个 `project_materials.video_material_list[].video_cover_id` 从省略变为存在及其 evidence/hash。
- 不论结果如何都不执行 Attempt 2。需要 create 验证时，另行批准单变量 Task 和新的人工确认。

## 结果

P1 已完成。只读 Job 为 `JOB-MWBV2-20260829163317-C97C14`，状态 `diagnosed`。严格执行 2 次 `file/video/get` 与 2 次 `file/image/get`：两条必选视频均在目标账户可见；两张对应封面均未在目标账户可见。

| 素材 | 视频目标账户可见 | 封面目标账户可见 | 结论 |
| --- | --- | --- | --- |
| `JSZC-HUNT-4IG2-3` | 是 | 否 | `platform_default_cover_allowed` |
| `JSZC-HUNT-4GE6-14` | 是 | 否 | `platform_default_cover_allowed` |

两次视频查询和两次封面查询均有请求 ID 与响应 hash 的脱敏证据。没有 blocker、没有 raw response；`execution_plans`、`launch_confirmations`、`platform_actions`、`created_objects`、`readbacks` 均为 `0`。

因此不运行 fresh Node 1–5 显式封面草稿分支，不修改 Node 5 或路线默认，也不消耗验证系列的下一次创建机会。P1 结论为：当前默认封面分支具有官方合同和 fresh 目标账户只读事实支撑，但它不能单独解释 Attempt 1 的 `40000`；下一步应回到 forensic Task 处理下一个候选。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | [Attempt 1 `40000` 字段差异排查报告](../docs/.问题排查/3.0项目创建排查对比/JSZC-1871922346964041-P10-创建40000-字段差异排查-20260830.md) 的 P1 视频默认封面候选。 |
| objective | 在不写入平台的前提下，用目标账户素材可见性决定默认封面或显式封面分支。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task/Manifest、`04-video-material-readiness.mjs`、本机官方 3.0 `std_project/create` 文档。 |
| stop condition | 任一需要平台写入、代码/路线改动或 Attempt 2 的动作均停止并另行取得批准。 |

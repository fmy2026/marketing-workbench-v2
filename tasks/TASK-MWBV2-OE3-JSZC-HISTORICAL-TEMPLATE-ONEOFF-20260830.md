# TASK-MWBV2-OE3-JSZC-HISTORICAL-TEMPLATE-ONEOFF-20260830

状态：completed_create_failed_landing_url_invalid_no_retry

## 目标

为广告主 `1871922346964041` 建立一条独立的一次性 JSZC 标准项目创建路径。历史成功样本固定字段集合和可移植业务值；账户绑定值只取当前账户已验证的 Postgres 记录。最多一次真实 `std_project/create`，不重试。

## 固定合同

- 历史项目名固定为 `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817`；同名 list 命中即停止。
- 历史业务值包括排期、预算 `88888`、CPA `488`、ROI `0.088`、人群静态项、标题、卖点、CTA、静态开关和空图片列表。
- 当前账户解析 `aweme_id`、事件资产、小游戏实例、品牌、DMP、视频与封面、产品图、小游戏 app_id/URL、监测链接。
- `mini_program_info` 保留历史 `app_id + url` 形态；`external_url_material_list` 保持省略；不补入历史未发送字段。

## 边界

允许：独立 Task/Manifest、一次性脚本、最小审计记录、只读预检、未来一次经精确确认的 create 和汇总回查。

禁止：修改 JSZC 常规 Node、路线合同、payload builder、现有 Case/Attempt、Promotion 或资源写入、预算/出价修改、token refresh、重试，以及保存 raw payload、完整 URL、token 或 raw response。

## 人工门槛

真实 create 前必须同时满足：当前资源/授权/链接核验、同名不重复、payload/wire hash 冻结、独立 plan 仅含一个 create action、用户对精确 Job/Plan/Hash/项目名再次确认。

## 已完成准备

| 项 | 值 |
| --- | --- |
| Case / Job | `CASE-MWBV2-HISTORICAL-20260830015756-E5D9E1D9` / `JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9` |
| Draft / Plan | `DRAFT-JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9-V1` / `PLAN-JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9-V1` |
| payload / plan hash | `sha256:52805c0dec2e2d9139acd142569ec42cc9b5e809d3ab0cf8354e1f616e8d9ff1` / `sha256:bfb7393e345b7d88c1997c11262749d7ef52e6787b9c71e75a3d11e5d6010007` |
| 同名只读查重 | `platform_not_duplicate` |
| 平台写入审计 | create 前为 `0`；唯一 create 后为 confirmation `1`、platform action `1`、created object `0`、readback `1` |

首次本地准备在执行计划的敏感文本约束处中断；Case、Job 与 Draft 已创建，但 platform action 与 confirmation 均为 `0`。当前 Job 已原地修复并完成准备，不产生第二条创建路径。

## 一次性真实创建结果

- 已按用户精确确认发送一次 `POST /open_api/v3.0/std_project/create/`；HTTP `200`，业务码 `40000`，request ID 已返回但未落明文，未返回项目 ID。
- 平台安全分类为 `landing_url_invalid`，未定位到可安全确认的具体字段路径；不得将该结果扩大归因为某一个链接字段。
- `std_project/list` 已在 `0/10/30` 秒执行三次回查：均 HTTP `200`、业务码 `0`、请求 ID 存在，均未命中同名项目。
- Case 已完成、Job 为 `failed_waiting_manual_review`；写入 scope 已撤销。不得重试、不得创建 Promotion 或改动任何资源、预算、出价或 token。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | `docs/Solution Design.md` 与 `docs/.问题排查/3.0项目创建排查对比/巨量营销3.0-标准项目-7675218401040220179-创建字段参数.md` |
| current truth | Postgres `marketing_workbench_v2.mwb`、当前账户只读资源与独立 one-off Job |
| stop condition | 任一当前账户资源或同名检查失败，或 create 返回非确认结果；均关闭 scope 且不重试。 |

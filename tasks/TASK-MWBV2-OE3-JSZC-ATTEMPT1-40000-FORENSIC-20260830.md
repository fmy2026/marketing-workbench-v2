# TASK-MWBV2-OE3-JSZC-ATTEMPT1-40000-FORENSIC-20260830

状态：closed_handed_off

更新时间：2026-08-30 CST

## 目标

对 JSZC 目标账户 Attempt 1 的 `40000` 未确认创建进行只读字段取证，确认是否存在“当前代码与官方直接合同冲突”或“目标账户资源/条件证据不足”。本 Task 只产出排查报告和后续最小修正方案；不执行修复或 Attempt 2。

## 固定范围

| 项 | 值 |
| --- | --- |
| Case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| Advertiser | `1871922346964041` |
| Route / Game | `oceanengine_3_byte_mini_game` / `JSZC` |
| 关联验证系列 | `SERIES-MWBV2-JSZC-REAL-CREATE-20260829` |
| 已完成尝试 | `1/3`，未确认创建 |
| 前序 Task | `TASK-MWBV2-OE3-JSZC-REAL-CREATE-VERIFICATION-SERIES-20260829` |
| 证据报告 | `docs/.问题排查/3.0项目创建排查对比/JSZC-1871922346964041-P10-创建40000-字段差异排查-20260830.md` |

## 允许与禁止

允许：更新本 Task / Manifest / `project.state.json` / 本次排查报告；只读查询 Postgres、当前代码、官方资料和目标账户已有只读资源证据；运行不触发平台写入的合同与安全摘要测试。

禁止：`std_project/create`、Attempt 2、任何平台或资源写入、预算/出价修改、token refresh、新建表/View/报表、修改路线默认或 Node 5 代码，以及保存 token、Cookie、完整 URL、raw payload、raw request 或 raw response。

## 工作项

- [x] 建立独立 forensic Task、Manifest 和 Attempt 1 字段差异报告。
- [x] 将原验证系列 Task 的失败状态以 handoff 引用交给本 Task；全局平台写入保持关闭。
- [x] 视频默认封面候选已完成精确目标账户只读核验：两条视频可见、两张封面不可见，保留 `platform_default_cover_allowed`；不修改 payload、不进入 Attempt 2。
- [ ] 对外链省略、空图片数组分别核对官方合同与目标账户只读证据。
- [ ] 复核 URL-only 小游戏链路、无 `schedule_time`、CTA/定向差异是否仅为官方允许的策略差异。
- [ ] 仅在发现官方直接合同冲突时，输出最小修正方案；否则输出“保留代码、补足证据”的结论。

## 验收

- 结论逐项标明“官方直接支持 / 条件未证实 / 目标资源依赖 / 历史经验”，不得把 `40000` 指向具体字段。
- 不产生 platform action、created object、资源写入、预算/出价修改或 token refresh。
- 若未来需要 Attempt 2，必须先关闭本 Task 并取得独立批准方案；使用 fresh Job、Draft、Plan、payload hash 和新的单次人工确认，序号只能为 `2/3`。

## 停止条件

- 任一后续动作需要修改代码、路线默认、平台资源或真实 create 时，停止并要求独立方案批准。
- 官方资料不足或与当前 3.0 合同冲突时，记录冲突；不得用历史项目替代平台真值。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | [Attempt 1 `40000` 字段差异排查报告](../docs/.问题排查/3.0项目创建排查对比/JSZC-1871922346964041-P10-创建40000-字段差异排查-20260830.md)。 |
| objective | 用只读证据缩小 `40000` 的候选范围，判断是否存在官方直接合同冲突。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task / Manifest、当前代码、本机 3.0 官方 create/list 资料。 |
| stop condition | 需要任何写入、代码/路线改动、或 Attempt 2 时停止并另行取得批准。 |

## Handoff

P1 视频默认封面候选在不打开平台写入 scope 的前提下，交由 [TASK-MWBV2-OE3-JSZC-P1-VIDEO-COVER-READONLY-20260830](TASK-MWBV2-OE3-JSZC-P1-VIDEO-COVER-READONLY-20260830.md) 执行。该子 Task 不改变验证系列创建次数，也不授权 Attempt 2。

P1 已于 2026-08-30 CST 完成：目标账户两条视频可见、对应封面均不可见，故既有 `platform_default_cover_allowed` 分支继续有效。该结论只排除“封面应当显式发送”的当前资源假设，不能解释 Attempt 1 的 `40000`；forensic Task 回到下一个候选。

候选 1 的官方条件字段证据不足已由用户批准进入单变量修正准备；后续由 `TASK-MWBV2-OE3-JSZC-ATTEMPT2-EXTERNAL-URL-SINGLE-VARIANT-20260830` 接管。该 handoff 不开放真实 create，Attempt 2 必须继续使用 fresh Job/Draft/Plan 和新的精确人工确认。

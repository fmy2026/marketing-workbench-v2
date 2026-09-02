# TASK-MWBV2-JSZC-FALLBACK-PARAMETERS-INCREMENTAL-20260902

状态：completed

更新时间：2026-09-02 15:59 CST

## 授权来源

用户于 2026-09-02 批准“JSZC 保底参数增量修正方案”并要求直接实施。

## Solution Link

- source：用户提供的账户 `1871922175825993`、项目 `7675218401040220179` 截图，以及当前 PostgreSQL 路线默认值和正式 Node 05 合同。
- objective：为所有 `oceanengine_3_byte_mini_game × JSZC` fresh Job 增量修正 CTA、预算/出价/ROI、性别/年龄和投放时段，不减少现有字段或账户动态资源。
- current truth：`mwb.game_route_defaults`、DMP 配置/账户只读状态、当前 Node 05 payload/diagnostics/ledger/success-profile 代码与 Schema。
- stop condition：任何真实平台调用、旧 Job/Plan/项目改写、DMP 成员减少、非 allowlist 字段变化或需要放宽 fail-closed 合同。

## 唯一目标

新增 migration `069`，以逐叶更新方式修正 JSZC 路线保底值，并使 Node 05 正式 payload、字段账本与 success profile 对新增性别、年龄和 `schedule_time` 形态完整校验。

## 范围

- CTA 保留“立即试玩”，追加“打开游戏、点击即玩、进入游戏、无需下载”。
- 日预算/出价/ROI 修正为 `66666`、`366`、`0.16`。
- 性别修正为 `GENDER_MALE`；年龄为 18–23、24–30、31–40、41–49、50+ 五档。
- 增加与既有 digest 一致的 336 位 `schedule_time`，保留 `SCHEDULE_FROM_NOW`。
- 更新 payload allowlist、嵌套字段合同、预检、字段账本、success profile 与 focused smoke。
- migration 应用后只影响 fresh Job；不回写历史运行事实。

## 非目标

- 真实平台只读或写入、token 刷新、confirmation 消费、创建或重试。
- 修改 DMP 集合/成员/账户状态、素材、品牌、事件资产、小游戏实例、Aweme 授权或触点。
- 修改旧 Draft、Plan、confirmation、action、readback 或现有平台项目。
- 新增表、View、Node、Gate、Plan/action 类型或公开 API。

## 验收

- migration 前后差异只命中批准路径，且可重复运行。
- 路线默认值与正式 payload 精确包含目标 CTA、数值、性别、五档年龄和 336 位时段。
- `schedule_time` 只含 `0/1`，长度 336，SHA-256 与既有 digest 一致。
- DMP 10 个成员保持不变；最终 payload 排除包非空且不减少。
- schema、payload contract、wire body、Execution Plan、workflow skills 与数据库合同 smoke 通过。
- 全程真实平台调用为 0。

## 停止条件

- 需要真实平台请求、运行时 confirmation/action/Job 或改写历史项目。
- migration 无法证明只变更 allowlist 路径，或 DMP/其他保留字段发生变化。
- 新字段与当前官方/现有合法枚举合同冲突，需扩大本任务范围。

## 完成记录

- migration `069` 已应用并完成幂等重放；仅目标路线默认记录的批准叶路径发生变化。
- Node 05 payload、预检、嵌套合同、字段账本和 success profile 已纳入目标数值、定向、CTA 与时段校验。
- DMP 保底仍为 10 个成员，未修改任何账户动态资源或历史业务运行事实。
- schema、数据库合同、payload contract、wire body、Execution Plan 与 workflow skills 测试通过；真实平台调用为 0。

# TASK-MWBV2-EVENT-ASSET-READBACK-LOSSLESS-20260901

状态：completed

## 授权来源

用户于 2026-09-01 批准“事件资产回查最小修复与当前 Case 续跑”并要求实施。

## 唯一目标

修复 OceanEngine 事件资产 detail 响应的真实字段归一与长数字 ID 精度丢失，使既有 fail-closed 绑定回查能正确识别当前账户的唯一事件资产；不改变任何 Case、Job、Gate、Plan 或平台写入机制。

## 已确认事实

- detail 使用 `micro_app_id` 和 `micro_app_instance_id`；现有映射遗漏前者。
- `micro_app_instance_id` 是超过 JS 安全整数范围的 JSON number，通用 `JSON.parse` 会改变其精确值。
- 同一真实 detail 在内存中按无损字符串解析后，App 与实例均精确匹配当前受控候选。
- 当前历史 Resource Plan 已消费；本 Task 不确认、不重试、不执行平台写入。

## 实现范围

- 泛化既有 OceanEngine 长 ID 响应解析器，使用内部 allowlist 无损处理事件资产 ID 字段，同时保留标准项目兼容接口。
- 在事件链与 event-config executor 中增加 `micro_app_id` 的标准 App 归一。
- 将 focused smoke 改为真实 HTTP 文本与真实字段形状，覆盖 19 位实例 ID 精度、匹配、缺失、失配和歧义。
- 只读验证当前 active Case 的 fresh Job/Plan 资格；不创建 Job、不确认 Plan、不产生平台写入。

## 禁止

- 所有真实平台写入、confirmation、action grant、重试、token refresh、预算或出价修改。
- 重复创建事件资产或小程序实例。
- 新增数据库表、View、Node、Gate、Plan 类型、action 类型或公开 API。
- 保存 token、Cookie、secret、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 真实形状的 `micro_app_id + micro_app_instance_id` 可通过绑定回查；19 位 ID 保持字符串精确值。
- 缺失、失配、歧义和非 allowlist 字段仍 fail-closed。
- 用户指定的五个 smoke、workflow/API/交互/安全检查通过；所有测试仅使用 mock/test_run。
- 重启后对当前 Case 只读验证：资产已识别、不会生成 `ensure_resource:event_asset`，且不消费旧 Plan。

## 停止条件

- 修复需要放宽绑定标准、修改 Gate 真值、引入 Schema/API/Plan 类型，或需要真实平台写入。
- 当前 detail 无损解析后仍不能精确匹配 App 与受控实例候选。

## 完成结果

- 已把事件资产详情的 `asset_id`、`micro_app_instance_id`、`instance_id` 与 `mini_program_instance_id` 纳入内部无损数字 allowlist；标准项目响应解析接口保持兼容。
- 已在事件链、只读适配层和 event-config executor 统一识别 `micro_app_id`，但仍要求 App、instance、账户和唯一候选全部精确匹配。
- 已用真实 HTTP 文本形状覆盖 19 位实例 ID、匹配、缺失、失配、歧义和 malformed JSON；解析失败仍 fail-closed，且不保留 raw response。
- 已重启本机工作台并只读检查当前 Case。它仍指向已消费的历史 Resource Plan；未创建 fresh Job、未确认 Plan、未执行平台写入。用户下一次输入“重新只读准备”才会在修复后的解析链上创建 fresh readonly Job。
- 全部约定 smoke 与最终 workflow / workbench 地址检查通过；验证期间平台写入为零。

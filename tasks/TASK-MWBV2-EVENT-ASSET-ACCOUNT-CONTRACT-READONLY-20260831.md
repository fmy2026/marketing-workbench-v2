# TASK-MWBV2-EVENT-ASSET-ACCOUNT-CONTRACT-READONLY-20260831

状态：completed（safe stop：目标小游戏实例未获权威 readonly 回查）

## 目标

为 active Case 的当前目标账户执行一次事件资产链只读核验，并仅在 App、小游戏实例与账户级合同均已验证时编译单动作资源 Plan；不确认、不执行平台写入。

## 范围

- 事件资产合同必须绑定当前账户、版本化模板引用和动态 template hash。
- 目标小游戏实例必须具有权威只读证据；仅引用候选不能生成事件资产 Plan。
- 合同达标时写入账户资源的脱敏合同元数据，并编译仅含 `ensure_resource:event_asset` 的 fresh Plan。

## 禁止

- 事件资产、monitor、素材或广告项目平台写入与自动重试。
- Plan confirmation、action grant、全局 Guardrail 放开或 token refresh。
- 复用已 blocked/stale/consumed Plan，或持久化完整 URL、凭证、raw request/response。

## 验收

- 实例未获权威回查时 fail-closed，不保存账户级可执行合同且不编译 Plan。
- 条件完整时只生成一个 `resource_prepare` Plan，动作仅为 `ensure_resource:event_asset`，最大平台调用数为 1、`retry_allowed=false`。
- 外部只读与数据库落账均为脱敏；平台写入、confirmation 和 action grant 数为零。

## 结果

- 已完成一次目标 Case 的 fresh readonly 事件链核验；目标小游戏实例仍只有引用候选，缺少权威回查证据。
- 系统按 `event_asset_provision_instance_readback_unverified` fail-closed：未保存账户级可执行合同，未生成新的资源 Plan。
- 当前 Case Gate 与 root blocker 保持不变；monitor 仍为 READY。
- 当前 Job 的新增审计结果：平台动作、创建对象与确认均为零；没有 token refresh、raw request/response 或完整 URL 落账。

## 后续边界

下一步应另建“小游戏实例权威回查/数据源诊断”只读专项 Task。未取得该证据前，不得创建事件资产、不得确认或执行任何事件资产 Plan。

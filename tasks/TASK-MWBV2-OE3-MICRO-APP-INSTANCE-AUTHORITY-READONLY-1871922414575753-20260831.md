# TASK-MWBV2-OE3-MICRO-APP-INSTANCE-AUTHORITY-READONLY-1871922414575753-20260831

状态：completed_blocked_authority_readonly_failed

## 目标

为 active Case `CASE-MWBV2-5B75EB40E6F9AF2469` 的账户 `1871922414575753` 补齐小游戏实例独立权威只读回查，解除“事件资产不存在即无法核验实例”的循环依赖；不确认、不执行任何平台写入。

## 范围

- Node 04 新增独立 `micro-app-instance-authority-readonly` Skill。
- 使用 `optimized_goal/get`，只提交当前账户、受控小游戏 App 与唯一实例候选；不依赖已有事件资产。
- 仅当返回成功、request ID 存在且 `PAY + PURCHASE_ROI_7D` 同时命中时，落脱敏 evidence 并写入 `micro_app_instance` 的权威回查元数据。
- 事件资产链应消费该实例证据；事件资产仍须其自己的 Plan、确认、单次执行与回查。

## 禁止

- 任何平台写入、Plan confirmation、action grant、Guardrail 放开、token refresh。
- 创建或共享小游戏实例、事件资产、事件配置、备用页、素材或标准项目。
- 将引用候选、历史账户事实、完整 URL、凭证、raw request/response/payload 当作权威证据或持久化。

## 验收

- 实例候选缺失、歧义、外部调用失败、业务码失败、request ID 缺失或目标链路不完整时，保持 `micro_app_instance_target_unverified` 且零平台写入。
- 通过时，`account_resources.micro_app_instance` 为 `visible + readback_verified`，metadata 只保存脱敏回查合同与 evidence 引用。
- 不改变既有 Plan kind、公开 API、`prepare_supported=false` 或 Case Gate 的推导责任。

## 停止条件

- 官方只读接口无法以候选实例独立验证当前账户的目标链路。
- 任何实现路径需要真实平台写入、人工确认或凭证刷新。
- 输出或存储将包含敏感原文。

## 结果

- 已实现并注册 Node 04 `micro-app-instance-authority-readonly`：对零事件资产账户使用当前账户、受控小游戏 App 和唯一实例候选调用 `optimized_goal/get`，请求不携带 `asset_id`。
- 成功路径仅写脱敏 evidence 与 `micro_app_instance_authority_readonly_contract.target_instance_readback_verified=true`；事件资产合同可消费该证据，但仍需独立 Plan/确认后才允许创建。
- 2026-08-31 对 `JOB-MWBV2-20260831092159-D13FDB` 执行一次官方只读验证，返回 `micro_app_instance_authority_readonly_failed`，未形成实例权威证据；保持 Case blocker，不创建事件资产或事件配置。
- 审计计数：confirmation=0、platform action=0、created object=0；无 token refresh，未存储 raw request/response。
- 已通过 focused smoke、Node 04 合同、workflow case、workflow skills smoke、schema validation 与 `git diff --check`。

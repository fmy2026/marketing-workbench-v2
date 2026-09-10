# TASK-MWBV2-MONITOR-ACCOUNT-IDENTITY-CONFIG-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-MONITOR-ACCOUNT-IDENTITY-CONFIG-20260910.json)。

## 目标

删除错误的路线级 Monitor `agent_id` 参考机制，使账户身份只从乾坤 `accountIndex` 写入的 `advertiser_accounts` 读取，并在 readonly、Plan 与确认后的 fresh preflight 中使用同一份有效 Monitor 配置。

## 批准方案

用户已批准“`agent_id`、乾坤账户记录和 owner 均为账户属性；路线默认值不再保存或兼容历史代理 ID”的最小修复。旧 Plan 保留审计、不恢复且不重试；修复后只能由本人通过“重新只读准备”创建 fresh Job。详见 [Solution Design](../docs/Solution%20Design.md)。

## 范围

- 删除路线默认值中 `monitor_provision_reference_candidates.agent_id`，并删除运行时候选补齐和不匹配判断。
- 移除包含历史账户代理/记录 ID 的 legacy Monitor config-sync 入口，避免它成为第二条运行配置链。
- 建立唯一账户有效配置装配器，并接入 Monitor readonly、Plan 与确认 executor 的 fresh preflight。
- 修复确认执行前失败时的 Case summary blocker 优先级、受控中文话术与前端过期确认卡。
- 增加 migration、mock 测试、逻辑图和数据合同；仅做真实只读验证。

## 非目标

- 不修改 3 阶段 7 Node、Gate、Plan kind、精确确认、单次 executor 合同或账户 B 的数据。
- 不执行 Monitor 创建、任何真实平台写入、自动重试、手工改账户身份或复用旧 Plan/confirmation。
- 不保留路线级历史 `613` 兼容逻辑。

## 验收

- AC-01: 路线配置与运行时代码不再以路线 `agent_id` 补齐、比较或依赖代理 ID；账户有效配置只来自数据库账户身份字段。
- AC-02: readonly、Plan、fresh preflight 对同一账户使用同一 effective monitor config；身份漂移使旧 Plan 安全失效且不写平台。
- AC-03: 已消费/失败 Plan 不返回确认卡；summary 与对话展示真实身份 blocker 的中文说明。
- AC-04: 613 与 617 mock 账户走同一链路，缺失账户身份或授权均在 Plan 前阻断，现有安全/Workflow 回归通过。
- AC-05: migration、方案、逻辑图、数据合同、Task/Manifest 与证据同步，项目合同校验通过。

## 停止条件

- 需要改变 7 Node、Gate、Plan/confirmation、真实平台写入范围或账户 B 动态事实。
- 无法用 mock 验证账户身份漂移不会引发平台写入。
- 发现 token、Cookie、完整触点 URL、raw request/response 或其它敏感信息泄漏。

## 交付说明

完成后只交付通用账户身份装配机制和 mock/只读证据；当前 Case 的恢复仍由用户在工作台显式输入“重新只读准备”触发。

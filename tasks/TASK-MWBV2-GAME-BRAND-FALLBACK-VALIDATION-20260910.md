# TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910.json)。

## 目标

在不新增专用写入链路的前提下，为目标账户可投品牌列表成功回查为空的情形提供受控、可审计的整组 `brand_info` 省略验证；该验证只能通过现有 Plan、确认与通用 executor 进行一次真实创建验证，且在权威回查成功前不得推广为通用账户能力。

## 批准方案

Attempt 1 已以游戏维度保底品牌三元组发送完整 `brand_info` 并收到未定位字段的 API `40000`；该尝试保持为失败证据，不能归因于品牌字段。用户批准新的单次实验：仅当 fresh 目标账户品牌接口成功回查为空、当前 Case 的 JSON 授权匹配 route/game/fresh Job 且最大创建次数为 1 时，整个省略 `brand_info`（四字段均不发送）。目标回查非空仍发送完整目标账户品牌对象；回查失败、不完整或不明继续阻断。资源准备与创建继续使用 fresh Plan、本人确认和既有单次通用 executor；本任务不代替本人输入确认短语或自动发起平台写入。

## 范围

- 建立游戏维度候选的通用只读聚合、冻结 hash 与元数据表达，移除代码中的固定品牌名称和平台 ID。
- 让 Node 04/05、payload 合同和工作台 blocker 投影消费同一候选合同；目标回查优先，实验候选严格限定为当前 route/game/Case。
- 补充单元及 smoke 覆盖，并更新当前方案、逻辑图和数据契约的实验边界。
- 修复游戏维度候选写入既有资源生命周期字段时的约束兼容性：实验来源只存既有 JSON 元数据，Node 04 同轮资源状态原子落库，且工作台不得回显内部数据库错误。
- 让 Node 05 复用 Node 04 的品牌资格合同，并仅在 fresh Job 实际生成创建确认卡时提示第二次确认；候选与 Draft 不一致时继续 fail-closed。
- 在实现与验证完成后，通过工作台由本人决定是否执行资源确认和一次创建确认；真实结果再决定候选的提升或拒绝状态。
- 将 Attempt 1 的游戏维度候选记录为未被平台接受但不作字段归因；为当前 Case 增加仅一次的目标空列表省略实验授权，并让 Node 04/05、payload、preflight、字段账本、action 审计与回查消费同一个 `brand_mode`。
- 修复 `prepare_corrective_attempt` 对“重新只读准备”的误拒绝：该命令与“继续执行”汇入既有 fresh corrective Attempt 链路，工作台以“重新只读准备”为主提示，不新增 Gate、Plan、写入入口或账户专用分支。
- 统一 `not_required` 资源状态的消费：Node 04、Node 05、嵌套字段合同与 Execution Plan 复用同一就绪谓词；目标品牌空列表实验只允许整组省略 `brand_info`，不允许空对象或部分字段。
- 将只读重跑的创建 Attempt 统一从 Case 尝试状态推导；Attempt 2 的未确认 Draft 与项目名 reservation 不得因调用方默认值退回 Attempt 1。

## 非目标

- 不新增 Node、Gate、Plan kind、品牌写入执行器、公开 API、Schema 或路由。
- 不自动创建资源、项目、monitor 或重试；不复用当前 blocked Plan。
- 不把实验候选宣称为 `fresh_target_brand_industry_readback_passed`，不保存凭据、原始请求、原始响应或完整触点 URL。
- 不新增数据库状态、Schema、Node、Gate、Plan、action、执行入口或平台写入；仅以获批 migration 在当前 Case 的既有 JSON 元数据登记 Attempt 1 结果和 Attempt 2 一次性授权，不修改资源、Plan、confirmation 或 action 历史。
- 不在 live 源码按账户、Case、品牌或平台 ID 分支；不发送空、部分或游戏维度继承的 `brand_info` 作为本次 Attempt 2 payload。

## 验收

- AC-01: 目标账户新鲜品牌/行业回查优先；仅同 route/game、唯一完整、证据和 hash 均匹配且显式获批的候选可在实验范围内替代品牌阻断。
- AC-02: 创建 payload 仅使用冻结的整型品牌三元组，代码无账户、Case 或固定品牌 ID 默认分支；缺失、多版本、过期或范围不匹配均 fail-closed。
- AC-03: 工作台对 `brand_info_not_ready` 给出明确恢复说明和“重新只读准备”占位；资源与创建 Plan 继续分离、各自单次确认且无自动重试。
- AC-04: 品牌资源、Node 04、payload、Plan/executor、工作台 smoke 与项目合同检查通过；平台写入只可能由已登录账户本人在运行时确认后发生。
- AC-05: 若本人完成一次真实创建验证，则将结果、权威回查和候选终态记录为 Postgres 证据；若未执行或任一前置资源失败，任务仅交付可运行机制并保持 Case 的安全阻断。
- AC-06: 保底候选以既有 `baseline_candidate` 生命周期原子保存；任一持久化错误不得造成部分资源更新或在 HTTP/UI 回显数据库内部细节。
- AC-07: Node 05 接受完整且获批的游戏维度实验候选，并拒绝伪造、范围/hash 或 Draft 不一致的候选；资源 Plan 完成后的对话不得在缺少创建确认卡时声称其已生成。
- AC-08: 成功空列表且 Case 授权匹配时，Attempt 2 整组省略 `brand_info`；非空、失败、不完整、空对象或部分对象均 fail-closed，且不复用 Attempt 1 的游戏候选。
- AC-09: 创建 action 的脱敏字段账本在成功、明确失败和结果不明分支均被保留；工作台只在真实回查已启动时称为“进入只读回查”。
- AC-10: 在 `prepare_corrective_attempt` 下，“重新只读准备”和“继续执行”得到同一 corrective effect；重复提交只创建或复用一个 fresh Job、仅运行 readonly，且不调用创建 executor。
- AC-11: 已获当前合同授权的 `not_required/not_required` 资源在所有消费端得到一致判定；目标空列表模式在嵌套合同中要求 `brand_info` 完全缺席，其他模式仍要求完整四字段品牌对象。
- AC-12: Case 已有失败创建时，无显式 Attempt 的 readonly 重跑使用 `nextCreateAttemptNo`；不匹配的显式 Attempt 在 Draft、Plan 或平台动作前 fail-closed。

## 停止条件

- 候选无法形成唯一、完整、同 route/game 的已验证三元组，或需要把账户/Case/ID 硬编码到 live 源码。
- 实现需要绕过现有 Plan、确认、action grant 或单次 executor。
- 实际平台写入未由账户本人在工作台精确确认，或回查结果不明。
- 验证要求读取、输出或持久化敏感凭据、Cookie、token、原始请求或响应。

## 交付说明

交付通用的实验候选机制与前端恢复提示。真实平台写入和候选最终结论仍由当前 Case 的 fresh Plan、本人确认与权威回查决定；任务关闭时如未实际验证，不把该候选升级为长期经验。

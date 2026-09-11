# TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910.json)。

## 目标

在不新增专用写入链路的前提下，为目标账户可投品牌列表成功回查为空的情形提供通用、可审计的整组 `brand_info` 省略能力；每个 fresh Job 仍须以当前目标账户的成功空列表证据决定字段形态。

## 批准方案

Attempt 1 曾以游戏维度保底品牌三元组发送完整 `brand_info` 并收到未定位字段的 API `40000`；该尝试保留为失败审计，不能归因于品牌字段。Attempt 2 在账户本人确认后以目标账户空列表整组省略 `brand_info` 创建成功，并完成项目 ID、名称和素材关系的权威回查。资源准备与创建始终使用 fresh Plan、本人确认和既有单次通用 executor；本任务不代替本人输入确认短语或自动发起平台写入。

真实创建与 Node 7 权威回查已完成。现将该实验升级为正式通用合同：目标账户品牌查询 API 成功且返回列表实际为空时，整个省略 `brand_info`；列表非空时只有唯一完整的目标品牌和行业可以发送四字段对象；失败、权限异常、结果不明、非空未匹配或多匹配均阻断。删除运行时 Case 特批、实验模式和跨账户游戏候选，不新增账户白名单或旁路写链。

## 范围

- 将已验证的空列表结果收敛为目标账户通用 capability，并删除运行时跨账户候选与 Case 特批依赖。
- 让 Node 04/05、payload 合同、字段账本、preflight 和工作台确认投影消费同一 `brandInfoMode`。
- 补充单元及 smoke 覆盖，并更新当前方案、逻辑图和数据契约的实验边界。
- 修复游戏维度候选写入既有资源生命周期字段时的约束兼容性：实验来源只存既有 JSON 元数据，Node 04 同轮资源状态原子落库，且工作台不得回显内部数据库错误。
- 让 Node 05 复用 Node 04 的品牌资格合同，并仅在 fresh Job 实际生成创建确认卡时提示第二次确认；候选与 Draft 不一致时继续 fail-closed。
- 在实现与验证完成后，通过工作台由本人决定是否执行资源确认和一次创建确认；真实结果再决定候选的提升或拒绝状态。
- 将 Attempt 1 的游戏维度候选记录为未被平台接受但不作字段归因；历史实验授权仅保留审计，不参与新 Job 的运行决策。
- 修复 `prepare_corrective_attempt` 对“重新只读准备”的误拒绝：该命令与“继续执行”汇入既有 fresh corrective Attempt 链路，工作台以“重新只读准备”为主提示，不新增 Gate、Plan、写入入口或账户专用分支。
- 统一 `not_required` 资源状态的消费：Node 04、Node 05、嵌套字段合同与 Execution Plan 复用同一就绪谓词；目标品牌真实空列表只允许整组省略 `brand_info`，不允许空对象或部分字段。
- 将只读重跑的创建 Attempt 统一从 Case 尝试状态推导；Attempt 2 的未确认 Draft 与项目名 reservation 不得因调用方默认值退回 Attempt 1。
- 将 JSZC 成功样本的字段形态校验收口为一个纯函数：目标空列表模式仅可将精确的五条品牌省略账本记录投影为历史四字段品牌形态用于比较；payload、payload contract、preflight 和 runner 共用该判定，品牌外任一差异继续阻断。
- 将目标空列表省略升级为 `target_empty_omit` 通用模式：以 fresh API 的实际列表数量为唯一空列表依据，保存当前 Job 与脱敏证据；运行时不再读取 Case 一次性授权、`experimental_pending_create` 或跨账户品牌候选。
- 通过幂等数据迁移将已有、已权威回查成功的实验记录规范化为通用空列表合同，同时保留原 Case 授权为只读历史验证信息。
- 修复 Node 7 的已知创建对象回查锚点：创建响应已确认且本地对象 ID 完整时，只能按精确 `project_ids` 只读查询并同时核验 ID 与草稿名称；每次只读观察独立留痕，绝不重放 Node 6 或再次创建。

## 非目标

- 不新增 Node、Gate、Plan kind、品牌写入执行器、公开 API、Schema 或路由。
- 不自动创建资源、项目、monitor 或重试；不复用当前 blocked Plan。
- 不把实验候选宣称为 `fresh_target_brand_industry_readback_passed`，不保存凭据、原始请求、原始响应或完整触点 URL。
- 不新增数据库状态、Schema、Node、Gate、Plan、action、执行入口或平台写入；仅以幂等 migration 规范化已验证历史的 JSON 元数据，不修改资源、Plan、confirmation 或 action 历史。
- 不在 live 源码按账户、Case、品牌或平台 ID 分支；不发送空、部分或游戏维度继承的 `brand_info` 作为本次 Attempt 2 payload。
- 不以名称过滤为空为由再次创建、不扩大 Node 7 的五次/25 秒只读边界，也不将已确认 ID 缺失降级为名称猜测。

## 验收

- AC-01: 每个 fresh Job 只消费目标账户新鲜品牌回查；非空唯一完整匹配发送四字段，成功真空列表整组省略，其他结果 fail-closed。
- AC-02: 创建 payload 不含账户、Case 或固定品牌 ID 默认分支；空列表模式不得发送空对象、部分对象或跨账户候选。
- AC-03: 工作台对 `brand_info_not_ready` 给出明确恢复说明和“重新只读准备”占位；资源与创建 Plan 继续分离、各自单次确认且无自动重试。
- AC-04: 品牌资源、Node 04、payload、Plan/executor、工作台 smoke 与项目合同检查通过；平台写入只可能由已登录账户本人在运行时确认后发生。
- AC-05: 本人已完成真实创建验证；结果、权威回查和通用能力升级均有 Postgres 证据，历史 Case 已完成。
- AC-06: 同轮资源更新保持原子；任一持久化错误不得造成部分资源更新或在 HTTP/UI 回显数据库内部细节。
- AC-07: Node 05 只接受 `target_verified` 或 `target_empty_omit` 两种完整合同，并拒绝伪造、范围/hash 或 Draft 不一致；资源 Plan 完成后的对话不得在缺少创建确认卡时声称其已生成。
- AC-08: 成功真空列表无需 Case 授权即可整组省略 `brand_info`；非空、失败、不完整、空对象或部分对象均 fail-closed，且不复用 Attempt 1 的游戏候选。
- AC-09: 创建 action 的脱敏字段账本在成功、明确失败和结果不明分支均被保留；工作台只在真实回查已启动时称为“进入只读回查”。
- AC-10: 在 `prepare_corrective_attempt` 下，“重新只读准备”和“继续执行”得到同一 corrective effect；重复提交只创建或复用一个 fresh Job、仅运行 readonly，且不调用创建 executor。
- AC-11: 已获当前只读证据的 `not_required/not_required` 资源在所有消费端得到一致判定；目标空列表模式在嵌套合同中要求 `brand_info` 完全缺席，其他模式仍要求完整四字段品牌对象。
- AC-12: Case 已有失败创建时，无显式 Attempt 的 readonly 重跑使用 `nextCreateAttemptNo`；不匹配的显式 Attempt 在 Draft、Plan 或平台动作前 fail-closed。
- AC-13: 目标空列表模式的真实草稿可通过完整 Node 05、Plan 和正式 prepare 预检；仅品牌省略可偏离历史形态，伪造、残缺或任何非品牌形态漂移均 fail-closed，工作台准确说明系统字段合同阻断。
- AC-14: 已确认创建响应的 Node 7 以保留精度的 `project_ids` 回查，同一记录必须同时精确匹配 ID、草稿名称及所需素材绑定；每轮只读观察独立归档，名称过滤仅保留给创建响应不明且无 ID 的恢复场景，且全程零创建调用。
- AC-15: `target_empty_omit` 不依赖 Case 特批或历史账户候选；仅 fresh API 成功且实际列表为空时放行整组省略，所有消费者一致拒绝非空未匹配、字段残缺、证据/Job 不匹配和模式漂移。已验证实验数据幂等升级为通用合同且不产生业务动作。

## 停止条件

- 需要把账户/Case/ID 硬编码到 live 源码，或需要以历史跨账户候选替代 fresh 目标账户回查。
- 实现需要绕过现有 Plan、确认、action grant 或单次 executor。
- 实际平台写入未由账户本人在工作台精确确认，或回查结果不明。
- 验证要求读取、输出或持久化敏感凭据、Cookie、token、原始请求或响应。

## 交付说明

交付 `target_verified / target_empty_omit / blocked` 三态品牌合同、条件字段形态校验和 Node 7 ID 优先回查机制。已通过本人确认创建与权威回查完成真实验证；此后每个 fresh Job 仍必须独立查询目标账户，不能复用历史结果。

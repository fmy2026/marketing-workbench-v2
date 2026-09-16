# 复盘依据与局限

这是 2026-09-16 文档任务的历史材料核对记录，不是当前运行合同或业务状态报告。

## 覆盖与日期口径

扫描基线 `de5a6fe0926ae7c6aff833621451b88f518f11b7` 下 `tasks/*.md` 的全部 277 份历史 Task，以及对应 277 份 Manifest；模板与本次新增任务不计入样本。全量读取文本并提取目标、结论、验收条目和内容指纹，按时间展示摘要，针对入选主题回读关键原文和已有验收证据。逐文件清单见 [task-index.json](task-index.json)。

时间统一按 Asia/Shanghai 日归并：237 份使用 Manifest.created_at；32 份使用 Task 头部记录日期；8 份无上述日期，使用 Git 首次入库日期。Task 更新时间、Git 入库时间均不等于事件开始时间；同日记录不据文件名推断先后。索引保留原始日期和依据，时间线区间只是主题归并。

历史 status 原样保留。部分旧合同存在非现行枚举、同一文档同时包含准备快照和后续结果、缺少结构化验证条目等情况；不升级旧合同、不补写缺失证据、不把 completed 或文件数量视为业务成效。

## 七组入选依据

1. **最小闭环分层。** `TASK-MWBV2-POSTGRES-MINIMAL-TRUTH` 限定一个账户、一款游戏、一条路线；`TASK-MWBV2-API-WORKFLOW-CLOSED-LOOP` 明确确认、回查为占位。对应原始 Git 提交为 `5baf095` 和 `03c7846`。本文据此区分结构串通与真实结果，不宣称早期已有真实业务成功。
2. **准确知识改变方案。** `TASK-MWBV2-OE3-QIANKUN-MEDIA-TAXONOMY-CORRECTION` 记载人补充媒体三层语义，原比较跨越不同层级；`TASK-MWBV2-OE3-QIANKUN-MONITOR-CORE-API-DICTIONARY` 区分当前返回、历史候选和登录阻断；`TASK-MWBV2-OE3-REFERENCE-CONTRACT-READONLY-RECONCILIATION` 明确泛化错误码不能精确归因。正文提炼知识核验方法，不沿用当时接口或对象值。
3. **模块与状态所有者。** `TASK-MWBV2-WORKFLOW-NODE-REGISTRY-UNIFICATION` 记录两份节点定义合并；`TASK-MWBV2-NODE3-4-RESOURCE-ACTION-REGISTRY-AND-SKILL-UNIFICATION` 统一模块输入输出与实际准备能力；`TASK-MWBV2-WORKFLOW-CASE-CONTROL-PLANE-REFACTOR` 区分开发协调与持续业务目标、单次运行。仅提炼职责分离，不将该项目表结构推广为必选设计。
4. **实验、正式链路、独立使用。** `TASK-MWBV2-OE3-JSZC-ONEOFF-CONVERTED-TIME-OMIT-CREATE-20260830` 的“执行结果”记载一次创建及三次回查；同文明确只证明该组合有效，不证明之前失败的唯一根因。`TASK-MWBV2-OE3-JSZC-FORMAL-NODE1-7-NEW-ACCOUNT-CERTIFICATION-20260830` 实际未完成正式认证，本文没有将它列为成功。`TASK-MWBV2-WORKBENCH-NATIVE-PLAN-BOUND-CLOSURE-20260901` 验证的是工作台运行机制，任务本身未消费真实 Plan，因此正文写“建设工作台独立闭环”，不声称该日已证实任意用户独立成功。
5. **上下文与验收治理。** `TASK-MWBV2-AGENTS-STARTUP-PROTOCOL-SLIMMING-20260908`、`TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908`、`TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910` 支撑启动协议精简、按需读取与按证据关闭。已回读 [原合同检查验收](../TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908/validation.md)，包含校验器不证明实际阅读与证据语义正确的限制。
6. **测试与正式判断一致。** `TASK-MWBV2-UNIFIED-EXECUTION-20260913` 及 [核心执行证据](../TASK-MWBV2-UNIFIED-EXECUTION-20260913/core-execution.json) 支撑移除测试成功捷径。`TASK-MWBV2-ISOLATED-REGRESSION-20260913` Manifest 为 cancelled，最终汇总回归未执行完；后续 Task 只记载核心验证。因此本文没有宣称全量测试均完成。
7. **用第二事项验证复用。** `TASK-MWBV2-PROJECT-VIDEO-APPEND-20260914` 开发验收为隔离验证；`TASK-MWBV2-APPEND-UNIFIED-CLOSURE-20260915` 的 [历史收口修复证据](../TASK-MWBV2-APPEND-UNIFIED-CLOSURE-20260915/current-case-repair.md) 记载沿用既存成功 action/readback 修复节点与证据，没有新平台请求。该组支持新事项复用和一致性经验，不证明多游戏、多媒体已完成扩展。

各 Task 的项目内路径、对应 Manifest、时间和 SHA256 均在全量索引中；以上历史记录未经本轮在线业务复验。

## 当前机制与方法参考

- [当前逻辑图](../../docs/project-现在的逻辑图.md)：用于理解静态职责与回查机制，正文不复制具体 Gate、重试窗口或当前业务状态。
- [数据与报表契约](../../docs/project-数据与报表契约.md)：区分配置、业务范围、运行、动作与回查及统计投影。它明确现有流程报表不提供投放收益指标。正文的数据设计段落属于未来项目思考，不宣称现有报表能力已实现这些组合。
- [项目经验](../../docs/project-lessons.md)：参考其已验证结论、适用范围及历史样例边界；接口细节的历史表述与当前合同不同之处不进入本文通用规则。
- 用户指定的本地《人-agent分类及理解方法论v1》：采用场景、验收、复杂度选择和信息职责区分，不引入其中需重新联网验证的产品版本或行业趋势结论。

## 提炼与排除原则

将同类诊断、修正、回查合并为机制问题；个人账户、具体错误码、字段取值、上传次数、网络配置和一次性恢复方案不进入正文。文件整理、页面样式与发布任务只用于理解阶段背景，不各自增加“通用维度”。

“如果重做”属于基于本案例及方法参考的建议。没有对照实验衡量节省多少时间、降低多少成本；不将后来的机制反推为一开始即可全部预知。仅先识别变化维度和必要边界，扩展抽象由第二场景检验。

## 跨场景适用性审阅

- 研究：同样需要目标、知识依据和证据验收；模块可按检索、综合、核查组织，自主路径可随发现变化，默认不需要业务写入确认链。
- 编程：同样需要整体依赖与小任务闭环；数据概念可对应仓库状态、构建产物和变更记录，验收由测试及实际行为支撑，不默认需要独立数据库。
- 业务执行：额外重视身份、授权、重复动作与外部状态核验；节点数和存储实现仍取决于具体任务。

两张图分别表达开发协作过程与产品模块/数据职责；没有把开发 AI 的工作方式直接等同于产品 Agent 架构。七维度是跨阶段的问题清单，阶段分工表是推进顺序，两者用途不同。

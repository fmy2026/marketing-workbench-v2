# TASK-MWBV2-WORKFLOW-LOGIC-DOC-ARCHITECTURE-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKFLOW-LOGIC-DOC-ARCHITECTURE-20260909.json)。

## 目标

将当前逻辑图重构为先说明总机制、再说明流程模块与运行维度的静态机制文档；保留现有真实合同、边界与引用，不改变运行行为。

## 批准方案

用户已批准将文档从按实现细节连续展开的形式，改为“核心合同 → 三阶段七 Node → 资源与 Gate 状态 → Plan 执行协议 → 消费边界与引用”的总分结构。路线专属字段账本、接口参数、时间窗口和前端异常分支保留唯一权威来源的引用，不在逻辑图复制。

该选择落实 [Solution Design](../docs/Solution%20Design.md) 的单一权威、3 阶段 7 Node、Case/单一 Gate 和 Plan-bound 写入决策；不改变其中任何运行机制。

## 范围

- 重写 `docs/project-现在的逻辑图.md` 的静态说明结构与措辞。
- 在 `docs/Solution Design.md` 登记本次已批准的文档分层决策。
- 建立本任务合同、验证证据并按项目协议关闭任务。

## 非目标

- 不修改 `src/`、`frontend/`、`db/`、部署配置或平台接口。
- 不改变 Node、Gate、Plan/action 类型、确认语义、资源能力或业务动态事实。
- 不执行真实平台写入、OAuth 刷新或外部资产操作。

## 验收

- AC-01: 当前逻辑图将核心机制、Node 模块、资源/Gate 状态、Plan 协议和消费者边界分层表达，并保留唯一真值与正式写入链。
- AC-02: 文档准确保留 3 阶段 7 Node、资源三态、单一 Gate 投影、三类 Plan、精确确认和权威回查的现行合同；路线专属细节均指向其权威位置。
- AC-03: Solution Design 登记文档分层决策；项目合同与 Markdown 变更检查通过，任务按当前协议关闭。

## 停止条件

- 若简化需要改变任何既有 Node、Gate、Plan、资源能力或运行时安全边界。
- 若现行权威代码、数据契约与文档无法确定相同的静态机制。
- 若验证需要连接业务数据库、调用真实平台或扩大文件修改范围。

## 交付说明

完成后交付精简的总分式当前逻辑图、已登记的文档结构决策及可定位验证证据。状态和逐项验证只维护在 Manifest。

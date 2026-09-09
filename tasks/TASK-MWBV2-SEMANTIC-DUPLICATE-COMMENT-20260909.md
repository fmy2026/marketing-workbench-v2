# TASK-MWBV2-SEMANTIC-DUPLICATE-COMMENT-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-SEMANTIC-DUPLICATE-COMMENT-20260909.json)。

## 目标

将 OE3 标准项目创建前的同名查重扩展为通用的未删除语义标的与竞价策略查重，并使评论管理开启值作为路线默认字段受到强制校验。

## 批准方案

用户批准使用 route/game 合同承载九个语义比较字段；同名或语义命中均阻断，缺失列表字段或分页无法可靠完成时 fail-closed。官方创建文档复核后，用户明确确认“评论管理启用”发送 `is_comment_disable=ON`，替代初始方案中误写的 `OFF`。不增加 Node、Gate、Plan/action、公开 HTTP API 或数据库 Schema。

## 范围

修改共享 Node 05 duplicate readonly、JSZC 路线默认值 migration、相应 smoke、数据合同与机制/经验文档；只执行本地数据库 migration 与测试，不调用真实平台创建。

## 非目标

不修改已完成 Case、Job、Plan、confirmation、action、创建对象或回查记录；不新增账户、Case、Job 或用户专用分支；不修改预算、出价、资源、监测或平台凭据。

## 验收

- AC-01: 同名与未删除语义命中均阻断；已删除候选、不同语义和无候选不误阻断；列表/字段不可靠时 fail-closed。
- AC-02: 任意 fresh Job 的 payload 只能从路线默认值读取 `is_comment_disable=ON`，缺失或其他值被字段账本/preflight 阻断。
- AC-03: JSZC 默认值 migration 可重复执行且不改 Schema；数据合同、逻辑图、Solution Design 与 lessons 已同步更新且不含动态敏感内容。
- AC-04: 相关 smoke、数据库合同与项目闭环检查通过，且零真实平台创建调用。

## 停止条件

若官方列表响应不能提供可比较语义字段、分页不能可靠覆盖，或新增行为需要 Schema/API/Node/Gate/Plan 类型变更，则停止并报告；任何真实平台写入需求均不在本 Task 授权范围内。

## 交付说明

完成后交付通用语义查重、评论开启默认保护、可回归测试及脱敏经验沉淀；动态业务结论仍以 Postgres 为准。

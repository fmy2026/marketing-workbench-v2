# TASK-MWBV2-CONFIRMATION-SUBMISSION-STABILITY-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CONFIRMATION-SUBMISSION-STABILITY-20260913.json)。

## 目标

修复工作台确认卡点击后闪退或无响应：确认请求必须冻结当前 Job、Plan 与 hash，在提交期间保持稳定可见，并在异常后以服务端最新状态收口。

## 批准方案

按用户于 2026-09-13 批准的“确认按钮闪退的最小修复”实施。只修改工作台确认交互、相应回归验证和本机服务重载闭环；保留三阶段七 Node、冻结 Plan、单次 confirmation、统一 executor 和 Node 07 权威回查。

## 范围

- 确认按钮在提交前冻结 `jobId`、`planId`、`planHash` 与确认短语，提交中仅锁定当前按钮。
- 命令提交使用冻结上下文；失败后刷新服务器 Job View 并如实展示诊断或 Gate。
- 补充工作台确认交互回归测试，修正 API smoke 对动态视频显示数量的旧上限假设，并更新当前逻辑、方案决策和本机服务重载说明。

## 非目标

- 不修改数据库、Case、Job、Plan、confirmation、平台动作或创建规则。
- 不执行真实平台创建、资源写入、OAuth 刷新、预算或出价修改。
- 不增加确认、重试、写入入口或账户特例。

## 验收

- AC-01: 确认单击冻结当前 Job/Plan/hash，提交中不整页重绘，重复点击不产生第二个请求。
- AC-02: 请求失败后刷新服务端 Job View，保留可见状态并展示受控诊断或真实 Gate，不错误断言确认未登记。
- AC-03: conversation、progress、runtime policy、API smoke 和项目合同检查通过；本机服务重载后加载当前 main。

## 停止条件

- 需要修改当前业务事实、执行真实平台写入或扩大确认、重试、账户权限时停止。
- 发现修复不能保持 Plan-bound 单次消费和 Node 07 回查边界时停止。

## 交付说明

完成后记录代码、文档、回归与本机重载证据；当前业务 Case 的实际确认和创建仍由账户本人在工作台完成。

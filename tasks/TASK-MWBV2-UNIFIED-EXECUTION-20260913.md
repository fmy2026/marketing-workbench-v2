# TASK-MWBV2-UNIFIED-EXECUTION-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-UNIFIED-EXECUTION-20260913.json)。

## 目标

移除正式流程中的测试成功捷径，使隔离测试和正式流程共享同一套权限、确认与执行判断。

## 批准方案

用户要求继续执行已批准的通用机制最小简化方案 Task 2，并将验证聚焦核心权限链、Plan 编译和资源执行边界。

## 范围

移除 `mockReady`、`mockExecute`、`legacy_single_action` 和 `test_fake_transport` 对正式判断的绕过；将假传输和合成凭据保持在测试支持层。HTTP 请求不可选择测试模式。

## 非目标

不改变 Case/Job/Plan、3 阶段 7 Node、数据库结构、公共 HTTP 合同或真实平台写入策略。

## 验收

- AC-01: 正式工作流不再包含测试成功捷径或测试专用授权绕过。
- AC-02: 核心隔离测试覆盖成功 Plan、缺少确认/授权阻断与假平台传输。
- AC-03: 项目闭环检查及文档更新通过。

## 停止条件

出现无法解释的 Plan、Gate、确认或权限边界差异，或需要真实平台写入。

## 交付说明

交付单一执行规则与最小核心回归；逐项结果由 Context Manifest 记录。

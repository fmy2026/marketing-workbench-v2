# TASK-MWBV2-EVENT-ASSET-READBACK-DYNAMIC-VIDEO-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-EVENT-ASSET-READBACK-DYNAMIC-VIDEO-20260911.json)。

## 目标

在不扩大平台写入权限的前提下，修复事件资产创建后的受控只读可见性确认，并将当前必需视频集、实际视频 ID 和其数量统一收敛到物料包与已验证来源映射。

## 批准方案

已批准方案：创建成功后的事件资产只进行有界、精确 ID 的只读回查，绝不重发创建；工作台如实说明“写入已受理但未获权威回查”；视频数量由当前 active+required 物料包项派生，实际 ID 只来自 `materialSourceResources` 的 verified 映射。方案依据见 [Solution Design](../docs/Solution%20Design.md) 与当前逻辑图。

## 范围

允许修改事件资产执行器及只读链、工作台确认结果文案、视频集共享解析器及其消费者、相关 smoke、当前数据迁移和当前合同文档。

## 非目标

不重试或自动确认平台写入；不修改现有 Case/Job/Plan 动态业务数据；不回填、不迁移账户资源；不为旧 `asset.metadata.video_id` 增加兼容；不改变平台 API、授权边界或确认模型。

## 验收

- AC-01: 创建成功后的事件资产仅以响应 ID 和目标 App/实例完成有界只读身份回查；超时、缺 ID 或不匹配均不再次写入。
- AC-02: 工作台对已写入但未获回查的资源 Plan 提供脱敏、准确的受控反馈。
- AC-03: Payload、readiness、执行器与嵌套字段合同共享动态必需视频集，且仅消费 verified 来源映射。
- AC-04: 物料包与必需视频蓝图集合一致，当前合同不将视频数量写成流程规则。
- AC-05: 相关 smoke、schema 验证、变更检查和项目关闭检查均有实际证据。

## 停止条件

发现需要重发平台创建、修改当前业务事实、暴露原始平台响应/凭据，或需要超出批准范围的流程改造时停止并请求新授权。

## 交付说明

完成后记录代码、迁移、文档与验证证据；现有 Case 仅可通过工作台的 fresh readonly recovery 重新读取，不由本 Task 操作。

# __TASK_ID__

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/__TASK_ID__.json)。

## 目标

填写一个可独立验收的目标。

## 批准方案

填写用户批准的选择、依据和 [Solution Design](../docs/Solution%20Design.md) 对应决策；小改动也需写明问题、修正、验收与停止条件。

## 范围

填写允许修改的能力、路径和数据边界；精确路径同步到 Manifest.allowed_writes。

## 非目标

填写不处理的需求及禁止副作用。

## 验收

- AC-01: 填写可核验的完成条件；每项编号必须同时出现在 Manifest.validation_plan 中。

## 停止条件

填写权限、未知信息或范围冲突的停止条件；与 Manifest.stop_conditions 一致。

## 交付说明

完成后记录产物、影响与剩余限制。状态和逐项验证只维护在 Manifest，不在这里复制当前业务状态。

# TASK-MWBV2-CONVERSATION-START-PROGRESS-20260914

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CONVERSATION-START-PROGRESS-20260914.json)。

## 目标

将已完成 Intake 的流程启动入口移至对话内卡片，并在启动请求开始时展示右侧受控进度状态，使 Case 或 Job 建立前的失败也可见。

## 批准方案

用户已批准“对话启动卡片 + 即时进度侧栏”最小方案：不改平台写入、账户预检、后端接口或数据库；只复用现有 Intake、Case、Job 与进度投影，补齐启动前后的界面反馈。方案依据为 [Solution Design](../docs/Solution%20Design.md) 的统一 LaunchRequest、七节点进度与工作台 Gate 决策。

## 范围

修改投放创建前端、页面回归测试和当前逻辑图；建立并关闭本 Task/Manifest，更新项目指针。

## 非目标

不绕过或修复账户预检本身，不创建平台对象，不改变 Plan/confirmation 边界，不新增 API 或数据库字段。

## 验收

- AC-01: 自然语言和 JSON Intake 完成后仅在对话末尾呈现一个准确的启动卡片，草稿失效时同步移除。
- AC-02: 启动即显示右侧真实阶段；Case/Job 建立后显示服务端七节点，失败也保留受控说明。
- AC-03: 账户预检、Job 创建、运行失败及成功路径不重复请求、不伪造节点进度，并通过页面和进度回归测试。

## 停止条件

若需修改账户预检、平台写入、API/数据库合同，或无法取得现有测试所需的隔离环境证据，则停止并报告。

## 交付说明

完成后在 Manifest 记录验证证据、文档回写和剩余限制。

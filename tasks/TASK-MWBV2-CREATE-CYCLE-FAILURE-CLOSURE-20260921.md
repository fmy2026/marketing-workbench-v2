# TASK-MWBV2-CREATE-CYCLE-FAILURE-CLOSURE-20260921

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CREATE-CYCLE-FAILURE-CLOSURE-20260921.json)。

## 目标

修复确认创建第二执行轮在本地 Skill 记录写入时被遗留唯一约束阻断、Plan 长留 `executing` 的通用故障，并在严格零动作核验后收口截图 Case，使其回到既有只读恢复路径。

## 批准方案

采用已批准的最小闭环：新增幂等迁移删除 `launch_skill_runs_unique_attempt` 并保留四字段跨执行轮次唯一性；确认领取后的零动作异常安全消费旧 Plan，记录明确 blocker，禁止重放。对截图 Case 仅在同一失败尝试、无运行中执行轮次、无平台 action／投递／创建对象时执行一次本地状态收口；随后仅由本人重新只读准备、核对新 Plan 并确认。

## 范围

修改执行记录 Schema、确认创建异常收口、服务端进度投影测试与当前机制、数据、部署文档；在隔离数据库验证后，迁移生产 Schema、发布固定版本，受控修复指定 Case 的本地状态并核验既有恢复 Gate。

## 非目标

不增加账户、Case 或 Job 专用运行时分支；不变更七节点、Gate、LaunchRequest、确认协议或平台适配器；不重放旧 Plan/confirmation，不执行项目创建、平台重试或凭据操作。

## 验收

- AC-01: 新迁移可重复执行，移除遗留三字段唯一约束并保留四字段跨执行轮次唯一性；隔离库同一 Job 的不同 cycle 可记录，同 cycle 仍幂等。
- AC-02: 确认创建在领取后、任何平台动作前发生本地异常时安全收口为零动作受阻，旧 Plan 不能重放，Case 仅开放既有 fresh readonly recovery。
- AC-03: 存在 action、投递、对象或核验错误时不归类为零动作恢复，不创建 successor Plan 或自动重试。
- AC-04: HTTP、浏览器和进度投影一致显示受阻原因与只读恢复入口，不再将失败 Job 误报为创建中。
- AC-05: 生产迁移和目标 Case 收口均经锁定条件核验；修复过程新增平台写入为零，发布版本、远端 main 与服务运行版本一致。

## 停止条件

当前 Case 状态、Plan 绑定或零动作证据变化；修复需要扩大为平台写入、确认重放、账户专用路径或改变七节点/Gate；任一隔离或发布验证失败。

## 交付说明

完成后在 Manifest 中记录隔离验证、迁移与 Postgres 安全证据。开发和状态收口不表示项目已创建；业务创建仍需本人针对新的冻结 Plan 独立确认。

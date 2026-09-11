# TASK-MWBV2-GET-CORE-CONTEXT-ALIAS-FIX-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GET-CORE-CONTEXT-ALIAS-FIX-20260911.json)。

## 目标

修复 `getCoreContext` 的视频来源资源子查询引用不存在 `j` 别名而造成的创建 Case 前只读查询 500。

## 批准方案

用户批准：仅将 `materialSourceResources` 子查询的 route/game scope 从错误的 `j` 别名改为当前 `getCoreContext` 外层存在的 `r/g`；保持 `material_source_account.advertiser_id` 的唯一来源账户筛选，不改变 Case、Job、Gate、Plan、确认或平台写入机制。

## 范围

- 修复仓储只读 SQL 的别名作用域。
- 扩展现有真实 `getCoreContext` smoke，覆盖 `materialSourceResources` 输出。
- 运行指定回归、重启本地工作台并只验证 HTTP 可达。
- 允许更新本 Task、Manifest、项目指针及无敏感信息的验证证据。

## 非目标

- 不新增 migration、数据回填、4xx blocker 或兼容回退。
- 不修改视频 ID 唯一来源，不使用旧 `asset.metadata.video_id`。
- 不提交新的工作台启动、confirmation、平台写入或 OAuth 刷新。

## 验收

- AC-01: `getCoreContext` 的真实数据库 smoke 通过，且 `materialSourceResources` 为数组。
- AC-02: 视频执行器、工作台前端与 5xx 边界 smoke 通过，差异无空白错误。
- AC-03: 本地工作台重启后局域网入口返回 200；不产生新的业务写入。

## 停止条件

如修复需要更改 Schema、动态业务数据、资源来源、Gate/Plan/确认或平台写入语义，停止并另建专项任务。

## 交付说明

完成后，新的账户可越过 `getCoreContext` 别名错误进入既有唯一只读主链；其他阻断继续按既有受控机制处理。

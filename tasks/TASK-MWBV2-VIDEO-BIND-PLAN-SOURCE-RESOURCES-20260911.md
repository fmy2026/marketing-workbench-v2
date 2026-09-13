# TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911.json)。

## 目标

修复 `getLaunchJobBundle()` 缺失 `materialSourceResources` 导致 `video_bind_plan_empty` 的问题。目标是恢复 `buildVideoMaterialPreparePlan` 能够通过物料包 `required=true + active` 的视频集合，从物料户映射读取 `oceanengine_video_mapping.status=verified` 的实际视频 ID，不改变流程机制。

## 批准方案

用户批准的变更范围为仓储真值装载、已提交集成改动的最小收尾与视频资源就绪回归：

1. 在 `getLaunchJobBundle()` 中补齐 `materialSourceResources`；
2. 仍以 `game_route_defaults.raw_defaults.material_source_account.advertiser_id` 筛选物料户；
3. 仍只取同 `route_id/game_code` 的 `video_asset`；
4. 不恢复旧 `asset.metadata.video_id` 或目标账户资源回退。

本 Task 保留 `base_revision=d1983caa613bb4b5826d77129e17416d38ddead2` 及原始基线指纹。提交 `d5615ca` 与 `2cb200e` 已携带的文件逐项列入 Manifest 的精确 `allowed_writes`，作为同一集成验收的既存变更；不重设基线、不放宽为目录通配符，也不修改项目检查器绕过范围检查。

## 范围

- 核验并收口提交 `d5615ca` 的 Job bundle 来源资源装载与 `2cb200e` 的动态必需视频集、事件资产回查、字段合同及其已列明回归；
- 通用化 `scripts/06-launch-job-bundle-video-source-smoke.mjs`：必须显式提供 `--case-id`，不再默认某个业务 Case；
- 修正资源动作注册表的视频证据说明，并更新方案、逻辑图、数据契约的静态校验基线与来源边界；
- 完成本 Task 的 Manifest 验收、文档回写与关闭指针；具体既存改动文件仅以 Manifest 的精确清单为准。

## 非目标

- 不新增或改变事件资产、Plan、Gate、Node、HTTP API、数据库 Schema 或平台写入边界；
- 不引入任何硬编码“10”卡点逻辑；
- 不新增数据库迁移或历史数据回填。

## 验收

- AC-01: `npm run check:project -- --phase start` 通过且启动真值闭环一致；
- AC-02: 视频执行器、payload、引导视频与资源动作注册表回归通过；
- AC-03: 事件资产回查与工作台受控反馈回归通过；
- AC-04: 显式 `--case-id` 的 Job bundle 视频来源 smoke 通过，缺少该参数时明确失败；
- AC-05: 只读核验 active required 物料视频集与 required 视频蓝图集合一致；
- AC-06: 项目合同 smoke 与 Git 空白检查通过。

## 停止条件

- 本任务范围外需要触及事件资产写入流程；
- `materialSourceResources` 恢复后出现平台写入越权或与已有 4xx blocker 语义冲突；
- 验证发现缺少可追溯证据或环境状态不稳定时停止并请求确认。

## 交付说明

完成后只提交最小收尾。Case 侧建议仅对该卡点 Case 执行一次“重新只读准备”，观察视频执行器是否仍出现 `video_bind_plan_empty`；该业务动作不属于本 Task。完成后按项目协议关闭任务，再通过 PR 合入 `main`。

# TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911.json)。

## 目标

修复 `getLaunchJobBundle()` 缺失 `materialSourceResources` 导致 `video_bind_plan_empty` 的问题。目标是恢复 `buildVideoMaterialPreparePlan` 能够通过物料包 `required=true + active` 的视频集合，从物料户映射读取 `oceanengine_video_mapping.status=verified` 的实际视频 ID，不改变流程机制。

## 批准方案

用户批准的变更范围仅限仓储真值装载与视频资源就绪回归：

1. 在 `getLaunchJobBundle()` 中补齐 `materialSourceResources`；
2. 仍以 `game_route_defaults.raw_defaults.material_source_account.advertiser_id` 筛选物料户；
3. 仍只取同 `route_id/game_code` 的 `video_asset`；
4. 不恢复旧 `asset.metadata.video_id` 或目标账户资源回退。

## 范围

- 修改 `src/repositories/postgresRepository.mjs` 的 `getLaunchJobBundle()`；
- 新增 `scripts/06-launch-job-bundle-video-source-smoke.mjs`，对真实 Case Job 做 `materialSourceResources` 与 `buildVideoMaterialPreparePlan` 的联合断言；
- 更新 `project.state.json` 的 `active_task` 指针到当前任务。

## 非目标

- 不修改事件资产、Plan、Gate、Node 或平台写入边界；
- 不引入任何硬编码“10”卡点逻辑；
- 不新增数据库迁移或历史数据回填。

## 验收

- AC-01: `npm run validate:schemas` 通过；
- AC-02: `npm run test:video-material-executor` 通过；
- AC-03: `node scripts/06-launch-job-bundle-video-source-smoke.mjs` 在目标 Case 上通过（`buildVideoMaterialPreparePlan` 不再抛 `video_bind_plan_empty`）；
- AC-04: `npm run check:project -- --phase start` 通过且启动真值闭环一致。

## 停止条件

- 本任务范围外需要触及事件资产写入流程；
- `materialSourceResources` 恢复后出现平台写入越权或与已有 4xx blocker 语义冲突；
- 验证发现缺少可追溯证据或环境状态不稳定时停止并请求确认。

## 交付说明

完成后只提交最小修复与回归脚本。Case 侧建议仅对该卡点 Case 执行一次“重新只读准备”，观察视频执行器是否仍出现 `video_bind_plan_empty`。完成后请按项目协议在该任务下做任务关闭检查。

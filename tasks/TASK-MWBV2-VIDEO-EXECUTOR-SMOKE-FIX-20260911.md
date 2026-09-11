# TASK-MWBV2-VIDEO-EXECUTOR-SMOKE-FIX-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-VIDEO-EXECUTOR-SMOKE-FIX-20260911.json)。

## 目标

修复视频素材执行器 smoke fixture，使其仅以已验证物料户映射提供视频 ID，并恢复该定向 smoke。

## 批准方案

用户已批准最小修复：仅更新 `scripts/04-video-material-executor-smoke.mjs` 的 fixture。每个 required 视频提供 `materialSourceResources` 的 verified `oceanengine_video_mapping`，移除旧的 `asset.metadata.video_id`，保留既有批量断言并增加映射已被读取的断言；不修改运行时机制、数据库、工作台或文档。

## 范围

- 允许修改视频执行器 smoke fixture。
- 允许更新本 Task、Context Manifest 与项目当前任务指针。

## 非目标

- 不修改生产执行器、Node、数据模型、工作台或平台接口。
- 不调用 OceanEngine、乾坤或 Postgres。
- 不引入未验证映射或旧 `asset.metadata.video_id` 的兼容回退。

## 验收

- AC-01: 单视频和双视频 fixture 均从 `materialSourceResources` 的 verified 映射取得视频 ID，绑定计划及既有批量断言通过。
- AC-02: `npm run test:video-material-executor` 与 `git diff --check` 通过，且改动仅在批准范围内。

## 停止条件

如修复需要改动生产运行时、数据库、工作台、平台调用或引入旧字段回退，停止并保持现有机制不变。

## 交付说明

完成后将恢复视频执行器定向 smoke 对当前唯一数据合同的覆盖；不产生业务或平台副作用。

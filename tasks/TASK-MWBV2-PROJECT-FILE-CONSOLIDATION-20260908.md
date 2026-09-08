# TASK-MWBV2-PROJECT-FILE-CONSOLIDATION-20260908

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-PROJECT-FILE-CONSOLIDATION-20260908.json)。

## 目标

将可恢复代码和过期项目文件统一收口到 `.archive/`，修复乾坤 API 文档引用，并用项目检查器阻止归档、文档路径和 migration 编号再次漂移。

## 批准方案

用户批准保留 `docs/.参考文档/`、`docs/.开发方案/`、`docs/.问题排查/` 现状；乾坤当前 API 文档使用 `docs/qiankun-api-docs-20260827.md`。`scripts/archive/`、旧 `ops/` 配置及 `docs/.乾坤系统/` 的其余旧材料迁入唯一归档根 `.archive/`，不改变业务流程、数据库结构或平台权限。

## 范围

允许修改项目控制协议、当前逻辑图、数据契约、Solution Design、归档隔离检查、项目合同检查、乾坤 monitor 文档引用，以及上述明确批准的文件移动。精确路径以 Manifest `allowed_writes` 为准。

## 非目标

不修改三个指定保留目录，不批量改写历史 Task/Manifest，不拆分业务模块，不执行数据库迁移、备份、恢复、真实平台调用或运行事实写入。

## 验收

- AC-01: `.archive/` 成为唯一归档根，`scripts/archive/` 与 `ops/` 不再存在，归档索引完整且归档代码无 package/runtime 入口。
- AC-02: 乾坤 API 文档只使用新路径；当前代码和文档不再引用旧路径或不存在的 2026-08-25 文档。
- AC-03: 三个指定保留目录内容与 Git/本地状态均未改变，Task/Manifest 历史原位保留。
- AC-04: 项目检查器能阻止第二归档目录、归档遗漏、当前乾坤文档缺失以及新的 migration 编号冲突，并兼容两个历史 `015`。
- AC-05: 当前文档数量说明正确，项目合同、工作流隔离和相关回归检查全部通过。

## 停止条件

发现需要修改指定保留目录、业务行为、数据库结构或平台权限；或者现有归档文件仍被正式运行链依赖时停止。

## 交付说明

已将脚本历史、旧 launchd 配置和乾坤旧辅助资料统一归入 `.archive/`，建立覆盖全部归档组的索引，并修复乾坤 API 文档入口。项目检查器现会阻止归档入口、Task/Manifest、乾坤文档路径和 migration 编号再次漂移；三个指定隐藏文档目录保持逐文件内容不变。完整验证见 `evidence/TASK-MWBV2-PROJECT-FILE-CONSOLIDATION-20260908/validation.md`。

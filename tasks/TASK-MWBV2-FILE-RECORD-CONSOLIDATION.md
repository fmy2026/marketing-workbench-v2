# TASK-MWBV2-FILE-RECORD-CONSOLIDATION

状态：completed

更新时间：2026-08-27 CST

## 目标

将 v2 长期文件机制说明收口到 `AGENTS.md`，使 `project.state.json` 只保存动态运行状态与权限边界；归档重复或过时的工作台逻辑说明，不改运行代码、数据库或平台状态。

## 范围与边界

- 精简 `AGENTS.md` 的启动、真值、运行链路、归属、记录和安全规则。
- 删除 `project.state.json.source_of_truth` 的静态机制详情，保留动态状态和 `guardrails`。
- 将两份 `docs/工作台逻辑底层/` Markdown 移至 `.archive/工作台逻辑底层/`。
- 不删除归档内容，不改变 Postgres、平台权限、运行代码或历史业务结论。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 建立任务卡、manifest 和 active task | passed | 文档收口任务已挂入项目状态 |
| 收口长期机制入口 | passed | `AGENTS.md` 成为唯一长期机制说明入口 |
| 归档重复文档 | passed | 两份说明已移至 `.archive/工作台逻辑底层/` |
| 验证并关闭任务 | passed | JSON、guardrails、路径和 diff 检查通过 |

## 验收

- `AGENTS.md` 是唯一长期机制说明入口，开发方案仅按需参考。
- `project.state.json` 不含 `source_of_truth` 静态机制对象，且 guardrails 不变。
- 两份工作台逻辑文档仅存于 `.archive/工作台逻辑底层/`。
- JSON、路径检查和 `git diff --check` 通过。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `project.state.json` 与 manifest JSON 解析 | passed |
| `source_of_truth` 已移除、`active_task=null` | passed |
| guardrails SHA-256 | passed；与变更前一致 |
| 两份文档归档存在、原路径不存在 | passed |
| `AGENTS.md` 不再默认引用工作台逻辑文档 | passed |
| `git diff --check` | passed |

## 最终结论

本任务完成。长期文件机制已收口到 `AGENTS.md`；`project.state.json` 只保留动态项目状态和权限边界。未修改运行代码、数据库记录或平台权限。

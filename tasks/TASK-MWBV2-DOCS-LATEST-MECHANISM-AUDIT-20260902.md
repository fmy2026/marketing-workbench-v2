# TASK-MWBV2-DOCS-LATEST-MECHANISM-AUDIT-20260902

状态：completed

## 授权来源

用户于 2026-09-02 明确要求基于当前唯一底层机制审计并最小修正指定的核心文档，确保 docs 文档具有元信息与最后更新时间。

## 唯一目标

以当前 Git HEAD、`project.state.json`、7 Node 注册表、当前 Schema/migration 和已完成的工作台展示收敛为基线，校准六份指定文档及逻辑图图片；不改变运行代码、数据库、业务事实或权限机制。

## 精确范围

- 审计并按需修改 `AGENTS.md`。
- 审计并按需修改 `docs/project-数据与报表契约.md`、`docs/project-现在的逻辑图.md`、`docs/project-lessons.md`、`docs/Solution Design.md`。
- 为 `docs/project-现在的逻辑图.jpg` 补充可见元信息和最后更新时间；保留原逻辑图内容。
- 建立、执行并关闭本 Task、Context Manifest 与 `project.state.json.active_task`。

## 禁止

- 修改 frontend、API、workflow、Schema、migration、数据库 View 或运行主链。
- 调用外部平台、提交工作台命令、创建 runtime Job、消费 confirmation 或刷新凭据。
- 把动态账户、Case、Job、Plan、资源或平台状态写入 Markdown。
- 在 `project-lessons.md` 新增未经授权或未经验证的长期经验；只允许补齐元信息并修正与当前机制冲突的既有复用指引，历史事实不得改写。

## 验收

- 六份指定文档/图片均能明确看到元信息和最后更新时间。
- Markdown 中的机制说明与当前唯一注册表、Case Gate 真值链、工作台投影边界和数据契约一致。
- 数据表/View/summary 列数与 migration 基线经只读合同校验确认。
- 逻辑图图片主体不被重绘或语义改写，只增加元信息区。
- `project.state.json.active_task` 在完成后恢复为 `null`，且 `git diff --check` 通过。

## 完成结果

- 六份指定文档/图片均已补齐或刷新可见元信息与最后更新时间，校验基线统一指向本审计任务。
- 统一写明工作台投影边界：右侧固定 3 阶段 7 Node，左侧承载动态 Gate/阻断/下一步/确认卡，底部保留进度与只读刷新；三者共享同一后端 Job View，不复制 Gate 计算。
- 补齐最新标准项目回查机制：Create Plan `ready → waiting_readback → consumed`，绝对 `0/3/5/8/10` 秒只读回查，以及 verified 后强校验、幂等收口 runtime Case 为 `completed`。
- JPG 仅增加顶部元信息栏，并定点校准“前端投影分区”和 Node 07 回查卡片；原有路线、7 Node、资源、Gate 与权限图主体保持不变。
- Postgres 只读确认 33 张基础表、5 个 View、`workflow_case_summary` 24 列；仓库确认 68 个 migration、最新 067；注册表确认 7 Node、8 类必需资源、34 个可追踪子节点。
- Schema、字段合同、工作流注册表、工作台进度/对话、标准项目回查与 verified Case 收口回归全部通过；平台写入与 token 刷新均为 0。

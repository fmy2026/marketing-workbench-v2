# 项目合同检查验收证据

任务：TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908。本证据仅记录开发验证，不声明任何业务 Case 成功。

## Schema

两份 JSON Schema、Task/Manifest 模板及当前项目状态已通过启动检查。校验器无新增依赖，支持本地 Schema 所用的明确子集；未知关键字拒绝，不冒充完整通用 JSON Schema 引擎。

正反例共 55 项通过，原始结构化结果见 [regression.json](regression.json)。覆盖错指针、错 ID、缺少文件或章节、历史资料混入必读、重复状态、验收编号遗漏、未知状态与 Schema 关键字。

## Lifecycle

同一回归验证启动→关闭前→关闭后正常链，及无证据、失败验收、遗留指针、错误最近关闭任务、未恢复授权、取消/未执行说明等异常。检查前后文件指纹一致，检查器只读、不执行 Manifest 命令、不访问数据库/平台。

Git 范围验证覆盖任务基线后的提交、暂存、未暂存、未跟踪、删除、重命名，以及“暂存修改后工作区恢复原文”的隐藏改动。基线脏文件指纹同时包含工作区和索引，后续更改不能冒充原有改动。

真实任务 start 检查已通过。真实 before-close / after-close 输出在实际执行后分别保存为 before-close.json / after-close.json；此处的生命周期验收首先由已运行 fixture 证明，不预先声明尚未执行的关闭步骤通过。

## Documents

43 处当前文档及验收说明本地链接/章节有效；Solution Design 保留有效选择、理由与依据，原始历史设计通过基线 Git 提交保留。早期入口标为 reference_only；逻辑图增加能力承接且不保存 active Task 快照；数据契约只解释数据接口，Gate 优先级表只保留在逻辑图。

核心键、时间、去重及人员指标按既有 SQL 静态核对。特别明确 active 与 blocked 可重叠、账户计数没有 source_usage 过滤、Case 计数只来自 runtime 明细。静态审计见 [static-audit.json](static-audit.json)，未执行在线数据库对账。

## Scope

业务 src、frontend、SQL、部署配置和既有历史 Task/Manifest 相对开始基线无改动；guardrails 逐字段一致。历史审计检查 206 份旧 Manifest，输出 320 条格式/路径诊断；诊断不证明业务失败，也不改写原文。完整报告见 [legacy-audit.json](legacy-audit.json)。

`node --check` 两个新增模块与 `git diff --check` 已通过。平台调用、数据库访问、授权变更、仓库 Git 提交/推送均为 0。

## Limits

检查器验证结构、引用、Git 可见改动和证据存在性；不能证明模型实际阅读、用户目标理解或证据语义正确。已有忽略文件中的运行数据不由 Git 差异检查覆盖。授权判断仍由既有 runtime 实现；本工具不是平台权限入口。

验证时间：2026-09-08T07:17:02.528+00:00。

## Actual closure

真实关闭前与关闭后检查均已执行并通过，输出分别见 [before-close.json](before-close.json) 与 [after-close.json](after-close.json)。Manifest 已为 completed，active_task 已清空，last_closed_task_ref 指向本 Task；未修改任何全局 guardrails。

# TASK-MWBV2-ARCHITECTURE-SCRIPT-TEST-OPS-LAYERING-20260830

状态：planned_blocked_by_formal_node1_7_certification

更新时间：2026-08-30 CST

## 目标

在正式新账户 Node 1–7 认证成功后，将脚本、测试和受控运维入口分层，保持 `src/` 为唯一业务机制来源，并修正 AGENTS 文档引用。

## 阻塞条件

本 Task 必须等待 `TASK-MWBV2-OE3-JSZC-FORMAL-NODE1-7-NEW-ACCOUNT-CERTIFICATION-20260830` 成功关闭。此前不得移动脚本、测试或 npm 入口，以免目录重构干扰正式认证。

## 已批准范围

- `scripts/cli/`：稳定 workflow、readonly readiness、monitor 入口。
- `scripts/ops/`：头像、DMP、视频、产品图、token、create-once 等受控入口。
- `scripts/diagnostics/`：状态、库存、回查、字段账本 attest 等只读诊断。
- `tests/smoke/{core,resources,monitor,platform}/`：现有 smoke。
- `.archive/<日期-用途>/`：耗尽的一次性实验脚本。
- 新增聚合命令 `test:core`、`test:resources`、`test:monitor`、`test:all`、`check:architecture-boundaries`。
- 单项 npm 命令保留一个过渡周期作为兼容别名。
- 架构检查阻断 `src` 引用 `scripts/tests/.archive`、package 指向 `.archive`、第二份 Node 定义及 one-off runtime import。
- AGENTS 文档路径修正为 `docs/project-逻辑图.md` 与 `docs/project-数据与报表契约.md`。

## 禁止范围

- 不删除历史 Task。
- 不让 `.archive` 成为 runtime 依赖。
- 不降低 Plan、confirmation、单次写入或人工 Gate。
- 不执行任何平台写入。

# TASK-MWBV2-RUNTIME-FILE-HYGIENE-ARCHIVE-CLEANUP

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户要求全面排查 `/scripts`、`/src` 和 `AGENTS.md`，将一次性临时任务脚本或没有实际运行作用的代码归档到 `.archive/`，并检查目录/文件分类是否合理。

## 结构化理解

本任务是文件卫生与运行边界清理，不改变业务逻辑、不改变数据库、不调用平台、不新建 runtime job。

## 目标

1. 盘点 `scripts/` 与 `src/` 文件角色、package 入口和 import 关系。
2. 将已完成任务的一次性脚本、旧专项清理脚本和未接入当前运行链路的代码移入 `.archive/`。
3. 从 `package.json` 移除已归档脚本命令，避免主入口指向 archive 外的旧文件。
4. 排查 `AGENTS.md` 是否需要补充临时脚本归档规则。
5. 保持 v2 独立运行链路清晰：`frontend/API -> src/workflows -> src/platforms + src/repositories -> Postgres`。

## 非目标

| 项 | 状态 |
| --- | --- |
| 重构运行时业务逻辑 | 不做 |
| 删除历史任务文件 | 不做 |
| 触碰 `.local` 凭据 | 不做 |
| 平台 API 调用 | 不做 |
| 新建 runtime job | 不做 |
| 旧项目 runtime 依赖 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| 一次性脚本已归档 | passed |
| `package.json` 不再引用归档脚本 | passed |
| `src/` 中未接入主链路的资源补齐 adapter 已归档 | passed |
| `AGENTS.md` 补充临时脚本归档规则 | passed |
| `npm run check:runtime-consistency` 通过 | passed |
| 本地工作台保持在线 | passed |

## 当前结论区

### 归档文件

| 原位置 | 归档位置 | 原因 |
| --- | --- | --- |
| `scripts/oe3-three-payload-comparison.mjs` | `.archive/20260824-file-hygiene-cleanup/scripts/oe3-three-payload-comparison.mjs` | 已完成一次性三方 payload 对比文档生成 |
| `scripts/oe3-reference-contract-readonly-reconciliation.mjs` | `.archive/20260824-file-hygiene-cleanup/scripts/oe3-reference-contract-readonly-reconciliation.mjs` | 已完成一次性 reference contract 复盘 |
| `scripts/confirm-create-preflight-smoke.mjs` | `.archive/20260824-file-hygiene-cleanup/scripts/confirm-create-preflight-smoke.mjs` | 历史 smoke，已由 `test:execution-grant` 覆盖 |
| `scripts/runtime-test-data-purge.mjs` | `.archive/20260824-file-hygiene-cleanup/scripts/runtime-test-data-purge.mjs` | 已完成专项 test_run 清理任务脚本 |
| `scripts/runtime-test-data-purge-check.mjs` | `.archive/20260824-file-hygiene-cleanup/scripts/runtime-test-data-purge-check.mjs` | 已完成专项清理校验脚本 |
| `src/platforms/oceanengineAccountResourceAdapter.mjs` | `.archive/20260824-file-hygiene-cleanup/src-platforms/oceanengineAccountResourceAdapter.mjs` | 未接入当前 frontend/API/workflow 主链路，且包含资源补齐/上传类准备逻辑 |
| `scripts/.DS_Store`、`src/.DS_Store`、`src/workflows/.DS_Store`、`src/workflows/skills/.DS_Store` | `.archive/20260824-file-hygiene-cleanup/system-files/` | macOS 系统文件，无运行作用 |

### 保留分类

| 目录 | 保留内容 |
| --- | --- |
| `scripts/` | 长期 CLI、smoke、check：workflow CLI、API smoke、readonly smoke、payload/test、token status/refresh、execution grant smoke、runtime consistency、单次 execution CLI |
| `src/server/` | 本地 API |
| `src/workflows/` | 主 workflow、execution grant 服务、命名器、OE3 Skill |
| `src/platforms/` | 凭据、readonly client/adapter、std_project create executor |
| `.archive/` | 已完成专项脚本、未接入主链路实现、历史参考 |

### AGENTS 更新

- `scripts/` 职责改为“长期可复用 CLI、smoke、check；一次性任务脚本完成后必须归档”。
- 新增 `.archive/` 目录职责：历史参考，禁止 runtime import、package script 或 API 调用。
- 闭环中新增：专项一次性脚本若不再属于长期入口，任务关闭后移动到 `.archive/` 并从 `package.json` 移除。

### 验证

| 检查 | 结果 |
| --- | --- |
| 当前 `package.json` script 目标存在 | passed |
| 当前 `package.json` / `scripts` / `src` 不再引用归档文件 | passed |
| `scripts/` 与 `src/` 下无 `.DS_Store` | passed |
| JSON 校验：`project.state.json`、manifest、archive manifest | passed |
| `npm run check:runtime-consistency` | passed |
| 本地 API 抽查 P03 | passed；`failed_waiting_manual_review`、`blocked_after_single_create_failure`、`retryAllowed=false` |
| 工作台进程 | 在线，`http://127.0.0.1:3000/` |

## 下一步 gate

`scripts/` 只保留常规 CLI / smoke / check；新增专项任务脚本在任务关闭时默认归档。下一步仍回到 P03 40000 的平台错误详情 / fresh runtime job dry-run gate。

# TASK-MWBV2-FINAL-WORKBENCH-FRONTEND-CONSOLIDATION

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json` 和 v2 当前前端/API 为准。

## 结构化理解

本任务只改造 `frontend/`，把投放创建工作台收敛为最终双栏布局：顶部栏、左侧对话 Intake、右侧 3 阶段 7 节点、底部单主按钮 `开始执行`。页面只展示用户决策需要的信息，不展示开发期任务、Skill 内部细节、payload、hash、脚本、表名、证据原文、mock、测试数据或平台响应原文。

## 目标

1. 固定顶部栏：`Agent 工作台 / 投放创建 / 当前用户`。
2. 左侧仅承担 Intake：对话、识别结果、LLM 配置图标入口。
3. 右侧仅展示 API 返回的 3 阶段 7 节点，不在前端定义第二套 Workflow。
4. 底部只保留进度 `n / 7` 与唯一主按钮 `开始执行`。
5. `开始执行` 调用现有 `/api/launch/jobs/:job_id/run` dry-run 能力，不绕过后端写入边界。
6. 移除开发期按钮、诊断弹窗、hash/API/证据/raw/mock 等用户无关信息。
7. 桌面与移动端无文字溢出或重叠。

## 允许修改

| 文件 | 用途 |
| --- | --- |
| `frontend/index.html` | 页面结构 |
| `frontend/app.js` | API 数据渲染与单按钮交互 |
| `frontend/styles.css` | 最终布局与响应式样式 |
| `tasks/TASK-MWBV2-FINAL-WORKBENCH-FRONTEND-CONSOLIDATION.md` | 任务卡 |
| `tasks-context-manifests/TASK-MWBV2-FINAL-WORKBENCH-FRONTEND-CONSOLIDATION.json` | 上下文清单 |
| `project.state.json` | 任务状态 |

## 禁止修改

| 范围 | 状态 |
| --- | --- |
| `src/workflows/`、`src/workflows/skills/` | 禁止 |
| `src/platforms/`、`src/repositories/`、`src/server/` | 禁止 |
| `db/`、`schemas/`、`scripts/`、`package.json`、`AGENTS.md` | 禁止 |
| 真实平台写入、token refresh、创建重试 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | completed |
| 页面结构为顶部栏 + 左侧对话 + 右侧 3 阶段 7 节点 + 底部单主按钮 | completed |
| 页面数据来自现有 v2 API，无前端硬编码业务真值 | completed |
| 工作台只保留一个用户执行命令 | completed |
| 节点状态与 API 返回一致 | completed |
| `npm run smoke:api` 通过 | completed |
| 前端 smoke 或等价检查通过 | completed |
| 桌面与移动端检查通过 | completed |
| 未修改禁止范围 | completed |

## 结果摘要

| 项 | 结果 |
| --- | --- |
| 顶部栏 | 已收敛为 `Agent 工作台 / 投放创建 / 当前用户` |
| 左侧 | 仅保留 Intake 对话、识别结果、LLM 配置图标和发送按钮 |
| 右侧 | 直接渲染 API 返回的 `phases`，不在前端定义第二套 7 节点 |
| 底部 | 仅保留 `进度 n / 7` 与主按钮 `开始执行` |
| 展示收敛 | 不展示 payload、hash、raw、token、Cookie、Skill、脚本、mock、测试数据或证据原文 |
| 权限边界 | 主按钮只调用现有 dry-run API，不执行真实创建 |

## 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --check frontend/app.js` | passed |
| `npm run smoke:api` | passed |
| `curl http://127.0.0.1:3000/` | 200 |
| Chrome desktop screenshot | passed：3 阶段、7 节点、无检测到文本溢出 |
| Chrome mobile screenshot | passed：3 阶段、7 节点、无检测到文本溢出 |
| 主按钮点击检查 | passed：loading/disabled 生效，完成后恢复 `开始执行` |
| 平台写入检查 | passed：目标 latest job `platform_actions=0`、`created_objects=0` |

## 说明

点击 `开始执行` 的验收会按现有后端 dry-run 重新计算当前 job。当前 API 返回的唯一阻断为 `readonly_permission_required`，前端只按 API 动态展示，不自行判断或绕过。

## 下一步 gate

完成后另起小后端任务：统一“工作台点击开始执行”与“任务命令确认变量”为单次 execution grant，使一次点击能在安全边界内跑完节点 1-7，并处理当前 `readonly_permission_required` gate。

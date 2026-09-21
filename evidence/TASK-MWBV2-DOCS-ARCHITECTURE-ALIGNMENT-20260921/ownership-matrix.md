# 文档职责核对表

核对时间：2026-09-21 CST。此表是本次 Task 的验收证据，不是新的长期规则来源。

| 内容 | 唯一完整位置 | 其他文档的处理 |
| --- | --- | --- |
| 项目启动、真值、权限与任务闭环 | `AGENTS.md` | 导航只链接；当前文档不复述启动协议 |
| Agent 职责、批准理由、未实施建议 | `docs/Solution Design.md` | 逻辑图只说明当前运行；导航只指路 |
| Agent 流程、模块关系、实现定位与页面状态 | `docs/project-现在的逻辑图.md` | 方案、数据和部署文档改为具体章节链接 |
| 市场情报接口、允许字段、分页、数量、趋势、模型输入与存储边界 | `docs/project-数据与报表契约.md#市场情报外部只读合同` | 逻辑图只描述何时查询和如何停止；部署说明不重复字段或产品行为 |
| 市场情报连接、Token 保存、模型配置、启动发布与真实联调操作 | `deploy/README.md` | 数据契约只链接连接位置；方案与逻辑图只链接操作位置 |
| 阅读顺序与当前文档入口 | `docs/README.md` | 不定义规则、数据或运行行为 |

## 静态事实核对

- `src/agents/agentRegistry.mjs`、`src/server/workbenchServer.mjs`、市场情报 Agent、平台、凭据和前端模块仍为逻辑图中列出的当前定位；本 Task 未移动代码。
- `package.json` 没有 `test:market-intelligence` 公开命令；`tests/market-intelligence.test.mjs` 位于 unit 与 workflow-regression 清单，`tests/market-intelligence-report.test.mjs` 未列入 `tests/suites.json`。此为后续测试入口整理事项，本 Task 未改动。
- `TASK-MWBV2-MI-SEARCH-REPORT-20260920` 的 Manifest 仍为 `cancelled`，AC-07 为 `not_run`；当前文档只保留该真实联调缺口，不把它写为通过。
- 本次仅做静态文档、路径和命令核对；未访问公共电脑、未重载服务、未读取凭据或写入业务数据。

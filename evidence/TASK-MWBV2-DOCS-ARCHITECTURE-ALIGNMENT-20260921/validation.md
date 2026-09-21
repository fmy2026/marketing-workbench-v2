# 文档整理验证记录

验证时间：2026-09-21T06:46:35Z。

| 验收 | 方法与结果 | 证据 |
| --- | --- | --- |
| AC-01 | 新增导航按公共基础、三个 Agent、新增 Agent 与历史证据提供阅读入口；四份既有当前文档均回链导航。 | `docs/README.md`、`ownership-matrix.md` |
| AC-02 | 市场情报完整定义分别收束为方案、运行、数据、操作；流程、数据和部署文档以具体章节交叉引用。 | `ownership-matrix.md`、文档差异审阅 |
| AC-03 | 五份当前文档均具备性质与状态、用途与范围、权威依据、最后更新、核验范围和更新条件；元信息未复制表数、文件数或动态状态。 | `docs/README.md` 与四份当前文档顶部 |
| AC-04 | 静态检查 200 个本地链接和标题对应；部署说明中的 8 个 `npm run` 命令均存在。`tests/market-intelligence-report.test.mjs` 未进入统一清单且没有专属 npm 命令，已只记录在本 Task 证据。历史市场情报 Manifest 保持 `cancelled`，AC-07 保持 `not_run`。 | `ownership-matrix.md` |
| AC-05 | `git diff --check` 与 `npm run check:project -- --phase start` 通过；关闭前、关闭后及 GitHub SHA 核验待本表后续记录。 | 本 Task Manifest、后续关闭证据 |

本次未访问公共电脑、未重载服务、未读取凭据、未执行部署或业务写入。

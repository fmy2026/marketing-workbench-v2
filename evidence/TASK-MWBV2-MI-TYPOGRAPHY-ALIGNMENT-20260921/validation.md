# 市场情报字体对齐验证

验证时间：2026-09-21T06:59:25Z。

| 验收 | 方法与结果 | 证据 |
| --- | --- | --- |
| AC-01 | 静态核对 14 个选择器。顶栏品牌和 Agent 名称为 14px，配置按钮为 12px，侧栏员工名称和导航为 13px，对话及模块标题为 22px，状态为 12px，正文和快捷按钮为 13px，输入框为 14px；字重和行高按投放执行对应层级收敛。 | `frontend/market-intelligence.css`、`frontend/styles.css` |
| AC-02 | 保留 `.mi-shell.is-sidebar-collapsed .mi-module-button` 的文字隐藏与图标替代规则；窄屏标题覆盖为 22px。隔离浏览器测试访问市场情报页面并通过 129 项检查，未访问外部服务。桌面自动化连接不可用，未生成交互截图。 | `node tests/market-intelligence.test.mjs` 输出 |
| AC-03 | `git diff --check` 与 `npm run check:project -- --phase start` 已通过；关闭前、关闭后和远端 SHA 核验在任务终态记录。 | 本 Task Manifest |

本次只修改 `frontend/market-intelligence.css` 的字体声明；未改动布局、颜色、文案、HTML、JavaScript、接口或业务逻辑。

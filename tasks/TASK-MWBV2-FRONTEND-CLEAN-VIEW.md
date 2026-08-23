# TASK-MWBV2-FRONTEND-CLEAN-VIEW

状态：completed

更新时间：2026-08-23 CST

## 目标

将当前 `frontend/` 页面从开发说明型展示调整为正式工作台预览页面，提升信息密度和文案质感。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 精简主界面说明文案、优化状态措辞、压缩节点和摘要区视觉密度 |
| 非目标 | 不改目录结构、不接 Postgres、不接真实平台、不做真实创建 |
| 涉及文件 | `frontend/index.html`、`frontend/app.js`、`frontend/styles.css`、`frontend/mock-launch-job.js` |

## 已完成

- 将页面可见的 `mock`、`第一阶段`、`占位`、`后续接入` 等开发态措辞改为正式工作台文案。
- 将顶部、LLM 配置、Agent 状态、Workflow 状态和对话回复改为简洁产品文案。
- 将节点详情和诊断明细压缩为业务状态表达。
- 调整节点卡片、摘要面板、顶部栏和间距，让页面更接近清爽工作台。

## 验收

| 标准 | 结果 |
| --- | --- |
| 打开 `frontend/index.html` 能看到完整工作台 | passed |
| 3 阶段 7 节点信息完整 | passed |
| 页面更像正式产品，不像开发说明页 | passed |
| 不新增后端、不接数据库、不触碰真实平台能力 | passed |
| 无 token、Cookie、完整触点 URL、raw payload、raw response | passed |

## 下一步

建立 Postgres 最小真值表，并填入一个账户、一款游戏、一条路线的样例数据。

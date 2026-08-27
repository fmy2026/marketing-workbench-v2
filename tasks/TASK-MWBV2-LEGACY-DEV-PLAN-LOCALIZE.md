# TASK-MWBV2-LEGACY-DEV-PLAN-LOCALIZE

状态：completed

更新时间：2026-08-27 CST

## 目标

将过时的早期开发方案从当前机制入口和 GitHub 当前版本中退出，仅作为本机历史资料保留，避免后续任务误把旧方案当作判断依据。

## 范围

- 将 `docs/开发方案/` 的三份旧方案移动到 `docs/.开发方案/`。
- 将 `docs/.开发方案/` 加入 Git 忽略规则，使后续不再上传 GitHub。
- 更新 `AGENTS.md`，明确点号目录不能作为启动必读、任务 manifest `read_order`、运行真值或需求依据。
- 更新本任务 manifest 与 `project.state.json` 闭环字段。

## 移动关系

| 原路径 | 本机保留路径 | sha256 |
| --- | --- | --- |
| `docs/开发方案/plan1-新项目最高效启动框架_20260823.md` | `docs/.开发方案/plan1-新项目最高效启动框架_20260823.md` | `78eb2ad22e53178861b23e5e88e7a3fbd4818a04e45cc4b3431fdffa78ffacce` |
| `docs/开发方案/方案-前端页面效果_html_20260823.html` | `docs/.开发方案/方案-前端页面效果_html_20260823.html` | `35cad14a172cef6ee338cb457dfb253e51f84d01814b3e371a4fdb0461aa6877` |
| `docs/开发方案/方案-投放创建Agent开发方案_20260823.md` | `docs/.开发方案/方案-投放创建Agent开发方案_20260823.md` | `75335f3212340ff40c7b540ef8c503e1b854a39109397105d153b2dda237685b` |

## 已验证

- 运行代码、API、脚本和 package 命令不引用 `docs/开发方案/`。
- 当前权威入口不再把旧开发方案作为按需参考来源。
- 已关闭的历史任务卡和历史 manifest 保留旧路径，仅作为审计记录。
- 本次不改运行代码、数据库、平台状态或权限边界。

## 下一 gate

业务下一 gate 不变：优先新建 Node 4 品牌行业只读参数诊断任务，定位 `baseline_brand_industry` 的受阻原因；诊断后新建 fresh runtime truth job 复核，禁止直接创建广告。

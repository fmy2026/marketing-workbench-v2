# TASK-MWBV2-WORKBENCH-MODULAR-NODE-VIEW

状态：completed

更新时间：2026-08-27 CST

## 目标

将工作台右侧收口为 3 阶段、7 个模块化节点卡片；每张卡片直接展示其子节点及后端持久化状态。

## 范围

- 在唯一节点注册表维护节点与子节点归属。
- API 返回节点与子节点的最小状态投影；保留旧 `subflows` 兼容字段。
- 前端只渲染 API 状态，默认执行 `dry_run`，仅消费后端下发的安全主操作。
- 增加 API 与工作流 smoke 覆盖；不改 schema、节点执行逻辑或平台状态。

## 不做

- 不新增或执行真实平台写入。
- 不由前端推断业务状态、读取 `project.state.json` 或展示诊断长文。
- 不新建第二份节点或资源定义。

## 验收

- API 稳定返回 7 个节点、29 个子节点；节点 4 复用 8 类资源定义。
- 新 job 的 Intake 与其三个输入项通过，其余子节点等待。
- 真实创建仅在后端 grant/范围校验通过时显示；已有尝试固定禁止重试。
- 通过工作流、API、grant、runtime consistency 和 diff 检查。

## 实施结果

- 注册表现在唯一维护 7 个节点、29 个稳定子节点；节点 4 从既有 8 类资源合同生成。
- job API 为每个节点返回最小 `children` 状态投影，并保留字符串 `subflows`。
- 工作台以 3 / 2 / 2 的阶段卡片展示节点与子节点；860px 起节点单列，560px 起子节点单列。
- 默认按钮只调用 `dry_run`；只有服务端精确 grant 与创建就绪同时成立时才返回“确认创建”，任何已有尝试均返回“禁止重试”。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run smoke:workflow-skills` | passed；注册表 7 节点、29 子节点、节点 4 八类资源 |
| `npm run smoke:api` | passed；初始/干跑子节点状态、monitor 优先级、资源映射、无敏感泄露 |
| `npm run test:execution-grant` | passed；精确 grant 显示确认创建，单次创建与回查仍受后端 scope 校验 |
| `npm run check:runtime-consistency` | passed；临时 `test_run` 已清理 |
| `git diff --check`、语法检查 | passed |
| 本机界面检查 | passed；桌面、860px、560px 均为 7 卡 / 29 子项，无横向溢出 |

## 关闭

未修改数据库 schema、运行节点逻辑、平台权限或真实平台状态。用于界面检查的精确 `test_run` job 已删除；guardrails 哈希前后一致。

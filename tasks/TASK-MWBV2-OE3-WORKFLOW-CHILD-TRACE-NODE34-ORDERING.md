# TASK-MWBV2-OE3-WORKFLOW-CHILD-TRACE-NODE34-ORDERING

状态：completed

更新时间：2026-08-27 CST

## 目标

收口 OE3 七节点的子节点追溯与 Node 3/4 备用页职责：每个工作台子节点能说明静态输入合同、执行模块、输出合同、停止条件和最近一次脱敏运行结果；Node 3 只解析游戏级备用页默认值，Node 4 只判断目标账户资源就绪。

## 机制逻辑

```text
Node 1 业务归一
  -> Node 2 账户与 monitor 上下文
  -> Node 3 游戏级保底定义
  -> Node 4 目标账户资源事实
  -> Node 5 草稿与创建 gate
  -> Node 6 单次创建
  -> Node 7 readback 与证据收口
```

纯只读运行最多形成 Node 5 的创建就绪结论；Node 6/7 仍需独立的单次真实创建授权任务。

## 范围与边界

| 允许 | 禁止 |
| --- | --- |
| 修改现有 registry、runner、Node 3/4 Skill、只读 CLI 与 smoke | 新建第二份节点定义、重写七节点、数据库 migration |
| 新增本任务卡、manifest 和状态记录 | `monitorSerialNumberAdd`、`std_project/create`、素材绑定/共享/上传、DMP/品牌/事件写入 |
| 本地 test_run 与测试数据清理 | token refresh、预算/出价修改、记录 token/Cookie/raw request/raw response/完整 URL |

## 实施项

1. 为 registry 子节点新增 `skill`、`pipeline` 或 `derived` trace；派生子节点保留 resolver，不伪造原子 Skill。
2. 在工作台节点视图输出 trace 的静态合同和最近一次脱敏运行摘要、blocker、证据引用。
3. 增加 runner 调度一致性校验；验证 Skill 的依赖顺序和节点归属，不重构现有调度数组。
4. 将备用页静态默认值解析与目标账户资源核验拆分；蓝图物化和只读写回后重新读取 bundle。
5. 将“已执行但 blocked”的 Node 4 只读 reconcile 显示为已运行且受阻。

## 验收

- 七节点的每个子节点都可追溯到有效 Skill/pipeline/resolver。
- 仅 Node 4 输出账户级备用页候选、可见性和 readback blocker；Node 3 不再产生 `backup_landing_page_resource_missing`。
- 所有 runner mode 的调度依赖与节点归属通过静态校验。
- 只读 CLI 区分“未执行”和“已执行但受阻”。
- 测试不调用任何真实平台写入；完成后 `active_task=null` 且 `platform_write_allowed=false`。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 建立任务卡、manifest、状态 | passed | 本任务为机制收口，不开启平台写权限 |
| 核对 registry、contracts、runner、Node 3/4、CLI | passed | 确认需修复备用页职责交叉、bundle 重载与 blocked 覆盖文案 |
| 子节点 trace 与 registry 校验 | passed | `32` 个子节点均为有效 `skill`、`pipeline` 或 `derived` trace；无无效引用 |
| Node 3/4 备用页职责 | passed | Node 3 为 `game_route_default`；Node 4 为 `target_account_readiness`，候选物化与只读写回后均重新读取 bundle |
| runner 调度一致性 | passed | `dry_run`、`execute_once`、`readback_only`、`planned_actions` 无依赖倒置、缺失或未注册节点 |
| CLI 覆盖统计 | passed | `blocked` 的 readonly reconcile 明确记为 `executed_blocked` |
| API smoke 真值对齐 | passed | 从唯一 registry 读取 `32` 个子节点；trace 对外字段保持脱敏 |
| 关闭任务 | passed | 当前机制任务已完成；后续真实只读复核由独立任务接管 |

## 验证

`test:baseline-resource-inheritance`、`smoke:workflow-skills`、`test:readonly-readiness-cli`、`test:resource-action-registry`、`test:payload-contract`、`test:execution-plan`、`smoke:api`、`check:runtime-consistency` 与 `git diff --check` 均通过。

验证仅使用测试 job 或本地夹具；没有调用真实平台写接口、没有 token refresh、没有创建 monitor 或广告。

## 下一 Gate

已新建账户 `1871922346964041` 的全链路真实只读复核任务。该任务仅更新 runtime truth 和脱敏证据；按 Node 4 的最新唯一事实阻断项，分别建立资源补齐任务，禁止直接创建广告。

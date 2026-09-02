# TASK-MWBV2-STD-PROJECT-READBACK-CLOSURE-20260902

状态：completed

## 授权来源

用户于 2026-09-02 批准“创建后回查与 5/7 状态的最小修复”并要求直接实施；回查时间点明确为创建后的 0、3、5、8、10 秒。

## 唯一目标

在不改变 Case、Schema、View、Gate、Plan 类型、确认机制、权限模型或平台 endpoint 的前提下，缩短标准项目创建后的同步只读回查窗口，修正 Node 5/6/7 投影、Plan 生命周期和工作台文案。

## 实现范围

- 标准项目 list 回查按绝对 elapsed 时间 0/3/5/8/10 秒执行，命中即停止；未命中保持 `created_pending_readback`。
- 创建已确认或 action 已成功时，Node 5 为 passed；readback-only 不得降低 Node 6 的 passed 状态。
- 将待回查 Case 展示为已暂停，清楚区分只读“刷新进度”与“继续执行”平台回查。
- Create Plan 在 action 成功后进入 `waiting_readback`，回查 verified 后进入 `consumed`。
- 只补充 mock/test_run 测试和脱敏状态证据；不得操作当前业务 Case。

## 禁止

- 真实 `std_project/create`、资源准备、monitor 创建、OAuth refresh、预算或出价变更。
- 自动确认、自动重试、后台 worker、数据库 Schema/View migration、Gate 或 Plan/action 类型变更。
- 保存 token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 可控时钟证明五次回查为绝对 0/3/5/8/10 秒，最长十秒，命中即停止。
- 五次未命中时 create 调用仍为一次；readback-only 不触发 create。
- 待回查显示 6/7 且已暂停；verified 显示 7/7 且已完成。
- Plan 生命周期为 `ready → waiting_readback → consumed`；重复确认和重复创建继续 fail-closed。
- 定向 smoke 与既有工作台、runtime policy、execution plan、workflow 回归全部通过。

## 停止条件

- 需要新增 Schema、View、公开 API、后台任务、权限放宽或真实平台写入。
- 现有严格 ID + 名称 API 回查条件无法维持。

## 完成记录

- 已将标准项目只读回查改为从本轮开始计算的绝对 `0/3/5/8/10` 秒；命中或 ID/名称不一致均提前停止，五次未命中保持暂停。
- 已将已持久化 create success 投影为 Node 5/6 通过，verified readback 投影为 Node 7 通过；旧快照刷新即可从 5/7 修正为 6/7。
- 已实现 Plan `ready → waiting_readback → consumed` 的受限转换，并保留单次确认和重复创建 fail-closed。
- 已通过定向回查、工作台、Case、执行授权、Plan、结果映射、runtime-policy、workflow-skills、Schema 与确认编排 smoke；所有平台请求均为假传输或无平台写入。

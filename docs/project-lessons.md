# Project Lessons

## 使用规则

本文件只记录已经由真实证据、机制验证和回归测试支持的可复用经验。它用于定位问题和选择解决思路；账户实时状态、job、计划、平台动作和证据仍以 `project.state.json`、Postgres、active task / manifest 与当前代码为准。

每个新案例均按文末模板追加。案例正文不记录账户 ID、job ID、token、Cookie、raw request/response 或完整 URL。

## 通用：Node 4 资源准备

```text
识别资源与目标账户
  -> 查游戏级保底定义
  -> 查目标账户真实只读状态
  -> 分类：已存在 / 缺失 / 写后待回查 / 平台异常 / 本地机制异常
  -> 生成 fresh plan
  -> 单次受控写入
  -> 真实回查
  -> 写入脱敏证据、关闭任务、沉淀可复用结论
```

旧账户已通过，只能说明存在可参考候选或历史路径；目标新账户仍必须做真实只读核验。

| 阶段 | 关键判断 | 结果 |
| --- | --- | --- |
| 保底定义 | 游戏、路线、资源蓝图和来源是否完整 | 缺失时先修复定义，不猜测候选 |
| 目标核验 | 目标账户是否真实存在、可见、可用 | 已通过则 no-op；缺失才可生成准备计划 |
| fresh plan | 当前只读结论与 prepare capability 是否一致 | 仅覆盖当前缺失资源 |
| 单次写入 | fresh job、scope、确认变量、官方合同是否精确匹配 | 不匹配则零写入停止 |
| 回查 | 写后官方状态是否达到通过标准 | 通过则放行 Gate；否则记录失败分类并停止 |

## 案例：账户头像

| 项 | 经验结论 |
| --- | --- |
| 问题表现 | 新账户头像为 `UNSET`，Node 4 头像 Gate 阻断。 |
| 根因 | 目标账户缺少头像；写入中间状态若不受数据库约束支持，可能在上传后、提交前中断。 |
| 解决思路 | 使用独立游戏级 `300x300 PNG` 头像资产；fresh preflight 后依次上传、提交、回查。产品图的平台资源 ID 不可直接假定为头像。 |
| 写入边界 | `ensure_resource:avatar` 仅一次；内部最多上传一次、提交一次；禁止自动重试。 |
| 通过标准 | `advertiser/avatar/get` 返回 `IN_AUDIT` 或 `AUDIT_PASS`。 |
| 失败分流 | 上传失败不提交；提交失败停止；审核拒绝更换资产后另建任务；回查未收敛记录证据；本地状态约束失败先修复 schema 与 executor 映射。 |
| 关键教训 | 写入前先确认所有中间和终态都受数据库约束支持；smoke 必须覆盖“上传成功、提交前状态落库”。 |
| 案例依据 | 已关闭的头像首次与恢复任务；`src/platforms/oceanengineAvatarExecutor.mjs`、`src/workflows/avatarExecutionScope.mjs`；`npm run test:avatar-executor`。 |

## 案例：DMP 保底人群包

| 项 | 经验结论 |
| --- | --- |
| 问题表现 | 新账户缺少保底 DMP 人群包，不能直接把历史候选写入广告 payload。 |
| 根因 | 候选集合只是参考；来源户、目标户、push plan 与已验证成员混用会造成误推或重复推送。 |
| 解决思路 | package set -> 来源户逐包 read/select -> 目标户逐包 read/select -> fresh missing plan -> 单包推送 -> 整组回查。 |
| 写入边界 | 仅推送 fresh plan 中目标户 `missing` 的成员；每次请求只对应一个成员和一个目标账户；已 `passed` 成员必须跳过。 |
| 通过标准 | 成员 read 命中、`select_type=1` 可投放、状态 available、未删除且未下线。 |
| 回查策略 | 全部单包 push 成功后，以 `0s / 3s / 6s` 轮询整组；不把即时不可见误判为失败。 |
| 失败分流 | 来源不完整、合同/凭据/权限异常时零写入停止；单包失败停止后续包；回查未收敛只记录待回查，不自动重推。 |
| 关键教训 | 目标状态按“package set + 成员 + 目标账户”保存；运行内存保留后续 Gate 所需安全输出，持久化 Skill 记录保持脱敏。 |
| 案例依据 | 已关闭的 DMP 只读、推送与剩余包闭环任务；`src/workflows/skills/oe3/04-dmp-readonly.mjs`、`src/platforms/oceanengineDmpExecutor.mjs`、`src/workflows/dmpExecutionScope.mjs`；`npm run test:dmp-executor`、`npm run test:dmp-readback`。 |

## 新案例模板

```text
问题类型：
典型表现：
适用范围：
根因：
判定路径：
解决思路：
单次写入边界：
回查与通过标准：
失败分流：
案例依据：
回归校验：
不适用边界：
```

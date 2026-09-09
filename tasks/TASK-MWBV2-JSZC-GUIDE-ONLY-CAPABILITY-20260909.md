# TASK-MWBV2-JSZC-GUIDE-ONLY-CAPABILITY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-JSZC-GUIDE-ONLY-CAPABILITY-20260909.json)。

## 目标

将广告账户 `1867508089433225` 的已验证差异落实为“每条视频复用当前 Job 唯一引导视频、允许平台默认封面”，并以通用 capability 合同解除只读准备阻塞；不增加账户专用 runtime 行为。

## 批准方案

用户已批准以前向 migration 将该账户的 `video_cover_required` 从错误的 `true` 修正为 `false`，保持 `guide_video_required=true`。现有通用链已按两个正交 capability 处理 guide video 与 explicit cover，因此本任务只补齐 guide-only 组合的回归测试与当前文档决策，不新增 Node、Gate、Plan/action、API、公开脚本或账户 ID 分支。

迁移后复用当前零平台写入的 Case/Job 完整重跑只读准备；只有账户所有者在工作台完成精确确认后，才由既有 Plan-bound 链执行一次创建与回查。本任务不替代该确认，也不允许自动重试。

## 范围

- 新增受前置条件保护的账户 capability 修正 migration。
- 扩充 guide-only 的只读、payload 与项目创建回查 smoke。
- 更新 Solution Design、当前逻辑图和数据与报表契约的有效决策与迁移基线。
- 创建、运行并关闭本任务合同；在代码与数据合同验收后，将变更提交并推送至 `origin/main`。

## 非目标

- 不修改现有 Case、Job、Plan、confirmation、action、created object 或 readback 历史。
- 不增加账户专用 live `src/`、`frontend/` 或 `package.json` 条件分支。
- 不执行真实平台创建、OAuth 刷新、外部素材操作、预算或出价修改。
- 未完成真实创建与回查前，不更新 `docs/project-lessons.md` 为成功经验。

## 验收

- AC-01: 迁移仅修正获批账户为 `guide_video_required=true`、`video_cover_required=false`，并在不匹配的前置条件下拒绝执行。
- AC-02: guide-only 组合的只读准备、payload 和创建回查 smoke 均确认所有视频使用相同唯一引导视频、忽略显式封面；三种 capability 组合保持独立。
- AC-03: 当前文档只将该账户差异表达为 capability 数据，准确记录 077 迁移与默认封面规则，不引入第二份动态业务真值。
- AC-04: 项目合同、静态质量检查和相关 smoke 通过；变更不含 live runtime 账户 ID 分支、秘密或原始平台请求/响应。

## 停止条件

- 账户、route、game 或当前 capability 前置条件与批准方案不一致。
- 修正需要添加账户 ID runtime 分支、改变 Node/Gate/Plan/action 或扩大平台写权限。
- 只读准备无法得到唯一当前 Job 引导视频，或平台创建/回查需要在无账户所有者精确确认时执行。
- 任何真实创建失败或回查不一致；保留证据并停止，不自动重试。

## 交付说明

完成后已交付可重复执行的 077 前向修正、guide-only 回归覆盖、当前合同文档和验证证据。首次真实创建由平台以语义重复拒绝，未生成项目对象；该业务失败不改变本任务的 capability 验收结果，且已按停止条件结束旧 Plan。后续仅可经人工复盘批准、新替代 Case、fresh readonly 与账户本人新确认继续；真实成功后才可形成长期 lesson。

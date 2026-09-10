# TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-CACHE-BINDING-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-CACHE-BINDING-20260910.json)。

## 目标

修正 JSZC 引导视频只读缓存只在当前 Job 与唯一已核验实例精确绑定时复用的通用机制，使账户 `1867508116186632` 的现有 replacement Job 能完成一次真实只读核验；不修改任何创建权限或账户专用行为。

## 批准方案

用户于 2026-09-10 批准：以 `canonicalGuideVideoReadiness` 的既有 Job/实例绑定为唯一底层判断，旧 Job 或错误实例的 metadata 一律不命中缓存并进入现有 `gameplay/list` readonly；同一 Job 的已持久化结果继续缓存。修正后只通过 owner-bound 工作台“重新只读准备”恢复当前 replacement Case/Job，真实创建仍须等待 owner 的精确“确认创建”。

## 范围

- 维护本 Task、Manifest、项目状态与脱敏验证证据。
- 修改引导视频规范化绑定、缓存调用和既有内存 smoke。
- 重启现有 LAN 工作台服务，并对当前 replacement Case/Job 进行 owner-bound readonly recovery。

## 非目标

- 不修改公开 API、Schema、账户 capability、payload 默认值、Node、Gate、Plan 类型或确认短语。
- 不直接修改资源 metadata，不复制旧 Job 的 guide video ID，不创建第二个 replacement Case。
- 不确认、创建、重试或以 CLI/管理员身份绕过 owner、Plan binding、action grant 或平台回查。
- 不记录 token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- AC-01: 新 Task 启动检查通过，范围与既存脏文件基线准确。
- AC-02: 旧 Job 或错误实例的缓存均不能命中；当前 Job 的 passed、not_required、blocked 结果可缓存，相关 smoke 全部通过。
- AC-03: 服务重启后加载修正提交并保持健康；不改变公开接口、Schema 或平台写权限。
- AC-04: 当前 replacement Job 首次实际运行 `gameplay/list` readonly，写入当前 Job 绑定的脱敏 evidence，且 root blocker 不再是 `guide_video_current_job_readonly_missing`。
- AC-05: 若无其他 blocker，生成更高版本的单一 `std_project_create` ready Plan，保持逻辑 Attempt `0/1` 与零平台 action；若有真实新 blocker，保留证据并停止。

## 停止条件

- 当前 Case、Job、owner、一次逻辑 Attempt 或零平台 action 前提改变。
- 缓存绑定修正不能通过自动测试，或只读结果产生新的真实 blocker。
- 任何路径需要修改旧历史、直接写 metadata、扩大平台写权限或绕过 owner/confirmation。

## 交付说明

完成后记录代码与 smoke、服务加载和 Postgres 的脱敏事实。若产生确认卡，交付给账户 owner；本 Task 不执行真实创建。

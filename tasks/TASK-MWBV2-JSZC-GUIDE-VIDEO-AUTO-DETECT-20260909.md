# TASK-MWBV2-JSZC-GUIDE-VIDEO-AUTO-DETECT-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-JSZC-GUIDE-VIDEO-AUTO-DETECT-20260909.json)。

## 目标

将字节小游戏标准项目的引导视频能力改为当前 Job 的一次性只读自动识别，解除人工逐账户 capability migration 造成的分支漂移；在不创建平台对象的前提下，使当前 Case 可由其账户所有者重新准备至唯一“确认创建”卡。

## 批准方案

用户于 2026-09-09 批准以 `gameplay/list` 的 fresh readonly 结果作为 JSZC 引导视频字段的唯一运行时来源：唯一非空 ID 要求两条视频携带相同 ID；空列表允许省略；多候选或 probe 失败 fail-closed。`advertiser_accounts.guide_video_required=true` 仅保留为向后兼容的强制要求，不能把空 probe 降级为省略。`auth_status=ready` 仍判断授权就绪；`platform_status` 仅作诊断，不参与此分支。

## 范围

- 更新 route 默认合同、Node 04 canonical readiness、Node 05 payload/嵌套字段/成功画像与 Node 07 回查，全部读取当前 Job 绑定的脱敏 guide-video readiness。
- 新增前向数据库 migration，仅更新 JSZC route 默认合同；不修改任何账户 capability、Case、Job、Plan、confirmation、action 或历史对象。
- 覆盖唯一、空、多候选、probe 失败、强制开启为空、payload 92/94 字段账本、readback 和 corrective Job 幂等性测试。
- 更新 Solution Design、当前逻辑图及数据与报表契约；部署后由当前账户所有者执行一次“继续执行”作 fresh readonly 恢复。

## 非目标

- 不新增 Node、Gate、Plan/action 类型、公开 HTTP API 或账户/Case/Job/user ID 的 runtime 分支。
- 不以 `platform_status` 作为账户禁用判断，不改评论管理、预算、出价、DMP、品牌、素材、备用页或其他业务字段。
- 不代替账户所有者确认创建，不发起真实平台创建、自动重试、OAuth refresh 或任何权限扩大。

## 验收

- AC-01: JSZC fresh Job 对唯一已核验小游戏实例仅调用一次 `gameplay/list`，以实例平台 ID 绑定当前 Job canonical readiness 并决定引导视频字段；空、歧义和 probe 失败按批准规则处理。
- AC-02: Node 05、nested contract、success profile、preflight 与 Node 07 一致消费 canonical readiness；`is_comment_disable=ON` 不变，字段账本分别为 92 或 94。
- AC-03: route 默认合同和文档准确表达 capability 来源、强制兼容与 `platform_status` 边界，且未引入账户专用 runtime 逻辑或敏感数据。
- AC-04: 相关 smoke、数据库合同、项目启动检查、迁移备份/应用与服务重启通过；本次开发不新增 platform action、confirmation 或 created object。
- AC-05: 当前 Case 的账户所有者输入一次“继续执行”后，fresh Attempt 3 仅执行只读准备并且最多生成一张新的确认卡；若 probe 不能唯一确认则停止且不生成确认卡。

## 停止条件

当小游戏实例不唯一、`gameplay/list` 失败或返回多个引导视频、合同测试失败、需要账户专用分支、需要业务平台写入或需要输出敏感数据时停止。账户所有者未执行工作台命令前，不声称当前 Case 已到确认卡。

## 交付说明

交付通用 capability 自动识别、数据合同、验证证据和已部署服务。当前 Case 的实际 fresh readonly 由张境威在工作台完成；该操作仅会形成新 Draft/Plan，绝不替其确认创建。

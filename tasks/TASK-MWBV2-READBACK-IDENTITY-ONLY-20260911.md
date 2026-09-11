# TASK-MWBV2-READBACK-IDENTITY-ONLY-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-READBACK-IDENTITY-ONLY-20260911.json)。

## 目标

将 Node 07 的完成标准收敛为创建返回项目 ID 的权威列表回查与草稿名称一致；删除素材、封面和引导视频详情回查，不让已成功创建的项目因平台素材最终一致性延迟而无法闭环。

## 批准方案

用户于 2026-09-11 批准：创建前的素材、封面和引导视频合同仍由 Node 04、Node 05 与 preflight 保证；Node 07 只确认 `std_project/list` 的精确项目 ID 和名称。删除未使用的素材详情只读权限与运行态 pending 分支；不新增 Schema、Node、Gate、Plan、后台任务或公开 API。

## 范围

- 建立任务合同并维护当前项目指针。
- 精简 Node 07、其工作台投影、只读 client allowlist、相关 smoke 与当前机制文档。
- 保留现有项目列表五档回查和全部 ID/名称/传输 fail-closed 行为。

## 非目标

- 不创建、修改或删除平台对象，不确认新的 Plan，不刷新凭据。
- 不修改数据库 Schema、Case Gate、Plan 类型、Node 数量或历史 Task/证据/运行记录。
- 不覆盖本任务开始前已存在的 Node 05 限流恢复未提交改动。

## 验收

- AC-01: 对要求引导视频和封面的账户，只要项目 ID 与名称权威回查一致，Node 07 即 verified 且不调用素材详情接口。
- AC-02: 项目未出现、ID/名称不一致和传输失败仍 fail-closed，且不发生第二次 create。
- AC-03: 工作台只描述项目身份回查，不再展示素材关联为完成阻断。
- AC-04: Node 07、执行授权、对话/进度、workflow、runtime consistency 与项目闭环检查通过。

## 停止条件

- 删除素材回查需要改变创建前字段合同、Schema、Node、Gate、Plan 或公开 API。
- 无法保持 ID/名称权威回查和零重复创建。
- 需要账户 owner 以外的身份提交当前 Case 的命令或调用平台写接口。

## 交付说明

当前 Case 仅在部署后由其账户 owner 输入“继续执行”执行既有纯只读回查；本任务不代替 owner 操作，也不创建项目。

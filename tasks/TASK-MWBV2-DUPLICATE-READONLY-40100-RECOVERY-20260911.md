# TASK-MWBV2-DUPLICATE-READONLY-40100-RECOVERY-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-DUPLICATE-READONLY-40100-RECOVERY-20260911.json)。

## 目标

让 Node 05 标准项目查重在精确平台限流码 `40100` 下仅做一次有界只读恢复；恢复成功后继续既有同名和语义查重，其他失败保持 fail-closed。

## 批准方案

用户于 2026-09-11 批准：仅修改 Node 05 查重 Skill。首次 `HTTP 200 + api_code=40100` 后按确定性 20–24 秒等待并以相同参数重试一次；第二次仍限流时投影专属 blocker。不得改动通用只读 client、Node/Gate/Plan、数据库 Schema 或公开 API。

## 范围

- 创建任务合同并更新当前任务指针。
- 修改 Node 05 查重恢复、工作台 blocker 提示及相应 smoke。
- 同步 Solution Design 与当前逻辑图中的窄化只读限流规则。

## 非目标

- 不确认或创建标准项目，不刷新凭据，不修改资源、预算、出价或平台对象。
- 不新增 migration、表、View、Node、Gate、Plan 类型、后台队列或账户专用分支。
- 不保存 token、Cookie、完整 URL、raw request、raw payload、raw response 或平台消息。

## 验收

- AC-01: `40100 → 0` 仅增加一次相同参数 GET 并通过查重；`40100 → 40100` 形成专属 blocker。
- AC-02: 非 `40100`、超时、网络和解析失败均维持单次 fail-closed；原有重复、分页和字段完整性保护不回退。
- AC-03: 工作台展示明确限流恢复提示，证据只保存次数、最终码与恢复标识。
- AC-04: 查重、工作台进度、workflow 与 runtime consistency 测试及项目闭环检查通过。

## 停止条件

- 实现需要扩大为通用 client 重试、Schema/Plan/Gate 变化、后台队列或真实平台写入。
- 不能保持只读、单次重试、脱敏或既有 fail-closed 边界。

## 交付说明

交付 Node 05 的窄化 `40100` 只读恢复能力；当前业务 Case 仅在部署后由其账户 owner 自行触发“重新只读准备”，本任务不执行创建确认。

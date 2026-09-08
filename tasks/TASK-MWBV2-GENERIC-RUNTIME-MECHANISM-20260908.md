# TASK-MWBV2-GENERIC-RUNTIME-MECHANISM-20260908

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-GENERIC-RUNTIME-MECHANISM-20260908.json)。

## 目标

将 Case 耗尽后的替代验证、账户能力和运行期作用域收口为通用机制：运行代码不得依赖具体账户 ID，账户差异只能由 Postgres 通用能力字段表达，并通过项目合同检查持续阻止新的账户特例。

## 批准方案

保留 `video_cover_required` 作为通用账户能力，不把它扩展为全量 JSZC 账户强制规则；保持历史 migrations `074/076` 不变。删除 monitor runtime 默认账户 ID，改为要求调用方提供账户 scope；将 payload 回归改为能力开/关的内存 fixture；在 AGENTS、Solution Design、逻辑图和项目合同检查器中登记并执行“个体事实数据化、运行机制能力化”原则。

## 范围

允许修改 AGENTS、项目协调文件、通用 runtime 约束、monitor 配置默认 scope、payload/合同回归、相关当前文档和验收证据。精确路径见 Manifest。

## 非目标

不修改已应用 migration、账户 `1867508089433225` 的既有能力值、工作台 API、Node/Gate/Plan/action 类型或确认短语；不触发真实平台读取或写入，不修改业务 Case/Job/Plan/action/readback。

## 验收

- AC-01: 替代 Case 主链仍由通用 Case/Gate/owner/批准证据驱动，两个不同 fixture scope 均可幂等复用各自替代 Case，且无平台创建。
- AC-02: capability 开/关的 payload/readiness/readback 回归不再把生产账户 ID 当作机制前提，显式封面能力仍要求 fresh 验证和四字段 payload。
- AC-03: live runtime 无数字 advertiser ID 默认目标或账户 ID 条件分支；项目合同检查器存在正反例并 fail-closed。
- AC-04: AGENTS 和当前机制文档记录通用机制原则；相关测试、project 三阶段检查和 diff 检查通过。
- AC-05: 应用部署后 LAN 工作台返回 HTTP 200，真实平台写入为 0。

## 停止条件

任何实现需要重写历史 migration、改变账户能力业务值、扩大为全量账户封面强制、修改 Node/Gate/Plan/action/确认语义，或调用真实平台时立即停止。

## 交付说明

完成后记录通用机制、测试与部署证据。账户级动态事实继续只读 Postgres；本任务不产生真实平台业务结果。

# TASK-MWBV2-APPEND-RATE-LIMIT-RECOVERY-20260915

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-APPEND-RATE-LIMIT-RECOVERY-20260915.json)。

## 目标

为追加视频的精确 `HTTP 200 + code=40100` 系统限流建立与标准项目创建一致的、同一确认内最多三次错峰投递机制；终止旧 Case `CASE-MWBV2-718FF962130E387B3A`，交付可重新开始正式浏览器流程的最新工作台版本。

## 批准方案

用户批准沿用 `oc_project/material/create/`，不改为项目更新接口；只在新追加 Plan 中允许精确 40100 的有界错峰投递，其他结果绝不重试。旧 Case 以现有 `cancelled` 状态归档，保留全部审计记录。依据为 [Solution Design](../docs/Solution%20Design.md)、[project-lessons](../docs/project-lessons.md)、本地官方添加素材与频控文档。

## 范围

允许修改通用追加执行、Plan/授权合同、投递审计、进度投影、相关回归测试及权威文档；允许对指定旧 Case 执行一次受控归档事务；允许构建、推送、重载并核验公司工作台。

## 非目标

不发送任何新的真实平台追加 POST；不修改旧 Plan、confirmation、action 或回查审计；不增加长期专项入口、账户特例、Node 或 Gate；不将原始请求、响应或凭据写入仓库或数据库。

## 验收

- AC-01: 追加 Plan 只有精确 40100 才可在同一确认内最多投递三次，且每次请求 hash 相同。
- AC-02: 非 40100、超时、传输失败、重复确认和进程中断均不产生额外投递。
- AC-03: delivery 审计、40100 分类、回查查询状态和进度投影准确。
- AC-04: 指定旧 Case 在无在途 action 后归档，历史审计完整且不可继续执行。
- AC-05: 追加与创建回归、项目合同检查通过；版本已推送、发布、重载并完成在线 hash 核验。

## 停止条件

旧 Case 存在 in-flight 写入或等待中的投递；官方字段合同与现有执行合同冲突；任一修改要求扩大真实平台写入权限；部署无法恢复服务。

## 交付说明

完成后提供提交 SHA、在线 release SHA、旧 Case 归档证据及浏览器入口。真实追加成功由用户在新流程中确认并由权威回查判定。

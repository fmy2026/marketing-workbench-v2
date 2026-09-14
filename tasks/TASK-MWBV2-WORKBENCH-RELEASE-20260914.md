# TASK-MWBV2-WORKBENCH-RELEASE-20260914

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKBENCH-RELEASE-20260914.json)。

## 目标

将局域网工作台从旧发布快照切换至已推送的 `35d056a`，并以实际 HTTP 响应核验最新启动反馈页面已生效。

## 批准方案

用户明确要求发布最新版本。按 [部署说明](../deploy/README.md) 先生成固定提交快照，再以当前公司局域网地址重载 LaunchAgent，并检查根地址和页面标识。

## 范围

仅创建本次固定 Git 提交的本地 release、重载本机工作台 LaunchAgent，并进行只读 HTTP 核验。

## 非目标

不修改代码、数据库、账户预检或平台写入规则，不执行任何业务 Plan 或平台动作。

## 验收

- AC-01: release 根目录的 revision 为 `35d056a7a105a7ad7ab1fbc9cba2bcd0abbee618`。
- AC-02: 工作台继续监听当前公司局域网地址，根地址返回成功。
- AC-03: 工作台返回的 `app.js` 包含本次启动卡片和启动进度标识。

## 停止条件

若 release 构建、LaunchAgent 重载或根地址健康检查失败且自动回滚后仍无法恢复，则停止并报告。

## 交付说明

完成后在 Manifest 记录 release、HTTP 验证证据和项目闭环结果。

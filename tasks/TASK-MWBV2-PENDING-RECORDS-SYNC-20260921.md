# TASK-MWBV2-PENDING-RECORDS-SYNC-20260921

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-PENDING-RECORDS-SYNC-20260921.json)。

## 目标

补齐两组遗留任务和验收材料的 Git 记录，恢复标准任务模板路径，并准确表述市场情报真实联调缺口。

## 批准方案

用户于 2026-09-21 要求“尚未同步内容，先更新同步”。采用前轮最小收尾建议：原样补交公司共享发布与市场情报查询月报的历史 Task、Manifest 和证据，恢复 AGENTS 指定的模板路径，将 [Solution Design](../docs/Solution%20Design.md) 的市场情报完成表述限定为代码与模拟验证完成；按既有 main 交付流程提交、正常推送并核验远端 SHA。

## 范围

两组遗留任务/Manifest/证据的 Git 纳入、模板路径恢复、Solution Design 一句说明及本任务合同、证据和项目协调指针。

## 非目标

不改应用、数据库、运行服务或凭据；不更新桌面排查请求；不重启旧任务，不补造历史验收，不把真实联调 AC-07 改为通过。

## 验收

- AC-01: 九个历史文件与启动基线内容指纹一致，保留 completed/cancelled 与 AC-07 未运行事实；截图及文本人工审阅可纳入 Git。
- AC-02: 标准模板路径恢复且内容与 HEAD 原模板一致，方案说明不再暗示整体验收完成；改动仅在批准范围，项目合同校验和 Git whitespace 校验通过。

## 停止条件

发现未知并发改动、材料包含凭据、合同校验失败或远端分歧时停止交付并核对；不强推或改写历史证据。

## 交付说明

完成任务闭环后在本地 main 提交并正常推送 origin/main，核验远端 SHA。旧任务的真实联调缺口仍由其 Manifest 记录，本任务只完成记录同步。

# TASK-MWBV2-JSZC-QIANKUN-VIDEO-BASELINE-READONLY-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-JSZC-QIANKUN-VIDEO-BASELINE-READONLY-20260911.json)。

## 目标

将 JSZC-HUNT 保底视频静态基线切换为十个乾坤素材标识码，并以冯美钰授权对物料户 `1760246749825031` 完成乾坤身份、素材库与预热记录的真实只读核验。

## 批准方案

按 2026-09-11 已批准方案执行 Task 1 与 Task 2：备份后单事务应用 `086` 迁移；物料户 `1760246749825031` 正式绑定 `fengmeiyu`，虚拟 SSO `jushoutoufangongyong` 不取代真实授权人，其他真实人员的乾坤 token 可做只读核查。任何来源码缺失、类型不符或预热记录缺失均 fail-closed，不执行乾坤或 OceanEngine 写入。

## 范围

- 修正并应用 `086` 静态迁移。
- 备份、数据库只读验收、乾坤真实只读查询及最小事实落库。
- 更新实现与当前合同，使后续 Plan 仅使用物料户全页中来源码文件名唯一匹配并已核验的 OceanEngine 视频 ID。

## 非目标

- 不调用 `sync_material_option`，不尝试未文档化的首次预热。
- 不共享任何目标账户，不创建标准项目。

## 验收

- AC-01: 静态层精确为十条 active required QK 视频，旧本地视频条目不再参与。
- AC-02: 物料户身份仅使用 `fengmeiyu` 精确核验并保存脱敏最小事实。
- AC-03: 十个来源码完成乾坤素材库与预热列表真实只读核验，结果写入证据。

## 停止条件

身份不匹配、任一素材缺失或非视频、预热记录归属错误或缺失时停止，不产生平台写入。

## 交付说明

本 Task 已完成静态基线、物料户身份与十条来源码的只读库存核验：每条均唯一映射到真实 OceanEngine 视频 ID。目标户共享、绑定与项目创建须以独立冻结 Plan 和对应账户确认推进。

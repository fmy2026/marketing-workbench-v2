# TASK-MWBV2-OE3-DMP-BASELINE-SOURCE-TARGET-READINESS-1871922346964041

## Brief

为账户 `1871922346964041` 建立 Node 4 的 DMP 保底人群包原子子流程。系统需要能确定 JSZC 保底 DMP 集合，分别核验来源户和目标户；当来源户可用而目标户缺失时，只生成逐包推送计划，不执行真实 DMP push。

## Scope

- 新增 DMP package-set、package-member、push-plan 结构。
- 将 Node 4 DMP 子节点收口为可追溯 pipeline：
  `dmp-baseline-resolve -> dmp-source-readonly-verify -> dmp-target-readonly-verify -> dmp-push-plan -> resource-verify-dmp-audience-package`。
- 只读核验使用 `dmp/custom_audience/read` 与 `dmp/custom_audience/select`。
- 新增 DMP push dry-run 计划构造器和 CLI。
- 对账户 `1871922346964041` 创建 fresh runtime truth 只读复核 job。

## Non Goals

- 不调用 `dmp/custom_audience/push_v2`。
- 不创建广告项目。
- 不刷新 token。
- 不修改预算、出价、素材或 monitor。
- 不把 token、Cookie、raw request、raw response 写入项目文件。

## Expected Baseline

| 字段 | 值 |
| --- | --- |
| package_set_id | `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001` |
| semantic_key | `converted_exclude_tags` |
| payload_field | `audience.retargeting_tags_exclude` |
| source_advertiser_id | `1871922153496588` |
| target_advertiser_id | `1871922346964041` |
| candidate_count | `10` |

## Acceptance

- 数据库能区分保底集合、成员候选、来源户真实状态、目标户真实状态和逐包推送计划。
- DMP 子节点不再只有 `dmp_custom_audience_ids_missing`，而是输出来源核验、目标核验、可否推送和下一动作。
- 本任务真实平台写入数为 `0`。
- 若来源户 10 包全部通过且目标户缺失，下一 gate 为“DMP 默认集合逐包单次推送与回查”任务。
- 若来源户任一包未通过，停止于来源户缺失证据，不猜测替代包。

## Progress

- [x] 建立任务卡与 manifest。
- [x] 新增 DMP package-set/member/push-plan migration。
- [x] 补齐 Node 4 DMP pipeline Skill 合同与 runner 调度。
- [x] 新增 DMP push dry-run 计划构造器与 smoke。
- [x] 执行 migration 与回归测试。
- [x] 对目标账户执行 fresh runtime truth 只读复核。
- [x] 关闭任务并更新下一 gate。

## Result

完成。

最终 runtime truth job：`JOB-MWBV2-20260827122811-BF9632`。

关键结论：

| 项 | 结果 |
| --- | --- |
| DMP baseline resolve | 通过，保底集合 `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001`，成员数 `10` |
| source readonly | 通过，来源户 `1871922153496588` 的 10 个候选包均 read/select 通过 |
| target readonly | 阻断，目标户 `1871922346964041` 的 10 个候选包均缺失 |
| push plan | 已生成 `10` 条 `planned` 逐包推送计划 |
| platform write | `0` |
| launch confirmations | `0` |
| created objects | `0` |

本任务过程中发现并修复两个机制问题：

- `dmp/custom_audience/read` 官方字段为 `custom_audience_ids`，已从单数字段修正为复数 JSON 数组字段。
- `dmp-push-plan` 不能从脱敏 `launch_skill_runs` 输出取 ID，已改为从 `mwb.dmp_package_members` 状态表读取来源/目标核验结果。

下一 gate：新建“DMP 默认集合逐包单次推送与回查”任务，仅允许 `ensure_resource:dmp_audience_package`，逐包执行 `push_v2` 并立即 target read/select 回查；本任务不执行真实 push。

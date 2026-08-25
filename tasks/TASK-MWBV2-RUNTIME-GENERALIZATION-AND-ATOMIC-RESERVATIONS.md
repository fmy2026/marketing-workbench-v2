# TASK-MWBV2-RUNTIME-GENERALIZATION-AND-ATOMIC-RESERVATIONS

状态：completed

更新时间：2026-08-25 CST

## 目标

将 v2 收敛为每轮 job 独立运行、结束回到空工作台的通用模式，并以 Postgres 原子 reservation 保护项目序号与单次真实创建。

## 范围

- 新增 `mwb.project_name_reservations` 和 `db/015_add_project_name_reservations.sql`。
- 运行时项目名由 reservation 表占用；`runtime_truth` 永久占用，`test_run` 独立且可清理。
- 真实 `std_project/create` 在网络请求前原子 claim `mwb.platform_actions`。
- 工作台默认 idle；仅显式 `?job_id=` 读取历史 job。
- 归档已完成 P04 一次性视频脚本，移除 package 入口。
- 参数化 workflow CLI 和 runtime consistency check，移除固定 job/账户和 source record magic 值。

## 非目标

- 不调用 OceanEngine、不刷新凭据、不重试任何 create。
- 不删除历史 runtime job，包括 `JOB-MWBV2-20260825041227-12D2B5`。
- 不新增 job 列表或历史查询 UI。

## 数据真值

| 信息 | 真值位置 |
| --- | --- |
| job 历史和终态 | `mwb.launch_jobs` |
| 草稿和 payload hash | `mwb.launch_drafts` |
| 项目名占用 | `mwb.project_name_reservations` |
| 真实创建单次 claim/审计 | `mwb.platform_actions` |
| 当前工作台 | 浏览器会话；无持久化“last job”指针 |

## 权限

| 项 | 状态 |
| --- | --- |
| v2 Postgres migration/本地代码/任务文件 | 允许 |
| 真实平台写入、创建重试、token refresh | 禁止 |
| 旧项目运行依赖 | 禁止 |

## 验收

- 并发草稿获得不同 `Pxx`，同 job 重跑保持项目名和 hash。
- 并发 fake create 只允许一个 action claim 和一个 fake network create。
- 初始与终态工作台均 idle；显式 job URL 只读。
- `test_run` 不影响 `runtime_truth` 项目名占用。
- 已归档脚本不在 package/runtime 链路中。
- 不泄漏敏感字段，且不触碰旧库。

## 完成结果

- 已新增 `db/015_add_project_name_reservations.sql` 并应用到 `marketing_workbench_v2.mwb`；历史 runtime 草稿已回填 reservation。
- `mwb.project_name_reservations` 成为项目名占用真值；并发 test job 已验证获得不同 `P01` / `P02`，同 job 重跑保持项目名和 hash。
- 真实 create 在 `mwb.platform_actions` 写入 `started` claim 后才可调用网络；并发 fake grant 已验证只有一个 create 和一个 readback。
- 工作台默认 API 返回 `idle`，不加载历史 job；`?job_id=` 为只读查看模式。
- 已归档 P04 专项视频脚本并从 package 移除入口；workflow CLI 和 consistency check 改为显式参数。
- 未调用 OceanEngine、未刷新凭据、未重试 `JOB-MWBV2-20260825041227-12D2B5`。

## 下一步 gate

项目已进入 `idle`；下一次真实创建必须从新的 intake/fresh runtime job 和新的单次确认任务开始。

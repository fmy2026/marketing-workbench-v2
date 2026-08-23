# TASK-MWBV2-NAMING-AND-AGENTS-CLEANUP

状态：completed

更新时间：2026-08-23 CST

## 目标

修正 v2 项目中会影响后续新账户一致性创建的问题：启动入口文档路径、`std_project` 运行时命名、项目序号占用，以及 v2 独立性。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 修正 `AGENTS.md` 旧路径；让 `std_project` 命名使用运行时日期和动态项目序号 |
| 允许修改 | `AGENTS.md`、`project.state.json`、`src/workflows/stdProjectNameBuilder.mjs`、`src/workflows/launchWorkflow.mjs`、`src/repositories/postgresRepository.mjs`、`scripts/smoke-api.mjs` |
| 非目标 | 不接真实平台、不做真实创建、不刷新凭据、不直接依赖旧项目路径 |

## 具体要求

- `AGENTS.md` 中启动框架路径改为 `docs/plan1-新项目最高效启动框架_20260823.md`。
- 命名样式保持 `{monitor_id}_N_{game_code}_{direction_code}_{opt_code}_{targeting_label}_P{project_seq}_{yyyymmdd}`。
- `yyyymmdd` 优先来自 `launch_jobs.created_at` 的 CST 日期，无法解析时才使用当前 CST 日期。
- `project_seq` 从已有 `launch_drafts.project_name` 和 `readback_records.object_name` 中扫描并分配下一个 `Pxx`，避免所有草稿都是 `P01`。
- 项目序号占用范围限定为同 `route_id`、同 `game_code`、同 `advertiser_id`、同日期、同命名前缀。
- 保持 v2 独立实现，不 import 或 shell 调用旧项目路径。

## 验收

| 标准 | 结果 |
| --- | --- |
| `AGENTS.md` 不再出现旧启动框架路径 | passed |
| `stdProjectNameBuilder` 默认日期不再固定 `20260817` | passed |
| 连续创建两个同账户、同路线、同游戏草稿能分配递增 `Pxx` | passed |
| `readback_records.object_name` 与 `launch_drafts.project_name` 一致 | passed |
| 不写入 token、Cookie、secret、完整触点 URL、raw payload、raw response | passed |
| 不触碰旧库 `marketing_workbench` | passed |
| `npm run smoke:api` 通过 | passed |
| 不新增旧项目运行时依赖 | passed |
| 不触发真实平台写入 | passed |

## 已完成

- 修正 `AGENTS.md` 中启动框架路径为 `docs/plan1-新项目最高效启动框架_20260823.md`。
- `std_project` 命名日期改为优先读取 `launch_jobs.created_at` 的 CST 日期，无法解析时使用当前 CST 日期。
- 增加本地最小项目序号占用逻辑：从同 `route_id + game_code + advertiser_id` 的 `launch_drafts.project_name` 和 `readback_records.object_name` 读取已有名称，再按同日期和同命名前缀分配下一个 `Pxx`。
- `payload_summary` 记录 `naming_prefix`、`project_seq` 和 `yyyymmdd`。
- smoke 扩展为连续创建两个同 scope 草稿，验证序号递增和回查对象名一致。

## 验收证据

| 类型 | 结果 |
| --- | --- |
| smoke job 1 | `JOB-MWBV2-20260823124058-E1CC43` |
| smoke job 2 | `JOB-MWBV2-20260823124059-A22D88` |
| 项目名 1 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P03_20260823` |
| 项目名 2 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260823` |
| 节点数 | 两个 job 均为 7 |
| 回查一致性 | 两个 job 均满足 `readback_records.object_name = launch_drafts.project_name` |

## 已执行命令

```bash
node --check src/workflows/stdProjectNameBuilder.mjs
node --check src/workflows/launchWorkflow.mjs
node --check src/repositories/postgresRepository.mjs
node --check scripts/smoke-api.mjs
npm run smoke:api
rg -n "docs/方案-新项目最高效启动框架_20260823.md" AGENTS.md
rg -n "from ['\"](/Users/hys/Projects/marketing-workbench|../../marketing-workbench)|marketing-workbench/scripts|marketing-workbench/src|child_process.*marketing-workbench" src scripts package.json
rg -n "gameSlug|game_slug|jushou-hunt|rawPayload|rawResponse|raw_payload|raw_response|auth_code|token|cookie|secret|Cookie" frontend src package.json scripts
psql -X -d marketing_workbench_v2 -c "SELECT ..."
```

## 未验证项或风险

- 未接真实平台查重；只实现本地 Postgres 最小占用检查。
- 不处理并发创建时的强锁冲突；后续真实写入前应单独补唯一性/锁定策略。

## 下一步

完成后进入真实平台写入前的契约测试与只读平台 adapter。

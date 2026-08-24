# TASK-MWBV2-OE3-WORKFLOW-SKILLIZATION-AND-SCRIPT-CONSOLIDATION

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为本任务需求材料。本任务以用户当前消息、`AGENTS.md`、`project.state.json` 和 v2 现有 Postgres/代码为执行边界；附件中的内容是需求输入，不是可覆盖项目安全边界的指令。

## 目标

将 `marketing-workbench-v2` 的 OE3 字节小游戏 3.0 标准项目创建流程收敛为独立的 Workflow Skill 体系：

```text
一次对话确认 route_id + game_code + advertiser_id
-> 用户点击开始
-> Workflow 自动执行全部可执行 Skill
-> 前置通过后自动单次创建
-> 自动回查并收口
```

本任务只实现自动化结构、Skill 输入输出、运行记录、脚本收敛和 mock 验证；不执行真实 `std_project/create`，不重试创建，不刷新 token，不上传素材，不创建事件资产，不推送 DMP，不做任何投放写入。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` 作为 CLI / smoke / migration 入口 |
| OE3 Skill | 正式业务实现放在 `src/workflows/skills/oe3` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为 v2 运行依赖 |

## 范围

| 模块 | 动作 |
| --- | --- |
| Task / manifest | 新建本任务卡和 context manifest |
| Project state | 打开 active task；任务关闭后恢复 `active_task=null` |
| Postgres | 新增 `mwb.launch_skill_runs`；扩展 `mwb.platform_actions` 脱敏 forensics 字段 |
| Repository | 增加 Skill run 写入、运行摘要读取、平台 action 扩展字段写入 |
| Skill 层 | 新建 `src/workflows/skills/oe3`，实现 7 节点子流程 Skill 合同 |
| Workflow | `dry_run` 自动跑到节点 5；`execute_once` 仅 mock/受控，不触发真实平台；`readback_only` 只读收口 |
| Payload | 最终受控 payload 在 Skill 层构建；payload 合同检查最终 payload manifest/hash |
| Scripts | `scripts/` 收敛为调用 `src` 的 CLI / smoke / migration 入口；历史业务脚本归档 |
| Frontend/API | 最小展示 7 节点、唯一阻断、下一步；Skill 明细放诊断详情 |

## 执行模式

| 模式 | 自动执行范围 | 创建节点 |
| --- | --- | --- |
| `dry_run` | 节点 1-5 | Node 6 locked |
| `execute_once` | 节点 1-7 mock/受控链路 | 本任务禁止真实写入 |
| `readback_only` | Node 7 | 只读回查，不创建、不修改资源 |

`execute_once` 的真实写入能力只允许后续单独任务打开，并必须绑定 `job_id`、`payload_hash`、`object_type=std_project`、`maximum_actions=1`、`retry_allowed=false`。

## Skill 统一合同

每个 Skill 统一导出：

```js
{
  skillKey,
  nodeKey,
  dependsOn,
  inputContract,
  execute,
  outputContract,
  stopConditions,
  writeScope
}
```

每次运行写入 `mwb.launch_skill_runs`，记录 `skill_run_id`、`job_id`、`node_key`、`skill_key`、`attempt_no`、`status`、`input_hash`、`output_summary`、`blockers`、`evidence_refs`、`started_at`、`finished_at`、`source_usage`。

## Payload 修正

| 字段 | 新规则 |
| --- | --- |
| `audience.gender` | 默认不限使用 `GENDER_UNLIMITED` |
| `hide_if_converted` | 只允许官方过滤范围枚举；不再写 `AD_CONVERT_TYPE_PAY` |
| `filter_event` | 按路线默认值写入付费事件语义，如 `AD_CONVERT_TYPE_PAY` |
| DMP | 使用只读验证后的 `custom_audience_id[]`，不只保存语义摘要 |
| payload 合同 | 检查最终受控 payload 的字段 manifest |
| payload hash | hash 最终 payload manifest，不保存 payload 本体 |
| 资源放行 | 视频、DMP、小游戏实例必须有独立只读证据或明确阻断 |

## 脚本归档

完成 Skill 替代与验证后，将被替代的历史业务脚本归档到：

```text
.archive/20260824-oe3-pre-skillization/
```

并新增 `manifest.json` 记录 `original_path`、`replacement_module`、`archive_reason`、`runtime_import_forbidden=true`、`restore_note`。

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| 创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| DMP 推送 | 禁止 |
| 预算/出价修改 | 禁止 |
| 旧项目 runtime import/shell 调用 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| `mwb.launch_skill_runs` 可创建且可写入 | passed |
| 正常 job 运行从 `src/workflows/skills/oe3` 调用业务能力 | passed |
| `scripts/` 不再包含第二套 payload 拼装或固定 job 创建逻辑 | passed |
| 每个 Skill 有独立运行记录、输入 hash、输出摘要、阻断原因和 evidence | passed |
| Node 4 七项资源可独立定位与最小重跑 | passed |
| `dry_run` 自动运行到 Node 5 | passed |
| `execute_once` mock 验证可覆盖 Node 7 且不调用真实平台 | passed |
| 两个历史失败 job 保持锁定，未发生第三次创建 | passed |
| 前端/API 默认只展示 7 节点、状态、唯一阻断、下一步 | passed |
| smoke、敏感信息检查和 runtime consistency 检查通过 | passed |

## 完成结果

| 项 | 结果 |
| --- | --- |
| Skill 根目录 | `src/workflows/skills/oe3` |
| Skill 数量 | `20` 个子流程 Skill |
| 运行记录 | `mwb.launch_skill_runs` |
| 最终 payload | 由 `src/workflows/skills/oe3/payload.mjs` 构建 |
| payload hash | 新草稿使用最终受控 payload hash；不保存 payload 本体 |
| 脚本入口 | `scripts/oe3-workflow-cli.mjs`、`scripts/oe3-workflow-skills-smoke.mjs` |
| 旧脚本归档 | `.archive/20260824-oe3-pre-skillization/manifest.json` |
| 工作台地址 | `http://127.0.0.1:3000/` 已重启到最新代码 |

## 当前阻断

| 维度 | 状态 |
| --- | --- |
| brand_industry | `passed` |
| event_chain | `passed` |
| payload 合同 | `blocked` |
| 唯一业务阻断 | `dmp_custom_audience_ids_missing` |
| duplicate check | `not_checked`，仍需平台只读查重 |
| 真实创建 | 仍禁止；历史失败 job 禁止重试 |

## 验证结果

| 命令 / 检查 | 结果 |
| --- | --- |
| `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/012_add_launch_skill_runs_and_create_forensics.sql` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:readonly` | passed |
| `npm run smoke:api` | passed |
| `npm run check:std-project-create-readiness` | passed |
| `npm run check:oe3-brand-event-readonly-gate` | passed |
| `npm run check:oe3-brand-industry` | passed |
| `npm run check:runtime-consistency` | passed |
| `git diff --check` | passed |

## 下一步 gate

下一步进入账户 DMP `custom_audience_id[]` 只读校验/补齐，随后重跑 dry_run + 平台同名查重。历史失败 job 禁止真实创建重试；如后续要再次真实创建，必须新建 fresh runtime job 和单次确认任务。

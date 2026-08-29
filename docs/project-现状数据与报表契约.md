# marketing-workbench-v2｜project-现状数据与报表契约

```text
┌──────────────────────────────────────────────────────────────────┐
│ 权威：当前 PostgreSQL marketing_workbench_v2.mwb 数据 / 报表现状 │
│ DDL / 约束 / 迁移：db/*.sql                                      │
│ 动态运行事实：mwb schema                                         │
│ 当前节点与 Skill 合同：src/workflows/skills/oe3/                  │
└──────────────────────────────────────────────────────────────────┘

======================================================================
A｜当前数据流：业务真值 → 运行证据 → 当前运营报表
======================================================================

┌──────────────────────────────────────────────────────────────────┐
│ L1 业务配置真值                                                   │
│ platform_routes                                                   │
│   + games                                                         │
│   + game_route_defaults                                           │
│   + game_platform_apps                                            │
│   + game_assets                                                   │
│   + material_packs + material_pack_items                          │
│   + landing_page_assets                                           │
│   + game_route_resource_blueprints                               │
│   + game_route_launch_links                                      │
│   + dmp_package_sets + dmp_package_members                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  作用：定义“哪个游戏、走哪条路线、默认使用什么配置 / 资产 / 资源蓝图”。
  主定位：route_id + game_code。
  不承担：一次账户执行状态、Job 状态、统计报表。
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ L2 账户业务真值                                                   │
│ advertiser_accounts                                               │
│   + account_touchpoints                                           │
│   + account_resources                                             │
│   + dmp_package_member_account_states                             │
│   + qiankun_option_relations                                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  作用：定义“指定账户当前有什么资源、触点、授权关系和账户级状态”。
  主定位：route_id + game_code + advertiser_id。
  不承担：某次执行的过程和历史尝试。
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ L3 业务闭环真值                                                   │
│ workflow_cases                                                    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  一行粒度：一个 route × game × advertiser 的独立业务闭环 Case。
  核心字段：case_id + case_key + route_id + game_code + advertiser_id。
  作用：绑定同一业务目标下的 fresh job、只读复核、回查与后续修正。
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ L4 一次运行与过程证据                                             │
│ launch_jobs                                                       │
│   ↓                                                               │
│ launch_node_runs                                                  │
│   ↓                                                               │
│ launch_skill_runs                                                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  launch_jobs
    一行粒度：一个 Case 中的一次运行尝试。
    核心字段：job_id + case_id + route_id + game_code + advertiser_id
              + source_usage + job_status + current_node。
                              ↓
  launch_node_runs
    一行粒度：一个 job 的一个 Workflow Node 执行结果。
    核心字段：job_id + node_key + status + output_summary + evidence_refs。
                              ↓
  launch_skill_runs
    一行粒度：一个 job 中某个 Skill 的一次 attempt。
    核心字段：job_id + node_key + skill_key + attempt_no + status
              + input_summary + output_summary + module_ref。
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ L5 写入授权、外部动作与回查证据                                   │
│ launch_execution_plans + launch_confirmations                     │
│   ↓                                                               │
│ platform_actions                                                  │
│   ↓                                                               │
│ created_objects                                                   │
│   ↓                                                               │
│ readback_records + evidence_artifacts                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  作用：证明“为何允许写、执行了什么、是否创建成功、是否已回查”。
  约束：仅保存脱敏摘要、hash、必要 ID、状态和证据引用。
  不保存：token、secret、Cookie、auth_code、完整 URL、raw request / response。
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ L6 当前运营状态报表 / 只读投影                                    │
│ workflow_case_summary                                             │
│ v_monitor_provision_status_report                                 │
│ v_monitor_provision_blocker_report                                │
│ v_advertiser_aweme_authorization_readiness                        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
  作用：面向 UI / API / CLI 输出当前可行动结论。
  约束：报表 / View 不替代业务真值；不反向写 workflow / account / job 状态。


======================================================================
B｜当前数据分层与责任边界
======================================================================

[L1 业务配置真值]
  platform_routes
    ↓
  games
    ↓
  game_route_defaults ───────────────→ 路线默认目标 / 预算 / 出价 / 基线配置
    ↓
  game_platform_apps ────────────────→ 游戏对应平台 App
    ↓
  game_assets ───────────────────────→ 游戏级资产候选
    ↓
  material_packs / material_pack_items → 创建所需保底物料集合
    ↓
  landing_page_assets ───────────────→ 备用落地页资产
    ↓
  game_route_resource_blueprints ────→ 游戏级资源蓝图
    ↓
  dmp_package_sets / members ────────→ DMP 基线包与成员定义
    ↓
  game_route_launch_links ───────────→ 受控小游戏启动链接

  输入：项目配置、经验证的游戏 / 路线 / 资产定义。
  输出：Node 03 游戏保底包、Node 04 资源蓝图、Node 05 草稿默认值。
  写入者：受控 migration、种子或明确的配置维护流程。
  不可作为：账户实时状态、Job 运行事实、投放效果指标。

[L2 账户业务真值]
  advertiser_accounts
    ↓
  account_touchpoints ───────────────→ monitor / 受控触点事实
    ↓
  account_resources ─────────────────→ 目标账户每种资源的可见 / 回查 / 就绪状态
    ↓
  dmp_package_member_account_states ─→ DMP 成员在来源 / 目标账户的状态
    ↓
  qiankun_option_relations ──────────→ 乾坤选项与账户关系

  输入：平台只读回查、资源准备流程、已授权的账户级写入。
  输出：Node 02 创建上下文、Node 04 资源就绪、Node 05 payload 输入。
  写入者：只读 reconcile、受控资源准备、账户配置维护流程。
  不可作为：报表聚合源的唯一替代；一次 Job 的完整执行证据。

[L3 业务闭环真值]
  workflow_cases
    ↓
  case_id
    ↓
  绑定多个 launch_jobs

  输入：route_id + game_code + advertiser_id + case_key。
  输出：一个持续业务目标的 Case 身份与范围。
  写入者：创建 Case / Job 的运行入口。
  不可作为：某一次最新执行的唯一细节；需结合最新 job 和运行证据读取。

[L4 运行证据]
  workflow_case
    ↓
  launch_job
    ↓
  Node 01 … Node 07
    ↓
  launch_node_runs
    ↓
  子能力 / attempt
    ↓
  launch_skill_runs

  输入：每次 Workflow 与 Skill 的脱敏输入摘要。
  输出：状态、输出摘要、错误 / blocker、模块版本与证据引用。
  写入者：Workflow runner、Skill runner、只读或受控写入执行器。
  不可作为：业务配置主档、最终账户资源真值、投放效果报表。

[L5 写入与回查证据]
  launch_execution_plan
    ↓ 授权范围 / plan hash / attempt 规则
  launch_confirmation
    ↓ 人工确认
  platform_action
    ↓ 一次外部写入的状态 / 脱敏结果
  created_object
    ↓ 创建对象事实
  readback_record
    ↓ 平台只读核验
  evidence_artifact

  输入：已通过的草稿、payload hash、权限、计划与确认。
  输出：可审计的创建与回查证据。
  写入者：Node 06 / Node 07。
  不可作为：再次创建的自动授权；失败后必须由新 fresh job 决定后续。

[L6 当前运营状态报表]
  业务 / 运行真值
    ↓ 只读聚合
  report / view
    ↓ 当前操作结论
  UI / API / CLI / 任务卡

  输入：L1-L5 的真值与运行证据。
  输出：当前状态、blocker、建议下一步。
  写入者：无；View 只读。
  不可作为：动态真值写入源、自动创建的直接触发器。


======================================================================
A｜现有报表逻辑图
======================================================================

┌──────────────────────────────────────────────────────────────────┐
│ RPT-01｜mwb.workflow_case_summary                                │
└──────────────────────────────────────────────────────────────────┘
                              ↑ INPUT
  workflow_cases
  + 每个 Case 最新 launch_job
  + launch_node_runs
  + account_resources
  + account_touchpoints
  + launch_execution_plans / launch_confirmations
  + platform_actions / created_objects / readback_records
                              ↓ AGGREGATE
  Case 当前最新运行 + 当前 Node + 资源就绪 + 根 blocker + 建议动作
                              ↓ OUTPUT
  case_id + case_key + route_id + game_code + advertiser_id
  + latest job / current_node / current Gate
  + latest_node_states + resource_readiness + monitor_resolved
  + blocker + next_action
                              ↓ USE
  UI / API / CLI / 任务卡读取当前业务下一步
                              ↓ BOUNDARY
  一行粒度：一个 workflow_case 的当前状态。
  不保存：历史 attempt 细节、完整平台响应、投放效果指标。
  不写回：workflow_cases、launch_jobs、account_resources。


┌──────────────────────────────────────────────────────────────────┐
│ RPT-02｜mwb.v_monitor_provision_status_report                    │
└──────────────────────────────────────────────────────────────────┘
                              ↑ INPUT
  monitor_provision_runs
  + monitor_provision_attempts
  + account_touchpoints
  + game_route_defaults
                              ↓ AGGREGATE
  monitor provision 周期、尝试、回查和账户触点状态
                              ↓ OUTPUT
  route_id + game_code + advertiser_id + provision_id + cycle_id
  + 当前状态 + attempt + readback / touchpoint 状态 + 脱敏证据状态
                              ↓ USE
  Node 02 monitor 子链、诊断与人工排障
                              ↓ BOUNDARY
  一行粒度：一个 monitor provision cycle。
  不写回：monitor、触点或 Job 真值；不触发新的 monitor 创建。


┌──────────────────────────────────────────────────────────────────┐
│ RPT-03｜mwb.v_monitor_provision_blocker_report                   │
└──────────────────────────────────────────────────────────────────┘
                              ↑ INPUT
  monitor_provision_runs / attempts / 状态报告依赖事实
                              ↓ AGGREGATE
  未通过 monitor 的 blocker 分类
                              ↓ OUTPUT
  route_id + game_code + advertiser_id + provision / cycle
  + blocker_code + blocker 相关状态
                              ↓ USE
  Node 02 失败分流、人工排障与下一次 fresh plan 判断
                              ↓ BOUNDARY
  一行粒度：一个 monitor provision blocker。
  不写回：任何运行或账户真值。


┌──────────────────────────────────────────────────────────────────┐
│ RPT-04｜mwb.v_advertiser_aweme_authorization_readiness           │
└──────────────────────────────────────────────────────────────────┘
                              ↑ INPUT
  advertiser_accounts + 已验证抖音号授权关系 / 只读状态
                              ↓ AGGREGATE
  账户的抖音号授权可用性
                              ↓ OUTPUT
  advertiser_id + 授权就绪状态 + 活跃候选 / 选择结论 + 脱敏证据
                              ↓ USE
  Node 04 aweme-authorization、Node 05 payload-build
                              ↓ BOUNDARY
  一行粒度：一个 advertiser 的当前授权就绪状态。
  不写回：授权真值；不替代 Node 04 的新鲜只读核验。


======================================================================
当前未建立的数据 / 报表边界
======================================================================

  投放效果原始接入
    [未建立]
      ↓
  标准投放事实表
    [未建立]
      ↓
  日期 × 游戏 × 渠道 × 账户 × 广告对象 × 投放形式
    [未建立]
      ↓
  消耗 / 曝光 / 点击 / 转化 / 收入 / ROI 指标报表
    [未建立]

  规则：
    当前 workflow_case_summary 等运营状态 View
      ≠ 投放效果报表
      ≠ 业务配置真值
      ≠ 自动策略输入的唯一依据
```

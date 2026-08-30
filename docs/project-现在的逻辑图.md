# marketing-workbench-v2｜项目当前唯一底层机制逻辑图

> 文档性质：当前 OE3 / JSZC 工作流机制的静态说明。
>
> 本文只解释“系统如何判断、计划、授权、执行、回查和收口”。账户、Case、Job、资源、平台动作和 blocker 的实时状态只看 PostgreSQL `marketing_workbench_v2.mwb`，尤其是 `mwb.workflow_case_summary`。不得从本文恢复动态运行事实。

## 0. 一句话结论

当前 v2 已收敛为一条唯一主链：

```text
业务 Case
→ fresh runtime Job
→ Node 1-4 只读发现与资源三态分类
→ 一份不可变 Execution Plan
→ 一次 Plan-bound 人工确认
→ Node 5 按 Plan 执行缺失资源并生成确定性 Draft
→ Node 6 恰好一次 std_project/create
→ Node 7 最多三次只读回查
→ Postgres 写入脱敏证据
→ workflow_case_summary 输出唯一当前状态
```

唯一节点来源：

```text
src/workflows/skills/oe3/00-workflow-node-registry.mjs
```

唯一运行入口链：

```text
frontend / API / CLI
→ launchWorkflow
→ workflow-node-registry
→ OE3 runner
→ Node 01-07 Skills
→ platforms / repositories
→ Postgres marketing_workbench_v2.mwb
→ mwb.workflow_case_summary
→ UI / API / CLI / 任务卡
```

核心原则：

```text
只读先行
→ 缺什么只计划什么
→ 没有 Plan 不写
→ 没有确认不写
→ 超出 Plan 不写
→ 写后不回查通过不 READY
→ Case 当前状态只由 workflow_case_summary 投影
```

## 1. 最完整文本逻辑图

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 入口层                                                                       │
│ frontend / API / CLI                                                         │
│ 输入：route_id + game_code + advertiser_id + case_id / case_key              │
│ 边界：默认 idle，不自动加载最后一次 Job；历史 Job 只能显式只读查看             │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workflow Case｜持续业务闭环身份                                               │
│ 表：mwb.workflow_cases                                                        │
│ 粒度：一个 route × game × advertiser 的持续业务目标                           │
│ 作用：把多次 fresh Job、只读复核、资源准备、创建和回查放在同一业务闭环下        │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Latest / Fresh Runtime Job｜一次运行尝试                                      │
│ 表：mwb.launch_jobs                                                           │
│ 要求：新 runtime Job 必须显式带 case_id                                       │
│ 输出：job_id、source_usage、current_node、job_status                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node 1｜launch_intake：需求与目标标准化                                        │
│ 读取：route_id、game_code、advertiser_id、case_id                              │
│ 写入：launch_node_runs / launch_skill_runs 脱敏摘要                            │
│ 边界：不访问平台资源，不写平台                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node 2｜creation_context：账户与创建上下文                                     │
│ 读取：advertiser_accounts、account_touchpoints、game_platform_apps             │
│ 核验：账户、受控触点、monitor、平台 App、抖音号授权                             │
│ 边界：只读核验；monitor / 授权缺失只写 blocker，不偷偷补写                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node 3｜game_launch_pack：游戏保底包                                           │
│ 读取：games、game_route_defaults、game_assets、material_packs                  │
│      landing_page_assets、resource_blueprints、launch_links、DMP baseline      │
│ 输出：默认目标、预算、出价、排期、物料包、资源蓝图、成功字段合同                  │
│ 边界：不从历史请求恢复目标账户动态资源 ID                                       │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node 4｜account_resource_prepare：账户资源只读发现 + 三态分类                  │
│                                                                              │
│ 1. 对每个必需资源执行目标账户只读核验                                          │
│ 2. 汇总 resource readiness                                                     │
│ 3. 形成 READY / PLANNED / BLOCKED 三态                                         │
│ 4. 编译一份 Execution Plan                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌──────────────────────────────────────┐      ┌──────────────────────────────────┐
│ 全部缺口都可准备或已 READY            │      │ 存在不可准备 / 不可信 / 歧义缺口    │
│ → ready Execution Plan                │      │ → blocked Execution Plan           │
│ → 可进入人工确认                       │      │ → 不可确认，零平台写入              │
└──────────────────────────────────────┘      └──────────────────────────────────┘
              │                                               │
              ▼                                               ▼
┌──────────────────────────────────────┐      ┌──────────────────────────────────┐
│ Plan-bound Confirmation              │      │ workflow_case_summary             │
│ 表：launch_confirmations              │      │ 输出唯一 root blocker              │
│ 绑定：job_id + plan_id + plan_hash     │      │ 保留 structural blockers 供排查     │
│      + advertiser + 风险 + 调用上限    │      │ suggested_next_action 指向下一步    │
└──────────────────────────────────────┘      └──────────────────────────────────┘
              │                                               │
              ▼                                               ▼
┌──────────────────────────────────────┐      ┌──────────────────────────────────┐
│ Node 5｜confirmed-resource-orchestrator│     │ 停止当前 Job                     │
│ 只执行 Plan 内的资源动作               │      │ fresh Job 重新只读，不沿用旧状态    │
│ 每个动作原子 claim + 写后回查           │      └──────────────────────────────────┘
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Node 5｜payload-build / payload-contract / duplicate-check / create-readiness │
│ 输入：已 READY 资源 + 本 Plan 写后回查资源                                     │
│ 输出：最终 Draft、payload hash、字段合同、字段账本、同名查重和 preflight        │
│ 边界：不扩大 Plan；不二次确认；不创建项目                                      │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│ Node 6｜std_project_create_executor   │
│ POST /open_api/v3.0/std_project/create│
│ 恰好一次；无自动重试；不创建 Promotion │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│ Node 7｜readback_closer               │
│ std_project/list 0 / 10 / 30 秒回查    │
│ 命中提前结束；最多一条汇总 readback     │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 收口层                                                                       │
│ platform_actions：每次平台动作脱敏审计                                        │
│ created_objects：创建对象事实                                                 │
│ readback_records：创建回查结果                                                │
│ evidence_artifacts：脱敏证据与 hash                                           │
│ account_resources：账户资源 visible / readback_verified 状态                  │
│ workflow_case_summary：唯一 current_gate / root blocker / next action         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. Node 4 资源三态的唯一判定模型

Node 4 不直接“修资源”，只做事实判断与计划编译。

```text
资源进入 Node 4
  ↓
查游戏级保底定义 / 资源蓝图 / 来源合同
  ↓
查目标账户真实只读状态
  ↓
┌─ 已存在、唯一、未过期、目标账户可用、回查通过
│    → READY
│    → 写 account_resources 可见 / 已回查
│    → 不生成资源写动作
│
├─ 目标账户缺失
│  + prepare_supported=true
│  + 官方接口合同已验证
│  + executor 已实现
│  + 写后回查合同已验证
│    → PLANNED
│    → 生成 ensure_resource:* 或专用 ensure_* 动作
│
└─ 多候选 / App 不匹配 / 来源缺失 / 合同缺失 / executor 缺失 / 回查失败
     → BLOCKED
     → 保存 blocked Plan
     → 不允许确认，不允许平台写入
```

三态含义：

| 状态 | 含义 | 对 Plan 的影响 |
| --- | --- | --- |
| `READY` | 当前目标账户本轮只读回查可用 | no-op，作为 Node 5 payload 输入 |
| `PLANNED` | 当前缺失但系统已有完整受控准备机制 | 进入 ready Plan 的受限动作 |
| `BLOCKED` | 缺官方合同、缺来源、缺权限、歧义或回查不通过 | Plan 为 blocked，不可确认 |

当前已验证可自动准备的资源动作：

| 资源 / 环节 | Plan action | 平台动作 | 上限 | 收口标准 |
| --- | --- | --- | --- | --- |
| 头像 | `ensure_resource:avatar` | 上传 + submit | 上传 1 次、提交 1 次 | `advertiser/avatar/get` 命中可接受状态 |
| DMP 人群包 | `ensure_resource:dmp_audience_package` | DMP push | 仅缺失成员 | read/select 全部成员可投 |
| 视频素材 | `ensure_resource:video_asset` | material bind | 一次批量绑定 | 目标户视频/封面规则通过 |
| 产品图 | `ensure_resource:product_image` | image upload | 最多 1 张 | 目标户 image/material id 回查通过 |
| 事件资产 | `ensure_resource:event_asset` | event asset create | 最多 1 次 | 资产存在并进入事件链核验 |
| 事件配置 | `ensure_event_configs:baseline` | events/create | 最多 6 次 | baseline 6/6 + optimized_goal + dbt |

当前仍只读或人工边界资源：

| 资源 | 当前边界 |
| --- | --- |
| 品牌信息 | 只读核验目标账户可投品牌与行业；缺失不自动创建 |
| 备用落地页 | 只读核验普通/共享库存、HTTPS、active 和 hash；自动共享/复制仍不启用 |
| 小游戏实例 | 作为事件链核验结果落入 `micro_app_instance`；不单独猜测或自动创建 |

## 3. 事件资产的当前唯一真实机制

事件资产已升级为真实接口验证过的受控准备机制。当前机制以最终成功执行并回查通过的接口为准，分为两个受控准备环节：事件资产创建、资产下 baseline 事件配置。

### 3.1 事件资产查找与创建

```text
目标账户 event_asset 准备
  ↓
GET /open_api/2/tools/event/all_assets/list/
  参数：advertiser_id + filtering.asset_type=MINI_PROGRAME
  ↓
候选分类
  ├─ 0 个候选
  │    → 若官方合同 + 模板 + 单次确认完整
  │    → 计划 ensure_resource:event_asset
  │
  ├─ 1 个候选
  │    → GET /open_api/2/tools/event/all_assets/detail/
  │    → asset_ids 必须是 JSON 十进制数字数组：[1234567890123456]
  │    → detail 通过后进入事件配置/目标链核验
  │
  └─ 多个候选 / App 不匹配 / detail 失败
       → BLOCKED，不猜选
```

缺失创建：

```text
ensure_resource:event_asset
  ↓
确认 Plan ID/hash
  ↓
POST /open_api/2/event_manager/assets/create/
  asset_type = MINI_PROGRAME
  mini_program_asset.mini_program_id
  mini_program_asset.mini_program_name
  mini_program_asset.instance_id
  mini_program_asset.mini_program_type = BYTE_GAME
  ↓
记录 oceanengine_event_asset_create 脱敏 platform_action
  ↓
重新 all_assets/list + detail
  ↓
找到唯一目标资产才继续
```

边界：

```text
最多 1 次资产创建
不保存 raw payload / raw response / token / Cookie / 完整 URL
创建成功但回查不到 → BLOCKED
候选歧义 → BLOCKED
```

### 3.2 事件配置添加与配置核查

baseline 事件集合：

```text
active
active_register
active_pay
purchase_roi
purchase_roi_7d
purchase_roi_30d
```

执行链路：

```text
目标账户已有唯一 event_asset
  ↓
GET /open_api/2/event_manager/event_configs/get/
  ↓
判断 baseline 已配置数量
  │
  ├─ 已配置 6/6
  │    → 不调用 events/create
  │    → 进入 optimized_goal / dbt 回查
  │
  └─ 未配置 6/6
       ↓
     GET /open_api/2/event_manager/available_events/get/
       只用于获取“当前资产可创建事件”的本账户 event_id
       不复用旧库、旧账户或截图里的 event_id
       ↓
     对缺失项逐个执行：
     POST /open_api/2/event_manager/events/create/
       advertiser_id
       asset_id
       event_id
       track_types=["MINI_PROGRAME_API"]
       ↓
     每个事件一条 oceanengine_event_config_create 审计
       ↓
     写后 GET /open_api/2/event_manager/event_configs/get/
       必须 6/6
```

关键真实经验：

```text
available_events/get = 可创建事件列表
event_configs/get    = 已配置事件列表

因此：
创建前：available_events 必须能提供缺失事件的 event_id
创建后：available_events 可能不再返回这些 baseline
最终 READY：只以 event_configs/get 6/6 作为配置核查
```

### 3.3 事件链最终 READY

```text
event_configs/get = baseline 6/6
  ↓
GET /open_api/v3.0/event_manager/optimized_goal/get/
  必须命中 PAY + PURCHASE_ROI_7D
  ↓
GET /open_api/v3.0/event_manager/dbt/get/
  必须命中 PER_AND_SEVEN_PAY_ROI
  ↓
account_resources.event_asset
  visibility_status = visible
  readback_status   = readback_verified
  platform_resource_id = event asset id
  ↓
account_resources.micro_app_instance
  visibility_status = visible
  readback_status   = readback_verified
  platform_resource_id = micro app instance id
  ↓
workflow_case_summary 清空事件链 root blocker
```

事件资产模块的职责边界：

```text
负责：
  事件资产存在性
  资产下 baseline 事件配置
  PAY / PURCHASE_ROI_7D / PER_AND_SEVEN_PAY_ROI 可用性
  micro_app_instance 与事件链共同 READY

不负责：
  std_project/create
  Promotion 创建
  预算 / 出价修改
  token 刷新
  DMP / 视频 / 产品图 / 头像 / 备用页准备
  通过截图或旧账户经验直接认定 READY
```

## 4. Execution Plan 的唯一状态控制

Node 4 持久化的 `launch_execution_plans` 是一次执行机会的唯一授权合同。

```text
Node 4 输出 Plan
  ↓
plan_status
  ├─ ready
  │    → 可请求人工确认
  │    → planned_actions 列出所有允许动作
  │    → 每个 action 有最大调用数、依赖、幂等键、模块引用
  │
  └─ blocked
       → 只作审计
       → 不可确认
       → 不可平台写入
```

ready Plan 可以包含：

```text
0..N 个资源准备动作
+ 恰好 1 个 std_project_create
```

或在单独资源补齐任务中只包含一个聚焦动作：

```text
ensure_resource:event_asset
ensure_event_configs:baseline
ensure_resource:avatar
ensure_resource:dmp_audience_package
ensure_resource:video_asset
ensure_resource:product_image
```

Plan 绑定内容：

```text
job_id
case_id
route_id
game_code
advertiser_id
plan_id
plan_hash
payload_hash / draft_hash
planned_actions
maximum_platform_calls
retry_allowed=false
official_contract hash
resource states
risk summary
```

Plan 变更规则：

```text
确认前：可重新编译 fresh Plan，旧 Plan 自动 stale
确认后：Plan 不可变
已消费/失败的 Plan：不覆盖、不删除，保留审计
同一 hash 但新 plan_id/version：仍必须重新确认或在明确授权范围内续跑
```

## 5. 人工确认与平台写入闸门

真实平台写入必须同时满足两层闸门。

第一层：项目全局 guardrail

```text
project.state.json.guardrails.platform_write_allowed = true
platform_write_scope.target_job_id       = 当前 job
platform_write_scope.target_plan_id      = 当前 plan
platform_write_scope.target_plan_hash    = 当前 hash
platform_write_scope.allowed_actions     = 当前 action
maximum_platform_calls                   = 当前上限
retry_allowed                            = false
```

第二层：Postgres Plan-bound confirmation

```text
launch_confirmations.confirmation_status = confirmed_for_execution_plan
confirmation.plan_id                     = 当前 plan_id
confirmation.metadata.plan_hash          = 当前 plan_hash
confirmation.confirm_variable            = 当前动作确认变量
```

任一不匹配：

```text
零平台写入
→ platform_actions 只记录 internal failed_once / blocked
→ 不调用真实 POST
→ 不自动复用旧确认
```

## 6. Node 5 的执行边界

确认后，Node 5 只做两类事：执行 Plan 内资源动作、生成确定性 Draft。

```text
confirmed-resource-orchestrator
  ↓
按正式 registry 顺序扫描 planned_actions
  ↓
每个 action：
  1. 验证 Plan/Confirmation/hash/scope
  2. internal action 原子 claim
  3. 调用对应 executor
  4. 写 platform_actions 脱敏记录
  5. 写后只读回查
  6. 成功才更新 account_resources
  7. 失败立即停止
```

internal claim 规则：

```text
action_id 必须绑定 job + action + plan id
idempotency_key 必须绑定 planned action + plan id
同一 plan/action 不得重复消费
不同 plan/version 不得被 stale plan 误挡
```

资源全部 READY 后才进入 Draft：

```text
payload-build
→ payload-contract
→ duplicate-check
→ create-readiness
```

Draft 必须是已确认 Plan 的确定性派生：

```text
项目名 / 预算 / CPA / ROI 不漂移
资源 ID 来自当前目标账户 READY 证据或本 Plan 写后回查
payload 保存 derived_from_plan_id / derived_from_plan_hash
字段合同、字段账本、wire body、查重、preflight 全部通过
```

## 7. Node 6-7：项目创建与回查闭环

Node 6 只允许一次标准项目创建：

```text
POST /open_api/v3.0/std_project/create/
× 1
```

执行前必须满足：

```text
workflow_case active
ready Plan 已确认
最终 Draft 派生校验通过
action scope 与调用上限匹配
当前 create attempt 尚未消费
```

执行后：

```text
无论成功、业务失败、超时或结果不确定
→ 写入 scope 立即收回
→ 不自动重发 create
→ 不创建 Promotion
→ 不修改预算 / 出价
```

Node 7：

```text
对精确项目名执行 std_project/list 回查
  时间点：0 / 10 / 30 秒
  命中：提前结束
  未命中：停止人工复盘
  持久化：最多一条汇总 readback_record
```

成功判定：

```text
create 返回项目 ID
或
readback 精确命中项目
```

两者都不能确认时，不补发 create。

## 8. 数据库更新逻辑

最小数据链：

```text
workflow_cases
  持续业务 Case
  ↓
launch_jobs
  一次 fresh 运行
  ↓
launch_node_runs
  Node 状态与摘要
  ↓
launch_skill_runs
  Skill attempt 状态、blocker、module_ref
  ↓
launch_execution_plans
  当前 Job 的 ready / blocked / stale Plan
  ↓
launch_confirmations
  Plan-bound 人工确认
  ↓
platform_actions
  external POST / internal claim 的脱敏动作审计
  ↓
account_resources
  目标账户资源 visible / readback_verified 状态
  ↓
created_objects
  std_project 创建对象事实
  ↓
readback_records
  std_project 最终回查摘要
  ↓
evidence_artifacts
  脱敏证据与 hash
  ↓
mwb.workflow_case_summary
  当前可行动状态投影
```

写入职责：

| 表 / View | 写入者 | 作用 | 不承担 |
| --- | --- | --- | --- |
| `workflow_cases` | Case/Job 入口 | 业务闭环身份 | 单次运行细节 |
| `launch_jobs` | workflow 入口 | 一次运行 attempt | 资源真实性 |
| `launch_node_runs` | runner | Node 结果 | 平台动作审计 |
| `launch_skill_runs` | skill runner / 脚本 | Skill attempt 结果 | 原始请求响应 |
| `launch_execution_plans` | Plan compiler | 授权合同 | 人工确认 |
| `launch_confirmations` | 确认入口 | 绑定 plan hash | 自动授权 |
| `platform_actions` | executor / orchestrator | 外部写入与 internal claim 审计 | raw payload/response |
| `account_resources` | 只读 reconcile / resource executor | 账户资源当前可用性 | Job 全过程 |
| `created_objects` | create executor | 创建对象事实 | 资源状态 |
| `readback_records` | readback closer | std_project 回查结果 | 资源准备 |
| `evidence_artifacts` | 各 Skill / executor | 脱敏证据 | 动态状态唯一来源 |
| `workflow_case_summary` | View | UI/API/CLI 当前结论 | 反向写真值 |

安全持久化只允许：

```text
状态
字段路径
类型 / 数量 / 枚举
必要 ID
hash
request_id 是否存在
证据引用
脱敏错误分类
```

禁止持久化：

```text
token
Cookie
secret
auth_code
完整 URL
raw payload
raw request
raw response
完整 request_id
```

## 9. `workflow_case_summary` 的唯一读取方式

UI、API、CLI、任务卡和后续自动化只读这个投影拿当前状态：

```sql
SELECT
  latest_job_id,
  latest_job_status,
  latest_plan_status,
  root_blocker_codes,
  structural_blocker_codes,
  current_gate,
  suggested_next_action,
  action_readback_state,
  resource_readiness
FROM mwb.workflow_case_summary
WHERE case_id = $1;
```

字段语义：

```text
root_blocker_codes
  当前唯一最前置 blocker，正常为 0 或 1 个。

structural_blocker_codes
  完整 forensic，用于诊断，不直接决定当前动作。

current_gate
  当前所处 Gate，例如等待确认、等待资源补齐、等待创建、完成等。

suggested_next_action
  与 current_gate 同源计算的下一步，不允许 UI/API/任务卡手写。

resource_readiness
  当前目标账户资源状态摘要。

action_readback_state
  创建动作和项目回查状态，不由调用方自行推导。
```

## 10. 当前 JSZC/BYTE_GAME 成功合同

Node 5 当前成功字段合同：

```text
successProfileVersion
= 2026-08-30.jszc-byte-game-success-profile-v1

goldenFieldShapeHash
= sha256:9203ddf077d05b51958e851dad86894f75fdf09884ffc99690ad459ce5dd1064

createFieldLedgerPathCount
= 82
```

核心创建形态：

| 模块 | 当前合同 |
| --- | --- |
| 受众排除 | `hide_if_converted=NO_EXCLUDE` 时完全省略 `filter_event` |
| 转化时间 | `hide_if_converted=NO_EXCLUDE` 时完全省略 `converted_time_duration` |
| 备用页 | `external_url_material_list` 恰好发送 1 条已核验 HTTPS 页面 |
| 小游戏 | `mini_program_info` 只发送 `url`；省略 `app_id/start_path/params` |
| 视频/标题/商品图/DMP | 2 条视频、3 条标题、1 张产品图、10 个排除人群 |
| 普通图片 | `image_material_list=[]` |
| 锚点/组件 | `anchor_related_type=OFF`；省略锚点和组件列表 |
| 禁止字段 | 省略 `micro_promotion_type` |

动态账户 ID、资源 ID、URL 和授权值永远从当前目标账户已核验的 Postgres 事实读取，不能从本文、历史请求或 lessons 复制。

## 11. 正式操作入口

长期入口以 `package.json` 为准。

```text
只读发现：
  npm run workflow:readonly-readiness -- <精确 target/case>

合同检查：
  npm run db:contract-check

确认后执行主创建：
  npm run launch:execute-once -- --job-id <精确 Job>

只读回查：
  npm run workflow:readback-only -- --job-id <精确 Job>

事件资产单独补齐：
  npm run resource:event-asset-api-create-once -- --job-id <Job> ...

事件配置单独补齐：
  npm run resource:event-configs-api-create-once -- --job-id <Job> ...
```

一次性脚本只服务受控 Task 和已确认 Plan。若某脚本成为长期入口，必须在 `package.json` 中显式声明；历史实验脚本完成后应归档，不进入 runtime import graph。

## 12. 当前状态控制的精简方向

已经固定下来的主机制：

```text
Node 定义唯一
→ READY / PLANNED / BLOCKED 三态唯一
→ Plan 唯一
→ Confirmation 唯一
→ confirmed-resource-orchestrator 只消费 Plan 内动作
→ 资源写后回查才 READY
→ Draft 从已确认 Plan 确定性派生
→ Node 6 一次 create
→ Node 7 最多三次 readback
→ workflow_case_summary 给唯一当前结论
```

仍可后续加固但不改变主链的点：

```text
1. 将排期、最终资源槽位和内容 hash 纳入更完整的 Plan → Draft 直接派生证明。
2. 继续减少 blocked dry-run 的下游诊断噪声，但不能削弱 Node 4 root blocker Gate。
3. 将已完成的 one-off 任务脚本按生命周期归档，同时保留 package.json 中必要的长期入口。
```

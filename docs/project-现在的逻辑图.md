# marketing-workbench-v2｜v2 当前唯一底层机制：完整文本逻辑图

> 文档性质：静态架构与运行合同说明，不是运行报表。
>
> 动态账户、Case、Job、Plan、确认、资源、平台动作、项目 ID 与 blocker 的唯一真值在 PostgreSQL marketing_workbench_v2.mwb；消费端只读 mwb.workflow_case_summary。本文不保存或恢复动态运行事实。

## 0. 一句话结论

v2 只有一条受控主链：

~~~text
Task / Manifest + 全局 Guardrail
→ Workflow Case
→ fresh runtime Job
→ Node 01–04 readonly
→ READY / PLANNED / BLOCKED
→ immutable Execution Plan
→ exact plan_id + plan_hash 人工确认
→ Node 05 只执行 Plan 内资源并写后回查
→ fresh Draft / ledger / wire body / 独立 Create Plan
→ Node 06 std_project/create 恰好一次
→ Node 07 只读回查与精确 ID 一致性
→ Postgres 脱敏账本
→ mwb.workflow_case_summary 唯一当前 Gate
~~~

六条不可绕过的规则：

~~~text
1. 没有 fresh readonly 结果，不生成可执行 Plan。
2. 没有 prepare_supported、executor、写后回查合同，不计划资源写入。
3. 没有精确 Plan ID + hash 的人工确认，不调用平台写接口。
4. Plan 外动作、超调用上限、旧 Plan / 旧确认、自动重试，一律禁止。
5. 创建响应不是 READY；只有权威只读回查通过才写 verified。
6. UI / API / CLI / Task 不手写当前 Gate；只读 workflow_case_summary。
~~~

唯一来源：

~~~text
Node 定义：src/workflows/skills/oe3/00-workflow-node-registry.mjs
Skill 合同：src/workflows/skills/oe3/00-contracts.mjs
Skill 调度：src/workflows/skills/oe3/00-runner.mjs
Plan 编译：src/workflows/executionPlan.mjs
当前状态：mwb.workflow_case_summary
~~~

## 1. 真值、控制面与消费面

~~~text
┌───────────────────────────────────────────────────────────────────────┐
│ 项目控制面                                                            │
│ AGENTS.md → project.state.json → Task / Context Manifest              │
│ 规定任务范围、全局 Guardrail、确认 Gate、禁止项、验证项               │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 不替代动态事实
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 运行真值：Postgres marketing_workbench_v2.mwb                         │
│ L1 配置 → L2 账户 → L3 Case → L4 Job/Node/Skill → L5 Plan/证据       │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 唯一当前投影：mwb.workflow_case_summary                               │
│ current_gate + root_blocker_codes + suggested_next_action              │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ frontend / API / CLI / 任务卡 / 自动化                                 │
│ 只读投影；不得反向写状态，也不得自己计算下一步                         │
└───────────────────────────────────────────────────────────────────────┘
~~~

| 层 | 权威内容 | 不承担 |
| --- | --- | --- |
| 项目文件 | 静态机制、当前任务的权限边界 | 动态资源和平台结果 |
| src/ | Node、Skill、Plan、executor、脱敏与接口合同 | 当前账户是否 READY |
| db/*.sql | Schema、约束、View、投影优先级 | 外部平台写入 |
| mwb 表 | 配置、账户、Case、Job、确认、动作、证据 | UI 自行派生的下一步 |
| workflow_case_summary | 唯一当前 Gate、root blocker、建议动作 | 历史明细和反向写入 |
| docs/ | 机制、方案、Task 合同、lessons | 实时状态、secret、raw 请求/响应 |

## 2. 唯一主链

~~~text
入口：frontend / API / CLI（默认 idle；历史 Job 必须显式只读打开）
  ↓
workflow_cases
  一行 = route_id × game_code × advertiser_id 的持续业务闭环
  ↓
launch_jobs
  一行 = 一个 Case 下的一次 fresh 运行；runtime_truth 必须显式 case_id
  ↓
Node 01–04：只读发现、资源核验、Plan 编译
  ├─ 有 blocker
  │   → blocked Plan
  │   → 平台写入=0；不可确认；定位一个最小修复；下一轮 fresh readonly
  │
  └─ Plan ready
      → 人工确认 job + plan_id + plan_hash + actions + limits
      → Node 05：资源 action 逐项 atomic claim → write once → authoritative readback
      → 任一失败：停止、撤销 scope、不自动重试
      → 全部 READY：fresh Draft / contract / ledger / duplicate / create-readiness
      → 独立 Create Plan（仅 std_project_create）
      → 再次人工确认
      → Node 06：create × 1
      → Node 07：list readonly 0 / 10 / 30 秒，命中提前结束
      → 脱敏账本和 workflow_case_summary 收口
~~~

## 3. 7 个 Node 与所有注册 Skill

| Node | 目的 | 注册 Skill | 产物 | 不做 |
| --- | --- | --- | --- | --- |
| 01 launch_intake | 规范化输入 | intake-normalize | route、game、advertiser | 平台读写 |
| 02 creation_context | 账户上下文 | monitor-query、monitor-plan、monitor-ensure、monitor-readback、context-resolve-account、context-resolve-touchpoint、context-resolve-platform-app | 账户、触点、monitor、平台 App | 把 monitor 自动混入广告创建写入 |
| 03 game_launch_pack | 游戏保底配置 | launch-pack-resolve-game、launch-pack-resolve-defaults、launch-pack-resolve-materials、launch-pack-resolve-backup-landing-page、launch-pack-resolve-resource-blueprints | 默认值、物料、备用页、资源蓝图 | 从旧账户复制动态资源 ID |
| 04 account_resource_prepare | fresh readonly、三态、资源计划输入 | 见第 4 节完整矩阵 | READY / PLANNED / BLOCKED | 未确认平台写入 |
| 05 std_project_draft_builder | 已确认资源执行和最终草稿 | confirmed-resource-orchestrator、payload-build、payload-contract、duplicate-check、create-readiness | Draft、payload hash、ledger、preflight | 创建项目 |
| 06 std_project_create_executor | 单次创建 | create-once | 平台 action 和创建对象 | 重试、Promotion、预算/出价调整 |
| 07 readback_closer | 回查收口 | readback-std-project | verified / mismatch / missing 证据 | 通过补发 create 修复 |

调度模式由 00-runner.mjs 唯一决定：

| mode | 范围 | 写边界 |
| --- | --- | --- |
| dry_run | Node 01–05 | 不真实写；可生成 Draft/Plan |
| draft_readiness | Node 01–05 | 只读和草稿就绪 |
| planned_actions | Node 01–04 与 monitor 计划路径 | 只限明确 planned action |
| execute_once | Node 01–07 | 仅冻结 confirmed Plan 下的单次受限写 |
| readback_only | readback-std-project | 只读，绝不创建 |
| aweme_auth_readonly | 01、必要 02/03、授权核验 | 只读专项 |

## 4. Node 04：资源三态、专项 Skill 与自动准备边界

### 4.1 唯一三态

~~~text
游戏级资源蓝图 / 来源合同
      + 目标账户 fresh readonly
      ↓
resource verifier
  ├─ 已唯一命中、可用、字段合同和权威回查都通过
  │   → READY（no-op，可作为 Draft 输入）
  │
  ├─ 目标缺失 + prepare_supported=true + executor 已注册
  │   + 单次调用上限与写后回查合同齐全
  │   → PLANNED（Plan 仅列该 ensure action）
  │
  └─ 只读/凭据失败、多候选、来源不完整、verify-only 缺失、
      合同缺失、回查失败或 executor 不存在
      → BLOCKED（Plan=blocked，不可确认，平台写入=0）
~~~

本轮实时状态决定 Node 4 与 Plan。account_resources 只保存最近一次权威回查成功的 visible + readback_verified；一次只读降级不能把历史 verified 覆盖为 missing，但历史 verified 也不能跳过本轮 verify-only Gate。

### 4.2 资源能力注册表

04-resource-action-registry.mjs 是唯一资源 prepare 支持表；正式受确认执行顺序：

~~~text
ensure_resource:avatar
→ ensure_resource:dmp_audience_package
→ ensure_resource:event_asset
→ ensure_resource:video_asset
→ ensure_resource:product_image
→ ensure_event_configs:baseline
~~~

| 资源 | 可自动准备 | Plan action / executor | READY 的权威依据 | 固定边界 |
| --- | ---: | --- | --- | --- |
| avatar | 是 | ensure_resource:avatar / oceanengineAvatarExecutor.mjs | advertiser/avatar/get 回查 | 源图合同为 300×300 |
| dmp_audience_package | 是 | ensure_resource:dmp_audience_package / oceanengineDmpExecutor.mjs | 指定 ID read 命中且可投 | read 成功未命中即 missing；select 仅辅助诊断 |
| event_asset | 是 | ensure_resource:event_asset / oceanengineEventAssetExecutor.mjs | list/detail 唯一资产、App/实例绑定和事件链 | 多候选或绑定不明即 BLOCKED |
| baseline event configs | 是 | ensure_event_configs:baseline / oceanengineEventConfigExecutor.mjs | event_configs/get baseline 6/6 + goal/dbt | available_events/get 只为待创建项取 event_id |
| video_asset | 是 | ensure_resource:video_asset / oceanengineVideoMaterialExecutor.mjs | 视频、封面、目标账户回查 | 只批量绑定 Plan 的目标集合 |
| product_image | 是 | ensure_resource:product_image / oceanengineProductImageExecutor.mjs | 108×108 PNG 的 file/image/get 签名/ID 回查 | 格式、尺寸、hash、文件不符不上传 |
| brand_info | 否 | 无 | 品牌和行业只读 | 缺失只 blocker，不创建 |
| micro_app_instance | 否 | 无 | 事件链中的目标实例只读 | 不猜测、不创建实例 |
| backup_landing_page | 否 | 无 | 来源默认页 + 目标 share_type=SHARE 清单同 site、可用、URL hash 一致 | 普通库存仅诊断；site/handsel 被排除；只允许人工共享后回查 |

### 4.3 Node 04 全部 Skill 映射

| Skill | 模块 | 责任 |
| --- | --- | --- |
| aweme-authorization-readonly | 04-aweme-authorization-readonly.mjs | 核验固定默认抖音号的目标账户授权，不任意挑选候选 |
| resource-bootstrap-from-blueprints | 04-resource-blueprint-bootstrap.mjs | 从蓝图物化资源候选，不将候选当 READY |
| resource-live-readonly-reconcile | 04-platform-readonly-reconcile.mjs | 平台只读刷新资源与脱敏 evidence |
| avatar-source-prepare | 04-avatar-source-prepare.mjs | 检查头像源文件、hash、格式、尺寸 |
| avatar-submit-plan | 04-avatar-submit-plan.mjs | 形成头像提交合同，不自行授权写入 |
| dmp-baseline-resolve | 04-dmp-readonly.mjs | 解析 DMP package set、成员和 payload 字段 |
| dmp-source-readonly-verify | 04-dmp-readonly.mjs | 逐包验证来源人群 |
| dmp-target-readonly-verify | 04-dmp-readonly.mjs | 逐包用目标 read 做权威分类 |
| dmp-push-plan | 04-dmp-readonly.mjs | 只计划 target_readonly_status=missing 的成员 |
| video-material-bind-plan | 04-video-material-bind-plan.mjs | 核验源视频、目标可见性和封面，输出绑定候选 |
| product-image-source-prepare | 04-product-image-source-prepare.mjs | 核验 PNG、108×108、hash 与目标库存 |
| event-chain-readonly | 04-event-chain-readiness.mjs | 核验 event asset、instance、baseline、goal、dbt |
| event-configs-baseline | oceanengineEventConfigExecutor.mjs | 事件配置专项执行合同，仅在已确认 action 路径调用 |
| backup-landing-page-material-inventory | 04-backup-landing-page-material-inventory.mjs | 目标 SHARE 清单为权威；515 等降级只能产生 site_get_target_shared_blocked |
| backup-landing-page-source-prepare | 04-backup-landing-page-source-prepare.mjs | 检查备用页来源和共享合同，不创建/复制页面 |
| resource-verify-avatar | 04-resource-verifiers.mjs | 归一头像三态 |
| resource-verify-dmp-audience-package | 04-dmp-readonly.mjs | 归一 DMP 与 retargeting_tags_exclude 就绪性 |
| resource-verify-event-asset | 04-event-chain-readiness.mjs | 归一事件资产准备资格 |
| resource-verify-video-asset | 04-video-material-readiness.mjs | 归一视频、封面和目标可见性 |
| resource-verify-product-image | 04-resource-verifiers.mjs | 归一产品图三态 |
| resource-verify-brand-info | 04-resource-verifiers.mjs | 归一品牌只读状态 |
| resource-verify-micro-app-instance | 04-event-chain-readiness.mjs | 归一小游戏实例事件链状态 |
| resource-verify-backup-landing-page | 03-landing-page-readiness.mjs | 归一备用页共享库存状态 |

### 4.4 共享备用页的一致性合同

~~~text
目标 share_type=SHARE 清单成功且命中 → READY
目标 share_type=SHARE 清单成功但未命中 → missing / BLOCKED
目标 share_type=SHARE 请求失败（如 515）→ degraded / BLOCKED

degraded 不得伪造 target_site_missing 或 target_not_visible。
本轮 Plan 必由 site_get_target_shared_blocked 阻断；
上一次 account_resources 的 verified 不得被该临时故障覆盖。
~~~

## 5. Execution Plan、确认、scope 与资源执行

~~~text
Node 04 resource states
  ├─ 任一 BLOCKED
  │   → plan_status=blocked
  │   → blocker_codes / root_blocker_codes
  │   → 不可确认、零平台写
  │
  ├─ 存在 PLANNED
  │   → ready Resource Plan
  │   → planned_actions 仅为资源 ensure action
  │   → maximum_create_calls=0
  │
  └─ 全部 READY
      → fresh Draft / contract / duplicate / readiness
      → ready Create Plan
      → planned_actions=[std_project_create]
      → maximum_create_calls=1
~~~

每份 Plan 都固定绑定：

~~~text
case_id + job_id + advertiser_id
+ plan_id + plan_hash + plan_version
+ planned_actions + action_grants + maximum_platform_calls
+ target_draft_id + target_payload_hash
+ resource_states + blocker_codes
+ retry_allowed=false
~~~

确认和写入必须同时经过双层 Gate：

~~~text
project.state.json.guardrails
  platform_write_allowed=true
  scope 的 target job / plan / hash / actions / call limits
                         +
launch_confirmations
  confirmed_for_execution_plan
  同一 plan_id + 同一 plan_hash
                         +
plannedActionGrant / executionGrantScope
  action 在 Plan 内、次数未用尽、确认未漂移
                         ↓
atomic claim → write once → authoritative readback → redacted evidence
~~~

确认后的 confirmed-resource-orchestrator 只按资源注册表顺序执行 Plan 内 action。每项先 claimPlannedExecutionAction；并发调用也只能有一个获得执行权。任一 executor 非 READY，动作标记 failed_once、后续停止、scope 撤销；成功项不自动重做。

Plan 生命周期：

~~~text
确认前：fresh readonly 可重编；旧版本 stale。
确认后：immutable；同一 Plan/hash 只消费一次。
资源 Plan：绝不包含 std_project_create。
创建失败或回查失败：停止；下一次必须 fresh Job + new Plan + new confirmation。
~~~

## 6. Node 05：最终 Draft 与字段合同

~~~text
所有资源已 READY 或同一已确认 Plan 的写后回查通过
  ↓
payload-build
  ├─ 只读当前目标账户 READY 资源
  ├─ 写 launch_drafts：payload_hash、payload manifest、derived_from_plan
  └─ 不读历史 raw payload，不复制历史资源 ID
  ↓
payload-contract + nested contract + official evidence
  ↓
create-field-ledger
  ↓
duplicate-check（目标账户 + 项目名 readonly list）
  ↓
create-readiness
  ↓
独立 std_project_create Plan
~~~

Node 05 支撑模块：

| 模块 | 责任 |
| --- | --- |
| 05-jszc-success-profile.mjs | 已验证 JSZC 成功字段形态、素材数、ledger 路径数 |
| 05-payload.mjs | 从当前 bundle 构造最终 payload |
| 05-payload-contract.mjs | Draft、payload hash、敏感字段禁存与 Plan 派生校验 |
| 05-official-create-field-contract.mjs | 官方字段证据和 send / omit / block |
| 05-nested-field-contract.mjs | 嵌套对象、数组、枚举、图文/视频约束 |
| 05-title-materials-contract.mjs | 标题来源、数量、长度和安全形态 |
| 05-selling-points-contract.mjs | 卖点字段合同 |
| 05-create-field-ledger.mjs | 可审计字段 ledger |
| 05-std-project-create-wire-body.mjs | int64 decimal JSON number token 的无损 wire body |
| 05-create-preflight-diagnostics.mjs | 创建前字段、资源、contract、ledger、profile 总 Gate |
| 05-duplicate-readonly.mjs | 创建前名称查重和脱敏 evidence |

## 7. Node 06–07：一次创建、无损 ID、权威回查

~~~text
独立 Create Plan 已确认
  ↓
create-once
  ↓
createStdProjectForTargetOnce
  ├─ 校验 Case、Plan、confirmation、grant、payload hash、attempt
  ├─ 原子 claim std_project_create
  ├─ POST /open_api/v3.0/std_project/create/ × 1
  └─ scope 立即撤销；无自动 retry
  ↓
readback-std-project
  ├─ GET std_project/list：0 / 10 / 30 秒，命中提前结束
  ├─ 名称必须匹配 Draft
  ├─ create response ID 与 list ID 必须 exact string match
  └─ mismatch / not-found / 未确认响应：停止，绝不补发 create
~~~

长数字 ID 合同：

~~~text
平台 JSON bare decimal project_id / std_project_id / id
→ oceanengineStdProjectResponse.mjs 仅对这些已知字段预转字符串
→ JSON.parse
→ create executor 与 readonly client
→ created_objects.object_id / readback_records.object_id
→ Node 7 逐字符比对

任何项目 ID 默认以字符串保存和比较。
仅官方要求 JSON number token 的字段（如 instance_id）使用专用无损 wire 编码，
绝不经 JavaScript Number 的安全整数截断。
~~~

## 8. 数据、证据与唯一 Case Gate

~~~text
L1 业务配置
platform_routes + games + game_route_defaults + game_platform_apps
+ game_assets + material_packs + landing_page_assets
+ game_route_resource_blueprints + game_route_launch_links
+ dmp_package_sets + dmp_package_members
        ↓
L2 账户事实
advertiser_accounts + account_touchpoints + account_resources
+ dmp_package_member_account_states + qiankun_option_relations
        ↓
L3 持续业务闭环
workflow_cases
        ↓
L4 一次运行证据
launch_jobs → launch_node_runs → launch_skill_runs
        ↓
L5 写入与回查审计
launch_execution_plans → launch_confirmations
→ platform_actions → created_objects → readback_records → evidence_artifacts
        ↓
L6 唯一当前投影
mwb.workflow_case_summary
~~~

最小持久化：

~~~text
允许：状态、枚举、数量、必要 ID、字段路径、hash、request_id 是否存在、证据引用、脱敏错误分类。
禁止：token、Cookie、secret、auth_code、完整 URL、raw request、raw payload、raw response、完整 request_id。
~~~

workflow_case_summary 的 Gate 优先级：

~~~text
1. 已创建对象但未 verified readback
   → created_object_readback_pending
2. 已耗尽创建上限且未 verified
   → std_project_create_attempt_limit_reached
3. 创建失败、需要新 payload 版本
   → corrective_attempt_requires_new_payload_version
4. confirmed-resource-orchestrator 停止 blocker
   → root blocker
5. verify-only / resource / Plan blocker
   → root blocker
6. create action=1 + created object=1 + readback_verified
   → first_std_project_create_completed
7. 否则 Plan=ready
   → await_job_write_authorization
8. 否则
   → run_fresh_readiness / review_latest_job
~~~

## 9. src 模块地图

### 9.1 入口、服务、仓储、控制

| 文件 | 唯一职责 |
| --- | --- |
| src/agents/launchAgent.mjs | 从用户意图解析 route / game / advertiser，不授予写权限 |
| src/server/index.mjs | 本地 HTTP/API 边界；默认不加载最后一次 Job |
| src/repositories/postgresRepository.mjs | Postgres 读写、原子 claim、Plan/confirmation/证据与 View 查询 |
| src/workflows/launchWorkflow.mjs | Case/Job 创建、runner 启动与公开 Job View |
| src/workflows/executionPlan.mjs | Plan 编译、hash、stale、scope 和 Draft 派生验证 |
| src/workflows/executeConfirmedLaunch.mjs | Node 6 的 Plan-bound 真实执行总入口和 scope 回收 |
| src/workflows/executionGrantScope.mjs | create 的 scope、Plan、confirmation、attempt 校验 |
| src/workflows/plannedActionGrant.mjs | 受确认资源 action 的权限与次数校验 |
| src/workflows/avatarExecutionScope.mjs | 头像专项 scope 校验/撤销 |
| src/workflows/dmpExecutionScope.mjs | DMP 专项 scope 校验/撤销 |
| src/workflows/eventAssetExecutionScope.mjs | 事件资产专项 scope 校验/撤销 |
| src/workflows/eventConfigExecutionScope.mjs | 事件配置专项 scope 校验/撤销 |
| src/workflows/productImageExecutionScope.mjs | 产品图专项 scope 校验/撤销 |
| src/workflows/videoMaterialExecutionScope.mjs | 视频专项 scope 校验/撤销 |
| src/workflows/stdProjectNameBuilder.mjs | CST 日期、命名和名称序列保留 |

### 9.2 平台适配

| 文件 | 唯一职责 |
| --- | --- |
| src/platforms/oceanengineCredentialStore.mjs | 本地凭据 scaffold、脱敏状态、token refresh scope |
| src/platforms/oceanengineTokenRefresh.mjs | 单独授权的 OAuth refresh |
| src/platforms/oceanengineReadonlyAdapter.mjs | OceanEngine 只读适配、摘要和脱敏 |
| src/platforms/oceanengineReadonlyClient.mjs | 权威只读客户端；std_project/list 使用无损解析 |
| src/platforms/oceanengineStdProjectResponse.mjs | 已知项目 ID 字段的无损 JSON token 解析 |
| src/platforms/oceanengineStdProjectCreateExecutor.mjs | 项目单次创建、安全错误摘要与 readback |
| src/platforms/oceanengineAvatarExecutor.mjs | 头像上传/提交/回查 |
| src/platforms/oceanengineDmpReadonly.mjs | DMP read/select、可投性、轮询 readback |
| src/platforms/oceanengineDmpExecutor.mjs | DMP push_v2 单次推送与逐包回查 |
| src/platforms/oceanengineEventAssetExecutor.mjs | event asset 创建与 list/detail 回查 |
| src/platforms/oceanengineEventConfigExecutor.mjs | baseline event config 创建与 config 回查 |
| src/platforms/oceanengineVideoMaterialExecutor.mjs | 视频集合绑定、封面和目标回查 |
| src/platforms/oceanengineProductImageExecutor.mjs | 产品图上传、签名/ID 回查 |
| src/platforms/qiankunCredentialStore.mjs | 乾坤凭据和环境 scaffold |
| src/platforms/qiankunMonitorClient.mjs | monitor provision 外部客户端 |

### 9.3 所有 OE3 Skill 模块

| 模块 | 对应 Skill / 职责 |
| --- | --- |
| 00-contracts.mjs | Skill definitions、资源类型、hash、脱敏、Skill Run 记录 |
| 00-index.mjs | OE3 公开聚合出口 |
| 00-readonly-permission.mjs | readonly dependency 明确许可边界 |
| 00-result-mapping.mjs | Node 6/7 结果映射与 Job 收口 |
| 00-runner.mjs | mode 调度、依赖顺序、Node Run 聚合 |
| 00-workflow-node-registry.mjs | 唯一的 3 阶段 7 Node 与 child trace |
| 01-intake-normalize.mjs | intake-normalize |
| 02-context-resolvers.mjs | context-resolve-account / touchpoint / platform-app |
| 02-monitor-cycle.mjs | monitor 周期状态计算 |
| 02-monitor-provision.mjs | monitor-query / plan / ensure / readback 与 monitor CLI |
| 02-qiankun-option-relation-sync.mjs | monitor 关联选项同步子能力 |
| 03-launch-pack.mjs | 五个 launch-pack-resolve Skill |
| 03-landing-page-readiness.mjs | resource-verify-backup-landing-page |
| 04-resource-action-registry.mjs | 资源能力、prepare 支持、正式执行顺序 |
| 04-resource-blueprint-bootstrap.mjs | resource-bootstrap-from-blueprints |
| 04-platform-readonly-reconcile.mjs | resource-live-readonly-reconcile |
| 04-resource-verifiers.mjs | 通用资源 verifier |
| 04-avatar-source-prepare.mjs | avatar-source-prepare |
| 04-avatar-submit-plan.mjs | avatar-submit-plan |
| 04-dmp-readonly.mjs | DMP resolve / readonly / push-plan / verifier |
| 04-video-material-bind-plan.mjs | video-material-bind-plan |
| 04-video-material-readiness.mjs | resource-verify-video-asset |
| 04-product-image-source-prepare.mjs | product-image-source-prepare |
| 04-event-asset-provision-contract.mjs | event asset Plan 合同 |
| 04-event-config-provision-contract.mjs | event config Plan 合同 |
| 04-event-chain-readiness.mjs | event asset / micro app instance 事件链核验 |
| 04-aweme-authorization-readonly.mjs | 抖音号授权关系 readonly |
| 04-backup-landing-page-material-inventory.mjs | 来源/目标 SHARE 库存核验 |
| 04-backup-landing-page-source-prepare.mjs | 备用页来源合同，不写平台 |
| 05-confirmed-resource-orchestrator.mjs | 已确认资源 Plan 的 claim、顺序执行、失败停止 |
| 05-payload.mjs | 最终 payload 构造 |
| 05-payload-contract.mjs | Draft、hash、contract、reservation |
| 05-official-create-field-contract.mjs | 官方字段 send / omit / block |
| 05-nested-field-contract.mjs | 嵌套字段合同 |
| 05-title-materials-contract.mjs | 标题素材合同 |
| 05-selling-points-contract.mjs | 卖点合同 |
| 05-create-field-ledger.mjs | 创建字段账本 |
| 05-std-project-create-wire-body.mjs | 无损 JSON wire body |
| 05-jszc-success-profile.mjs | JSZC 成功 profile |
| 05-duplicate-readonly.mjs | 创建前只读查重 |
| 05-create-preflight-diagnostics.mjs | Node 5 创建前总诊断 |
| 06-create-once.mjs | create-once |
| 07-readback.mjs | readback-std-project |

## 10. scripts 完整入口地图

说明：package.json 中的命令才是长期 CLI 入口。所有 smoke 使用 mock、test_run 或只读验证；test_run 必须清理。所有 once 脚本都必须由对应 fresh Plan 的人工确认约束。scripts/oneoff 不进入长期 runtime import graph。

### 10.1 基础、只读、凭据和全局 smoke

| 脚本 | 类型 / 作用 |
| --- | --- |
| scripts/00-create-result-mapping-smoke.mjs | smoke：Node 6/7、Job 状态与无真实写映射 |
| scripts/00-execution-grant-smoke.mjs | smoke：Plan-bound create scope、原子单次 claim、回查、无损 ID、历史 ID reconcile |
| scripts/00-execution-plan-smoke.mjs | smoke：资源/创建 Plan、hash、stale、单变量实验和授权边界 |
| scripts/00-jszc-success-profile-contract-check.mjs | contract check：数据库 JSZC success profile |
| scripts/00-oceanengine-token-refresh-scope-smoke.mjs | smoke：OAuth refresh 限于 scheduled scope 且不泄漏 secret |
| scripts/00-oceanengine-token-refresh.mjs | 受控 CLI：单独授权的 token refresh |
| scripts/00-oceanengine-token-status.mjs | 只读 CLI：脱敏凭据状态 |
| scripts/00-oe3-readonly-readiness-cli-smoke.mjs | smoke：fresh readonly CLI 的 Case/Job/零写边界 |
| scripts/00-oe3-readonly-readiness-cli.mjs | 长期 CLI：运行 fresh Node 01–04 readonly，输出 Plan 候选/审计摘要 |
| scripts/00-oe3-workflow-cli.mjs | 长期 CLI：dry-run、readback-only、mock execute runner |
| scripts/00-oe3-workflow-skills-smoke.mjs | smoke：7 Node、registry、公开 Job View |
| scripts/00-readonly-oceanengine-smoke.mjs | smoke：OceanEngine readonly dependency 与无真实写 |
| scripts/00-runtime-consistency-check.mjs | consistency check：既有 Job 节点、Draft、计数、脱敏 |
| scripts/00-safe-platform-error-summary-smoke.mjs | smoke：安全错误分类/字段路径 |
| scripts/00-schema-validation-smoke.mjs | schema check：数据库配置与授权 readiness 字段 |
| scripts/00-smoke-api.mjs | smoke：API view、节点 children、dry-run 清理 |
| scripts/00-workflow-case-smoke.mjs | smoke：Case、root blocker、完成 Gate、投影优先级 |

### 10.2 Node 02 monitor

| 脚本 | 类型 / 作用 |
| --- | --- |
| scripts/02-monitor-account-scope-smoke.mjs | smoke：monitor 显式目标账户范围 |
| scripts/02-monitor-bootstrap-smoke.mjs | smoke：bootstrap、凭据、脱敏、回查 |
| scripts/02-monitor-cycle-smoke.mjs | smoke：provision cycle / attempt 状态 |
| scripts/02-monitor-formal-boundary-smoke.mjs | smoke：monitor 不属于资源 executor 正式 action |
| scripts/02-monitor-planned-action-workflow-smoke.mjs | smoke：monitor planned action 与 scope |
| scripts/02-monitor-provision-cli.mjs | 长期 CLI：status、preflight、plan、reconcile、ensure、report、relation sync；必须显式 Case/账户 |

### 10.3 Node 03、备用页与资源蓝图

| 脚本 | 类型 / 作用 |
| --- | --- |
| scripts/03-backup-landing-page-readonly-resolve.mjs | 只读 CLI：单独运行备用页 readiness |
| scripts/03-baseline-resource-bootstrap-readonly-cli.mjs | 只读 CLI：物化/核验蓝图候选和 Plan 摘要 |
| scripts/03-baseline-resource-inheritance-smoke.mjs | smoke：蓝图继承、DMP、launch pack、资源状态 |
| scripts/03-landing-page-source-target-readonly-inventory.mjs | 只读 CLI：来源页、普通库存、目标 SHARE 库存 |

### 10.4 Node 04 资源专项

| 脚本 | 类型 / 作用 |
| --- | --- |
| scripts/04-avatar-ensure-once.mjs | 受控 once：头像 upload/submit/readback 后撤销 scope |
| scripts/04-avatar-executor-smoke.mjs | smoke：头像成功、失败、已 READY |
| scripts/04-avatar-submit-once.mjs | 受控 once：头像源与提交合同 Skill Run |
| scripts/04-avatar-submit-smoke.mjs | smoke：头像源检查和提交 Plan 零写 |
| scripts/04-aweme-authorization-readonly-smoke.mjs | smoke：抖音号授权 readonly 与 payload Gate |
| scripts/04-backup-landing-page-material-inventory-smoke.mjs | smoke：共享清单命中、未命中、降级 |
| scripts/04-dmp-ensure-once.mjs | 受控 once：逐包 DMP push/readback 后撤销 scope |
| scripts/04-dmp-executor-smoke.mjs | smoke：DMP transport、单次、失败停止、回查 |
| scripts/04-dmp-push-plan-smoke.mjs | smoke：DMP Plan 仅选择 missing 成员 |
| scripts/04-dmp-push-plan.mjs | 只读 CLI：输出 DMP push Plan，不写平台 |
| scripts/04-dmp-readback-smoke.mjs | smoke：read 权威分类、select 降级、可投性 |
| scripts/04-event-asset-api-create-once.mjs | 受控 once：event asset 单动作 Plan 创建/回查 |
| scripts/04-event-asset-executor-smoke.mjs | smoke：资产 executor、scope、list/detail 回查 |
| scripts/04-event-asset-provision-contract-smoke.mjs | smoke：资产可计划性与 BLOCKED 合同 |
| scripts/04-event-chain-readonly-smoke.mjs | smoke：资产、实例、baseline、goal、dbt readonly 链 |
| scripts/04-event-configs-api-create-once.mjs | 受控 once：baseline configs 创建/回查 |
| scripts/04-event-configs-executor-smoke.mjs | smoke：event config 请求、上限、失败停止、回查 |
| scripts/04-node4-resource-prep-contracts-smoke.mjs | smoke：Node 04 源合同、readiness、schedule、verifier |
| scripts/04-product-image-ensure-once.mjs | 受控 once：产品图 upload/readback 和撤销 scope |
| scripts/04-product-image-executor-smoke.mjs | smoke：108×108 图片 executor、签名/ID 回查 |
| scripts/04-resource-action-registry-smoke.mjs | smoke：资源注册表、Plan action、verify-only 边界 |
| scripts/04-video-material-bind-plan.mjs | 只读 CLI：视频绑定候选 Plan |
| scripts/04-video-material-ensure-once.mjs | 受控 once：视频批量绑定/回查和撤销 scope |
| scripts/04-video-material-executor-smoke.mjs | smoke：视频绑定、封面、scope、失败停止 |
| scripts/04-video-material-readback.mjs | 只读 CLI：指定视频集合目标账户回查 |

### 10.5 Node 05–07、确认与创建

| 脚本 | 类型 / 作用 |
| --- | --- |
| scripts/05-confirmed-resource-plan-execute-once.mjs | 长期受控 CLI：校验精确 Plan，记录一次确认，临时 scope，orchestrator，必撤销 |
| scripts/05-game-route-launch-link-smoke.mjs | smoke：小游戏 link、nested contract、payload 形态 |
| scripts/05-payload-contract-smoke.mjs | smoke：payload、字段合同、ledger、wire body、preflight |
| scripts/05-runtime-reservations-smoke.mjs | smoke：项目名 reservation 与并发序列 |
| scripts/05-single-confirmation-orchestrator-smoke.mjs | smoke：一份资源 Plan、一次确认、多个受限动作、失败停止 |
| scripts/06-create-verification-series-prepare.mjs | 受控 CLI：有上限创建验证系列，仍须 new Plan/confirmation |
| scripts/06-launch-execute-once.mjs | 长期受控 CLI：Node 06/07 Plan-bound 单次创建入口 |
| scripts/06-std-project-create-wire-body-smoke.mjs | smoke：int64 wire body、字段合同、无损响应 ID |
| scripts/07-create-field-ledger-attest.mjs | 人工 CLI：创建后字段 ledger attest |
| scripts/oneoff/06-std-project-id-lossless-reconcile.mjs | one-off：严格条件下事务修复历史舍入 ID；不调用平台写 |

## 11. 最小操作图与回归入口

~~~text
读取 workflow_case_summary
  ↓
├─ blocker
│  → 只定位一个最小修复
│  → fresh Node 01–04 readonly
│
├─ Resource Plan ready
│  → 展示 action / limit / plan_id / plan_hash
│  → 人工确认
│  → confirmed-resource-orchestrator
│  → 逐项 write/readback；失败停止或全部 READY
│
├─ Create Plan ready
│  → 展示唯一 std_project_create / plan_id / plan_hash
│  → 人工确认
│  → create ×1 → Node 07 readonly
│
├─ readback pending / mismatch
│  → 只 readback / 人工复盘
│  → 不重复 create
│
└─ first_std_project_create_completed
   → Case 完成；write scope 的 actions 和额度必须已撤销
~~~

最小回归集合：

~~~text
npm run validate:schemas
npm run test:workflow-case
npm run test:execution-plan
npm run test:single-confirmation-orchestrator
npm run test:execution-grant
npm run test:std-project-create-wire-body
npm run test:resource-action-registry
npm run test:dmp-executor
npm run test:video-material-executor
npm run test:product-image-executor
npm run test:event-chain-readonly
npm run test:payload-contract
git diff --check
~~~

最终不变量：

~~~text
一条主链
+ 一个 Node 注册表
+ 一份当轮 immutable Plan
+ 一次对应人工确认
+ 每项写后权威回查
+ 一个 workflow_case_summary 当前状态投影
~~~

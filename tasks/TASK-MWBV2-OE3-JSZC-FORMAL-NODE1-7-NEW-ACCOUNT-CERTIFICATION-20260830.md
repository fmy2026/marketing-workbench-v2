# TASK-MWBV2-OE3-JSZC-FORMAL-NODE1-7-NEW-ACCOUNT-CERTIFICATION-20260830

状态：closed_waiting_external_resource_readiness

更新时间：2026-08-30 CST

## 目标

使用一个由用户明确指定的新广告主账户，通过正式 Node 1–7 完成 JSZC/BYTE_GAME 从资源准备到一次标准项目创建及三次回查的最终认证。禁止使用 one-off 编译器。

## 当前认证范围

1. 目标账户固定为 `1871922434025472`；用户已确认它作为“目标账户从零”认证目标。
2. 路线固定为 `oceanengine_3_byte_mini_game`，游戏固定为 `JSZC`。
3. 使用游戏级已验证素材、DMP 源包与成功合同；账户级资源必须在目标账户重新核验或受控准备。
4. 先新建独立 `workflow_case`；所有 runtime Job 必须显式绑定新 Case。
5. 先只读完成账户、监测、事件、品牌、小游戏实例、备用页、抖音号授权和资源矩阵解析。
6. Node 4 将全部受支持资源动作与最终 create 编入一份不可变 Execution Plan；只允许一次绑定精确 Job/Plan/hash 的人工确认。
7. 确认后由 Node 5 按固定顺序复用现有单次 executor，写后回查并生成最终 Draft；任一资源失败时 Node 6 create 必须为零。

当前只读 bootstrap 阶段平台写入上限为 `0`。

## 冻结业务参数

- `budget=88888`
- `cpa_bid=488`
- `roi_goal=0.088`
- `schedule_type=SCHEDULE_FROM_NOW`
- 最终创建前必须重新展示并精确确认以上风险参数。

## 正式认证合同

- 使用 `2026-08-30.jszc-byte-game-success-profile-v1`。
- Node 5 字段形态必须匹配黄金 field shape hash，字段账本为 82 条：
  - `filter_event` 省略；
  - `converted_time_duration` 省略；
  - `external_url_material_list` 发送且恰好 1 条；
  - `mini_program_info` 只发送 `url`；
  - 禁止 one-off 和 `.archive` 进入 runtime import graph。
- Node 6 通过正式 `executeConfirmedLaunch` 最多调用一次 `std_project/create`，失败不自动重试。
- Node 7 汇总即时、10 秒、30 秒三次 list 回查；不创建 Promotion。

## 最终验收

- 7 个 Node 均有当前 runtime Job 状态，正式调度 Skill 均有 `launch_skill_runs`。
- confirmation、create action、created object 各 1 条；汇总 readback 1 条且包含 3 次尝试。
- `workflow_case_summary` 完成且无 blocker。
- raw payload、完整 URL、raw response、token 或完整 request ID 不落库。
- 仅在上述验收全部通过后，才可声明“新账户从零到智擎版标准项目创建的正式流程已走通”。

## 当前允许范围

- 新建目标账户独立 Workflow Case。
- 写入该 Case 的 runtime Job、Node、Skill、Plan、证据和只读回查审计记录。
- 调用 OceanEngine 与乾坤只读接口核验账户、监测、授权、资源和同名项目。
- 当前阶段不得生成或执行任何平台写入授权；外部资源就绪后必须使用 fresh Job 生成唯一 Plan。

## 禁止范围

- 当前只读阶段不刷新 token，不执行任何平台写入。
- 不复用旧 Case、Attempt 1–3 或 one-off Job 充当新账户认证。
- 不在本 Task 内提前进行脚本目录重构。
- 不因资源缺失新增事件、品牌、小游戏实例或备用页写入 executor。

## 关闭原因

用户已清理当前 active Task，为下一项独立工作释放项目协调位。本 Task 未完成新账户认证，不代表外部资源或标准项目创建已经成功；保留此记录仅用于后续 fresh Task 的事实参考。

## 后续前提

1. 平台侧完成目标账户的 JSZC 事件资产、小游戏实例、PAY、7 日 ROI 深度目标和深度出价的有效关联；
2. 平台侧完成受控备用落地页对目标账户的有效共享；
3. 新建独立 Task 后，创建 fresh 只读 bootstrap Job 重新核验。不得复用本 Case 的 Draft/Plan；Node 4 无 BLOCKED 后才可申请唯一 Plan 级确认。

唯一 Workflow 的单确认机制与 Case 单根 blocker 投影已经由独立 Task 完成并验证。当前只读 Case 只显示最前置的事件资源 blocker；Node 5 派生诊断保留在 `structural_blocker_codes`，不再阻断对根因的判断。

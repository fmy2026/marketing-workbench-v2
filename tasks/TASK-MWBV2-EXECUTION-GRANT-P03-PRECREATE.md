# TASK-MWBV2-EXECUTION-GRANT-P03-PRECREATE

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务统一工作台点击与 CLI 确认变量为同一个单次 `execution grant`。服务接收一次 grant 后，进入唯一正式 Workflow 链路：

```text
节点 1-5 真实只读校验
-> 节点 6 单次 std_project/create
-> 节点 7 自动 std_project/list 回查
```

本任务实现能力与 fake-transport 验证，但本轮不执行真实 `std_project/create`，不刷新 token，不重试历史失败 job。

## 目标

1. 新增唯一应用服务 `src/workflows/executeConfirmedLaunch.mjs`。
2. 新增正式 API `POST /api/launch/jobs/:job_id/execute-once`。
3. 新增 CLI 入口 `npm run launch:execute-once -- --job-id ...`，与 UI 共用同一服务。
4. `confirm-create` 不再作为第二条创建路径，改为兼容调用同一服务或保持阻断。
5. readonly permission 和 create permission 从本次 grant 上下文传入，不永久修改全局 guardrail。
6. P03 可执行真实只读预检；本任务不执行真实创建。
7. 前端主按钮改为调用 `/execute-once`，布局不改。
8. 新增 execution grant fake-transport 测试，验证 1-7 自动链路但不调用真实平台。

## 目标 job

| 项 | 值 |
| --- | --- |
| job_id | `JOB-MWBV2-20260824092327-494BF1` |
| 项目序号 | P03 |
| 账户 | `1871922175825993` |
| 游戏 | `JSZC` |
| 路线 | `oceanengine_3_byte_mini_game` |

## 非目标

| 项 | 状态 |
| --- | --- |
| 本任务中执行真实 `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 自动重试或复制旧 job | 禁止 |
| 修改素材、预算、出价、DMP、事件、品牌或账户资源 | 禁止 |
| 新增第二套 Workflow、Skill、executor 或平台写入路径 | 禁止 |
| 依赖旧项目运行路径 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| UI 与 CLI 共用 `executeConfirmedLaunch` 服务 | passed |
| `/execute-once` 已接入，前端主按钮使用它 | passed |
| readonly/create permission 由 grant 上下文传入 | passed |
| `confirm-create` 不再形成第二条真实创建路径 | passed |
| P03 只读预检可运行，且本任务不创建平台对象 | passed |
| fake-transport execution grant 测试通过 | passed |
| 现有 smoke/check 通过 | passed |
| 无 token、Cookie、完整触点 URL、raw payload、raw response 泄漏 | passed |

## 完成记录

- 新增 `src/workflows/executeConfirmedLaunch.mjs` 作为 UI 与 CLI 唯一 execution grant 服务。
- 新增 `POST /api/launch/jobs/:job_id/execute-once`，前端主按钮改为调用该接口。
- 新增 `npm run launch:execute-once -- --job-id ...`，CLI 需 `MWBV2_OE_EXECUTION_CONFIRM=EXECUTE_ONE_LAUNCH`。
- `confirm-create` 已兼容调用同一服务，且无 `execution_intent` 时阻断，不能形成第二条创建路径。
- P03 `JOB-MWBV2-20260824092327-494BF1` 已完成 grant-scoped dry_run 只读预检：节点 1-4 passed，节点 5 needs_confirmation，节点 6 locked，节点 7 waiting。
- P03 创建记录保持为 `confirmationCount=0`、`createActionCount=0`、`createdObjectCount=0`、`realReadbackCount=0`。

## 验证记录

- `npm run token:status` passed，凭据状态脱敏 `valid`。
- P03 grant-scoped dry_run passed，`createReadiness.status=ready_for_user_create_confirmation`。
- `npm run test:execution-grant` passed。
- `node scripts/confirm-create-preflight-smoke.mjs` passed，旧入口无 `execution_intent` 时阻断且不写平台动作。
- `npm run test:create-result-mapping` passed。
- `npm run test:payload-contract` passed。
- `npm run smoke:workflow-skills` passed。
- `npm run smoke:api` passed。
- `npm run smoke:readonly` passed。
- `npm run check:runtime-consistency` passed。

## 下一步 gate

用户在工作台点击一次 `开始执行` 或 CLI 带确认变量执行时，进入单次真实 create grant：节点 1-5 将再次真实只读校验，通过后才允许节点 6 单次 `std_project/create`，随后节点 7 自动只读回查。当前仍禁止自动重试、token refresh 和任何范围外平台写入。

# TASK-MWBV2-OE3-INSTANCE-ID-LOSSLESS-WIRE-AND-CREATE-READY-1871922346964041

## Brief

目标账户 `1871922346964041`、case `CASE-LEGACY-2E4217E20C9E26BFB648772C` 进入单次真实创建前的最后工程 Gate：将 19 位 `instance_id` 从 Postgres 数字字符串，经本地受控 BigInt 校验，编码为 `std_project/create` 请求体里的 JSON number token。

## Scope

- 仅处理 `oceanengine_3_byte_mini_game / JSZC / 1871922346964041` 的 Node 5 创建传输合同。
- 本机官方资料仍只证明 `instance_id` 字段名、`number` 类型和 `MICRO_GAME + BYTE_GAME` 适用性。
- `decimal_bigint_json_number` 只代表本地工程无损编码验证，不代表平台新增官方文档。
- fresh readonly job 通过后，只开放“等待单次创建授权”的状态；不自动执行真实平台写入。

## Non Goals

- 不搜索外部资料。
- 不创建 monitor、不上传素材、不刷新 token、不改预算或出价。
- 不保存 raw payload、raw request body、raw response、token、完整 URL。
- 不把 19 位实例 ID 转成 JavaScript `Number()`。

## Mechanism

```text
Postgres instance_id string
-> validate positive decimal, no leading zero, BigInt parse, <= int64 max
-> canonical std_project/create wire body
-> top-level instance_id emitted as JSON number token
-> wire body hash = payload hash = request hash
-> fresh Node 1-5 readonly readiness
-> user grants one create scope
-> std_project/create once
-> std_project/list readback
```

## Acceptance

- `test:std-project-create-wire-body` 通过，覆盖 19 位 ID、非法字符、前导零、浮点、负数和 int64 上限。
- `test:payload-contract` 通过，Node 5 manifest 能证明 `instance_id` 使用 `decimal_bigint_json_number`。
- `test:execution-grant` 通过，mock create 的 fetch body 中实例 ID 不加引号、不用科学计数法且只发送一次。
- fresh readonly job 的 Node 1-5 可进入 `ready_for_user_create_confirmation`，平台写入计数为 0。
- 真实创建仍需独立授权，并在执行后撤销 write scope。

## Result

- Status: completed
- Owner: Codex
- Runtime truth: Postgres `marketing_workbench_v2.mwb`
- Evidence boundary: redacted status, IDs, hashes and presence flags only
- Fresh job: `JOB-MWBV2-20260828123736-9B885F`
- Draft: `DRAFT-JOB-MWBV2-20260828123736-9B885F`
- Project name: `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P13_20260828`
- Payload hash: `sha256:220933a99cf8cd573dba2e5c0380c127fd8f0a7a8e203f7a284c760a665b19cc`
- Case gate: `await_job_write_authorization`
- Suggested next action: `obtain_single_job_authorization`
- Platform writes before authorization: `0`

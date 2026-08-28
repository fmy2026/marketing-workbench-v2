# TASK-MWBV2-OE3-MINI-GAME-LAUNCH-LINK-AND-FRESH-CREATE-1871922346964041

## Brief

目标账户 `1871922346964041`、case `CASE-LEGACY-2E4217E20C9E26BFB648772C` 的上一次 `std_project/create` 已消耗且失败，本任务只迁入并固化 JSZC 字节小游戏调起链接，然后基于新鲜 job 再进入一次独立真实创建闭环。

## Scope

- 新增 `mwb.game_route_launch_links`，按 `route_id + game_code` 保存小游戏调起深链受控真值。
- 从旧项目成功样板 `1871922175825993 / 7675218401040220179` 一次性迁入 JSZC 字节小游戏调起链接。
- Node 5 对 `MICRO_GAME + BYTE_GAME` 强制要求 `project_materials.mini_program_info.url`，并校验 `platform_app_id + app_id + hash + sslocal://microgame`。
- 旧失败 job `JOB-MWBV2-20260828123736-9B885F` 保持已消耗状态，不重试。
- 新鲜 Node 1-5 readonly/preflight 通过后，才建立 fresh job 的一次性 `std_project/create` scope。

## Non Goals

- 不把完整调起链接写入任务卡、manifest、普通日志、前端或 evidence 摘要。
- 不上传素材、不创建 monitor、不刷新 token、不改预算或出价。
- 不把旧项目作为 v2 runtime 依赖；旧项目只作为一次性迁入来源。
- 不对已失败 job 追加第二次真实创建。

## Mechanism

```text
legacy success controlled ref
-> in-memory sslocal/app_id validation
-> mwb.game_route_launch_links(route_id + game_code)
-> Node 5 controlled read
-> mini_program_info.app_id + url
-> fresh readonly Node 1-5
-> single fresh create confirmation
-> std_project/create once
-> std_project/list readback
```

## Acceptance

- 表结构限制非 `sslocal://microgame`、空值、hash 异常和 metadata 泄露。
- 同一 `route_id + game_code` 只能有一条有效调起链接。
- Node 5 缺深链、hash 不一致或 app_id 不匹配时输出 `mini_game_launch_url_not_ready`。
- fresh job 创建前平台写入计数为 0。
- 单次真实创建最多调用一次，执行后自动撤销 write scope，并写入脱敏排障日志。

## Result

- Status: completed_with_platform_create_failure
- Owner: Codex
- Runtime truth: Postgres `marketing_workbench_v2.mwb`
- Evidence boundary: IDs, status, hash and presence flags only
- Launch link ref: `GRLL-JSZC-OE3-BYTE-MINI-GAME-001`
- Launch link hash: `2dba4e87ff86333ca31d55ce5a6cd3d625ec45176820d229022103e8ef11ae0b`
- Fresh job: `JOB-MWBV2-20260828133507-78C36B`
- Draft: `DRAFT-JOB-MWBV2-20260828133507-78C36B`
- Plan: `PLAN-JOB-MWBV2-20260828133507-78C36B-V1`
- Payload hash: `sha256:5da2fff1f37254f7117a8762f514dd12b409f0321447874b6efb64feb99487cd`
- Create called: `true`
- Create call count: `1`
- API code: `40000`
- Object created: `false`
- Readback status: `not_found_after_create`
- Retry allowed: `false`
- Next action: `manual_review_required`

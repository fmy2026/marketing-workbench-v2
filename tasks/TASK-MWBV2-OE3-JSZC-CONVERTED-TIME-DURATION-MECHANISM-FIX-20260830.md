# TASK-MWBV2-OE3-JSZC-CONVERTED-TIME-DURATION-MECHANISM-FIX-20260830

状态：closed_validated_no_platform_write

更新时间：2026-08-30 CST

## 目标

将 one-off 真实创建已验证成功的 JSZC/BYTE_GAME 字段形态固化到正式 workflow / Skill / 合同 / 预检 / 字段账本中：

- `hide_if_converted=NO_EXCLUDE` 时，`audience.filter_event` 与 `audience.converted_time_duration` 必须完全省略；
- `project_materials.external_url_material_list` 必须发送且只能发送 1 条受控、已核验备用页；
- `project_materials.mini_program_info` 只发送 `url`；
- 继续省略 `micro_promotion_type`、`app_id`、`start_path`、`params`、锚点列表和组件列表。

本 Task 只做底层机制修正与本地验证，不开放任何平台写入。

## 证据基线

| 项 | 值 |
| --- | --- |
| 成功 one-off Task | `TASK-MWBV2-OE3-JSZC-ONEOFF-CONVERTED-TIME-OMIT-CREATE-20260830` |
| 成功 Job | `JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8` |
| 成功 Plan | `PLAN-JOB-MWBV2-CTD-OMIT-20260830051146-6C3BEBF8-V1` |
| payload hash | `sha256:e22443b2f2edc37dce042da79519bd6394c9cd35f813a0e5d7ae063161bd353a` |
| diff hash | `sha256:17b6e55a7075203f00c9bf89f38692cd8f445d8498f42de72b7c78e61986003c` |
| 平台结果 | `std_project/create` HTTP `200`，业务码 `0`，三次 list 回查 `readback_verified` |

该证据只证明“Attempt 3 基线省略 `audience.converted_time_duration` 的组合被平台接受”，不反向宣称前三次 `40000` 的唯一根因必然就是该字段。

## 实施范围

- 修改正式 JSZC / OE3 payload 生成逻辑，禁止在 `hide_if_converted=NO_EXCLUDE` 时发送 `audience.converted_time_duration`。
- 将 JSZC 路线备用页策略从 `omit` 固化为 `send`，并强制恰好 1 条 active、HTTPS、目标账户可见、回查通过且 hash 一致的备用页。
- 更新 nested contract、payload contract、字段账本和 create preflight，让发送 `SIX_MONTH`、空值或错误类型都阻断。
- 增加唯一数据库迁移、成功配置版本、脱敏字段形态 hash 与只读 `db:contract-check`。
- 以成功请求的脱敏路径、类型、数量和 send/omit 策略建立黄金 fixture；动态值只保存 hash，不保存原始值。
- 补充回归测试：
  - `NO_EXCLUDE` 下省略 `converted_time_duration`；
  - 非 `NO_EXCLUDE` 场景不被误伤；
  - Attempt 3 fixture 到成功 one-off 形态的 diff 只包含批准路径；
  - 不触发真实平台写入。
- 同步更新必要的诊断说明和 lessons，但不得把一次性脚本作为 runtime 依赖。

## 禁止范围

- 不调用 `std_project/create`。
- 不创建 Promotion。
- 不上传或修改素材、事件、DMP、人群、预算、出价、token。
- 不恢复或复用 `.archive/` 下 one-off 脚本作为长期入口。
- 不修改已关闭 Attempt 1-3 与 one-off 执行结果。
- 不保存 raw payload、完整 URL、raw response、token、secret、Cookie、auth_code 或完整 request ID。

## 验收

- [x] workflow / Skill 正式路径生成的 JSZC payload 在 `NO_EXCLUDE` 下完全缺失 `audience.converted_time_duration`。
- [x] 正式路径同时完全缺失 `audience.filter_event`，并发送恰好 1 条已核验备用页。
- [x] 合同与预检能阻断误发该字段。
- [x] Draft/Plan 脱敏摘要包含 success profile 版本、field shape hash 和三项策略证据。
- [x] 运行数据库合同版本与代码一致，`db:contract-check` 通过。
- [x] 相关 smoke / contract / workflow 测试通过。
- [x] `package.json` 只增加长期只读 `db:contract-check`；无 one-off 临时入口。
- [x] 无真实平台写入记录新增。

## 验证结果

- 成功配置：`2026-08-30.jszc-byte-game-success-profile-v1`。
- nested contract：`2026-08-30.oe3-std-project-create-nested-fields-v4`。
- 黄金字段形态 hash：`sha256:9203ddf077d05b51958e851dad86894f75fdf09884ffc99690ad459ce5dd1064`，脱敏字段账本 `82` 条。
- 黄金数量：视频 `2`、标题 `3`、产品图 `1`、空图片数组 `0`、备用页 `1`、DMP 排除 `10`。
- `db:contract-check`、payload contract、execution plan、wire body、launch-link、workflow skills 与 schema smoke 均通过。
- 迁移前后 `mwb.platform_actions` 总数均为 `29`；相关 `test_run` Job 清理后为 `0`。
- 正式 builder 对已审计成功 Job 的只读重编译得到相同字段形态；旧 Job 的 aweme 授权证据不属于该 Job scope，因此没有把该只读重编译误记为正式 Node 1–7 认证。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | one-off 真实创建验证成功后，按用户批准计划启动永久机制修正。 |
| objective | 将已验证字段规则纳入正式运行链路，避免 v2 机制再次生成平台不接受的组合。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、成功 one-off Task/Manifest、当前代码、官方 OE3 文档与 `docs/Solution Design.md`。 |
| stop condition | 本地合同/测试通过后关闭；若发现会改变其他业务字段或需要平台写入，停止并重新提交方案确认。 |

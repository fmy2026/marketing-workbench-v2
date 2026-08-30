# TASK-MWBV2-OE3-JSZC-CONVERTED-TIME-DURATION-MECHANISM-FIX-20260830

状态：planned_waiting_implementation

更新时间：2026-08-30 CST

## 目标

将 one-off 真实创建已验证成功的字段规则固化到正式 workflow / Skill / 合同 / 预检 / 字段账本中：

`hide_if_converted=NO_EXCLUDE` 时，`audience.converted_time_duration` 必须完全省略。

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
- 更新 nested contract、payload contract、字段账本和 create preflight，让发送 `SIX_MONTH`、空值或错误类型都阻断。
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

- [ ] workflow / Skill 正式路径生成的 JSZC payload 在 `NO_EXCLUDE` 下完全缺失 `audience.converted_time_duration`。
- [ ] 合同与预检能阻断误发该字段。
- [ ] 相关 smoke / contract / workflow 测试通过。
- [ ] `package.json` 只保留长期需要的命令；无 one-off 临时入口。
- [ ] 无真实平台写入记录新增。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | one-off 真实创建验证成功后，按用户批准计划启动永久机制修正。 |
| objective | 将已验证字段规则纳入正式运行链路，避免 v2 机制再次生成平台不接受的组合。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、成功 one-off Task/Manifest、当前代码、官方 OE3 文档与 `docs/Solution Design.md`。 |
| stop condition | 本地合同/测试通过后关闭；若发现会改变其他业务字段或需要平台写入，停止并重新提交方案确认。 |

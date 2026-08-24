# TASK-MWBV2-OE3-THREE-PAYLOAD-COMPARISON

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务只读定位 P03 `std_project/create` 的 `api_code=40000` 是否可能来自字段结构差异。任务不新建 runtime job、不重试 P03、不调用真实 `std_project/create`、不刷新 token、不改前端、不新增 workflow / Skill / migration。

本任务只产出 4 个脱敏参考文件：

```text
docs/.参考文档/3.0创建/01-P01-平台项目结构-脱敏.json
docs/.参考文档/3.0创建/02-P03-v2最终创建结构-脱敏.json
docs/.参考文档/3.0创建/03-P01-旧项目创建结构-脱敏.json
docs/.参考文档/3.0创建/04-P01-P03-创建字段对比.md
```

## 固定对象

| 项 | 值 |
| --- | --- |
| advertiser_id | `1871922175825993` |
| P03 job | `JOB-MWBV2-20260824092327-494BF1` |
| P03 payload_hash | `sha256:152babf25efa31d4aa526d17a5dd7379f687dc8a069e5e93bf51eb38aa73a2f4` |
| P01 project_id | `7675218401040220179` |
| P01 project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817` |

## 目标

1. 使用 v2 `oceanengineReadonlyClient.mjs` 按官方/旧 readback 口径只读 P01 `std_project/list`，只保存脱敏字段结构。
2. 使用 v2 唯一 payload builder 重新生成 P03 最终提交前字段结构，并校验 hash 稳定。
3. 只读搜索旧项目文件和旧 Postgres，确认是否保留 P01 当次完整创建 request JSON；若不存在，记录 `legacy_raw_create_payload_not_retained`。
4. 生成 P01 / P03 / 旧成功经验的字段差异结论。

## 非目标

| 项 | 状态 |
| --- | --- |
| 重试 P03 | 禁止 |
| 真实 `std_project/create` | 禁止 |
| 新建 P04 / runtime job | 禁止 |
| token refresh | 禁止 |
| 新增 workflow / Skill / migration | 禁止 |
| 修改前端 | 禁止 |
| 保存 raw payload / raw response / 完整触点 URL | 禁止 |
| 旧项目成为 v2 runtime 依赖 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| 4 个脱敏参考文件已生成 | passed |
| P01 平台只读结构已保存或明确记录不可得原因 | passed；`std_project/list` 命中 P01 |
| P03 v2 最终字段结构已生成且 hash 匹配目标 hash | passed |
| 旧项目 P01 创建 JSON 若不存在已记录 `legacy_raw_create_payload_not_retained` | passed |
| `04-P01-P03-创建字段对比.md` 回答 5 个最终问题 | passed |
| P03 create action 计数保持 1、created_objects 保持 0 | passed |
| 无 token、Cookie、secret、完整触点 URL、raw payload、raw response 泄漏 | passed |

## 当前结论区

### 生成文件

| 文件 | 结果 |
| --- | --- |
| `docs/.参考文档/3.0创建/01-P01-平台项目结构-脱敏.json` | P01 `std_project/list` 只读通过，`api_code=0`，命中目标 project |
| `docs/.参考文档/3.0创建/02-P03-v2最终创建结构-脱敏.json` | P03 最终 create payload 结构已脱敏保存，hash 匹配目标 |
| `docs/.参考文档/3.0创建/03-P01-旧项目创建结构-脱敏.json` | 旧库有 P01 成功对象/记录索引，但未保留 raw create payload |
| `docs/.参考文档/3.0创建/04-P01-P03-创建字段对比.md` | 已回答 5 个最终问题 |

### 关键结论

| 问题 | 结论 |
| --- | --- |
| P03 与 P01 是否同名重复 | 否。P01 存在且命中，但 P03 名称不同。 |
| P03 是否缺 P01 有的关键创建字段 | 否。按 v2 当前官方/旧脚本抽象出的关键创建字段，P03 均 present。 |
| P03 是否有官方/旧脚本不允许字段 | 否。P03 字段均在允许创建字段范围内。 |
| 字段类型、枚举、素材、品牌、事件、DMP、触点差异 | 未发现可证实创建字段合同差异；P01 list 与 P03 create 的 response/request 差异不直接作为根因。 |
| P03 `40000` 是否明确根因 | 仍未明确；需下一次新 job 的 safe error summary 或平台 request id 错误详情确认。 |

### 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm run docs:three-payload-comparison` | passed |
| `npm run check:runtime-consistency` | passed |
| P03 Postgres 计数 | `create_actions=1`，`created_objects=0` |
| 本地 API 抽查 | P03 `createReadiness=blocked_after_single_create_failure`，按钮 `禁止重试` |
| 文档敏感扫描 | 未命中 token、Cookie、完整触点 URL、raw response |
| `npm run smoke:api` | 未运行；该命令会创建 test_run P04，本任务明确禁止新建 P04 |

## 下一步 gate

P03 不可重试。下一步如继续排查，需要平台 request id 错误详情，或另建 fresh runtime job 先 dry-run；若再次执行真实创建，必须另建单次确认任务，并依赖 safe error summary 保留脱敏错误指纹。

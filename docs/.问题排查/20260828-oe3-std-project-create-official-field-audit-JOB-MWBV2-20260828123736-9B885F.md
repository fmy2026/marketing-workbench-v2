# 20260828 OE3 std_project/create 官方字段合同审计 - JOB-MWBV2-20260828123736-9B885F

## 结论

本轮只做官方合同和本地最终 payload 形状审计，没有平台调用、没有 fresh job、没有重试。

当前失败更像是 `api_code=40000` 的平台业务校验不通过，而不是 Node 1-4 资源未就绪或顶层必填字段缺失。顶层必填项均有直接官方字段依据并已发送；真正需要收敛的是“嵌套字段 + 条件必填 + 空值发送”的合同闭合。

## 来源

| 来源 | 用途 |
| --- | --- |
| `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md` | 主依据；请求地址、Header、完整请求参数表、SDK 示例 |
| `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-巨量营销智擎版-项目管理与优化目标.md` | 3.0 主库索引交叉校验 |
| `/Users/hys/Projects/marketing-workbench-v2/src/workflows/skills/oe3/05-payload.mjs` | 当前最终 payload 构造入口 |
| `/Users/hys/Projects/marketing-workbench-v2/src/workflows/skills/oe3/05-official-create-field-contract.mjs` | 当前官方发送策略 |
| `/Users/hys/Projects/marketing-workbench-v2/src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs` | 当前创建前诊断 |

## 审计范围

- 官方请求地址：`POST /open_api/v3.0/std_project/create/`
- Header：`Access-Token`、`Content-Type`
- 请求参数：官方参数表 line 45-204，按父路径展开为 159 条请求字段记录；加 Header 共 161 条合同记录。
- SDK 示例：只作为字段形状示例，不作为同一路线必填依据。
- 当前路线：

```text
ad_type=ALL
landing_type=MICRO_GAME
marketing_goal=VIDEO_AND_IMAGE
delivery_medium=BYTE_GAME
native_type=AWEME
advertiser_id=1871922346964041
```

## 当前最终 payload 形状

| 项 | 结果 |
| --- | --- |
| job | `JOB-MWBV2-20260828123736-9B885F` |
| payload hash | `sha256:220933a99cf8cd573dba2e5c0380c127fd8f0a7a8e203f7a284c760a665b19cc` |
| final payload blockers | `0` |
| 脱敏字段路径数 | `69` |
| 平台写入 | `0` in this audit |
| raw payload stored | `false` |

## 1. 当前路线必填且已满足

| 字段 | 官方依据 | 当前形状 |
| --- | --- | --- |
| `header.Content-Type` | line 39，必填，允许 `application/json` | executor 发送；不入 payload |
| `advertiser_id` | line 45，必填 number | sent，number |
| `ad_type` | line 51，必填 string | sent，`ALL` |
| `landing_type` | line 52，必填 string | sent，`MICRO_GAME` |
| `marketing_goal` | line 53，必填 string | sent，`VIDEO_AND_IMAGE` |
| `external_action` | line 56，必填 string，来源优化目标接口 | sent，string |
| `native_type` | line 59，必填 string | sent，`AWEME` |
| `delivery_mode` | line 69，必填 string | sent，`PROCEDURAL` |
| `schedule_type` | line 70，必填 string | sent，`SCHEDULE_FROM_NOW` |
| `bid_type` | line 75，必填 string | sent，`CUSTOM` |
| `budget_mode` | line 76，必填 string | sent，`BUDGET_MODE_DAY` |
| `budget` | line 77，预算类型为日预算/总预算时条件必填 | sent，number |
| `cpa_bid` | line 79，条件必填 | sent，number |
| `roi_goal` | line 81，条件必填 | sent，number |
| `pricing` | line 83，必填 string | sent，`PRICING_OCPM` |
| `audience_type` | line 87，必填 string | sent，`CUSTOM` |
| `name` | line 106，必填 string，1-50 字 | sent，string |
| `is_comment_disable` | line 107，条件必填 | sent，`OFF` |
| `audience` | line 109，条件必填 object | sent，object |
| `project_materials` | line 142，必填 object | sent，object |
| `brand_info` | line 189，条件必填 object | sent，object |
| `instance_id` | line 199，number，小程序/小游戏资产 id | current object keeps string; wire encoder emits decimal JSON number token |

## 2. 当前路线条件必填但缺失或条件判断不足

| 字段 | 风险 | 定位 |
| --- | --- | --- |
| `project_materials.mini_program_info.url` | 当前字段存在但为空字符串。官方 line 188 写明 url 传入时会检查正确性；空字符串是否等价于“不传”没有直接合同。建议下阶段改为 omit 空值或用官方规则证明可空。 | `05-payload.mjs` builds `url: clean(...)` |
| `project_materials.mini_program_info` | 官方 line 184-188 提供字节小程序信息；无 url 时可上传 `app_id/start_path/params` 自动生成链接，但 line 186 又说小游戏类型不传 `start_path`。当前仅发送 `app_id` + 空 `url`，小游戏场景是否充分需要收敛。 | `mini_program_info.app_id` sent, `url` empty |
| `project_materials.product_info` | line 163 为条件必填；当前发送 `titles/image_ids/selling_points`，但“当前 MICRO_GAME + BYTE_GAME 路线为什么必须或可以带产品基础组件”没有被独立条件化。 | product image count 1, selling point count 3 |
| `project_materials.external_url_material_list` | line 174 为条件必填，支持橙子建站/自研落地页；当前作为备用落地页发送 1 个已验证链接，但其和 `MICRO_GAME + BYTE_GAME + instance_id` 是否必须同时出现没有路线级合同。 | count 1，完整 URL 未记录 |
| `track_url_setting` | line 89 为条件必填；当前只发送 `send_type` 与 `action_track_url`。需要把 nested path 条件写入基线，确认当前优化目标是否只需要有效触点监测。 | `track_url_setting.action_track_url` count 1 |
| `delivery_type` | line 197 官方存在，默认常规投放；当前最终 payload 未发送。可能可依赖默认值，但应显式标记为 `optional_default_omitted`，避免被旧 omit 规则误认为“无官方合同”。 | current omitted |

## 3. 当前发送但官方直接合同或格式证据不足

| 字段 | 状态 | 说明 |
| --- | --- | --- |
| `project_materials.mini_program_info.url` | `type_or_format_risk` | 发送了空字符串；建议下阶段禁止发送空字符串。 |
| `project_materials.image_material_list` | `type_or_format_risk` | 发送了空数组；官方 line 150 只定义图片素材列表，没有说明空数组等价于不传。 |
| `audience.age` | `type_or_format_risk` | 发送了空数组；官方 line 111 定义年龄枚举，没有说明空数组等价于不限。 |
| `audience.retargeting_tags_exclude` | `sent` | 官方 line 128 定义为 `number[]`；当前 count 10。需要继续保持仅保存数量和 hash，不保存成员原文。 |
| `deep_external_action` / `deep_bid_type` / `roi_goal` / `cpa_bid` | `official_condition_unknown` | create 文档给了字段和来源，但组合有效性依赖优化目标/深度优化方式接口；本轮未调用平台，只能标为待二阶段只读核验。 |

## 4. 官方存在但当前未发送

这些字段不能简单视为缺失。按当前路线分三类：

| 分类 | 字段 |
| --- | --- |
| 当前路线不适用 | `app_promotion_type`、`subscribe_url`、`download_url`、`download_type`、`launch_type`、`download_mode`、`product_platform_id`、`product_id`、`unique_product_id`、`shop_platform`、`landing_page_stay_time`、`live_duration`、`multi_delivery_medium`、`web_url_material_list`、`open_url`、`ulink_url`、`ulink_url_type`、`open_urls`、`playlet_series_url_list` |
| 可选未用 | `internal_advertiser_info.*`、`game_addiction_id`、`start_time`、`end_time`、`schedule_time`、`search_continue_delivery`、`bid`、`deep_cpabid`、`first_roi_goal`、`blue_flow_keyword_name`、`keywords.*`、`auto_extend_traffic`、`star_task_id_list`、`aigc_dynamic_creative_switch`、`delivery_type`、`layer_roi_switch`、`seven_roi_goal` |
| 待确认是否应 omit 空值 | `audience.age`、`project_materials.image_material_list`、`project_materials.mini_program_info.url`、`project_materials.video_material_list[].video_cover_id` |

## 候选问题清单

| 优先级 | 字段/机制 | 为什么可能导致 `40000` | 下一步 |
| --- | --- | --- | --- |
| P0 | `project_materials.mini_program_info.url` | 官方明确“url 传入会检查正确性”，当前是空字符串字段；平台可能按“传了 url 但不合法”处理。 | 修改前先建二阶段方案：空 URL 改 omit，并重跑 Node 5 dry-run。 |
| P0 | 嵌套字段合同基线 | 当前 `05-official-create-field-contract.mjs` 只遍历顶层 key；嵌套字段无法逐项判定。 | 将 JSON 矩阵接入 preflight 的 nested path 评估。 |
| P1 | `project_materials.product_info` | 条件必填但条件未在代码中明确；当前发送产品基础组件，平台可能对小游戏路线有更细条件。 | 对产品组件条件补充官方依据或标记可选策略。 |
| P1 | `external_url_material_list` + `instance_id` + `mini_program_info` 组合 | 三者同时出现在小游戏创建里是否允许，当前官方表只给字段级说明，不给组合示例。 | 用官方表先做互斥/组合矩阵，再决定是否保留备用页字段。 |
| P1 | 优化目标/深度优化/出价组合 | create 表只给来源；当前组合需要 optimized_goal/get 与 dbt/get 的只读结果闭合。 | 第二步排查再只读核对优化目标和 deep bid 组合。 |
| P2 | 空数组字段 | 官方未说明空数组等价于不传。 | 建议后续 payload policy 对空可选数组统一 omit。 |

## 机读矩阵

完整矩阵见：

`/Users/hys/Projects/marketing-workbench-v2/docs/.问题排查/20260828-oe3-std-project-create-field-matrix-JOB-MWBV2-20260828123736-9B885F.json`

## 本轮边界确认

- `platform_write_called=false`
- `fresh_job_created=false`
- `std_project_create_retry=false`
- `old_project_reference_used=false`
- `token_stored=false`
- `full_url_stored=false`
- `raw_payload_stored=false`
- `raw_response_stored=false`

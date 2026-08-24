# TASK-MWBV2-OE3-APICODE-40000-FAILURE-REVIEW

状态：completed

更新时间：2026-08-24 CST

## 目标

只读复盘 `JOB-MWBV2-20260824014546-851B76` 的 OceanEngine `apiCode=40000` 失败原因，定位可能来自 payload 字段、账户资源、`brand_info`、事件资产、触点、权限或平台返回结构。

本任务不执行 `std_project/create`，不重试创建，不刷新 token，不调用任何平台写入 API。

## 读取边界

| 来源 | 规则 |
| --- | --- |
| v2 项目文件 | 可读 |
| v2 Postgres | 只读 `marketing_workbench_v2.mwb` 中脱敏 platform action、draft、readback、node、resource 摘要 |
| 旧项目 | 只读参考 3.0 成功经验，不作为运行依赖 |
| 平台 API | 不调用 |

## 诊断维度

| 层级 | 状态 |
| --- | --- |
| payload 合同 | passed，低嫌疑 |
| `brand_info` | high_suspicion |
| `event_asset` | medium_high_suspicion，事件链深度证据不足 |
| `product_image` | passed，低嫌疑 |
| touchpoint | passed，低嫌疑 |
| `app_id` / `game_platform_apps` | passed，低嫌疑 |
| DMP / 素材 | partial，低到中嫌疑 |
| account authorization | passed，低嫌疑 |
| platform action result | failed_or_unconfirmed，原因不透明 |

## 只读复盘结论

结论：当前已保存的脱敏证据不足以把 `apiCode=40000` 精确归因到某一个字段；它更像平台侧通用参数/业务校验失败。按现有 v2 证据分层，最可疑的两类是：

1. `brand_info` / 行业链路：品牌 fuzzy 只读通过，但 `brand_industry` 只读接口本身返回过 `api_code=40000`，当前 create gate 使用了同账户历史证据 + 人工确认放行，不是 fresh target-account industry live readback 全链路通过。
2. 事件链深度不足：v2 只确认了 `MINI_PROGRAME` event asset 可见，但旧项目 3.0 成功经验要求继续验证 available events、event configs、optimized goal / dbt，当前 v2 未沉淀这些证据。

payload 摘要合同、触点、`game_platform_apps.app_id`、产品图、头像、视频素材、账户授权本身没有显示为直接阻断。平台动作结果显示：`std_project/create` HTTP `200`、`api_code=40000`、request id 存在、对象 id 不存在；随后 `std_project/list` HTTP `200`、`api_code=0`，未找到同名对象。

## 分层诊断表

| 层级 | 结论 | 证据 | 下一步 |
| --- | --- | --- | --- |
| payload 合同 | 低嫌疑 | 草稿 payload 合同 `passed`；字段齐全；无禁止字段；`payload_hash` 稳定；create payload 脱敏摘要显示事件资产、小程序实例、头像、触点、产品图、视频、封面、标题和 brand_info 均 present | 暂不优先修摘要合同；若要继续，应补一个只读/离线 create-payload official allowlist 审计，不输出 raw payload |
| `brand_info` | 高嫌疑 | `brand_info` 字段齐全且无 `ecom_brand_id`；但 `brand_industry` 只读证据为 HTTP `200` + `api_code=40000`，当前为 `passed_by_manual_confirmation` | 优先重跑/修复 fresh target-account brand industry 只读校验；不要依赖历史证据进入下一次创建 |
| `event_asset` | 中高嫌疑 | event asset list 只读 `passed`，读到目标 `MINI_PROGRAME`；但未看到 available events、event configs、optimized goal / dbt 证据 | 新建“事件链只读深检”任务，补 B3 G3-G5 证据 |
| `product_image` | 低嫌疑 | `file/image/get` 只读 `passed`；create payload 摘要 product image id present | 暂不优先 |
| touchpoint | 低嫌疑 | 触点 URL 受控入库，hash present 且节点显示 hash 校验通过；普通 API/前端不展示完整 URL | 暂不优先 |
| `app_id` / `game_platform_apps` | 低嫌疑 | `game_platform_apps` 中 app id present；`mwb.games.app_id` 已移除；payload summary 的 `platform_app_id` 来源一致 | 暂不优先 |
| DMP / 素材 | 中低嫌疑 | DMP 和 video 部分使用本地已验证证据；create payload 当前未输出 DMP retargeting tag 明细；视频和封面 present | 如事件链和 brand 排除后，再补 DMP/video fresh readback |
| account authorization | 低嫌疑 | 本地 account `auth_status=ready`；平台只读 probes 多数 HTTP `200` 且 request id present | 暂不优先；除非平台侧指出权限不足 |
| platform action result | 已确认失败但原因不透明 | `std_project/create` HTTP `200`、`api_code=40000`、request id present、object id absent、response hash present；raw response 未保存 | 需要平台侧错误详情或在不重试 create 的前提下，用 request id/平台后台定位更细错误 |

## 禁止事项

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 重试真实创建 | 禁止 |
| token refresh | 禁止 |
| OceanEngine 写入 API | 禁止 |
| 输出 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |
| 改变目标 job 状态 | 禁止 |
| 旧项目作为 v2 运行依赖 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| 只读取 v2 项目、v2 Postgres、脱敏 platform action/readback 记录 | passed |
| 目标 job 状态保持不变 | passed |
| 不泄漏 token、Cookie、完整触点 URL、raw payload、raw response | passed |
| 不调用真实写入 API | passed |
| 输出明确的 `apiCode=40000` 复盘结论和下一步建议 | passed |

## 下一步 gate

根据复盘结论决定：修 payload、补账户资源、只读校验，或请用户提供平台侧更细错误详情；真实创建仍禁止重试。

建议下一步优先级：

1. 新建“brand industry fresh readback 修复/复核”任务，解决 `brand_industry` 只读 `api_code=40000`，不要继续用人工历史证据替代 fresh target-account evidence。
2. 新建“事件链只读深检”任务，补 available events、event configs、optimized goal / dbt 证据。
3. 如果平台后台能按当次 request id 反查，请用户提供平台侧脱敏错误详情；当前 v2 只保存了 request id present 和 response hash，不保存 request id 值和 raw response。

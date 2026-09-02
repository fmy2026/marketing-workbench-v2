# Project Lessons

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；已验证可复用经验集 |
| 最后更新时间 | 2026-09-02 14:39 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-CASE-TERMINAL-HTTP-DEADLINE-20260902`；当前逻辑图、数据报表契约、7 Node 注册表与回归证据 |
| 重新校验条件 | 新增可复用闭环经验、接口/字段合同变化，或既有经验被当前代码、Schema、官方资料或真实回查否定时 |

## 使用规则

本文件只记录已经由真实证据、机制验证和回归测试支持的可复用经验。它用于定位问题和选择解决思路；账户实时状态、job、计划、平台动作和证据仍以 `project.state.json`、Postgres、active task / manifest 与当前代码为准。

每个新案例均按文末模板追加。案例正文不记录账户 ID、job ID、token、Cookie、raw request/response 或完整 URL。

官方接口只记录 method、endpoint path、用途与边界；不记录完整请求 URL、token、raw query/body 或 raw response。OE3 合同优先查官方 3.0 知识库，3.0 缺失时再补 2.0 / 2.0 copy，并在经验中标明“当前项目实际使用的接口”和“仅作为后续/受控写入使用的接口”。

Node 4 的资源 Skill 独立判断：先查资源归属和流转路径，再查目标账户真实只读状态；只为 `prepare_supported=true` 且获得单次授权的资源生成写入计划。一个资源通过不能替代其他资源的 Gate。

## 通用：Node 4 资源准备

```text
识别资源与目标账户
  -> 查游戏级保底定义
  -> 查目标账户真实只读状态
  -> 分类：已存在 / 缺失 / 写后待回查 / 平台异常 / 本地机制异常
  -> 生成 fresh plan
  -> 单次受控写入
  -> 真实回查
  -> 写入脱敏证据、关闭任务、沉淀可复用结论
```

旧账户已通过，只能说明存在可参考候选或历史路径；目标新账户仍必须做真实只读核验。

| 阶段 | 关键判断 | 结果 |
| --- | --- | --- |
| 保底定义 | 游戏、路线、资源蓝图和来源是否完整 | 缺失时先修复定义，不猜测候选 |
| 目标核验 | 目标账户是否真实存在、可见、可用 | 已通过则 no-op；缺失才可生成准备计划 |
| fresh plan | 当前只读结论与 prepare capability 是否一致 | 仅覆盖当前缺失资源 |
| 单次写入 | fresh job、scope、确认变量、官方合同是否精确匹配 | 不匹配则零写入停止 |
| 回查 | 写后官方状态是否达到通过标准 | 通过则放行 Gate；否则记录失败分类并停止 |

## 抖音号授权（aweme_id）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | `aweme_id` 是游戏/路线级固定默认值，不是目标账户运行时人工选择项；创建 payload 只从 `game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id` 取值。 |
| 数据库机制 | 路线默认基线保存明文默认号与 hash；账户表 `advertiser_accounts.aweme_authorization` 只保存 Node 4 的脱敏授权核验快照；`v_advertiser_aweme_authorization_readiness` 负责最终 Gate 判断。 |
| 官方接口 | Node 4 只使用 `GET /open_api/2/tools/aweme_auth_list/` 核验授权关系；该接口返回 `aweme_id`、`auth_type`、`auth_status`、`share_type`、有效期和 `request_id`。 |
| 请求形态 | `filtering.auth_type` 必须按官方完整参数形态传 `string[]`，如 `["AWEME_ACCOUNT"]`；固定号主查询传 `aweme_ids`，不传 `auth_status`，因为接口默认仅返回生效授权。 |
| 通过标准 | 目标默认号命中、`auth_status=AUTHRIZED`、未过期、账户/路线/游戏/default hash/fresh job 均一致，readiness 才可为 `ready=true`。 |
| 共享授权 | `share_type` 只记录为 `shared_relation_seen=true` 的脱敏证据；共享授权本身不是失败条件。 |
| 失败分流 | 参数形态错误、凭据/账户范围异常、平台业务失败、网络失败、默认号不可见、授权失效分别记录 blocker；不得笼统只写 `probe_failed`。 |
| 实时性边界 | 数据库保存的是最近一次 fresh Node 4 只读核验快照，view 是实时投影数据库快照；平台后台授权变化不会自动同步，必须重新跑 Node 4 刷新。 |
| 不适用边界 | `std_project/list` 不能证明 `aweme_id` 授权；`std_project/create` 只消费已通过的 `aweme_id`，不能替代授权核验；旧账户可见不代表目标账户可用。 |
| 回归校验 | 覆盖主查询命中、共享授权命中、精确查询未命中后的发现查询、参数错误分类、zero platform write audit、payload contract gate。 |

## Node 5 创建字段合同

| 项 | 经验结论 |
| --- | --- |
| 合同来源 | 顶层字段和已发送嵌套字段均记录在 `game_route_defaults.raw_defaults.official_create_field_contract`；顶层用 `field_rules`，嵌套路径用 `nested_rules`，不新增第二套表或报表。 |
| 官方接口 | 创建字段唯一依据为 `POST /open_api/v3.0/std_project/create/`；`tools/project_material_type/update` 只能作为同素材结构旁证，本流程不调用素材更新接口。 |
| 已发送与受控省略路径 | 当前 JSZC 路线校验实际发送的 `video_material_list`、`image_material_list`、`title_material_list`、`product_info`、`call_to_action_buttons`、`source`、`anchor_related_type`、`mini_program_info`、`track_url_setting`、`audience`、`brand_info`。`external_url_material_list` 的 send/omit 必须由当次路线 nested contract 决定；已验证成功的受控场景为发送 1 条已回查备用页，不能据此把它推广为所有场景必填。 |
| 共同 Gate | Node 5、payload contract 与 create preflight 必须复用同一个嵌套字段合同模块；不得在三处各写一套规则。 |
| 视频素材 | 视频必须来自当前物料包 required `video_asset`，目标账户只读证据通过；竖版视频使用 `CREATIVE_IMAGE_MODE_VIDEO_VERTICAL`；只有显式封面已验证时才发送 `video_cover_id`，否则省略并记录平台默认封面模式。 |
| 商品与标题 | 标题素材来自 `game_assets.asset_type=title_material` 经物料包关联；商品名来自游戏身份，商品图来自目标账户已核验产品图，卖点来自路线默认值并满足 6-9 字合同。 |
| 备用网页链接 | 当前 JSZC 为 `MICRO_GAME + BYTE_GAME + mini_program_info.url` 主链路；`external_url_material_list` 是条件字段，必须由路线 nested contract 明确 send/omit。已验证成功的受控场景发送 1 条已回查备用页；这说明该组合可接受，不证明所有 BYTE_GAME 场景都必须发送。 |
| 图片素材列表 | 当前 JSZC 走视频素材和产品图，普通 `image_material_list` 固定为空数组；非空图片列表必须被 Node 5 / preflight 阻断。 |
| 小游戏链接 | `MICRO_GAME + BYTE_GAME` 使用受控 `mini_program_info.url`；传 `url` 时禁止同时传 `app_id`、`start_path`、`params`。 |
| 静态开关 | `layer_roi_switch`、`aigc_dynamic_creative_switch`、`is_comment_disable` 与 `track_url_setting.send_type` 从 `payload_defaults` 读取，不在 Node 5 硬编码第二来源。 |
| 锚点边界 | 当前 JSZC 路线固定 `anchor_related_type=OFF`，不得携带 `anchor_material_list` 或 `component_material_list`；未来启用 `SELECT` 前必须先新增独立只读准备和官方取值证据。 |
| 审计摘要 | 最终 manifest 只保存 `nestedFieldContract` 的版本、来源、检查路径数、数量/长度范围、枚举结果、封面模式、证据计数和 blocker 数；不保存完整 payload、URL、token、raw request 或 raw response。 |
| 扩展规则 | 未来新增 create 嵌套字段，必须先补官方合同、路线 `nested_rules`、共享校验模块和正反例测试；未启用条件字段不得为了兼容性而提前发送。 |

## 头像（avatar）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 无共享链路；头像直接上传并提交至目标账户，不经物料户中转。 |
| 官方接口 | 只读回查使用 `GET /open_api/2/advertiser/avatar/get/`；受控写入链路为 `POST /open_api/2/advertiser/avatar/upload/` 获取 `image_id`，再 `POST /open_api/2/advertiser/avatar/submit/` 更新头像。官方资料明确“上传成功 ≠ 更新头像”。 |
| 问题表现 | 新账户头像为 `UNSET`，Node 4 头像 Gate 阻断。 |
| 根因 | 目标账户缺少头像；写入中间状态若不受数据库约束支持，可能在上传后、提交前中断。 |
| 解决思路 | 使用独立游戏级 `300x300 PNG` 头像资产；fresh preflight 后依次上传、提交、回查。产品图的平台资源 ID 不可直接假定为头像。 |
| 写入边界 | `ensure_resource:avatar` 仅一次；内部最多上传一次、提交一次；禁止自动重试。 |
| 通过标准 | `advertiser/avatar/get` 返回 `IN_AUDIT` 或 `AUDIT_PASS`。 |
| 回查证据 | 目标账户头像只读回查、资源 ID 存在性与脱敏响应 hash。 |
| 失败分流 | 上传失败不提交；提交失败停止；审核拒绝更换资产后另建任务；回查未收敛记录证据；本地状态约束失败先修复 schema 与 executor 映射。 |
| 验证状态 | 已闭环；写入前先确认所有中间和终态都受数据库约束支持，smoke 必须覆盖“上传成功、提交前状态落库”。 |
| 案例依据 | 已关闭的头像首次与恢复任务；`src/platforms/oceanengineAvatarExecutor.mjs`、`src/workflows/avatarExecutionScope.mjs`；`npm run test:avatar-executor`。 |

## DMP 保底人群包（dmp_audience_package）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 先在物料户准备，再逐成员推送至目标账户；不是目标户直接创建。 |
| 官方接口 | 只读核验使用 `GET /open_api/2/dmp/custom_audience/read/` 查询指定包详情、`GET /open_api/2/dmp/custom_audience/select/` 查询客户下可见/可投放包；受控写入只使用 `POST /open_api/2/dmp/custom_audience/push_v2/` 推送到目标账户。 |
| 问题表现 | 新账户缺少保底 DMP 人群包，不能直接把历史候选写入广告 payload。 |
| 根因 | 候选集合只是参考；来源户、目标户、push plan 与已验证成员混用会造成误推或重复推送。 |
| 解决思路 | package set -> 物料户逐包 read/select -> 目标户逐包 read/select -> fresh missing plan -> 单包推送 -> 整组回查。 |
| 写入边界 | 仅推送 fresh plan 中目标户 `missing` 的成员；每次请求只对应一个成员和一个目标账户；已 `passed` 成员必须跳过。 |
| 通过标准 | 成员 read 命中、`select_type=1` 可投放、状态 available、未删除且未下线。 |
| 回查策略 | 全部单包 push 成功后，以 `0s / 3s / 6s` 轮询整组；不把即时不可见误判为失败。 |
| 失败分流 | 来源不完整、合同/凭据/权限异常时零写入停止；单包失败停止后续包；回查未收敛只记录待回查，不自动重推。 |
| 验证状态 | 已闭环；目标状态按“package set + 成员 + 目标账户”保存；运行内存保留后续 Gate 所需安全输出，持久化 Skill 记录保持脱敏。 |
| 案例依据 | 已关闭的 DMP 只读、推送与剩余包闭环任务；`src/workflows/skills/oe3/04-dmp-readonly.mjs`、`src/platforms/oceanengineDmpExecutor.mjs`、`src/workflows/dmpExecutionScope.mjs`；`npm run test:dmp-executor`、`npm run test:dmp-readback`。 |

## 事件资产（event_asset）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | `event_asset` 是目标账户事件管理资产，不走跨账户共享；小游戏实例是同一事件链的配套事实。目标账户已有唯一可用资产时 no-op 回查；缺失时才允许在单独 Task、单份 Plan、单次确认下 API 创建。 |
| 唯一链路 | `all_assets/list` 查目标账户 `MINI_PROGRAME` 资产 -> `all_assets/detail` 核对唯一资产 -> 缺资产时 `assets/create` 创建 -> `available_events/get` 获取本资产可创建 baseline event_id -> `events/create` 仅创建缺失事件 -> `event_configs/get` 验证 6/6 -> `optimized_goal/get` 验证主/深度目标 -> `dbt/get` 验证深度优化方式 -> `event_asset` 与 `micro_app_instance` 写为 `visible + readback_verified`。 |
| 资产查找接口 | 使用 `GET /open_api/2/tools/event/all_assets/list/` 查询目标账户事件资产列表，过滤 `asset_type=MINI_PROGRAME`；使用 `GET /open_api/2/tools/event/all_assets/detail/` 查询详情。`detail` 的 `asset_ids` 必须按 JSON 十进制数字数组形态传输，例如 `[1234567890123456]`；不要传字符串数组、逗号字符串或单数 `asset_id`。 |
| 资产创建接口 | 缺失且合同完整时使用 `POST /open_api/2/event_manager/assets/create/` 创建 `MINI_PROGRAME` 资产；字段固定为 `advertiser_id`、`asset_type`、`mini_program_asset.mini_program_id`、`mini_program_asset.mini_program_name`、`mini_program_asset.instance_id`、`mini_program_asset.mini_program_type`。长 ID 以 lossless JSON 十进制 number token 发送；不保存 raw payload 或 raw response。 |
| 事件配置创建接口 | 使用 `GET /open_api/2/event_manager/available_events/get/` 从目标账户、目标资产获取可创建事件的 `event_id`；再用 `POST /open_api/2/event_manager/events/create/` 创建缺失 baseline，字段只传 `advertiser_id`、`asset_id`、`event_id`、`track_types=["MINI_PROGRAME_API"]`。不得复用其他账户、旧库或历史样本的 event_id。 |
| Baseline 事件 | 游戏保底集合固定为 `active`、`active_register`、`active_pay`、`purchase_roi`、`purchase_roi_7d`、`purchase_roi_30d`。每次只创建 `event_configs/get` 缺失的项；已存在项必须跳过。 |
| Partial baseline 分类 | `event_configs/get` 与 `available_events/get` 都完成标准化后，只能调用共享 `eventConfigBaselineReadiness` 输出 status、blocker 和 create candidates。available 仅需覆盖尚未配置的 baseline：4 configured + 2 available 仅创建 2 项；5+1 仅创建 1 项；6 configured + empty available 为 no-op READY。读取函数或 Node 04 不得把 available 单独不足 6/6 当 blocker；仅缺失配置中同时不可用的项才追加 `available_events_baseline_missing`。 |
| 配置核查接口 | 最终配置核查以 `GET /open_api/2/event_manager/event_configs/get/` 为准，必须返回 6/6 baseline 且 track type 命中 `MINI_PROGRAME_API`。`available_events/get` 是“可创建事件列表”，创建完成后 baseline 可能不再出现在 available 列表中；因此创建后的 READY 不能要求 available 仍为 6/6。 |
| 优化目标核查 | 配置 6/6 后，继续使用 `GET /open_api/v3.0/event_manager/optimized_goal/get/` 验证 `PAY + PURCHASE_ROI_7D`，并使用 `GET /open_api/v3.0/event_manager/dbt/get/` 验证 `PER_AND_SEVEN_PAY_ROI`；这两段通过后才允许关闭事件链。 |
| 写入边界 | 事件资产创建最多 1 次；事件配置创建最多 6 次；每个动作都必须绑定当前 Job、Plan、confirmation、route、game、advertiser 与模板 hash。创建成功但回查不到、候选歧义、App/instance 不匹配、任一 API 非 0 或权限异常时停止，不自动扩大范围。 |
| 幂等与审计 | orchestrator 的 internal claim 必须同时绑定 plan id 和 idempotency key；不同 plan/version 不得互相挡住，但同一 plan/action 不得重复消费。Create Plan 在确认前还必须让最终 Draft 精确绑定 Plan ID/hash；缺失绑定必须早于 confirmation/action fail-closed，已确认且零 action 的预写入阻断 Plan 必须 consumed 收口。事件配置 create 子 action 必须使用“已验证 planned action key + 当前 Plan ID + event type”，request hash 只作请求证据，不能充当跨 Job 的全局幂等身份。真实平台动作只记录 endpoint path、method、HTTP/API code、request_id 是否存在、hash 和脱敏 metadata。 |
| 通过标准 | `event_configs/get` 6/6、`optimized_goal/get` 主/深度目标命中、`dbt/get` 深度优化方式命中；随后 `account_resources.event_asset` 与 `account_resources.micro_app_instance` 均写为 `visible + readback_verified`，Case root blocker 清空事件链相关 blocker。 |
| 验证状态 | 已闭环；已形成“查找 -> 缺失创建资产 -> 缺失创建 baseline 事件 -> 配置核查 -> 优化目标/DBT 核查 -> READY”的真实可复用经验。 |
| 不适用边界 | 不把平台 UI 截图、旧账户资产、旧库 event_id、历史目标户候选或 `available_events/get` 创建后为空当作 READY 证据；不在本模块触发标准项目、Promotion、预算、出价、素材、DMP、头像、备用页或 token 刷新。 |

## 视频（video_asset）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 先在物料户准备，再绑定到目标账户；物料户和目标户分别核验。 |
| 官方接口 | 目标户视频可见性回查使用 `GET /open_api/2/file/video/get/`；如需核验抖音主页公开视频，先通过 aweme 授权，再使用 `GET /open_api/2/file/video/aweme/get/`；受控跨账户素材推送使用 `POST /open_api/2/file/material/bind/`，字段为源户 `advertiser_id`、目标户数组 `target_advertiser_ids` 与 `video_ids`。 |
| 绑定前预检 | 每条素材确认物料户可见、视频 ID 与本地文件元数据完整；目标户已可见的成员跳过，来源结论在绑定后复用。 |
| 受理成功判定 | 单次绑定必须同时满足 HTTP `200`、API code `0`、`fail_list=0`；否则停止，不进入“成功后延迟可见”分支。 |
| 目标户通过标准 | 全部必选视频可见；显式封面可见即通过，未返回显式封面时允许平台默认封面。 |
| 即时回查 | 以平台成功受理时刻为基准，在 `0/10/20/30/60/120/180` 秒目标户专用 probe；每轮不重复查物料户。 |
| 提前结束与终止 | 全组视频和封面满足规则即提前结束；180 秒仍未收敛则返回 `readback_pending`，附 `window_exhausted=true` 与 `readback_window_exhausted`，不自动续跑或重绑。 |
| 延迟复核 | 独立只读 cycle 先验证原绑定受理成功，再核验目标户；不调用乾坤、不上传、不绑定、不刷新 token。 |
| 时延统计 | 每 cycle 记录首次全量可见窗口；成功样本少于 3 个仅展示原始窗口与 `insufficient_sample`，达到 3 个才计算 P50/P90；少于 10 个成功 cycle 不自动调整轮询时间表。 |
| 写入边界 | 单批绑定仅一次；任一素材不可见、部分可见或窗口耗尽均只留证据并停止，绝不自动第二次绑定。 |
| 失败分流 | 来源预检失败、受理失败、目标延迟、封面规则未满足、凭据/权限/API 异常分别记录；只有“受理成功后的目标延迟”可进入延迟只读复核。 |
| 脱敏证据 | 记录计划/实际延时、素材及整组可见数量、封面就绪数量、首次通过窗口、request ID/response hash 是否存在；不保存 token、URL、raw request 或 response。 |
| 验证状态与依据 | 已闭环；真实延迟复核已证明“延迟可见不等于绑定失败”。回归覆盖 7 个首次可见点、部分可见、默认封面、窗口耗尽、提前结束、统计阈值及零写入。 |
| 不适用边界 | 不以物料户可见替代目标户可见；不以 180 秒未收敛判定绑定失败，也不借此触发第二次绑定。 |

## 产品图（product_image）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 当前先核验游戏级产品图源文件，再核验目标账户 `file/image/get` 只读库存；未验证物料户图片复用或跨账户共享/绑定为默认路径。 |
| 官方接口 | 目标户图片素材回查使用 `GET /open_api/2/file/image/get/`；官方资料另有同主体图片查询 `GET /open_api/2/file/image/ad/get/` 和素材推送 `POST /open_api/2/file/material/bind/`，但当前产品图模块尚未把跨账户图片复用作为已验证默认机制。 |
| 只读判定 | 资源可见、readback 已验证且 readonly 状态通过。 |
| 准备边界 | `product-image-source-prepare` 已支持源文件存在性、hash、格式、尺寸与目标户候选摘要核验；目标户仍缺产品图时，只生成后续“单次目标户图片上传与回查任务”的 next action，不在 Node 4 自动上传或创建。 |
| 回查证据 | `account_resources` 只读状态、资源 metadata、源文件脱敏 hash、目标户候选数量、目标图片/素材 ID 是否存在、`file/image/get` 响应 hash 是否存在。 |
| 验证状态 | 源文件准备路径已进入当前 Node 4 合同；目标户真实上传/创建闭环仍需独立任务和官方写入合同确认。 |
| 不适用边界 | 不将头像或本地图片文件视为产品图已就绪。 |

## 品牌（brand_info）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 目标账户品牌/行业事实，不属于物料户推送链路。 |
| 官方接口 | 品牌可投列表使用 `GET /open_api/v3.0/dpa/brand/adv_auth/fuzzy/get/`；品牌行业使用 `GET /open_api/v3.0/dpa/brand/adv_auth/industry/get/`，其中行业查询的 `outer_brand_id` 应来自可投品牌列表返回的云图品牌明细。 |
| 只读判定 | 新鲜品牌行业回查或已验证修复状态通过。 |
| 写入边界 | `prepare_supported=false`；本 Node 不补写品牌或行业。 |
| 回查证据 | 品牌名称、行业匹配与脱敏只读证据。 |
| 验证状态 | 当前核验合同可用，尚未形成独立准备闭环经验。 |
| 不适用边界 | 历史品牌候选不能替代目标账户回查。 |

## 小程序实例（micro_app_instance）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 目标账户实例事实；未验证跨账户共享或自动创建路径。 |
| 官方接口 | 创建前只使用当前路线 active 小游戏 App 中唯一、来源受控的实例候选。event asset 创建或发现后以 `all_assets/detail` 同时核验 App + instance 绑定；configs 6/6 后才调用带真实 `asset_id` 的 `GET /open_api/v3.0/event_manager/optimized_goal/get/` 和 `GET /open_api/v3.0/event_manager/dbt/get/`。不带 `asset_id` 的 optimized-goal 结果不能否定候选有效性，只可作可选诊断。`std_project/create` 的 `instance_id` 字段合同只证明创建 payload 字段，不等于实例可用性回查接口。 |
| 只读判定 | 唯一受控候选允许生成 event asset Plan，但不会提前成为目标账户已核验；只有 asset detail 的 App + instance 绑定成功才写入该标记。configs、优化目标和 DBT 继续以完整事件链分别通过。 |
| 写入边界 | `prepare_supported=false`；缺实例或合同证据时停止。 |
| 回查证据 | 候选来源、可选诊断和完整事件链均只保存脱敏 evidence；目标实例已核验标记只来自 asset detail 绑定，最终 READY 还需要 configs、优化目标与 DBT。 |
| 验证状态 | 已收敛为事件资产顺序合同；独立 optimized-goal 不再是资源准备路径。 |
| 不适用边界 | 不猜测实例 ID，也不将其他小程序实例映射到当前目标账户。 |

## 备用落地页（backup_landing_page）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 游戏级默认页先在物料户确认；由人工在平台完成“指定账户可用”的**同站点共享**；系统自动发现并只读收口。 |
| 官方接口 | 主判定均为 `GET /open_api/2/tools/site/get/`：来源物料户、目标普通库存（诊断）和目标共享库存（`share_type=SHARE`，权威）。`GET /open_api/v3.0/tools/orange_site/get/` 仅辅助候选诊断，不能区分自建/共享；其业务码失败不覆盖三次主库存回查。 |
| 只读判定 | 默认来源页唯一且可用；只接受目标 `share_type=SHARE` 库存精确命中**同一** `site_id`，目标状态可用且本轮来源/目标脱敏 hash 一致。普通库存同 ID 只保留诊断，不可替代共享证明。 |
| hash 规则 | 目标通过优先比较本轮源户只读返回 hash 与目标户只读返回 hash；历史 DB/构造 hash 只作兜底，不能单独阻断已验证共享。 |
| 写入边界 | capability 为 `manual_share_only`，`prepare_supported=false`；不复制、不重建、不拼接 URL、不生成 `ensure_resource:backup_landing_page`。`site/handsel` 是转赠复制（会生成目标新站点并清空资产），不是同站点共享，明确排除为 executor。 |
| 通过标准 | `account_resources.backup_landing_page` 写为 `visible + readback_verified`；evidence 只留状态、ID、hash、request id/response hash 是否存在。 |
| 失败分流 | 源户缺失/不可用、共享库存未命中、share type 非 `SHARE`、状态不可用或 hash 不一致即 `BLOCKED`，不补写、不猜 URL。来源页缺失时只能另建“来源页创建”专项 Task；必须先具备受控 `name + bricks` 模板、本地素材映射与发布合同，单有图片文件不得调用 `site/create`。 |
| 验证状态 | 已以真实手动共享后的只读回查闭环：来源默认页可用、目标普通库存未命中、目标共享库存同站点命中且 `AUDIT_ACCEPTED`，来源/目标 hash 一致；全程 0 次平台写入。 |
| 创建字段边界 | 备用落地页资源可作为路线候选准备事实；`external_url_material_list` 是否发送由 `official_create_field_contract.nested_rules` 决定。已验证成功的受控场景发送 1 条，但该成功事实不应被泛化为所有 JSZC/BYTE_GAME 场景必填。 |
| 不适用边界 | 不在文档、日志、API 或前端保存完整落地页 URL；不把落地页通过替代产品图或小程序实例 Gate，也不因资源存在就默认进入创建字段。 |

## Create 终态与 HTTP deadline（2026-09-02）

| 项 | 经验结论 |
| --- | --- |
| Plan 不可重放 | 已确认 Create Plan 一旦存在平台 action，就不得继续为 `ready`。成功链固定为 `ready → waiting_readback → consumed`；明确失败、超时、异常或结果不明在相应只读收口后都必须离开可确认态。 |
| 不明与明确失败的区别 | 只有 `failed_or_unconfirmed + outcome_category=platform_response_unknown` 才能进入严格只读回查恢复；平台明确业务失败保留失败事实，禁止用同名对象回查改写成成功。 |
| 恢复门槛 | 不明响应的恢复同时要求该 action/Plan、项目 ID、最新 Draft 名称、created object 与 `readback_verified` 精确一致；恢复只标记“由回查确认成功”，不伪造或重用 confirmation/action。 |
| 终态一致性 | verified 成功同时收口 Plan、Job 和 Case；非 active Case 不再投影确认、重试或执行入口，只有完整完成证据保留完成 Gate。 |
| deadline 单一来源 | 所有生产 HTTP 经同一封装：JSON 15 秒、上传 60 秒；Node 07 保留 `0/3/5/8/10` 秒绝对回查点并设 25 秒整轮硬截止。封装必须组合 caller signal、超时 abort 与 timer 清理，且不实现自动重试。 |
| 回归范围 | 可控假传输覆盖超时 abort、timer 清理、一次写入、不明恢复、明确失败不可恢复和 Node 07 截止；数据库迁移只收口已落库的确定性证据。 |

## 新案例模板

```text
问题类型：
典型表现：
适用范围：
根因：
判定路径：
解决思路：
单次写入边界：
回查与通过标准：
失败分流：
案例依据：
回归校验：
不适用边界：
```

## JSZC 智擎版标准项目：一次性真实创建成功的完整经验（2026-08-30）

### 已证实的结论与边界

在独立、单次、受控的 `POST /open_api/v3.0/std_project/create/` 验证中，平台返回 HTTP `200`、业务码 `0`、项目对象存在；随后 `0/10/30` 秒三次 `std_project/list` 回查均确认创建。整个 Job 只有一次人工确认、一次 create action、一条汇总回查记录；没有 Promotion、资源、预算、出价或自动重试写入。

上句 `0/10/30` 只记录 2026-08-30 案例当时的真实证据，不是当前调度合同。当前机制在 create 成功受理后将 Plan 置为 `waiting_readback`，并按本轮起点的绝对 `0/3/5/8/10` 秒只读回查；ID 与最新 Draft 名称均一致时才 `consumed` 并收口 Case，未命中或不一致均不得再次创建。

成功请求相对已冻结的上一基线，唯一业务变化为：在 `audience.hide_if_converted=NO_EXCLUDE` 下，**完全省略** `audience.converted_time_duration`。该结果证明“该基线减去该字段”的组合可被平台接受；不证明此前失败必然或仅由此字段导致。

下列内容是本案例的精确、可复用字段形态；动态 ID、名称、完整 URL、监测参数、素材文本和原始请求不记录在此，必须在下次创建时从目标账户的当轮 Postgres 只读核验重新解析。

### 创建前必须同时通过的核心模块

| 模块 | 创建前 Gate / 最终使用方式 | 不能用什么替代 |
| --- | --- | --- |
| 账户与抖音号 | 当前广告主有效，`aweme_id` 经目标账户授权只读核验；长数字 ID 使用正确 wire 编码。 | 旧账户可见、历史 ID 或项目 list。 |
| 优化目标、事件与小游戏实例 | 当前 `BYTE_GAME`、小游戏实例、主优化目标 `PAY`、深度目标 `PURCHASE_ROI_7D` 和事件链均通过当前只读合同。 | 历史创建样本、仅数据库旧 hash。 |
| 头像 | 目标账户头像 Gate 已通过；它是资源准入条件，不是本 create payload 字段。 | 上传成功但未提交/回查的头像。 |
| DMP 排除人群 | 目标账户当前可投、未删除的 DMP 包通过回查；本成功组合发送 10 个整数 ID 到 `audience.retargeting_tags_exclude`。 | 来源户包、字符串 ID、缺少成员的包集合。 |
| 品牌 | 当前账户可投品牌及行业关系通过只读核验，发送三个整数品牌/行业 ID 与脱敏品牌名称。 | 历史品牌候选。 |
| 视频、标题、产品图 | 目标账户回查通过；本成功形态为 2 条竖版视频、3 条标题、1 张产品图、3 条卖点。封面未获得显式可用证据时省略，由平台默认。 | 物料户可见、未回查封面、把产品图当普通图片或头像。 |
| 小游戏主链、备用页与监测 | 小游戏只发送受控 `mini_program_info.url`；备用页、监测链接均为目标账户可见、已回查且 hash 一致的受控链接。 | 拼接 URL、历史 URL、只比较旧数据库 hash。 |
| 审计与执行 | 同名查重、字段账本、payload/wire hash、单变量 diff、凭据、确认/action/readback 计数都通过，才允许原子 claim 的一次 create。 | 只看 HTTP `200`、自动重试或跳过 list 回查。 |

### 最终成功的字段参数与发送形态

固定业务枚举来自路线 `payload_defaults`，下表列出本次成功组合。`budget`、`cpa_bid`、`roi_goal` 仅是本次验证值，不是下次项目应照抄的业务预算策略。

| 区域 | 字段与最终参数 |
| --- | --- |
| 顶层投放类型 | `ad_type=ALL`；`native_type=AWEME`；`landing_type=MICRO_GAME`；`marketing_goal=VIDEO_AND_IMAGE`；`delivery_mode=PROCEDURAL`；`delivery_type=NORMAL`；`delivery_medium=BYTE_GAME`。 |
| 优化与出价 | `external_action=AD_CONVERT_TYPE_PAY`；`deep_external_action=AD_CONVERT_TYPE_PURCHASE_ROI_7D`；`deep_bid_type=PER_AND_SEVEN_PAY_ROI`；`bid_type=CUSTOM`；`pricing=PRICING_OCPM`；`budget_mode=BUDGET_MODE_DAY`；`budget=88888`；`cpa_bid=488`；`roi_goal=0.088`。 |
| 排期与静态开关 | `schedule_type=SCHEDULE_FROM_NOW`；`layer_roi_switch=OFF`；`aigc_dynamic_creative_switch=OFF`；`is_comment_disable=OFF`。`SCHEDULE_FROM_NOW` 具有真实投放风险，必须在每次 create 前单独展示并人工确认。 |
| 账户绑定字段 | 发送 `advertiser_id`、`aweme_id`、`asset_id`、`instance_id`；其具体值只从当前账户的已核验数据库记录读取，不能从 lessons、历史请求或 Markdown 复制。 |
| 受众 | `audience_type=CUSTOM`；`district=NONE`；`gender=GENDER_UNLIMITED`；`age=[]`；`interest_action_mode=UNLIMITED`；`hide_if_converted=NO_EXCLUDE`；`retargeting_tags_exclude` 为当轮核验通过的 10 个整数 DMP ID。 |
| 受众必须省略 | `audience.filter_event` 必须完全缺失（不可为 `[]`、`null` 或 `[PAY]`）；`audience.converted_time_duration` 必须完全缺失（不可恢复路线默认值 `SIX_MONTH`、空串或 `null`）。这是本成功组合最关键的字段规则。 |
| 品牌 | 发送 `brand_info.brand_name_id`、`cdp_brand_id`、`yuntu_category_id`（均为整数）与 `cdp_brand_name`；具体值以当前账户品牌/行业只读回查为准。 |
| 视频与标题 | `project_materials.video_material_list` 发送 2 条，每条仅为已回查的 `video_id + CREATIVE_IMAGE_MODE_VIDEO_VERTICAL`；`title_material_list` 发送 3 条标题。未有显式封面证据时不得发送 `video_cover_id`。 |
| 商品与 CTA | `product_info.titles` 发送 1 条当前游戏产品名；`image_ids` 发送 1 个当前账户已回查产品图 ID；`selling_points` 发送 3 条，均满足路线长度合同；`call_to_action_buttons=["立即试玩"]`；`source` 由当前游戏品牌/名称生成。 |
| 小游戏、备用页、图片 | `mini_program_info` **仅**发送 `url`；必须省略 `app_id`、`start_path`、`params`。`external_url_material_list` 发送 1 条已核验 HTTPS 备用页；`image_material_list=[]` 保持显式空数组。 |
| 锚点与组件 | `anchor_related_type=OFF`；必须省略 `anchor_material_list` 与 `component_material_list`。 |
| 监测 | `track_url_setting.send_type=SERVER_SEND`；`action_track_url` 发送 1 条当前受控、回查通过的监测链接。完整链接及宏参数不入 lessons。 |
| 顶层禁止字段 | `micro_promotion_type` 不属于本 create 请求，必须省略；不得把优化目标查询接口字段混入 create payload。 |

最终成功组合固化后的黄金字段账本共校验 82 个路径，阻断路径为 0；第 82 条来自成功合同对受控省略/发送形态的完整固化。下次项目应以这张“模块 + 字段形态”表生成 fresh Draft，再用当前官方 3.0 合同、当前路线 nested contract 和目标账户只读证据决定动态值；不得把本例当作跨账户、跨游戏或所有 BYTE_GAME 场景的固定模板。

### 最小可复用执行顺序

```text
当前账户/授权/资源只读回查
  -> 路线合同与字段账本（特别检查两个 audience 省略字段）
  -> 同名查重 + payload/wire hash 稳定
  -> 精确展示预算、出价、ROI、排期与唯一差异
  -> 人工确认
  -> 原子 claim 的一次 create
  -> 0/3/5/8/10 秒绝对时间点 list 回查（命中即停止）
  -> 只保存脱敏摘要、hash、状态与必要对象存在性
```

案例依据：当前项目 Postgres 中已验证的创建 action 与汇总回查、对应 one-off Task/Manifest、当前 OE3 字段合同及官方 3.0 创建标准项目资料。任何后续真实写入仍须新建独立 Task、Plan 和人工确认。

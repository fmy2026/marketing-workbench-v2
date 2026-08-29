# Project Lessons

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
| 已发送嵌套路径 | 当前 JSZC 路线只校验实际发送的 `video_material_list`、`title_material_list`、`product_info`、`call_to_action_buttons`、`source`、`anchor_related_type`、`mini_program_info`、`track_url_setting`、`audience`、`brand_info`。 |
| 共同 Gate | Node 5、payload contract 与 create preflight 必须复用同一个嵌套字段合同模块；不得在三处各写一套规则。 |
| 视频素材 | 视频必须来自当前物料包 required `video_asset`，目标账户只读证据通过；竖版视频使用 `CREATIVE_IMAGE_MODE_VIDEO_VERTICAL`；只有显式封面已验证时才发送 `video_cover_id`，否则省略并记录平台默认封面模式。 |
| 商品与标题 | 标题素材来自 `game_assets.asset_type=title_material` 经物料包关联；商品名来自游戏身份，商品图来自目标账户已核验产品图，卖点来自路线默认值并满足 6-9 字合同。 |
| 小游戏链接 | `MICRO_GAME + BYTE_GAME` 使用受控 `mini_program_info.url`；传 `url` 时禁止同时传 `app_id`、`start_path`、`params`。 |
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
| 归属与流转 | 当前仅以目标账户的目标/事件链只读合同判断；未验证跨账户流转方案。 |
| 官方接口 | 账户事件资产列表使用 `GET /open_api/2/tools/event/all_assets/list/`，必要时结合 `GET /open_api/2/tools/event/all_assets/detail/`；目标/深度目标合同使用 `GET /open_api/v3.0/event_manager/optimized_goal/get/` 与 `GET /open_api/v3.0/event_manager/dbt/get/`。旧版 `event_manager/available_events/get`、`event_manager/event_configs/get` 只作兼容只读证据，不替代标准项目目标合同。 |
| 只读判定 | 目标、优化目标与事件链合同均通过。 |
| 写入边界 | `prepare_supported=false`；本 Node 不推断或创建事件资产。 |
| 回查证据 | objective/event readonly evidence 与字段合同。 |
| 验证状态 | 当前核验合同可用，尚未形成独立资源准备闭环经验。 |
| 不适用边界 | 不将旧账户事件候选视为目标账户已可用。 |

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
| 官方接口 | 小程序实例可用性通过 `GET /open_api/v3.0/event_manager/optimized_goal/get/` 做路线、小游戏、实例 ID、事件资产与优化目标组合校验；`GET /open_api/v3.0/event_manager/dbt/get/` 用于深度优化方式合同。`std_project/create` 的 `instance_id` 字段合同只证明创建 payload 字段，不等于实例可用性回查接口。 |
| 只读判定 | 实例 ID、资源可见性、readback 以及 `instance_id` 字段名、类型、适用条件、长 ID 传输证据均通过。 |
| 写入边界 | `prepare_supported=false`；缺实例或合同证据时停止。 |
| 回查证据 | 目标资源 metadata 与官方创建字段合同。 |
| 验证状态 | 当前为待验证资源准备路径。 |
| 不适用边界 | 不猜测实例 ID，也不将其他小程序实例映射到当前目标账户。 |

## 备用落地页（backup_landing_page）

| 项 | 经验结论 |
| --- | --- |
| 归属与流转 | 先在物料户确认游戏/路线默认页，再由人工在后台选择“指定账户可用”共享到目标账户；系统只做目标户只读回查。 |
| 官方接口 | 橙子建站库存回查使用 `GET /open_api/2/tools/site/get/`，目标户需同时查普通库存与 `share_type=SHARE` 共享库存；辅助接口 `GET /open_api/v3.0/tools/orange_site/get/` 只用于按优化目标查询候选，官方资料明确其不能区分自建或共享来源。 |
| 官方合同边界 | 官方资料存在站点转赠/复制类接口，但当前项目未沉淀可执行的“指定账户共享站点”写入合同；自动共享执行器只能预留，不得启用。 |
| 只读判定 | 默认项唯一且源户状态可用；目标账户普通库存或 `share_type=SHARE` 库存精确命中同一站点，目标状态可用。 |
| hash 规则 | 目标通过优先比较本轮源户只读返回 hash 与目标户只读返回 hash；历史 DB/构造 hash 只作兜底，不能单独阻断已验证共享。 |
| 写入边界 | `prepare_supported=false`；不复制、不重建、不拼接 URL、不调用落地页共享/复制/创建写接口。 |
| 通过标准 | `account_resources.backup_landing_page` 写为 `visible + readback_verified`；evidence 只留状态、ID、hash、request id/response hash 是否存在。 |
| 失败分流 | 源户缺失/不可用直接 blocked；目标未命中、目标状态不可用或源/目标实时 hash 不一致时保持 blocker，不补写、不猜 URL。 |
| 验证状态 | 已闭环；人工共享后，目标 `share_type=SHARE` 库存可命中默认页，源户实时 hash 与目标共享 hash 一致即可通过。 |
| 不适用边界 | 不在文档、日志、API 或前端保存完整落地页 URL；不把落地页通过替代产品图或小程序实例 Gate。 |

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

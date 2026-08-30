# JSZC 官方 3.0：双 Job `40000` 问题定位与 P02 单变量验证边界

更新时间：2026-08-30 CST
对象：广告主 `1871922346964041`、路线 `oceanengine_3_byte_mini_game`、游戏 `JSZC`
性质：脱敏只读证据报告；Postgres 仍是动态运行真值，本报告不替代 Job、Case 或平台状态。

## 结论先行

本轮不能把两次 `40000` 定位为某一个已证实的错误字段。

可以确定的是：两个请求都到达了智擎版 3.0 创建接口，均为 HTTP `200`、业务码 `40000`、没有项目 ID；随后 `0/10/30` 秒三次列表回查都成功返回但没有命中项目。两次请求共同使用的 BYTE_GAME 核心链路值——事件、实例、投放身份、品牌、DMP 排除包、视频、产品图、小游戏调起链接与点击监测链接——字段账本均一致，但这个组合尚未得到创建接口验收。

因此，当前共同主问题应表述为：

> 当前账户的 BYTE_GAME 落地、调起、追踪与资源组合存在“创建接口接受度缺口”；平台没有返回可安全落到具体字段的路径，尚不能证明其中哪一个字段是根因。

两个分支必须分开处理：

- 历史 one-off Job 存在独立、已证实的合同偏差：`advertiser_id` 被编码为 JSON string，而官方字段表要求 number。它还发送了创建合同未定义的 `micro_promotion_type`，并使用 `app_id + url` 组合。它不是后续实验基线。
- P02 已把 `advertiser_id` 按 number 发送，并经过完整 Node/Skill/字段账本/预检，因此历史 Job 的类型偏差不能解释 P02 的失败。P02 的未决风险仍集中在共享链接/资源组合，以及备用落地页与小游戏调起页同时存在时的场景兼容性。

后续唯一基线冻结为 P02。当前没有权威只读证据确认一个可替换值，也没有证明所有共享绑定都已通过“创建接口接受度”验证，所以本轮不创建新的 corrective Case/Job，不开放真实创建，不选择猜测性候选。

---

## 1. Context

### 1.1 现象

| 对象 | P02 完整链路 Job | 历史模板 one-off Job |
| --- | --- | --- |
| Job | `JOB-MWBV2-20260830010824-488F0E` | `JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9` |
| 请求角色 | P02 / Attempt 2 | 历史模板 / Attempt 1 |
| create HTTP / 业务码 | `200 / 40000` | `200 / 40000` |
| request ID | 存在，仅保存 presence | 存在，仅保存 presence |
| 项目 ID | 不存在 | 不存在 |
| 回查 | `0/10/30s` 均未命中 | `0/10/30s` 均未命中 |
| 本地安全分类 | `resource_not_eligible` | `landing_url_invalid` |
| 平台字段路径 | 不存在 | 不存在 |

### 1.2 为什么需要重新定位

此前容易出现三种错误归因：

1. 把本地安全分类当成平台返回的字段级错误；
2. 把“历史模板发送了什么”当成“官方 3.0 必须发送什么”；
3. 把两个同时变化了大量字段的失败请求当作单变量实验。

本轮按 [Solution Design.md](</Users/hys/Projects/marketing-workbench-v2/docs/Solution Design.md:20>) 的证据顺序重做：Postgres 运行事实 → 当前 Task/代码 → 官方 3.0 合同 → 历史经验只用于提出假设。

## 2. Objective

### 2.1 本质目的

- 还原两次实际 wire 形态，而不是从当前配置反推历史请求；
- 把共同失败面、历史分支合同偏差、P02 分支未知项拆开；
- 给出可证伪、严格单变量、需要重新人工确认的未来验证边界；
- 在没有权威替换值时保持真实创建关闭。

### 2.2 成功标准

- 官方字段类型、条件和 BYTE_GAME 适用性形成矩阵；
- 两个 Job 的 Draft/Plan/Action hash 链闭环；
- 明确区分“已证实事实 / 有证据推断 / 尚未知”；
- P02 被固化为唯一基线；
- 未来 create 最多只允许项目名、fresh 证据/hash 和一个批准的业务字段发生变化；
- 本轮数据库写入、平台写入、新 create 次数均为 `0`。

### 2.3 非目标

本轮不修复 Case 投影、不上传或替换资源、不刷新 token、不调整预算/出价/排期、不创建 Promotion，也不通过再发一次 create 来“试错找字段”。

## 3. System Placement

问题位于 Node 5 完成合同和字段账本后、平台 create 接受前的边界：

```text
Postgres 当前账户与资源事实
→ Node 1–5 / 字段账本 / payload contract / preflight
→ wire encoder
→ POST std_project/create
→ 平台业务码 40000、无字段路径
→ 0/10/30s std_project/list 未命中
```

动态事实来源是 Postgres `marketing_workbench_v2.mwb`。官方合同以智擎版 3.0 字段表为第一优先级；外部原始 3.0 用于补充主文档未写明的数量、默认值和条件。2.0 未参与推翻 3.0。

本轮新增的诊断模块只调用 repository 的只读查询，并在内存中确定性重编译历史请求；不保存 raw body，也不调用平台接口：

- [jszcOfficialTwoJobForensic.mjs](/Users/hys/Projects/marketing-workbench-v2/src/oneoff/jszcOfficialTwoJobForensic.mjs)
- [06-jszc-official-two-job-forensic.mjs](/Users/hys/Projects/marketing-workbench-v2/scripts/oneoff/06-jszc-official-two-job-forensic.mjs)
- [06-jszc-official-two-job-forensic-smoke.mjs](/Users/hys/Projects/marketing-workbench-v2/scripts/oneoff/06-jszc-official-two-job-forensic-smoke.mjs)

## 4. Facts & Constraints

### 4.1 官方 3.0 合同的读取规则

正式字段表是类型与条件合同。官方页面附带的多语言 SDK 长示例是“全字段占位生成器”：它把很多 number 也插入带引号的 `%s`，同时混装互斥场景字段，不能覆盖字段表的类型定义。`advertiser_id` 应以字段表的 number 和 Java 示例中的 `Long` 为准，而不是以 Python 字符串模板为准。

关键官方证据：

- `advertiser_id`：必填 number，[官方主文档](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md:99)。
- `instance_id`：BYTE_GAME 小游戏/小程序资产条件字段，类型 number，[官方主文档](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md:122)。
- `external_url_material_list`：条件字段；外部原始 3.0 补充为橙子/自研落地页、数量 `1–10`，[官方外部 3.0](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174)。
- `mini_program_info.url`：发送时会检查正确性；有 `url` 时其他三个子字段无须发送，[官方外部 3.0](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:184)。
- `video_cover_id`：外部原始 3.0 明确支持默认取首帧或高光帧，[官方外部 3.0](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:146)。
- 主文档披露的落地页专用业务码是 `400147`；两个 Job 实际均为通用 `40000`，[官方主文档](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md:494)。

### 4.2 官方字段矩阵与两次实际 wire 形态

| 字段路径 | 官方 3.0 | P02 实际形态 | 历史 one-off 实际形态 | 可下结论 |
| --- | --- | --- | --- | --- |
| `advertiser_id` | 必填 number | number，safe integer | string | 历史分支存在直接类型合同偏差；P02 已正确，不是 P02 候选 |
| `delivery_medium` | BYTE_GAME 场景条件字段 | `BYTE_GAME` | `BYTE_GAME` | 两者一致 |
| `instance_id` | 条件 number | 内存 string，wire 为无损 number token | 内存 string，wire 为无损 number token | 两者实际 wire 都符合 number；不能误判为共同类型问题 |
| `micro_promotion_type` | 创建合同未定义；优化目标 GET 定义 | 省略 | 发送 | 历史分支的合同外字段；未知字段是否被拒绝未获官方明示 |
| `mini_program_info.url` | 条件 string，平台检查正确性 | URL-only | 同一 URL | 链接 hash 一致；内容是否被 create 接受仍未知 |
| `mini_program_info.app_id` | 有 URL 时无须传 | 省略 | 与 URL 同时发送 | 历史形态过度指定，但官方未明确禁止共存 |
| `external_url_material_list` | 条件 string[]，外部 3.0 为 `1–10` | 发送 1 条合格备用页 | 省略 | 一发一省均失败；不能证明必填，也不能证明它导致失败 |
| `image_material_list` | object[]，未定义必须发空数组 | 发送 `[]` | 发送 `[]` | 共同未证实结构；只能在共享绑定全部通过后做结构候选 |
| `video_cover_id` | string；允许平台默认封面 | 省略 | 两条视频均发送 | P02 的省略有官方默认值依据 |
| `action_track_url` | 条件容器内 string[] | 1 条 | 同一 1 条 | hash 一致；协议/宏接受度没有独立权威验证 |

`micro_promotion_type` 出现在“标准项目下获取可用优化目标”的 GET 参数中，而不是 create 字段表，[优化目标 3.0 文档](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/标准项目下获取可用优化目标.md:55)。这能证明历史 Job 混入了相关接口字段，但不能单独证明平台必然因未知字段返回 `40000`。

### 4.3 两个 Job 的实际结果与证据强度

| 证据 | P02 | 历史 one-off |
| --- | ---: | ---: |
| Draft / Plan / Action request hash 一致 | 是 | 是 |
| 确定性重编译匹配已发送 hash | 使用持久化正式字段账本 | 是 |
| Node runs | 7 | 0 |
| Skill runs | 37 | 0 |
| payload contract checks | 30 通过 | 无正式合同链 |
| nested contract checks | 21/21 通过 | 无正式 nested contract |
| field ledger | 83 条、0 blocked | 无持久化正式 ledger；仅能确定性重建 |
| create preflight | 17 通过 | 自定义检查，不等价于 Node 5 preflight |
| evidence artifacts | 12 | 3 |
| platform actions | 1 | 1 |
| created objects | 0 | 0 |
| 汇总 readback | 1（含三次探测） | 1（含三次探测） |

P02 的 37 个 Skill 中，前 36 个通过，只有一次 create Skill 失败；所以本地合同“通过”只证明本地前置条件满足，不能替代平台最终接受。

历史请求虽然绕过 Node 1–7，但本轮通过相同账户事实和历史 builder 在内存中重编译，所得 wire hash 与 Draft、Plan、Action 完全一致。因此历史偏差是对实际已发送形态的判断，不是对当前代码配置的猜测。

### 4.4 两次请求不是单变量实验

统一字段账本共比较 74 个路径：54 个完全一致、20 个不同。重要差异至少包括：`advertiser_id` 类型、`micro_promotion_type`、备用落地页、`mini_program_info.app_id`、视频封面，以及项目名和其他历史业务字段。因此，两个结果之间不能做单字段因果推断。

下列接受度相关路径在两个请求中完全一致：

- `asset_id`、`instance_id`、`aweme_id`；
- DMP 排除人群；
- 品牌四个子字段；
- 视频 ID、产品图 ID；
- 小游戏调起链接；
- 点击监测链接。

P02 对当前账户 9 条必需资源记录完成了 visible、readback verified、readonly passed；但历史 one-off 没有 Job-local 资源证据，只复用了全局既有事实。因此，“资源 ID 相同”与“两个 Job 的证据链同强度”不是同一件事。

### 4.5 本地错误分类不是平台字段错误

当前 executor 从平台响应文案中按关键词归类：包含“落地页/链接”归为 `landing_url_invalid`，包含“素材/资源/品牌/事件”等归为 `resource_not_eligible`，[分类代码](/Users/hys/Projects/marketing-workbench-v2/src/platforms/oceanengineStdProjectCreateExecutor.mjs:104)。只有响应文案明确出现 allowlist 字段路径时，才会写安全 `offending_field_path`。

两个 Action 的字段路径都为空，所以：

- 可以说“本地根据文案归为某一类”；
- 不可以说“平台已经指出备用落地页错误”或“平台已经指出某个资源 ID 错误”；
- 分类变化也不能证明请求越过了某个固定校验阶段，因为平台校验顺序未公开。

### 4.6 已证实、推断与未知

| 等级 | 内容 |
| --- | --- |
| 已证实 | 两次均 `200/40000`、无项目 ID、三次回查未命中；两条请求 hash 链闭环；P02 合同链完整；历史 `advertiser_id` wire 为 string；共享关键路径完全一致 |
| 有证据推断 | 共同失败面优先落在当前账户 BYTE_GAME 的落地/调起/追踪/资源组合，而不是 P02 已纠正的历史 advertiser 类型问题 |
| 尚未知 | 平台具体失败字段、校验顺序、小游戏调起链接当前可接受格式、监测宏是否合法、备用页与小游戏 URL 的组合/互斥规则、空图片数组是否被接受 |

## 5. Options

### 方案 A：继续复制历史请求

不采用。历史 one-off 有明确 wire 类型偏差、合同外字段和弱合同链；继续复制会把已知问题带入新实验，而且无法解释 P02 已按 number 发送仍失败的事实。

### 方案 B：从本地错误分类猜一个字段立即创建

不采用。两个 Action 都没有平台字段路径；直接猜测会把 create 当成字段探测器，并消耗有限真实尝试。

### 方案 C：P02 唯一基线 + 权威只读证据驱动的单变量决策树

采用。它保留 P02 的完整合同链，只在当前账户权威证据确认“错误值 + 已有合格替换值”后选择一个候选。若证据不足，停止而不是猜测。

## 6. Recommended Design

### 6.1 问题拆分

共同主问题：当前账户 BYTE_GAME 组合未被 create 接受，但具体字段未证实。

历史分支问题：

1. `advertiser_id` 是 string wire，直接违反官方 number 类型；历史 builder 的强制 string 见 [jszcHistoricalTemplateCreate.mjs](/Users/hys/Projects/marketing-workbench-v2/src/oneoff/jszcHistoricalTemplateCreate.mjs:136)。
2. `micro_promotion_type` 被混入 create，见 [同一文件](/Users/hys/Projects/marketing-workbench-v2/src/oneoff/jszcHistoricalTemplateCreate.mjs:148)。
3. 同时发送 `app_id + url`，并发送空图片数组，见 [同一文件](/Users/hys/Projects/marketing-workbench-v2/src/oneoff/jszcHistoricalTemplateCreate.mjs:171)。
4. 历史偏差只解释该分支的合同不严格，均尚未被证明是 `40000` 的唯一原因。

P02 分支问题：

1. P02 的 advertiser number、URL-only、默认封面省略更接近官方合同；因此它是唯一后续基线。
2. P02 增加一条合格备用页后仍失败，只证明“P02 + 备用页”组合未被接受，不证明该字段必填或有错。
3. 官方没有提供 BYTE_GAME 下备用页与小游戏调起页的完整互斥矩阵。
4. 两次共享的小游戏 URL、监测链接和资源组合仍缺少 create 接受度级别的独立证明。

### 6.2 已完成的只读覆盖

| 检查面 | 当前结果 | 证据边界 |
| --- | --- | --- |
| 可用优化目标 | passed | P02 Job-local 只读 artifact |
| 小游戏 instance/app/link 绑定 | partial | 本地 hash、app 与平台 app 绑定、相关优化目标回查通过；没有独立 create-URL correctness 接口 |
| 点击监测链接 | partial | 受控值与 hash 存在；协议/宏合同未被独立权威来源确认 |
| 当前账户资源资格 | passed | 9/9 必需资源 visible、readback verified、readonly passed |
| 备用落地页资源 | partial | HTTPS、账户可见、回查/hash 通过；BYTE_GAME 是否应发及组合规则未知 |

这些持久化只读证据与本次数据库查询均为同一运行日事实。重复调用相同 GET 不能补出不存在的小游戏 URL correctness 或监测宏合同，因此本轮没有为了“看起来更新”而追加平台请求。

### 6.3 当前候选选择结果

```text
candidate.status = blocked_no_verified_single_variable
candidate.path   = none
future create    = disabled
```

历史 `advertiser_id` string 是已证实的分支偏差，但不是未来 P02 的可变候选：P02 已用 number 发送且仍失败。把历史 Job 改成 number 会验证历史分支，不会验证用户指定的 P02 共同问题基线。

### 6.4 未来候选决策树

只有出现新的权威只读证据时才继续：

```text
小游戏 URL / instance / app 绑定被明确证明不匹配
且已有当前账户可见、回查通过的替换值
→ 只替换 project_materials.mini_program_info.url，继续 URL-only

否则，监测链接被权威来源明确证明不合规
且已有合格替换值
→ 只替换 track_url_setting.action_track_url

否则，某一资源被平台只读接口明确判定不可用
且已有合格资源
→ 只替换该资源 ID；禁止现场上传

否则，小游戏、监测、资源、备用页适用性全部达到 passed
→ 结构候选：只把 project_materials.image_material_list 从 [] 改为省略

否则
→ 停止，不开放真实创建
```

### 6.5 未来真实创建合同

当且仅当候选被选中后，另建 corrective Case、Task、Manifest、runtime Job、Draft 和 Execution Plan，完整走 Node 1–7。P02 字段账本和 wire hash 作为固定比较基线。

允许变化：

- 新项目名；
- fresh 运行证据、时间、payload/wire hash；
- 决策树选中的一个业务字段。

禁止变化：

- 预算 `88888`、CPA `488`、ROI `0.088`、排期、定向、CTA、素材集合；
- 备用落地页策略和未选中的其他字段；
- Promotion、上传/修改资源、预算/出价、token。

字段账本 diff 必须通过严格 allowlist；预检通过后重新展示精确差异，并取得一次新的人工确认。原子 claim 后最多一次 create，不自动重试。

## 7. Validation & Stop

### 7.1 本轮实现验证

| 验证 | 结果 |
| --- | --- |
| 新模块、CLI、smoke `node --check` | passed |
| 字段 presence/type/count/hash 对照 fixture | passed |
| 单变量 diff allowlist fixture | passed |
| 候选决策树：无权威替换时阻断 | passed |
| 敏感输出拒绝：完整 URL、凭据、完整 request ID | passed |
| 两个真实 Job 的 Postgres 只读重建 | passed |
| P02 / 历史 hash chain | passed / passed |
| 运行前后目标 Job 审计计数 | 完全一致 |
| 新 platform action / confirmation / object / readback | `0 / 0 / 0 / 0` |
| 数据库写入 / 平台写入 / 本轮平台 GET | `0 / 0 / 0` |

诊断输出只保留字段路径、presence、类型、数量、hash、状态和 ID 是否存在；不保存 raw payload、raw response、完整链接或完整 request ID。

### 7.2 未来实验结果解释

- 返回项目 ID 或回查命中：只能证明“P02 基线 + 一个变更”的组合被接受；不能反向宣称该字段是两次 `40000` 的唯一原因。
- 返回明确字段错误：记录脱敏字段路径和业务码，关闭本次实验；不得顺手测试第二字段。
- 仍为其他 `40000` 或未确认创建：候选保持未证实，停止于 forensic；不自动重试。
- 任何结果都只允许一条 create action 和一条包含 `0/10/30s` 的汇总 readback。

### 7.3 强制停止条件

以下任一成立即停止：

- 没有权威证据确认候选字段当前值不匹配；
- 没有已经存在且通过回查的替换值；
- 除项目名/fresh 证据和一个批准字段外出现其他业务 diff；
- 需要上传素材、修改资源、刷新 token、改预算/出价或创建 Promotion；
- 需要用第二次 create 才能继续判断。

## 8. Decision & References

### 8.1 已落实决定

- P02 是后续唯一基线；历史 one-off 只作为分支反例与辅助证据。
- 当前候选为空，真实创建 scope 保持关闭，最大 create action 为 `0`。
- 不新增业务 Case/Job，不修改现有两个 Job，不修复路线默认或 Node 1–7。
- P02 Case 当前仍投影为 `await_job_write_authorization`，但 Action 已失败且回查未命中。这是独立审计投影缺陷，`payloadRootCauseImpact = none`；应另立修复任务，不得和字段实验捆绑。

### 8.2 任务与合同

- [本次 Task](/Users/hys/Projects/marketing-workbench-v2/tasks/TASK-MWBV2-OE3-JSZC-OFFICIAL3-TWO-JOB-FORENSIC-20260830.md)
- [Context Manifest](/Users/hys/Projects/marketing-workbench-v2/tasks-context-manifests/TASK-MWBV2-OE3-JSZC-OFFICIAL3-TWO-JOB-FORENSIC-20260830.json)
- [Solution Design.md](</Users/hys/Projects/marketing-workbench-v2/docs/Solution Design.md>)
- [智擎版 3.0 创建标准项目](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md)
- [外部原始智擎版 3.0 创建标准项目](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md)
- [智擎版 3.0 获取可用优化目标](/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/标准项目下获取可用优化目标.md)

最终问题定位不是“找到一个确定错误字段”，而是把证据边界收紧到可安全继续的位置：历史分支有明确合同偏差；P02 仍是当前最可靠基线；共同 BYTE_GAME 接受度缺口尚未被字段级证据拆开，因此下一次真实创建必须等待一个经过权威只读证据确认的单变量候选。

# Plan 2：项目优化迭代建议

状态：仅记录后续优化方向；不构成当前任务、运行真值、平台写入授权或数据迁移指令。

## 一、目标与原则

目标：在保持现有 3 阶段 7 节点和单次创建安全边界的基础上，使任意目标账户都能从独立 case 开始完成“只读准备 → 草稿 → 单次授权创建 → 回查”，而不依赖当前账户的隐式默认值或历史状态。

稳定原则：

```text
运行真值：Postgres（case / job / Node / resource / plan / evidence）
流程定义：src/workflows/skills/oe3/00-workflow-node-registry.mjs
文档职责：解释通用机制；不保存动态账户状态，不成为运行输入
账户作用域：route_id + game_code + advertiser_id
平台写入：全局权限 + 当前 job execution plan + 单次确认，三者同时满足
```

## 二、现状评估

### 1. 已合理且应保持的机制

| 维度 | 当前机制 | 保持理由 |
| --- | --- | --- |
| 7 节点定义 | 注册表是唯一节点元数据来源 | 避免前端、脚本、workflow 出现第二套节点定义 |
| Node 4 | 资源“目标可用性”与“是否可自动准备”分离 | 不因缺少官方写接口而虚构自动化能力 |
| Node 5 | 创建草稿、字段合同、查重、创建就绪分层 | 可在真实 create 前暴露字段和资源缺口 |
| Node 6 | execution grant + 单次 create | 避免重复创建或越权写入 |
| Node 7 | 创建后才允许对象回查 | 不在 dry-run 中伪造创建成功 |
| 长数字 ID | 日常存储为字符串；无无损合同则不发送 | 防止 JavaScript `number` 精度损失 |

### 2. 当前账户的真实状态（仅作方案背景）

目标账户 `1871922346964041` 在最近 fresh readonly job 中已满足 Node 1–4；Node 5 已生成草稿。唯一业务叶子 blocker 是：

```text
instance_id_long_id_transport_not_verified
```

它表示：官方资料已确认 `instance_id` 的字段名、类型和 Byte 小游戏适用性，但候选实例为 19 位数字，尚未有官方无损 JSON 传输策略。当前省略该字段并禁止 create 的处理正确。

## 三、按优先级的优化建议

### P0：先收敛账户通用性（未来切换账户的必要前置）

问题：Node 1、Node 3、Node 4、Node 5 的主 workflow 已由 job 的 `advertiser_id` 驱动；但 Node 2 的部分 monitor/乾坤 CLI 与辅助逻辑仍保留当前账户默认 target，以及一次性人工成功/覆盖常量。未显式传参时，未来存在误落到历史账户的风险。

重点位置：

```text
src/workflows/skills/oe3/02-monitor-provision.mjs
  MONITOR_PROVISION_TARGET
  MONITOR_L3_MANUAL_OVERRIDE_SCOPE
  MONITOR_MANUAL_SUCCESS_CONTRACT

src/workflows/skills/oe3/02-qiankun-option-relation-sync.mjs
  含 advertiserId 的默认同步 target

scripts/02-monitor-provision-cli.mjs
scripts/04-product-image-ensure-once.mjs
  当前账户的 CLI fallback
```

建议方案：

```text
CLI / API 输入
  → 必须显式 case_id
     或同时显式 route_id + game_code + advertiser_id
  → 创建 / 读取 fresh job
  → 从 job 组装 target
  → 所有 Node 2 readonly / plan / confirmation 使用该 target

缺少账户作用域
  → hard fail: explicit_account_scope_required
  → 禁止回退到任意默认账户
```

人工 L3 覆盖和历史成功对照应改为受控、可过期的 Postgres 证据记录，键为：

```text
route_id + game_code + advertiser_id + provision_id
```

其中路线/游戏层的稳定业务配置（例如技术系统、素材源、受控资产选择）可保留在蓝图或路线默认值中；目标账户、乾坤账户记录、owner、agent、monitor 只能由该账户的只读解析或显式确认记录产生。

验收：

- 不传目标账户时，所有生产 CLI 都失败，不采用 fallback。
- 两个不同账户的 monitor、resource、payload hash、plan、evidence 不互相读取或复用。
- 当前账户与新账户分别运行 fresh job，均由各自 job scope 驱动。
- 迁移前的硬编码值仅作为历史 evidence，可追溯但不可成为运行输入。

### P1：将 blocker 分为“叶子原因”和“结构状态”

问题：当前 Node 5 的 final payload manifest 已明确唯一叶子 blocker，但 `workflow_case_summary` / execution plan 可能只显示泛化的：

```text
draft_not_ready_for_std_project_create
```

这个代码可用于表明 create 不可执行，但不足以指导修复。

建议分层：

| 层级 | 示例 | 用途 |
| --- | --- | --- |
| 叶子 blocker | `instance_id_long_id_transport_not_verified` | 用户和任务的实际修复对象 |
| 聚合 blocker | `final_payload_blockers` | 表示 manifest 仍有缺口 |
| 执行状态 | `draft_not_ready_for_std_project_create` | 表示 Node 6 不得开始 |

建议投影规则：

```text
Node 5 final_payload_manifest.blockers
  → workflow_case_summary.root_blocker_codes（叶子原因）
  → UI “当前唯一阻断”

execution plan blockers
  → 保留 draft_not_ready_for_std_project_create（结构状态）
  → 附带 root blocker 引用，而非替代叶子原因
```

验收：case summary、CLI 和工作台在只有一个叶子原因时均直接展示该原因；多原因时展示稳定排序的叶子列表；不泄露 payload、URL、token 或原始平台响应。

### P2：建立“新账户从零启动”标准路径

“从零”指创建新的 business case / fresh runtime job，不是删除已有账户资源或历史 job。

```text
显式账户 scope
  → Node 1：输入归一
  → Node 2：账户身份、授权状态、monitor/触点只读解析
       └─ 缺 monitor：仅生成 ensure_monitor 计划；不自动写入
  → Node 3：按 route + game 读取默认值、素材蓝图、备用页候选
  → Node 4：为该目标账户 bootstrap resource rows，逐项 readonly readback
       ├─ 已可用：visible + readback_verified
       ├─ 可自动准备：只生成具备幂等键的 ensure_resource 计划
       └─ 不可自动准备：保留官方合同或人工动作 blocker
  → Node 5：草稿、查重、最终字段 manifest、叶子 blocker
  → Node 6：另行授权的单次 create
  → Node 7：对象、字段、证据回查
```

关键边界：

- 资源蓝图可指向路线/游戏的受控素材源，但目标可用性必须对新账户重新回查。
- 不把某账户的 `account_resources`、monitor 或素材 ID 当作另一账户的 ready 证据。
- 平台写动作只在独立任务、execution plan 和单次确认都齐备时执行。

### P3：将路线/游戏受控资产从代码常量进一步数据化

问题：备用落地页的源账户、站点 ID、资产 ID 等是当前 `JSZC` 路线的受控资产，并非目标账户写死；但仍有部分常量位于模块中，增加未来换游戏/换资产的维护成本。

建议：

```text
game_route_defaults / resource_blueprints / game_assets
  保存：source_advertiser_id、source_asset_id、site_id、内容 hash、适用 route/game

Node 3
  只读取受控蓝图

Node 4
  只验证“该目标账户是否可见 + 内容 hash 是否一致”
```

不得将完整落地页 URL 或原始平台响应写入该配置或运行摘要。

### P4：补齐跨账户回归测试与操作防呆

最低覆盖：

- 账户 A / B 同时跑 dry-run：所有资源、monitor、plan、evidence 作用域准确隔离。
- 缺失 advertiser scope：hard fail。
- Node 4 未命中时：不得继承其他账户的 ready 状态。
- Node 5：叶子 blocker 在 summary、plan、UI 一致出现。
- 19 位 `instance_id`：不得经过 `Number()`，未获得官方传输合同则不进入最终 payload。
- 生产 CLI：无 `--advertiser-id` 或 `--case-id` 时不能执行 readonly 以外的任何动作。

## 四、建议的实施顺序

```text
第 1 步（P0）账户 target 去默认化
  ↓
第 2 步（P1）叶子 blocker 投影
  ↓
第 3 步（P2）用第二个账户进行 fresh dry-run 验证隔离性
  ↓
第 4 步（P3）路线/游戏受控资产数据化
  ↓
第 5 步（P4）形成跨账户回归测试矩阵
  ↓
最后才处理 instance_id 的官方长数字传输合同
  ↓
独立建立一次真实 std_project/create 授权任务
```

当前账户的实际创建不应抢在 P0/P1 之前推进；否则新账户能力尚未稳定，且用户仍只能看到泛化 blocker。

## 五、文本流程逻辑图的归属建议

建议新增：

```text
docs/工作流-7节点-通用Gate逻辑图.md
```

该文档只描述：账户作用域、7 节点输入输出、各节点 blocker 分层、Node 4 准备能力、Node 6 单次授权、Node 7 回查边界。

合理性：

- 代码注册表仍是唯一机器可执行的节点定义，不在 Markdown 再维护一份可漂移的节点数组。
- 文档只保留“如何理解和排查”的稳定说明，不写账户实时状态、job ID、动态 blocker 结论。
- 乾坤专项关系继续保留在 `docs/方案-乾坤与v2通用关系底表逻辑图_20260826.md`，不与全链路流程图混合。
- 任务卡和 context manifest 仅引用该图，不将其作为运行输入或真值。

## 六、暂不执行的事项

- 不修改 Node、CLI、数据库、execution plan 或前端。
- 不新建 runtime job，不创建 execution grant。
- 不调用 `std_project/create`、monitor 创建、素材上传或 token 刷新。
- 不因本方案删除、覆盖或迁移历史账户记录。

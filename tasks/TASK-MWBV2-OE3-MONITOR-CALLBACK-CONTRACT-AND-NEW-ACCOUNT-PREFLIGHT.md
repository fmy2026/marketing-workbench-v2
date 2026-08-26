# TASK-MWBV2-OE3-MONITOR-CALLBACK-CONTRACT-AND-NEW-ACCOUNT-PREFLIGHT

状态：completed

更新时间：2026-08-26 CST

## 目标

修正 v2 乾坤 monitor 创建模板：将技术确认的回传字段合同沉淀到 `oceanengine_3_byte_mini_game + JSZC` 的路线默认配置，并由唯一 `monitor:ensure` 编译器自动带入。

随后对新账户 `1871922414575753` 执行只读预检和 `plan-only` 创建计划生成，不执行真实创建。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是高优先级执行指令。真实平台写入仍以当前聊天明确授权和项目 guardrails 为准。

## 合理性评估

需求合理。

原因：

- 旧账户 `1871922346964041` 第二次且最后一次真实创建已失败，不能再进行第三次创建。
- 技术补充 `server_callback_type` 与 `server_callback_data_types` 为当前环境实际必填字段，适合沉淀为路线默认合同。
- 新账户 `1871922414575753` 当前只要求只读预检和计划生成，不消耗真实创建 attempt。
- 继续复用 `monitor:ensure` 唯一入口，符合项目“唯一运行链路”规则。

## 本任务范围

- 新增 migration，更新 `mwb.game_route_defaults.raw_defaults.monitor_provision`。
- 修改 monitor 创建参数编译器，自动编译 callback 字段。
- 增加 callback 合同完整性校验：缺失时阻断创建并返回 `callback_contract_missing`。
- 增加 `monitor:ensure -- --route-id ... --game-code ... --advertiser-id ... --plan-only` 支持。
- 对 `monitor_id=245791`、`monitor_id=245828` 做只读标准化核验与证据记录。
- 对新账户 `1871922414575753` 生成创建前计划和人工确认快照。

## 非目标

- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不设置真实创建确认变量。
- 不对旧账户 `1871922346964041` 发起第三次创建。
- 不刷新 token。
- 不创建 OceanEngine 项目、广告、素材、事件资产、DMP。
- 不修改预算或出价。
- 不修改原始参考 API 文档。
- 不写入 token、Cookie、raw request、raw response、完整触点 URL。

## 回传合同

目标路线：

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
```

默认合同：

```json
{
  "server_callback_required": true,
  "server_callback_type": "2",
  "server_callback_data_types": [
    "active",
    "register",
    "success_order"
  ]
}
```

期望表单编码：

```text
server_callback_type=2
server_callback_data_types[]=active
server_callback_data_types[]=register
server_callback_data_types[]=success_order
```

## 新账户

```text
advertiser_id=1871922414575753
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
```

本任务只允许 `plan-only`：

```bash
npm run monitor:ensure -- \
  --route-id oceanengine_3_byte_mini_game \
  --game-code JSZC \
  --advertiser-id 1871922414575753 \
  --plan-only
```

## 验收

- `game_route_defaults` 已持久化 callback 合同。
- 唯一编译器生成字段包含 `server_callback_type` 与 3 个 `server_callback_data_types[]`。
- 缺少 callback 字段时创建前校验返回 `callback_contract_missing`。
- `245791`、`245828` 只读结果已标准化记录，不可见字段明确标注。
- 新账户 `1871922414575753` plan-only 成功或给出清晰只读阻断；不新增真实 attempt。
- 旧账户保持 `attempt_count=2`，不调用第三次创建。
- 通过必要 smoke / JSON / diff 检查。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已确认需求合理，且没有需要用户立即补充的问题。
- 已建立本任务与 context manifest。
- 已新增并应用 migration：`db/026_require_oe3_mini_game_monitor_callbacks.sql`，更新 `1` 条 `game_route_defaults`。
- 已将 callback 合同写入 `raw_defaults.monitor_provision`：
  `server_callback_required=true`、`server_callback_type=2`、`server_callback_data_types=active/register/success_order`。
- 已修改唯一 `monitor:ensure` 编译器，创建计划字段包含 `server_callback_type` 与 `server_callback_data_types`。
- 已增加 callback 合同完整性校验；缺失时会返回 `callback_contract_missing`。
- 已支持 `monitor:ensure -- --route-id ... --game-code ... --advertiser-id ... --plan-only`。
- 已只读核验 `monitor_id=245791` 与 `monitor_id=245828`，evidence 为 `EV-QK-MONITOR-IDS-READONLY-245791-245828`。
- 已确认 `monitor_id=245828` 属于旧账户 `1871922346964041`，并回写本地有效 monitor 状态；旧账户仍保留两次失败 attempt 审计，不允许第三次创建。
- 已为新账户 `1871922414575753` 执行 plan-only，evidence 为 `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-PLAN-ONLY`。
- 新账户 plan-only 结果：`status=passed`，`runStatus=planned`，`attemptCount=0`，`createCalled=false`，`existingMonitor=false`，`laterRealCreateAllowed=true`。

## 只读核验结果

| monitor_id | 账户 | 包 | 媒体资源位 | 代理 | monitor API | 触点 |
| --- | --- | --- | --- | --- | --- | --- |
| `245791` | `1871922175825993` | `36820` | `310 / 通投智选（原生竞价）` | `613 / 北京国新汇金股份有限公司` | `toutiao_wxgame` | 存在，仅保存 hash |
| `245828` | `1871922346964041` | `36820` | `310 / 通投智选（原生竞价）` | `613 / 北京国新汇金股份有限公司` | `toutiao_wxgame` | 存在，仅保存 hash |

`/tf/ad/index` 不暴露 callback 字段，因此记录为 `callbackFieldsVisible=false`，不做臆测。

## 新账户 plan-only 快照

| 项 | 值 |
| --- | --- |
| 目标账户 | `1871922414575753` |
| 乾坤账户记录 | `8449` |
| owner | `fengmeiyu` |
| agent | `613 / 北京国新汇金股份有限公司` |
| 是否已有 monitor | 否 |
| cate / vest / package / channel | `122 / 1414 / 36820 / dymini3k` |
| media / monitor API | `310 / toutiao_wxgame` |
| usage | `0` |
| callback | `type=2`，`active/register/success_order` |
| callback contract hash | `sha256:224d383b42f1a1a89774f85c267f16758f6b9e5acb4488724b9cfa387ded3819` |
| create plan hash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| 当前尝试次数 | `0` |
| 本任务是否创建 | 否 |

## 验证

- `node import monitor-provision`：通过。
- `psql -f db/026_require_oe3_mini_game_monitor_callbacks.sql`：通过，`UPDATE 1`。
- callback 缺失 stub 测试：返回 `callback_contract_missing`，无外部调用，无创建。
- `node scripts/monitor-provision-cli.mjs --mode monitor_ids_readonly --monitor-ids 245791,245828`：通过，`createCalled=false`。
- `npm run monitor:ensure -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922414575753 --plan-only`：通过，`createCalled=false`。
- `npm run monitor:status`：旧账户已回写 `monitor_id=245828`，`createAttemptNo=2`。
- `npm run monitor:status -- --advertiser-id 1871922414575753`：新账户 `planned`，`createAttemptNo=0`。
- `npm run smoke:workflow-skills`：通过；dry-run 里的落地页/instance_id 阻断为既有业务 gate。
- `npm run smoke:api`：命令通过；payload contract blocked 为既有 prewrite gate。
- JSON parse：`project.state.json` 与本任务 manifest 通过。
- `git diff --check`：通过。

## 关闭结论

本任务已完成。下一 gate：如果要对新账户 `1871922414575753` 执行首次真实乾坤 monitor 创建，必须另建单次真实创建任务并由用户在聊天中明确授权；该任务应复用已生成的 plan-only 合同和 hash，不得影响旧账户，也不得触发旧账户第三次创建。

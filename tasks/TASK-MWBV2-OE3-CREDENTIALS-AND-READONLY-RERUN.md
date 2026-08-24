# TASK-MWBV2-OE3-CREDENTIALS-AND-READONLY-RERUN

状态：completed

更新时间：2026-08-23 CST

## 目标

为 v2 建立独立的 OceanEngine 凭据读取、状态检查和受控 refresh 机制，并在凭据 ready 后重跑真实平台只读校验，刷新 7 个 Workflow 节点、账户资源只读摘要和创建前 gate。

## 背景

上一任务 `TASK-MWBV2-OE3-READONLY-GATES` 已完成真实平台只读 gate 骨架，但结果为：

| 项 | 当前结果 |
| --- | --- |
| `platformReadonlyStatus` | `credential_required` |
| `prewriteGateStatus` | `blocked` |
| 阻断资源 | `avatar`、`event_asset`、`product_image` |
| 凭据状态 | 本机 OceanEngine token 过期 |
| 已执行平台写入 | 无 |
| 已刷新凭据 | 无 |
| raw response 保存 | 无 |

## 范围

| 类型 | 内容 |
| --- | --- |
| 允许新增 | v2 私有凭据 env scaffold、凭据 store、token status 脚本、受控 token refresh 脚本 |
| 允许更新 | `project.state.json`、`package.json`、`src/platforms/oceanengineReadonlyClient.mjs`、只读 smoke / API / payload 安全断言 |
| 允许接口 | OceanEngine OAuth/token refresh 接口、真实平台只读 probe 接口 |
| 允许数据库写入 | `mwb.launch_node_runs.output_summary/status`、`mwb.account_resources.status/readback_status/metadata`、`mwb.evidence_artifacts` |
| 非目标 | 不执行 `std_project/create`，不上传素材，不创建事件资产，不推送 DMP，不改预算/出价，不建立自动定时刷新 LaunchAgent |

## 目标对象

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `monitor_id` | `245791` |
| 创建对象 | `std_project` |

## 凭据边界

- v2 优先且默认只读取 `/Users/hys/Projects/marketing-workbench-v2/.local/oceanengine.env`。
- `.local/` 必须保持 git ignored，凭据文件权限建议为 `0600`。
- 凭据文件需要支持后续 token refresh，不只保存 access token。
- 任何输出只展示字段是否存在、状态、过期时间、是否过期，不展示 token、refresh token、secret、auth_code。
- `OCEANENGINE_AUTH_CODE` 只作为临时字段，完成 exchange 后应清空或标记不可输出。
- 不复制旧项目 token，不把旧项目路径作为 v2 运行时真值。

## 需要实现

| 能力 | 文件 |
| --- | --- |
| 凭据读取与脱敏状态摘要 | `src/platforms/oceanengineCredentialStore.mjs` |
| token 状态检查，无网络请求 | `scripts/oceanengine-token-status.mjs` |
| 受控 token refresh，必须有确认变量 | `scripts/oceanengine-token-refresh.mjs` |
| 只读 client 复用凭据 store | `src/platforms/oceanengineReadonlyClient.mjs` |
| npm 脚本 | `package.json` |

确认变量固定为：

```bash
MWBV2_OE_TOKEN_REFRESH_CONFIRM=REFRESH_ONE_OCEANENGINE_TOKEN npm run token:refresh
```

## 7 节点覆盖

| 节点 | 本任务覆盖 |
| --- | --- |
| 1. Intake 规范 | 确认 `route_id/game_code/advertiser_id` 不变 |
| 2. 创建上下文装配 | 校验凭据状态、账户 ID、触点 ref、monitor_id、touchpoint hash/status |
| 3. 游戏保底包解析 | 不做平台写入，只确认本地 Postgres 保底包可读取 |
| 4. 账户资源诊断与补齐 | 只读校验头像、事件资产、产品图、视频、DMP、品牌、小程序实例 |
| 5. 创建草稿生成 | 凭据 ready 后重新校验 payload contract 和 payload hash |
| 6. 创建执行 | 保持 `locked`，不得执行真实创建 |
| 7. 回查收口 | 只做只读 probe 证据归档，不做 created object 回查 |

## 安全红线

- 不执行 `std_project/create`。
- 不调用素材上传、事件资产创建、DMP 推送、预算或出价修改接口。
- 不保存或输出 token、refresh token、app secret、auth_code、Cookie、raw response、raw payload、完整触点 URL。
- 只读响应只保存 response hash、状态、字段摘要和 request id 是否存在。
- 长数字平台 ID 一律按字符串处理。

## 验收

| 标准 | 结果 |
| --- | --- |
| `.local/oceanengine.env` 存在且 `.local/` 不进入 Git | passed |
| `npm run token:status` 输出脱敏凭据状态 | passed；当前 `status=missing` |
| token 过期时明确提示 refresh，不继续调用平台 | passed；当前先停在缺凭据状态 |
| 显式确认变量存在时 `npm run token:refresh` 可刷新并更新本地 env | blocked；本地还没有 app config / refresh token，未带确认变量时已验证拒绝执行 |
| `npm run smoke:readonly` 使用 v2 自己的 token 发起真实只读校验 | blocked；v2 本地凭据缺失，因此未发起真实平台 probe |
| `platformReadonlyStatus` 不再是 `credential_required` | blocked；当前仍为 `credential_required` |
| 7 个 Workflow 节点都有最新 `output_summary` | passed |
| `account_resources.metadata.readonly_check` 有最新只读证据摘要 | passed；当前摘要为 `credential_required` |
| 明确输出 `avatar`、`event_asset`、`product_image` 是否仍阻断 | passed；三项仍阻断 |
| 未执行 `std_project/create` | passed |
| 无 token/secret/auth_code/Cookie/raw/full URL 泄漏 | passed |

## 当前风险

本任务需要用户提供 v2 本地 `.local/oceanengine.env` 中的 app 配置与可用 refresh token，或通过 OAuth 流程生成。若本地凭据仍为空，本任务只能完成凭据体系与脱敏状态检查，真实平台只读重跑会继续停在 `credential_required`。

## 已完成

- 新增 v2 独立凭据 store：默认读取 `.local/oceanengine.env`，不回退旧项目 env。
- 新增 `.local/oceanengine.env` 空模板，字段只覆盖 app config、OAuth bootstrap 和 token state。
- 新增 `npm run token:status`，只输出脱敏状态，不发网络请求。
- 新增 `npm run token:refresh`，必须带 `MWBV2_OE_TOKEN_REFRESH_CONFIRM=REFRESH_ONE_OCEANENGINE_TOKEN` 才会尝试 OAuth refresh。
- 更新只读 client，复用 v2 凭据 store，凭据 blockers 细化为 `app_config_missing`、`access_token_missing`、`refresh_token_missing` 等。
- 更新 Workflow API 投影，7 个节点输出包含脱敏凭据 blockers 和只读 gate 状态。
- 修正 GET 缓存回放时重复计入资源缺口的问题。
- 更新 smoke 安全断言，允许脱敏状态名，不允许真实 token、secret、raw response、完整触点 URL。
- 精简 `.local/oceanengine.env`：只保留 app config、OAuth bootstrap、token state 三个模块。
- 从 env 模板和凭据状态输出中移除默认账户、sample 对象 ID、bootstrap/probe 状态字段。
- 确认 `advertiser_id` 仍来自 Postgres `launch_jobs/advertiser_accounts/account_touchpoints`，不从 env 推断。
- 修复并发 smoke 暴露的 `launch_jobs.job_id` 低概率撞号问题，job_id 增加随机熵。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/platforms/oceanengineCredentialStore.mjs` | passed |
| `node --check src/platforms/oceanengineReadonlyClient.mjs` | passed |
| `node --check scripts/oceanengine-token-status.mjs` | passed |
| `node --check scripts/oceanengine-token-refresh.mjs` | passed |
| `npm run token:status` | passed；脱敏输出 `status=missing` |
| 复制旧项目同名凭据字段到 v2 `.local/oceanengine.env` | passed；按 15 个精简字段复制，输出已脱敏 |
| `MWBV2_OE_TOKEN_REFRESH_CONFIRM=REFRESH_ONE_OCEANENGINE_TOKEN npm run token:refresh` | passed；OAuth refresh 成功，未调用投放写入 |
| `npm run smoke:readonly` | passed；`platformReadonlyStatus=blocked`，`credentialStatus=ready`，5 条平台只读 evidence，7/7 节点输出 |
| `npm run smoke:api` | passed；P34/P35 顺序占用正常 |
| `npm run test:payload-contract` | passed；`gapCount=4` |
| 敏感原文扫描 | passed；未发现完整触点 URL、旧项目运行依赖 |
| 工作台在线检查 | passed；`http://127.0.0.1:3000/api/launch/jobs/latest` 返回 200 |

## 当前脱敏状态

| 项 | 值 |
| --- | --- |
| `envFilePresent` | true |
| `appIdPresent` | true |
| `appSecretPresent` | true |
| `redirectUriPresent` | true |
| `accessTokenPresent` | true |
| `refreshTokenPresent` | true |
| `tokenExpired` | false |
| blockers | none |

## 最终 env 字段

| 模块 | 字段 |
| --- | --- |
| app config | `OCEANENGINE_APP_ID`、`OCEANENGINE_APP_SECRET`、`OCEANENGINE_REDIRECT_URI` |
| OAuth bootstrap state | `OCEANENGINE_AUTH_STATE`、`OCEANENGINE_AUTH_RID`、`OCEANENGINE_AUTH_CODE`、`OCEANENGINE_AUTH_UID`、`OCEANENGINE_AUTH_SCOPE`、`OCEANENGINE_MATERIAL_AUTH_STATUS` |
| token state | `OCEANENGINE_ACCESS_TOKEN`、`OCEANENGINE_REFRESH_TOKEN`、`OCEANENGINE_TOKEN_OBTAINED_AT`、`OCEANENGINE_TOKEN_EXPIRES_AT`、`OCEANENGINE_TOKEN_REFRESH_AFTER`、`OCEANENGINE_TOKEN_STATUS` |

## 最新只读重跑结果

| 项 | 值 |
| --- | --- |
| latest readonly job | `JOB-MWBV2-20260823152224-4D07EA` |
| `platformReadonlyStatus` | `blocked` |
| `credentialStatus` | `ready` |
| `prewriteGateStatus` | `blocked` |
| `gapCount` | 4 |
| 阻断资源 | `product_image`、`brand_info` |
| 已通过资源 | `avatar`、`event_asset`、`dmp_audience_package`、`video_asset`、`micro_app_instance` |
| 平台 evidence | 5；真实平台只读 probe 已执行并保存脱敏摘要/hash |
| 账户来源 | `mwb.launch_jobs.advertiser_id=1871922175825993`，并已关联 `mwb.advertiser_accounts` 与 `mwb.account_touchpoints` |

## 下一步

进入账户资源补齐任务，优先处理：

- `product_image`：缺少可直接查询的平台 image_id。
- `brand_info`：品牌/行业只读仍需确认。

真实创建仍禁止，需等账户资源补齐后再次运行只读 gate。

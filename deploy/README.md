# 本机工作台部署

| 元信息 | 值 |
| --- | --- |
| 文档性质与状态 | 当前有效；启动、发布、连接配置与部署验收说明 |
| 用途与范围 | 说明工作台如何运行和配置；不定义 Agent 流程、数据字段或业务结果 |
| 权威依据 | 当前 `package.json`、`deploy/`、网络策略与凭据存储实现 |
| 最后更新 | 2026-09-21 CST |
| 核验范围 | 静态核对当前部署入口、市场情报连接配置与公开命令；未重载服务或访问真实外部数据 |
| 更新条件 | 启动、发布、网络、凭据存储、连接录入、部署验收或公开命令变化时更新 |

当前默认入口是 `http://127.0.0.1:3000`。应用以 `WORKBENCH_PUBLIC_ORIGIN` 校验 Host、Origin 并决定 Cookie 属性。运行流程查[逻辑图](../docs/project-现在的逻辑图.md)，数据合同查[数据与报表契约](../docs/project-数据与报表契约.md)，阅读入口见[文档导航](../docs/README.md)。

## 当前本机配置

使用 [本机 LaunchAgent 样例](launchd/com.hys.marketing-workbench.lan-http.plist.example) 设置以下三项：

```text
WORKBENCH_BIND_HOST=127.0.0.1
WORKBENCH_PORT=3000
WORKBENCH_PUBLIC_ORIGIN=http://127.0.0.1:3000
```

LaunchAgent 使用 `RunAtLoad=true` 和 `KeepAlive=true`：用户登录时启动，进程退出后重启。Mac 关机、用户退出登录或设备睡眠期间服务不会运行。

切换到本机模式（可在任何网络下运行）：

```sh
npm run workbench:mode -- --mode local
```

每次交付涉及 `frontend/`、`src/server/` 或工作流运行代码后，都必须重载当前 LaunchAgent 并检查根地址，避免浏览器加载新前端而 Node 仍运行旧模块。本机模式重复执行上面的 `workbench:mode -- --mode local`；公司模式重复执行当前 IP 对应的 company 命令。随后执行：

```sh
curl -I http://127.0.0.1:3000/
```

再刷新浏览器工作台；确认卡、Gate 和按钮只以重载后的服务端投影为准。

追加视频改动发布后，额外检查一次“检查推送结果”或“重新只读准备”：页面应在运行结束后立即显示服务端的唯一卡点或确认卡，而不是停留在“正在核验”。对已受理但尚未确认的素材推送，页面在存活期间会按后端返回的下一轮时间自动回查原冻结视频；每次是短只读请求，不会重推、确认或追加。窗口结束或查询失败后，“检查推送结果”只做一次人工只读回查。

开发验证使用独立测试工作台：`npm run workbench:test` 启动在 `http://127.0.0.1:3100`，页面会标明“测试环境”，并且只连接临时数据库、临时凭据路径和阻断外网的模拟边界。业务工作台从固定提交快照启动：交付时先执行 `npm run workbench:release`，再把输出的 `release_root` 传给 `workbench:mode`；开发目录里的未发布修改不会直接改变业务页面或运行链。涉及获批 migration 时，先完成备份和 Task 规定的只读条件核验，再以单个 `psql -X -v ON_ERROR_STOP=1 -d marketing_workbench_v2 -f <migration>` 应用；发布脚本不得自动应用 migration，随后重建 release、重载当前模式并复查服务端投影。模式切换会向 release 注入共享根目录的绝对 `QIANKUN_CREDENTIAL_STORE_PATH`，并在重载前验证该文件可读；不得把凭据复制进 release 或输出其路径、内容。

## 公司共享模式

回公司连接 Wi-Fi 后，先确认 Mac 当前获得的私网 IPv4，再显式切换。公司模式只接受当前 Mac 已分配的 `10.*`、`172.16.*–172.31.*` 或 `192.168.*` 地址；命令会生成对应的监听与公开地址、重载同一 LaunchAgent，并检查根地址。重载或检查失败时自动恢复原配置。

```sh
npm run workbench:mode -- --mode company --host <公司当前IP>
```

成功后命令会输出唯一可分享的根地址 `http://<公司当前IP>:3000`。你和同事都从这个根地址登录；登录后进入 Agent 广场。公司配置样例见 [公司 LAN HTTP LaunchAgent](launchd/com.hys.marketing-workbench.company-lan-http.plist.example)。

连接公司 Wi-Fi 不会自动切换模式。每次 IP 变化后都必须重新运行该命令；同事访问还要求 Mac 在线、未睡眠，且公司网络允许设备互访。首次切换后需要由另一台公司电脑完成实际登录与本人数据隔离验收。

本机验收：

```sh
curl -I http://127.0.0.1:3000/
```

随后用浏览器登录并执行账户隔离验收。需要让其他设备访问时，另行建立受控 HTTPS 或显式私网 HTTP 配置；不得复用本机 loopback 配置。

每位试用者首次查询本人账户前，需要在这台 Mac 的终端录入其本人乾坤 Passport Token：

```sh
npm run setup:qiankun-user -- --user zhangjingwei --gui
npm run setup:qiankun-user -- --user zhangchaobo --gui
```

`--gui` 会打开 macOS 隐藏输入弹窗；去掉它则在交互终端中隐藏读取。命令不接受 Token 参数；结果写入 gitignored、权限为 `600` 的本地 credential store，终端仅输出脱敏状态。Token 默认 30 天到期、25 天后提示更新，与当前凭据合同一致。不要通过聊天、Git 或普通日志传递 Token。

投放创建 Agent 的用户自配模型 Key 独立保存在 `.local/workbench-llm-credentials.json`：程序强制文件为 `0600` 并采用临时文件替换；数据库、audit、日志和浏览器不会读取或回显 Key。该文件由工作区“大模型配置”写入，配置、测试和启用均只能由该用户本人完成；不要手工复制 Key 到环境变量、任务文件或部署日志。

投放创建页面支持自然语言和完整 JSON。新建项目使用 `launch-request.v1`；追加视频使用 `launch-request.v2`，并要求 `project_id` 与 1–100 个 `origin_resource_ids`。自然语言可分次补齐路线、游戏、账户、项目和视频标识码；JSON 不调用模型。追加事项先只读核验视频、目标项目与账户范围，再冻结单次 Plan；平台写入仍须由账户本人确认，回查未通过时不会自动重发。

配置 DeepSeek 时使用 `https://api.deepseek.com/v1`。工作台对该主机的固定 Schema 连接测试与运行时槽位解析都会关闭 thinking；连接测试通过后，输入“巨兽战场走抖小”应显示“已使用模型辅助解析：推广路线”。若显示受控回退原因，页面不会显示模型原始响应；只要服务端已校验当前合并草稿为完整请求，回退不影响用户点击启动。缺项、冲突或未校验输入仍不能启动。

## 长期 HTTPS 上线参数

上线前需要公司内网提供两个值：

- 内网 DNS 名，例如 `workbench.internal.example`；
- 该 DNS 名对应、由试用电脑信任的 TLS 证书和私钥。

把 [nginx 配置](nginx/marketing-workbench.conf.example) 中的占位值替换后启用，并把 [服务 LaunchAgent](launchd/com.hys.marketing-workbench.plist.example) 中的 `WORKBENCH_PUBLIC_ORIGIN` 设为同一个 `https://` 地址。代理必须把原始 `Host` 传给 Node。

现有 `proxy_read_timeout` / `proxy_send_timeout` 均为 70 秒。标准项目创建的已确认 `40100` 例外只会在同一 HTTP 请求内按最长约 49 秒的调用点完成三次投递，执行器总预算为 65 秒；不得把它改造成后台队列，也不得扩大代理窗口来容纳额外重试。

应用目录、日志目录和配置完成后，安装与启动示例：

```sh
mkdir -p /Users/hys/Projects/marketing-workbench-v2/.local/logs
cp deploy/launchd/com.hys.marketing-workbench.plist.example ~/Library/LaunchAgents/com.hys.marketing-workbench.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hys.marketing-workbench.plist
```

若本机已有同名 LaunchAgent，使用 `launchctl bootout` 后再 `bootstrap`。配置变更后用 `launchctl kickstart -k gui/$(id -u)/com.hys.marketing-workbench` 重启。

## 巨量 OAuth token 自动维护

唯一调度入口是 macOS LaunchAgent `com.hys.marketing-workbench.oceanengine-token-maintenance`。它在登录时和每小时第 1 分钟运行 `npm run token:maintain`，由脚本按凭据实际到期时间决定动作：距离 access token 到期不足两小时才刷新；其他时间只写脱敏检查结果。它不依赖 Codex、模型、`active_task` 或精确触发分钟。

安装时先暂停 Codex 的旧 `oceanengine-v2-token-refresh` 任务，并删除任何指向旧项目的同用途 LaunchAgent；然后复制并加载 [专用 LaunchAgent 样例](launchd/com.hys.marketing-workbench.oceanengine-token-maintenance.plist.example)。环境变量、Node 路径、项目目录和 `.local/oceanengine.env` 路径必须保持样例中的当前项目绝对路径。`RunAtLoad` 只补检一次；任务不设置 `KeepAlive`。

维护周期以 `.local/oceanengine.env` 的同一文件锁涵盖到期判断和刷新。刷新前会持久记录尝试状态，成功后原子写入新凭据，再调用 OAuth 已授权账户只读接口验证平台接受新 token；只在三步都成功时记录 `ready`。验证失败只在后续周期重做只读验证，不重复刷新。DNS 或连接建立失败下一周期可重试；超时、进程中断或其他结果不明会停在 `refresh_uncertain`，禁止自动重发并通知人工处理。

所有状态、审计和通知均脱敏：不保存或输出 token、secret、auth code、Cookie、完整 URL、原始请求或响应。首次异常、状态恶化和恢复发送本机通知，同一未恢复问题每天最多一次。日常排查使用 `npm run token:status` 或 `npm run token:maintain` 的脱敏输出与 audit；Mac 关机、退出登录、长时休眠、断网或平台撤销授权期间无法保证持续有效，恢复后会补检。

## 数据库运维入口

连接、迁移、备份与定时配置统一查 [数据与报表契约：数据库运维](../docs/project-数据与报表契约.md#8-数据库运维)。本文件只维护应用部署步骤。

## 三用户验收

1. 分别以 `fengmeiyu`、`zhangjingwei`、`zhangchaobo` 和初始密码登录，确认首次登录只能修改密码。
2. 三人各提交一句完整 Intake，确认本人广告账户进入原有七 Node；他人账户在 Case/Job 创建前返回归属冲突。
3. 修改 `case_id`、`job_id`、`advertiser_id` 请求他人数据，确认统一返回不可见。
4. 管理员查看人员汇总和个人明细，再尝试打开或确认他人 Job，确认仍被拒绝。
5. 按 [确认记录合同](../docs/project-数据与报表契约.md#2-基础表契约38-张) 与 [人员指标口径](../docs/project-数据与报表契约.md#6-view-去重与人员指标口径) 核对确认人和报表结果。
6. 执行 `npm run test:workbench-user-isolation`、`npm run test:workbench-auth-http` 和既有工作流回归。

上线前按 [数据库备份说明](../docs/project-数据与报表契约.md#备份与定时执行) 完成备份，再在每台试用电脑通过最终 HTTPS 域名完成以上浏览器验收。

## 开发回归服务

HTTP 回归由统一测试入口启动独立 loopback 临时端口服务，并在结束时关闭；不会连接默认 3000 工作台或修改真实用户密码。数据库与测试入口详见[隔离测试数据库](../docs/project-数据与报表契约.md#隔离测试数据库)。正式 `npm start` / LaunchAgent 入口保持原配置。

## 市场情报数据连接

登录后从 Agent 广场进入“市场情报”，在“数据连接”填写公共电脑 HTTP(S) 私网 IPv4 origin 与安全交接的 Token。地址不得带路径、查询参数、凭据、域名或重定向；使用 HTTP 时必须在表单确认只读传输。保存会先执行健康检查；空 Token 仅在地址不变时沿用已有配置，变更地址必须重新录入。

连接按当前登录用户保存在项目外 `.config/marketing-workbench/market-intelligence.json`，目录模式为 0700、文件模式为 0600，并原子替换。Token 不进入 Git、数据库、日志或 release，也不通过 API 回显；管理员不能读取或代改他人连接。通过“移除连接”删除本人记录；撤销 Token 在公共电脑侧处理。测试仅用 `MWBV2_MI_CONNECTION_STORE_PATH` 指向临时文件。

模型在“大模型配置”中按用户和 Agent 保存并测试；Base 填兼容服务根地址，例如 `https://…/v1`，不填 `/chat/completions`。保存并测试只测试当前输入版本，测试成功后才可按勾选启用。真实联调依次确认连接、素材查询、MP4/WebM 播放、已启用模型和 HTML 导出；不得以模型或接口 Schema 测试代替带凭据查询。功能流程查[逻辑图](../docs/project-现在的逻辑图.md#7-市场情报-agent只读证据链与演进边界)，接口字段查[数据契约](../docs/project-数据与报表契约.md#市场情报外部只读合同)。

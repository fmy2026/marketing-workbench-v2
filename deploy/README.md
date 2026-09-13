# 本机工作台部署

当前默认入口是 `http://127.0.0.1:3000/agents/launch-creation`。Node 仅监听 loopback，因此 Wi-Fi 切换、断网或局域网 IP 变化不会影响本机地址；平台业务调用仍需联网。应用以 `WORKBENCH_PUBLIC_ORIGIN` 校验 Host、Origin 并决定是否签发 `Secure` 会话 Cookie。

## 当前本机配置

使用 [本机 LaunchAgent 样例](launchd/com.hys.marketing-workbench.lan-http.plist.example) 设置以下三项：

```text
WORKBENCH_BIND_HOST=127.0.0.1
WORKBENCH_PORT=3000
WORKBENCH_PUBLIC_ORIGIN=http://127.0.0.1:3000
```

LaunchAgent 使用 `RunAtLoad=true` 和 `KeepAlive=true`：用户登录时启动，进程退出后重启。Mac 关机、用户退出登录或设备睡眠期间服务不会运行。

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

## 巨量 OAuth token 每日刷新

唯一调度入口是 Codex cron `oceanengine-v2-token-refresh`，每天 `12:01`（Asia/Shanghai）执行。它仅以固定 automation ID 与确认变量运行一次 `npm run token:refresh`；刷新成功后才运行 `npm run token:status` 输出脱敏状态。该任务不得调用业务 API、创建投放对象或修改仓库文件。

刷新使用本机受控的 `.local/oceanengine.env`、文件锁和原子更新；成功与失败都会追加脱敏 audit。传输失败会归类为 DNS、代理/连接、TLS、超时或未知错误并以非零状态结束，以触发失败通知；不会自动重试、不会使用 curl 回退。日常排查只读取 `npm run token:status` 与 audit 的脱敏字段，禁止输出或复制 token、secret、auth code、Cookie、请求体或响应体。

## 数据库运维入口

连接、迁移、备份与定时配置统一查 [数据与报表契约：数据库运维](../docs/project-数据与报表契约.md#8-数据库运维)。本文件只维护应用部署步骤。

## 三用户验收

1. 分别以 `fengmeiyu`、`zhangjingwei`、`zhangchaobo` 和初始密码登录，确认首次登录只能修改密码。
2. 三人各提交一句完整 Intake，确认本人广告账户进入原有七 Node；他人账户在 Case/Job 创建前返回归属冲突。
3. 修改 `case_id`、`job_id`、`advertiser_id` 请求他人数据，确认统一返回不可见。
4. 管理员查看人员汇总和个人明细，再尝试打开或确认他人 Job，确认仍被拒绝。
5. 按 [确认记录合同](../docs/project-数据与报表契约.md#2-基础表契约37-张) 与 [人员指标口径](../docs/project-数据与报表契约.md#6-view-去重与人员指标口径) 核对确认人和报表结果。
6. 执行 `npm run test:workbench-user-isolation`、`npm run test:workbench-auth-http` 和既有工作流回归。

上线前按 [数据库备份说明](../docs/project-数据与报表契约.md#备份与定时执行) 完成备份，再在每台试用电脑通过最终 HTTPS 域名完成以上浏览器验收。

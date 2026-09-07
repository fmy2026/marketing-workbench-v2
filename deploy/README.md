# 局域网部署

Node 服务默认监听 `127.0.0.1:3000`。长期内网用户通过 HTTPS 反向代理访问；应用用 `WORKBENCH_PUBLIC_ORIGIN` 校验 Host、Origin 并决定是否签发 `Secure` 会话 Cookie。

## 当前三人试用：私网 HTTP

当前批准的临时入口为 `http://192.168.42.7:3000/`。它不需要域名、证书或反向代理；使用 [LAN HTTP LaunchAgent](launchd/com.hys.marketing-workbench.lan-http.plist.example) 设置以下四项：

```text
WORKBENCH_BIND_HOST=192.168.42.7
WORKBENCH_PORT=3000
WORKBENCH_PUBLIC_ORIGIN=http://192.168.42.7:3000
WORKBENCH_ALLOW_PRIVATE_LAN_HTTP=true
```

应用只允许显式启用的 RFC1918 IPv4，且 bind host、public origin 和端口必须精确一致。Host、Origin、用户 owner 和 Plan-bound 校验继续生效。HTTP 不加密密码和会话，只用于当前公司内网短期试用；试用结束删除上述变量即可恢复 loopback。

从另一台公司网络电脑验收：

```sh
curl -I http://192.168.42.7:3000/
```

随后用浏览器登录并执行账户隔离验收。若无法连接，先确认两台电脑所在网络/VLAN 是否允许互访以及 Mac 地址是否仍为 `192.168.42.7`。

每位试用者首次查询本人账户前，需要在这台 Mac 的终端录入其本人乾坤 Passport Token：

```sh
npm run setup:qiankun-user -- --user zhangjingwei --gui
npm run setup:qiankun-user -- --user zhangchaobo --gui
```

`--gui` 会打开 macOS 隐藏输入弹窗；去掉它则在交互终端中隐藏读取。命令不接受 Token 参数；结果写入 gitignored、权限为 `600` 的本地 credential store，终端仅输出脱敏状态。Token 默认 30 天到期、25 天后提示更新，与当前凭据合同一致。不要通过聊天、Git 或普通日志传递 Token。

## 长期 HTTPS 上线参数

上线前需要公司内网提供两个值：

- 内网 DNS 名，例如 `workbench.internal.example`；
- 该 DNS 名对应、由试用电脑信任的 TLS 证书和私钥。

把 [nginx 配置](nginx/marketing-workbench.conf.example) 中的占位值替换后启用，并把 [服务 LaunchAgent](launchd/com.hys.marketing-workbench.plist.example) 中的 `WORKBENCH_PUBLIC_ORIGIN` 设为同一个 `https://` 地址。代理必须把原始 `Host` 传给 Node。

应用目录、日志目录和配置完成后，安装与启动示例：

```sh
mkdir -p /Users/hys/Projects/marketing-workbench-v2/.local/logs
cp deploy/launchd/com.hys.marketing-workbench.plist.example ~/Library/LaunchAgents/com.hys.marketing-workbench.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hys.marketing-workbench.plist
```

若本机已有同名 LaunchAgent，使用 `launchctl bootout` 后再 `bootstrap`。配置变更后用 `launchctl kickstart -k gui/$(id -u)/com.hys.marketing-workbench` 重启。

## 数据库备份

手工备份：

```sh
npm run db:backup
```

备份脚本生成 PostgreSQL custom dump，随后用 `pg_restore --list` 校验。默认写入 `.local/backups`，权限由 `umask 077` 限制，保留 14 天。可用 `MWBV2_BACKUP_DIR`、`MWBV2_BACKUP_RETENTION_DAYS` 和 `MWBV2_DATABASE_NAME` 覆盖。每天自动执行可安装 [备份 LaunchAgent](launchd/com.hys.marketing-workbench-backup.plist.example)。

## 三用户验收

1. 分别以 `fengmeiyu`、`zhangjingwei`、`zhangchaobo` 和初始密码登录，确认首次登录只能修改密码。
2. 三人各提交一句完整 Intake，确认本人广告账户进入原有七 Node；他人账户在 Case/Job 创建前返回归属冲突。
3. 修改 `case_id`、`job_id`、`advertiser_id` 请求他人数据，确认统一返回不可见。
4. 管理员查看人员汇总和个人明细，再尝试打开或确认他人 Job，确认仍被拒绝。
5. 验证确认记录带 `confirmed_by_user_id`，创建成功只在权威回查 verified 后计入报表。
6. 执行 `npm run test:workbench-user-isolation`、`npm run test:workbench-auth-http` 和既有工作流回归。

上线前先执行一次备份，再在每台试用电脑通过最终 HTTPS 域名完成以上浏览器验收。

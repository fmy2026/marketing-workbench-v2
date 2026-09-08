# TASK-MWBV2-GENERIC-RUNTIME-MECHANISM-20260908 验收证据

## AC-01

`npm run test:workbench-address` 通过：替代 Case 重复启动只返回同一 Case，替代创建调用为 `1`，平台创建调用为 `0`。`npm run test:case-attempt-limit` 通过：普通 Case 上限仍为 `3`，替代 Case 与 Plan 上限均为 `1`，平台写入为 `0`。

## AC-02

`npm run test:guide-video-readonly`、`npm run test:guide-video-payload` 与 `npm run test:std-project-readback` 均通过。payload 回归以普通测试 bundle 加内存 capability 开关覆盖关闭与开启：开启时两条视频都有 `guide_video_id` 与 `video_cover_id`，ledger 路径数为 `96`；关闭时不发送引导视频字段，ledger 路径数为 `92`。三个回归的外部平台创建调用均为 `0`。

## AC-03

`npm run test:project-contracts` 通过 80 个场景，包含 capability 分支允许、运行期账户 ID 默认值拒绝和账户 ID 条件分支拒绝；该检查不访问真实数据库或平台。

## AC-04

`npm run check:project -- --phase start` 已通过。`npm run test:monitor` 通过；`git diff --check` 通过。关闭前与关闭后项目合同检查见本任务完成步骤。

## AC-05

LaunchAgent `com.hys.marketing-workbench.local-server` 已用 `launchctl kickstart -k` 重启。服务日志确认监听 `http://192.168.42.7:3000/`；使用 `curl --noproxy '*'` 对该 LAN 入口的只读探测返回 HTTP `200`。未触发任何平台创建或其他外部平台写入。

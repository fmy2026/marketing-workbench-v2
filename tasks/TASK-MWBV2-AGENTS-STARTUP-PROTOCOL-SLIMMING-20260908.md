# TASK-MWBV2-AGENTS-STARTUP-PROTOCOL-SLIMMING-20260908

状态：completed_without_runtime_or_platform_changes

更新时间：2026-09-08 14:46 CST

## 目标

将根 `AGENTS.md` 收敛为所有协作者每次进入项目都必须读取的短启动协议，只保留启动顺序、文档路由、真值、不可突破的权限安全边界和任务闭环；工作台、Gate、Node、Plan、数据与部署细节继续由各自权威文档承载。

## 已批准边界

- 以用户批准的“最终 `AGENTS.md` 预期内容与迁移清单”为方案来源。
- 不修改运行代码、Schema、View、API、Postgres 业务事实或平台状态。
- 不新增、确认或执行任何平台 Plan/action，不刷新 OAuth token，不触发平台读写。
- 不删除当前逻辑图、数据契约、经验或部署文档中的既有权威内容；根协议只引用，不复制。

## 实施与验收

- 根协议删除当前 Task、最新 migration、网络地址、具体 Gate/状态机、回查时序、路线参数和资源实现细节。
- 根协议保留启动读取顺序、按需文档路由、真值链、最小架构约束、权限安全边界和任务闭环。
- 确认所有被移除的长期有效内容已由 `docs/project-现在的逻辑图.md`、`docs/project-数据与报表契约.md`、`docs/project-lessons.md` 或 `deploy/README.md` 承载。
- JSON、Markdown、引用路径、敏感内容扫描与 `git diff --check` 通过。

## 停止条件

- 需要改变运行行为、数据库合同、平台权限或动态业务事实。
- 迁移目标缺失，导致删除根协议内容后没有权威承载位置。
- 需要写入任何凭据、完整触点 URL、raw request/payload/response 或动态业务对象状态。

## 实施结果

- `AGENTS.md` 已从 153 行收敛为 89 行，只保留启动、文档路由、真值、最小运行约束、权限安全与任务闭环。
- 已移除当前 Task/migration、部署地址、具体 Gate/恢复分支、回查时序、OAuth 降级、JSZC 参数和资源实现细节；对应内容继续由当前逻辑图、数据契约、经验和部署文档承载。
- 已补充“一个长期规则只设一个权威位置”以及功能细节变化不默认更新根协议的文档治理规则。
- 已通过 JSON 解析、引用路径、迁移覆盖、动态细节扫描和 `git diff --check`；未修改运行代码、Schema、View、API 或 Postgres，真实平台读写为 0。

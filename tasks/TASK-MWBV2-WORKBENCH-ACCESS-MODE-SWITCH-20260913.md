# TASK-MWBV2-WORKBENCH-ACCESS-MODE-SWITCH-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-WORKBENCH-ACCESS-MODE-SWITCH-20260913.json)。

## 目标

为工作台增加本机和公司共享两种显式部署模式，使用户日常从根地址登录并选择 Agent，同时在公司网络下可用经验证的当前内网 IP 供同事登录。

## 批准方案

保留一个 LaunchAgent 和一个工作台服务。`local` 模式固定 `http://127.0.0.1:3000`；`company` 模式要求显式传入当前 Mac 已分配的 RFC1918 IPv4，设置同一 IP 的监听与公开地址，并显式启用私网 HTTP。切换失败必须恢复前一份 LaunchAgent 配置。

## 范围

- 新增长期公开的部署切换命令和无副作用 smoke。
- 更新 package 入口、部署样例、部署说明和有效决策索引。
- 应用并验证本机模式；公司模式仅作无副作用配置及逻辑验证，保留异机验收。

## 非目标

- 不新增业务 API、数据库迁移、业务 Case/Job/Plan 状态或平台写入。
- 不在家庭网络实际开启公司共享模式，不读取或输出凭据。
- 不解决跨网络访问或独立服务器部署。

## 验收

- AC-01: 项目启动检查通过。
- AC-02: 根地址、登录后的 Agent 广场和既有 Agent 深链接回归通过。
- AC-03: 部署模式命令的 local、company、非法地址和未分配地址分支均被 smoke 覆盖。
- AC-04: 实际 local 模式应用成功，根地址返回 200、未登录接口返回 401，LaunchAgent 保持自动恢复。
- AC-05: 项目合同 smoke、关闭检查和 Git 空白检查通过；提交直接推送 origin/main 并核验 SHA。

## 停止条件

- 切换失败无法恢复原配置、破坏 Host/Origin 校验或服务不能恢复。
- 公司模式需要访问非 RFC1918 地址、非本机地址或引入新网络权限。

## 交付说明

公司异机登录只能在公司 Wi-Fi 下实际验收；本 Task 记录为待现场验收，不将本机模拟替代为同事可用证据。

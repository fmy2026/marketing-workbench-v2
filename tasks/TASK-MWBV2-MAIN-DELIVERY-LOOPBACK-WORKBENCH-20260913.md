# TASK-MWBV2-MAIN-DELIVERY-LOOPBACK-WORKBENCH-20260913

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-MAIN-DELIVERY-LOOPBACK-WORKBENCH-20260913.json)。

## 目标

将 GitHub 交付固定为直接推送 `origin/main` 的 Git CLI 流程，并恢复本机工作台的稳定 loopback 入口 `http://127.0.0.1:3000/agents/launch-creation`，使 Wi-Fi 切换不再导致服务无法监听。

## 批准方案

用户批准复用既有 Git credential helper，直接在本地 `main` 提交并正常推送 `origin/main`，不创建分支或 PR、不强推。工作台使用 loopback 地址，保留 LaunchAgent 的开机启动和崩溃重启；多人局域网访问另行显式配置。

## 范围

- 在启动协议中记录 GitHub 直推 `main` 的凭据和远端核验规则。
- 将本机工作台 LaunchAgent 与仓库部署样例改为 loopback 配置，并更新部署说明及有效决策索引。
- 重新加载现有 LaunchAgent，验证页面、登录保护、数据库只读连通性与受控重启恢复。

## 非目标

- 不读取、输出、替换或提交 GitHub 凭据。
- 不新增 API、数据库迁移、业务流程或平台写入。
- 不启用公司或家庭局域网多人访问，不推进业务 Case。

## 验收

- AC-01: 项目启动检查通过，Task 范围与当前 `main` 基线一致。
- AC-02: 工作台地址与网络策略 smoke 通过。
- AC-03: loopback 工作台页面可打开，未登录 API 保持登录保护，数据库可只读连接。
- AC-04: 重启工作台进程后 LaunchAgent 自动恢复并持续监听 `127.0.0.1:3000`。
- AC-05: 项目合同 smoke、关闭前后检查和 Git 空白检查通过；提交直接推送 `origin/main` 后远端 SHA 与本地一致。

## 停止条件

- loopback 配置不能维持登录、Host/Origin 校验或工作台进程无法稳定重启。
- 需要开放多人网络访问、修改业务数据或扩大平台权限。

## 交付说明

完成后只保留固定本机入口与 Git 交付规则。实际 Wi-Fi 切换未在本轮主动断网时，记录为未直接模拟的物理环境验证。

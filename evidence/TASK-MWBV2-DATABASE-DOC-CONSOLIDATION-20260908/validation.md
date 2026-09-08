# 数据库文档归档验收

## Documents

- 字段命名、`text/jsonb`、平台 App 唯一来源核对了 migrations 002、004、010；固定抖音号快照与来源核对了 043；创建字段与静态参数核对了 048、069、074。
- 仓储 `PostgresRepository` 默认库、构造参数与 `runPsql` 已静态核对；`MWBV2_DATABASE_NAME` 仅被备份脚本读取，不声明它能配置应用连接。
- 备份入口、custom dump 参数、归档目录校验、权限、清理规则与每天 02:20 的示例分别核对了 package、备份脚本和 LaunchAgent；未执行备份或恢复。
- 旧数据库说明必要内容已并入数据契约；该文件及补充批准删除的两份历史方案，其原文 SHA-256 与 Git 基线见 [静态审计](static-audit.json)。过期命令及早期迁移清单没有复制。
- 当前 AGENTS、Solution Design、逻辑图、Lessons 和部署说明以数据契约为数据库说明入口；历史经验中的接口验证与业务流程仍保留，数据库字段/存储定义改为章节引用。
- 76 个当前文档及新 Task 的本地链接/章节有效；当前入口、检查器和模板无旧文件依赖。历史任务中的旧路径属于历史记录，按当时 Git 版本追溯。

## Regression

`npm run test:project-contracts` 实际通过 62 项，完整输出见 [回归输出](regression.txt)。新增 7 项：两个数据库运维路径各覆盖遗漏数据上下文、关闭时遗漏文档处理、补齐后完整闭环；另验证普通应用部署不误触发数据领域。所有用例使用临时 Git fixture，不连接数据库或平台，不执行配置文件中的命令。

## Scope

[静态审计](static-audit.json) 确认旧 Task/Manifest、其他历史资料、业务代码、SQL、Schema 实现与部署配置均未修改，guardrails 与基线深比较一致。三份获批删除的文档均可由 Git 原文校验，`git diff --check` 通过。

## Lifecycle

真实任务的 [启动](start.json)、[关闭前](before-close.json)、[关闭后](after-close.json) 保存最终执行输出。

执行期间曾因外部删除 plan1、plan2 历史文件而报告 `write_outside_scope`，随后重新打开任务为 blocked 并询问用户。用户明确确认“保留删除并纳入本次收口”，因此在保留原始基线的前提下更新批准 Task 与允许路径；两份原文通过 Git SHA-256 核验。补充授权后重新执行启动、关闭前和关闭后检查，不把外部删除偷偷记为既存基线，也不覆盖用户的删除。

# TASK-MWBV2-CURRENT-LOGIC-DOC-CONSISTENCY-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CURRENT-LOGIC-DOC-CONSISTENCY-20260911.json)。

## 目标

将当前逻辑图精简为易读的唯一底层机制总览，并让它、数据与报表契约及 Solution Design 的静态元信息与当前 `085` Schema 基线一致。

## 批准方案

用户已批准：仅进行文档与任务合同修正，不修改代码、Schema、Postgres 运行数据、平台行为或长期自动化。逻辑图保留唯一闭环、7 Node、runner mode、资源四态、Plan 不变量、Case Gate 与权威索引；品牌条件字段改用三态摘要，工作区与模型配置收敛为稳定边界。Schema 编号与文件数只由数据契约保存，逻辑图和 Solution Design 改为引用该唯一入口。

该选择延续 [Solution Design](../docs/Solution%20Design.md) 的“当前逻辑图分层”决策：总览解释机制，不复制实现流水、动态状态或数据库合同。

## 范围

- 更新 `docs/project-现在的逻辑图.md` 的机制表述、冗余细节与元信息。
- 更新 `docs/project-数据与报表契约.md` 的唯一 Schema 基线至 migration `085`。
- 更新 `docs/Solution Design.md` 的元信息，移除重复的 migration 编号。
- 建立、完成本 Task/Manifest 并更新项目任务指针。

## 非目标

- 不修改 `src/`、`frontend/`、`db/`、部署配置、Schema、测试或平台执行入口。
- 不连接外部平台，不创建、确认、重试或修改业务对象。
- 不把账户、Case、Job、Plan、凭据、原始请求或响应写入 Markdown。
- 不新增长期经验、校验器或自动化。

## 验收

- AC-01: 逻辑图保留所有批准的稳定机制，清楚说明统一 Plan-bound 执行层、7 Node、6 种 mode、资源四态、Plan/Gate 边界与权威来源；文本比基线更精简，且不形成第二套状态机或数据库合同。
- AC-02: 三份当前文档的元信息一致；仅数据契约保存当前 migration 文件数、编号与最新文件，且正确反映 86 个 SQL 文件、编号至 `085`。
- AC-03: 静态注册表和只读数据库投影与文档一致；链接、差异与指定 smoke 测试通过，项目合同三阶段检查完成。

## 停止条件

- 需要修改运行代码、Schema、Postgres 数据、平台授权或外部平台才能让文档成立。
- 核验发现 7 Node、mode、资源能力、Gate 或 Schema 当前事实与已批准范围无法兼容。
- 任何内容需要记录动态业务事实或敏感信息。

## 交付说明

完成后交付三份同步的当前文档及可定位的 Task/Manifest 验收记录；不产生业务或平台副作用。

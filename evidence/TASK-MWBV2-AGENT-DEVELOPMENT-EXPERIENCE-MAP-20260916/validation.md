# 文档任务验收证据

## AC-01

对开始基线的全部 277 份历史 Task 及 277 份 Manifest 做文本扫描、日期归并和指纹核对；554 份原文与 Git 基线及当前文件一致。237 份有 Manifest 创建日期，32 份采用 Task 记录日期，8 份仅有 Git 首次入库日期。日期不确定性、旧 status、实验与正式运行的区分见 [复盘依据](source-review.md)，逐文件信息见 [全量索引](task-index.json)。

实际方法：Python 读取 Task/Manifest，结合 git log --reverse --diff-filter=A 取首次入库时间，git ls-tree 校验覆盖，git cat-file --batch 校验开始基线原文及 SHA256；关键任务与已有验收证据逐项回读。未重跑历史验收、未查询当前业务数据库。

## AC-02

正文可见汉字 2201 个（去掉 Markdown 链接目标后统计 CJK 字符，包含标题、图表标签）；两张 Mermaid 图、三张 Markdown 表。按批准顺序呈现需求理解、时间线、重做顺序、七维度、扩展结构、人机分工与阶段通过标准。三个完成层次明确，数据报表段落明确属于未来项目思考。

实际方法：Python 检查数量与主题覆盖；人工复核正文及 Mermaid 源码的节点、连线和图文语义。未执行 Mermaid 渲染器，不声称完成截图级视觉验收。

## AC-03

检查正文、方案索引、本任务和复盘依据的 136 处本地 Markdown 引用，均可定位；复盘依据中的 Task 标识全部存在。两张图分别描述开发过程、产品模块与数据职责。研究、编程、业务执行的不同验收方式均在正文说明。固定七节点、Postgres、多 Agent 均不作为通用要求；没有声称已完成多游戏/多媒体适配或量化效率收益。

实际方法：Python 解析本地链接并检查文件/章节；人工对照用户批准方案、关键 Task、当前合同和方法参考。自动检查不能替代经验适用性的判断。

## AC-04

启动检查通过，输出见 [start.json](start.json)。静态检查核对业务代码、SQL、Schema、部署、AGENTS、当前逻辑图、数据契约和原 project-lessons 均未改动，guardrails 与开始基线逐字段一致；git diff --check 通过。结果见 [static-audit.json](static-audit.json)。仅新增方法文档、方案决策入口、任务合同及证据。

关闭前与关闭后输出只在实际执行后保存并补记，Git 提交推送与远端 SHA 由交付时实际结果核验，不提前声明。

## 局限

这是对已有资料的开发经验复盘；早期记录不完整或仅有总结性验收的情况保留原貌。没有对当前业务状态、历史成功的可重复概率或方法带来的效率提升作在线验证。用户指定的知识库文件保持只读。

## 实际关闭

关闭前与关闭后检查均已实际执行并通过，输出见 [before-close.json](before-close.json) 与 [after-close.json](after-close.json)。Manifest 已为 completed，active_task 已清空，last_closed_task_ref 指向本任务。未修改权限或业务状态。

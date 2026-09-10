# TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-LESSON-20260910 验证证据

所有结论均为通用机制与文档复核；未调用外部平台，未写入任何账户运行事实。

## AC-01 task-startup

- 时间：2026-09-10T03:55:34Z
- 方法：`npm run check:project -- --phase start`
- 结果：通过。基线为 `9a29e3c71f9305bc907540d325beca5cbe6c6a79`，启动后的变更均在 control 域允许范围内。

## AC-02 lesson-content-and-boundary

- 方法：审阅 `docs/project-lessons.md` 中案例模板之前的“JSZC 引导视频：当前 Job 缓存绑定”段落，并对照 `canonicalGuideVideoReadiness`、缓存入口和当前设计决策。
- 结果：通过。经验只记录 Job/实例双重绑定、失配时一次 readonly、同 Job 三种状态复用、回归矩阵及不适用边界；未记录任何账户、Case、Job、资源动态值或原始传输内容。

## AC-03 generic-mechanism-regression

- 方法：`npm run test:guide-video-readonly` 与 `git diff --check`。
- 预期：旧 Job 与错误实例缓存失效并重新探测；同 Job 的 `passed`、`not_required`、`blocked` 不重复探测；文档差异无空白错误。
- 结果：通过。smoke 报告旧 Job 与错误实例各 1 次 `gameplay/list` 调用，同 Job `passed`、`not_required`、`blocked` 均为 0 次重复调用，平台创建调用为 0；`git diff --check` 无输出并以零退出。

## AC-04 closure-and-publication

- 方法：`npm run check:project -- --phase before-close`、`npm run check:project -- --phase after-close` 与普通 `git push origin main`。
- 结果：`before-close` 与 `after-close` 均通过；四项验收证据、control 范围和文档更新声明完整，Task 已转为 `completed` 并清空 `active_task`。随后以普通提交推送 `origin/main`，不改写历史。

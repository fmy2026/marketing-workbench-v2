# TASK-MWBV2-APPEND-VIDEO-INPUT-20260914 验收证据

验证时间：2026-09-14 UTC。

- AC-01：`npm run test:workbench-client-pages` 通过。项目推荐卡为 grid 布局；浏览器回归覆盖推荐项目选择，长内容按卡片布局换行。
- AC-02：`npm run test:launch-request` 与 `npm run test:workbench-conversation` 通过。`4iLE-2,4iG2-18`、空格、顿号、分号和换行的列表均可识别；带标签列表在后续账户字段前停止解析。
- AC-03：`npm run test:launch-request` 与 `npm run test:workbench-auth-http` 通过。重复、非法、101 条和纯数字无标签列表均不可启动；有效项目匹配不再覆盖素材格式错误。
- AC-04：`npm run test:workbench-client-pages` 通过。自然语言输入为多行框，粘贴换行被保留，Enter 发送，Shift+Enter 和输入法 Enter 不发送；`npm run test:project-video-append` 也通过。

专项命令 `npm run check` 与 `npm run validate` 在当前 `package.json` 中不存在，未作为验证执行。隔离 HTTP／页面测试读取本机 Schema 并使用临时测试数据库；未写入业务数据库，未调用真实平台写入。

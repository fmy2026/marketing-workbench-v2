# TASK-MWBV2-OE3-NODE4-RESOURCE-PROBLEM-SOLVING-PLAYBOOK

状态：closed_success

## 目标

将 Node 4 头像与 DMP 的真实问题处理经验沉淀为项目级 lessons 文档，并在 `AGENTS.md` 建立简洁入口和真值边界。

## 范围

- 新增 `docs/project-lessons.md`。
- 更新 `AGENTS.md` 的项目经验入口与目录职责。
- 建立头像、DMP、后续资源问题共用的案例格式。

## 非目标

- 不调用平台接口，不上传头像，不推送 DMP，不创建广告。
- 不改动数据库 schema、运行代码、历史任务结果或当前视频素材 Gate。
- 不在案例库保存账户 ID、job ID、凭据、raw request/response 或完整 URL。

## 结果

| 项 | 结果 |
| --- | --- |
| Lessons | 已新增，包含通用决策框架、头像案例、DMP 案例与新案例模板。 |
| 启动协议 | 已简洁关联 lessons，并以运行真值与当前实现为准。 |
| 权限 | 无平台读写；关闭后 `active_task=null`，平台写权限保持关闭。 |

## 验证

- `npm run test:avatar-executor`
- `npm run test:dmp-executor`
- `npm run test:dmp-readback`
- `npm run test:resource-action-registry`
- `git diff --check`

以上均通过；测试同时确认不保存 raw response，且没有真实平台写入或 token refresh。

文档定位修正：案例库由被默认忽略的 `docs/.参考文档/workflow/` 移至 Git 可追踪的 `docs/project-lessons.md`；其他参考资料继续保持忽略。

## 下一 Gate

保持不变：新建账户视频素材 Node 4 只读/保底推送任务，优先处理 `JSZC-HUNT-4IG2-3` 并同步核验 `JSZC-HUNT-4GE6-14`。

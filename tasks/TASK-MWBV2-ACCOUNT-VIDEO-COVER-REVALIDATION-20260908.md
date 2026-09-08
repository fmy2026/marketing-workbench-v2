# TASK-MWBV2-ACCOUNT-VIDEO-COVER-REVALIDATION-20260908

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-ACCOUNT-VIDEO-COVER-REVALIDATION-20260908.json)。

## 目标

让账户 `1867508089433225` 的 owner 重新输入推广路线 `oceanengine_3_byte_mini_game`、游戏标识 `JSZC` 和账户 ID 后，沿工作台现有唯一写入机制幂等进入一个最大创建次数为 1 的替代 Case；fresh Job 在确认前核验两条视频、各自封面和唯一引导视频，创建 payload 与创建后回查均验证 `video_id + video_cover_id + guide_video_id` 绑定。

## 批准方案

用户批准只修正本账户的视频关联，并确认此前列出的其他投放设置差异合理、不在本次修改范围。旧 Case `CASE-MWBV2-776936E13CC487A466` 与三次失败 action 保持不变；写入脱敏批准结论 `video_cover_binding_v1`，由原 owner 重新提交三项时关闭旧 Case并幂等建立唯一替代 Case。替代 Case 沿现有 3 阶段 7 Node、Plan-bound executor 和精确确认短语运行，`maximum_create_attempts=1`，不新增 Node、Gate、Plan 类型、action 类型或确认短语。

## 范围

允许增加账户级“视频封面必需”能力合同并只为目标账户启用；复用现有人工复盘与替代 Case 事务，把重新输入三项的启动入口接入该事务；补强 fresh readonly、payload 和 Node 07 权威回查；通过受控维护入口写入目标旧 Case 的脱敏批准证据；完成自动测试、数据库迁移与应用部署。精确文件路径以 Manifest `allowed_writes` 为准。

## 非目标

不修改已确认合理的投放配置差异；不对旧 Case 创建第 4 条 action；不复制旧 Draft、Plan、confirmation 或幂等键；不自动确认、不自动重试、不由管理员或开发代理代账户 owner 执行真实创建；不在开发或自动测试中进行真实平台写入。

## 验收

- AC-01: 目标旧 Case 在实施后仍为 3/3、三条创建 action、零创建对象和零 verified readback；脱敏人工复盘批准结论为 `video_cover_binding_v1`，没有 raw 请求、payload、响应或敏感 URL 入库。
- AC-02: owner 重新输入三项并启动时幂等返回同一个替代 Case/Job，旧 Case转为不可执行终态，替代 Case 的 `maximum_create_attempts=1`；非 owner、未批准、重复提交均不能产生额外 Case/Job。
- AC-03: 目标账户的 fresh Job 必须只读核验两条视频、两个封面和唯一引导视频；任一缺失、不可见、非当前 Job 回查或关联不一致都在确认前阻断。
- AC-04: 新创建 payload 的两条视频均包含 fresh 验证的 `video_id`、`image_mode`、`video_cover_id`、`guide_video_id`，不改变其他已批准业务字段。
- AC-05: Node 07 只有在两条视频的 `video_id + video_cover_id + guide_video_id` 均经权威回查匹配后才写 verified；`40000` 或任一失败都停止且不允许第二次创建。
- AC-06: schema、Case、conversation、payload、readback、runtime policy 与项目合同测试通过，开发和自动测试的真实平台写入次数为 0。
- AC-07: 数据库 migration 和应用部署完成；不代账户 owner 发起真实创建，部署后的唯一剩余步骤是 owner 重新输入三项并精确确认一次。

## 停止条件

任何路径需要在开发/测试中调用真实 `std_project/create`、需要旧 Case 第 4 次 action、需要第二次替代创建、需要弱化 owner/Plan/confirmation/readback 校验，或需要保存 raw 平台请求/响应、凭据及完整敏感 URL 时立即停止。

## 交付说明

已完成代码、migration、目标旧 Case 的受控批准证据、应用部署和自动验证；证据见 [validation](../evidence/TASK-MWBV2-ACCOUNT-VIDEO-COVER-REVALIDATION-20260908/validation.md)。真实业务创建仍由账户 owner 在工作台重新输入三项后执行一次，本开发任务不把尚未发生的业务创建冒充为 verified。

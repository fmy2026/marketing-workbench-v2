# TASK-MWBV2-OE3-JSZC-BACKUP-LANDING-PAGE-SHARE-READBACK-1871922434025472-20260831

状态：completed_backup_landing_page_ready

## 目标

在目标账户完成外部同站点共享后，执行一次 JSZC 备用落地页只读回查并收口 Node 4；本任务不调用任何平台写接口。

```text
游戏级默认页
→ 来源物料户 site/get
→ 目标普通库存 site/get（诊断）
→ 目标共享库存 site/get?share_type=SHARE（权威）
→ 同一 site_id + SHARE + 可用状态 + hash 一致
→ backup_landing_page = visible + readback_verified
```

## 范围

- 绑定现有 JSZC workflow Case；创建一条 fresh `resource_readonly_inventory` Job。
- 只读调用 `GET /open_api/2/tools/site/get/`：来源、目标普通库存和目标共享库存。
- `GET /open_api/v3.0/tools/orange_site/get/` 仅辅助诊断；其失败不覆盖三次 `site/get` 的主结论。
- 回查通过后只写 Postgres 脱敏审计：`launch_skill_runs`、`account_resources`、`evidence_artifacts` 与 Job 状态。
- 固化手动同站点共享的自动发现/回查机制；备用页继续 `prepare_supported=false`。

## 禁止范围

- 不调用 `POST /open_api/2/tools/site/handsel/`；该接口是转赠复制，不是同站点共享。
- 不调用任何 `site/create`、`site/update`、`site/update_status`、复制、共享、项目、Promotion、预算、出价或 token 刷新接口。
- 不保存完整 URL、raw request/response、token、Cookie、secret 或截图。
- 不将“普通库存同 ID”当作手动共享成功；只接受 `share_type=SHARE` 的同站点命中。

## 来源缺失分流

来源默认页缺失时，本 Task 立即 `BLOCKED`。后续必须另建“来源页创建”专项 Task，并先具备受控站点模板、`bricks`、本地素材映射及发布合同；仅图片文件不能触发 `site/create`。

## 验收

- 来源默认页唯一且状态可用。
- 目标共享库存命中同一默认 `site_id`，`share_type=SHARE`，状态可用，来源/目标 hash 一致。
- `account_resources.backup_landing_page` 为 `visible + readback_verified`。
- 平台 POST、token 刷新、`platform_actions` 写入数均为零。
- 任务结果及项目经验只记录脱敏事实和接口路径。

## Solution Link

- source：`docs/Solution Design.md` 的“单模块专项走通与机制收口”；`docs/project-lessons.md` 的备用落地页经验。
- current truth：Postgres `mwb.workflow_case_summary`、`mwb.account_resources`、本 Task Manifest 与本次平台只读结果。
- stop condition：来源默认页缺失/不可用、目标共享库存未命中、share type 非 `SHARE`、状态不可用、hash 不一致、任一主 `site/get` 失败或凭据不可用。

## 执行收口

- 已创建只读 Job：`JOB-MWBV2-BACKUP-LANDING-INVENTORY-20260831022446-99236A`，结果为 `passed / target_already_usable`。
- 三次主 `site/get` 均业务成功：来源默认页可用；目标普通库存为 0；目标共享库存唯一命中同一站点，`share_type=SHARE`、状态 `AUDIT_ACCEPTED`、来源/目标 hash 一致。
- `orange_site/get` 仅返回辅助诊断失败，未影响主库存回查结论。
- 未发生平台 POST、token 刷新或 `platform_actions` 写入；仅保存脱敏运行、资源与证据记录。
- `account_resources.backup_landing_page` 已为 `visible + readback_verified`。其他 Node 4 资源仍须由 fresh Job 按各自合同继续判断，本 Task 不扩大其状态。

# TASK-MWBV2-EVENT-CONFIG-POST-CREATE-READBACK-20260906

状态：completed

## 目标

避免 event config 全部创建成功后因平台最终一致性延迟被单次即时回查误判为 `event_configs_baseline_missing`，并通过既有 fresh readonly Gate 恢复当前 Case。

## 范围

- 仅在本轮所有 event config create action 成功后执行绝对 `0/1/3/5` 秒只读回查，命中即停。
- 保存脱敏的回查 attempt 数、最终耗时和最终状态；不保存 raw request/response。
- 增加首次 5/6、后续 6/6 的 mock 覆盖，以及窗口耗尽的 fail-closed 覆盖。
- 重启服务后，对 `CASE-MWBV2-7F8C748BE84126BE77` 执行一次精确“重新只读准备”。

## 禁止

- 不重试任何 create，不复用已 consumed Plan、confirmation、action grant 或 idempotency key。
- 不自动确认 fresh Plan，不新增 Schema、API、Plan/action 类型或确认短语。
- 不放宽事件链、App/实例绑定、optimized goal 或 deep bid 权威回查。

## 验收

- 最终一致性模拟在第二次或后续回查转为 READY，create 次数保持原计划值。
- 窗口耗尽仍返回原 blocker 并完成终态收口。
- 当前 Case 生成 fresh Job，并停在未确认 Plan 或唯一真实 blocker；本 Task 平台写入为 0。

## Solution Link

`docs/Solution Design.md` 的“2026-09-06 Event Config 创建后有界回查（已批准）”。

## 完成证据

- 生产事实确认 6 个 event config create action 均为 HTTP 200 / `api_code=0`；即时回查为 5/6，稍后只读为 6/6。
- executor 仅在全部 create 成功后按绝对 `0/1/3/5` 秒执行有界事件链只读回查，命中即停；create 失败、超时和结果不明路径不进入。
- mock 最终一致性场景在第 2 次回查转为 READY，create 次数保持 6；窗口耗尽仍返回 blocker。
- 精确“重新只读准备”已创建 fresh Job `JOB-MWBV2-20260906105619-04E8AC`；旧 Plan、confirmation 与 action 未复用。
- fresh readonly 确认 event configs 6/6、optimized goal 与 DBT 通过；Resource V1 为 ready，只含头像、DMP、视频和产品图，平台 action 数为 0。
- 当前 Case 停在 `await_job_write_authorization`，root blocker 为空，确认短语为“确认准备资源”。

完成时间：2026-09-06 18:57 CST

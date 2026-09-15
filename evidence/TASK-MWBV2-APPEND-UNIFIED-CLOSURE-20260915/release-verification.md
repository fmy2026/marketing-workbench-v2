# 发布验收快照

核验时间：2026-09-15 12:50 CST。

- `origin/main` 与 release 都为 `c0c701cb696b690e7d90ad4ba2bb6d60c7592378`。
- LaunchAgent 工作目录指向该固定 release，状态为 active。
- 原 Case 页面返回 HTTP 200；在线 `app.js` 与 `styles.css` 的 SHA-256 均与 release 文件一致。
- 业务库只读核验：`CASE-MWBV2-5389271163DB6B8730` 的 Gate 为 `project_video_append_completed`，其 Job 的通过节点为 `7/7`。

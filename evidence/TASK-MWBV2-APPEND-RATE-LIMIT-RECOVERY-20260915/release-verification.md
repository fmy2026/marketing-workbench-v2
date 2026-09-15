# 发布验收快照

核验时间：2026-09-15 12:26 CST。

- 已提交并推送 `a7836453f0a62b16f0ce01a25509f4231ef20606`；`origin/main` 指向同一 revision。
- 固定 release 根目录为 `.local/releases/a7836453f0a62b16f0ce01a25509f4231ef20606`。
- 公司模式已重载至 `http://192.168.42.7:3000`；`/agents` 返回 HTTP 200，LaunchAgent 工作目录指向该 release。
- 在线 `/app.js` 和 `/styles.css` 的 SHA-256 分别与 release 中同名资源完全一致。未执行新的真实平台追加调用。

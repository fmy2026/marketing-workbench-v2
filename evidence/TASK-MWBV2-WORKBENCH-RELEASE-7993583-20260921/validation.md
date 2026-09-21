# 发布与页面复核证据

## 发布前

- 当前 Git 与 `origin/main`：`7993583d023b977183ed4d161d53a54f8fb46416`。
- 运行中的 LaunchAgent 工作目录：`.local/releases/66a0b1e25f20a96f5346487da333286b9170e38a`。
- 当前模式：公司共享模式，根地址 `http://192.168.42.7:3000/`。

后续记录发布、根地址和浏览器实际页面的核验结果。

## 发布结果

- `npm run workbench:release` 生成 release：`7993583d023b977183ed4d161d53a54f8fb46416`。
- 旧 `66a0b1e` 脱离 LaunchAgent 的 Node 进程占用端口，首次切换自动回滚；卸载旧 Agent 后重新按既有公司模式注册成功。
- 当前 LaunchAgent：`com.hys.marketing-workbench.local-server`，工作目录为 `.local/releases/7993583d023b977183ed4d161d53a54f8fb46416`，状态 `running`。
- `http://192.168.42.7:3000/` 返回 HTTP 200。

## 页面与样式核验

- 运行服务的 `/market-intelligence.css` 返回 HTTP 200、`Cache-Control: no-store`；其 SHA-256 为 `4786aa491f5d1fdfd7a1a74a04db04bdca5b3f728812c519e33135d832133ffc`，与该 release 文件完全一致。
- 已发布 CSS 包含桌面壳层的 58px 顶栏、216px 侧栏、22px 标题与 40px 输入框规则；与先前完成的实际 Chromium 尺寸对比保持同一规则集。
- `node tests/market-intelligence.test.mjs`：通过 129 项隔离浏览器与接口回归，无外部请求。
- Codex 内置浏览器连接不可用，隔离 Chromium 截图在无显示环境未能生成图像；因此本次以实际服务响应、无缓存头和既有浏览器回归完成发布复核。访问中的浏览器刷新后会重新请求新 CSS。

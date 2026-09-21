# 市场情报文案排版对齐证据

## 修正前

- 实际服务已返回当前 release 的市场情报 CSS，`Cache-Control: no-store`。
- 市场情报对话标题为 22px，投放执行 `.panel-title h2` 为 16px；市场情报用户名额外使用 `font-weight: 650`，侧栏导航额外使用 `line-height: 1.3`。

后续记录最终声明、浏览器回归和发布核验。

## 最终修正

- 桌面市场情报对话标题：`16px / 1.3 / letter-spacing: 0`；在 1024px 及以下为 15px，与投放执行同一断点一致。
- 用户菜单触发器：`13px / font-weight: 400`。
- 侧栏导航：`13px / line-height: normal`。
- 消息正文、状态说明、快捷按钮、输入框、窄屏隐藏侧栏和折叠规则未改动。

## 验证与发布

- `node tests/market-intelligence.test.mjs`：通过 129 项隔离浏览器与接口回归，`externalRequests: 0`。
- `git diff --check`：通过。
- 已提交 `760b0172e9077d36c9644cf77a63bcc1356d7c7a` 并生成同 SHA 的 release。
- 当前公司共享 LaunchAgent 工作目录为 `.local/releases/760b0172e9077d36c9644cf77a63bcc1356d7c7a`，状态 `running`。
- 实际服务的 `/market-intelligence.css` 返回 HTTP 200、`Cache-Control: no-store`，SHA-256 为 `d0118a3ec59681460e48b68f9e339391f48c30a9147cdea645d2ae470b9d42d8`，与 release 文件完全一致，并包含三项最终规则。
- Codex 内置浏览器连接不可用；无登录的隔离 Chromium 会被服务端重定向，不能读取工作区 DOM。实际服务 CSS、既有隔离浏览器回归和发布目录共同证明该修正已生效。

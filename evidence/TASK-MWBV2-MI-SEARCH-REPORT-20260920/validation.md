# 市场情报「查找素材 → HTML 月报」验收记录

验证时间：2026-09-20 CST。所有合成夹具只使用临时 loopback 服务、临时凭据和合成素材；不访问公共电脑，不保存 Token、原始响应或外部视频地址。

| 验收 | 已验证证据 | 结果 |
| --- | --- | --- |
| AC-01 | 无头 Chrome 在已登录合成工作台中查询素材；`mi-search-desktop.png` 验证四列，`mi-search-mobile.png` 验证两列、固定输入框及分页不重叠。 | 通过（合成界面） |
| AC-02 | `node tests/market-intelligence.test.mjs`：结构化查询、自然语言条件、分页状态、用户连接隔离、Range 视频代理和 MP4/WebM MIME 共 65 项。 | 通过（合成接口） |
| AC-03 | `node tests/market-intelligence-report.test.mjs`：0 纳入、null 与跨月排除、样本上限、轮流选样、候选未遍历完成及无样本失败。 | 通过（合成接口） |
| AC-04 | 同上验证模型非法输出、无用户原文依据的查询槽位、超时、恶意脚本指令回退；`npm run test:agent-model-config` 验证通用模型配置链。 | 通过（合成接口） |
| AC-05 | Chrome 编辑摘要并触发下载；`/private/tmp` 的下载 HTML 为 3,099 bytes，扫描无 script、HTTP URL、Token、Bearer、session 或 private 路径。 | 通过（合成浏览器） |
| AC-06 | `npm run test:agent-hub`、`npm run test:agent-model-config` 和 `npm run test:workbench-client-pages` 均通过；后者执行既有投放执行浏览器流程。 | 通过（回归） |
| AC-07 | 已留存合成页面截图和导出验证。公司共享 LaunchAgent 正运行 release `b70e3cfa368e3aefb75bf7afcbdbcd03a2070110`，内网首页返回 HTTP 200；本 Task 未读取任何用户数据连接或模型凭据，因此尚不能作真实公共电脑查询、MP4/WebM、已启用模型的验收。 | 待真实联调 |

2026-09-20 增量实现验证：`node tests/market-intelligence.test.mjs` 通过 77 项，覆盖发现当前候选中的真实游戏名、候选分页、单素材重新读取后的确定性证据解读、无模型状态与连接隔离；`node tests/market-intelligence-report.test.mjs` 通过 32 项，覆盖候选游戏去重、零值/缺失、人为不安全模型输出和模型单素材观察。`npm run test:agent-model-config`、`npm run test:agent-hub`、`npm run test:workbench-client-pages` 与 `npm run test:workbench-conversation` 均通过。所有结果仍为合成夹具；真实公共电脑验收状态不变。

2026-09-20 页面壳层增量验证：`node tests/market-intelligence.test.mjs` 通过 91 项，新增“查看当前已采集的游戏和素材”优先发现意图，以及六模块和纯自然语言输入的静态回归。隔离的已登录 Chrome 页面实际验证了顶部配置入口、六项导航、候选发现网格、真实响应游戏名、详情视频入口和 2026-09 样本月报操作；窄屏 `390×844` 下返回 2 列素材卡、隐藏侧栏，输入框底部坐标为 812，小于视口高度 844。上述数据均来自合成只读服务，不能替代 AC-07 的真实公共电脑、真实视频和已启用模型验收。

发布验证：`cfa86d165d8fc6b97c1b3937fc987be725847a4c` 已推送至 `origin/main` 并发布到公司共享模式；`http://192.168.42.7:3000/agents/market-intelligence` 返回 HTTP 200，页面响应包含六模块导航与“输入市场情报需求…”输入框。LaunchAgent `com.hys.marketing-workbench.local-server` 为 running，工作目录为该 release，公开 origin 为 `http://192.168.42.7:3000`。

2026-09-20 回复来源标识增量验证：`node tests/market-intelligence.test.mjs` 通过 129 项，覆盖规则解析、模型需求解析被采用、模型非法输出回退、模型异常回退，以及单素材解读和月报实际采用模型的状态；`node tests/market-intelligence-report.test.mjs` 通过 32 项；`npm run test:agent-model-config`、`npm run test:workbench-client-pages` 与 `npm run test:workbench-conversation` 均通过。`f2f40066c3cb9e66a4530239a1fecc8d5eab5be7` 已推送至 `origin/main`，公司共享 release 同步为该版本；共享页面返回 HTTP 200，发布的 `/market-intelligence.mjs` 包含模型失败回退来源话术。以上均为合成模型与合成公共电脑夹具；AC-07 的真实跨机验收仍未完成。

截图均使用页面上明确标识的合成数据：

- `mi-search-desktop.png`
- `mi-search-mobile.png`
- `mi-report-desktop.png`

真实联调必须在新 release 启用后，由已获授权的工作台用户在“设置”录入或沿用本人连接和模型配置完成；不得以本文件中的合成结果代替。

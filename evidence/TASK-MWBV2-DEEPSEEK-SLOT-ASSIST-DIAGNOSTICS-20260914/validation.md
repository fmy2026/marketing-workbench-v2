# 验证记录

- `npm run test:agent-model-config`：通过；隔离 HTTP 断言 DeepSeek 连接测试与运行时请求均关闭 thinking，其他主机不附带该字段。
- `npm run test:llm-explicit-intake-progress`：通过；覆盖成功采用推广路线及五类受控回退，未使用真实网络。
- `npm run test:launch-request`：通过；统一请求合同回归通过。
- `npm run test:workbench-client-pages`：通过；隔离 Chrome 完成模型辅助成功提示、失败提示和禁用启动按钮交互验证。

全部验证使用合成凭据、模拟模型响应和本地测试服务；真实投放平台调用为零。

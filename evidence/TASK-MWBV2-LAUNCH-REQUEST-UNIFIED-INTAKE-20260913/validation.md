# 验收证据

- `npm run test:launch-request`：通过。合成请求覆盖 JSON 不调用模型、自然语言等价请求、分次补齐、多账户、未支持事项、未知字段、版本、事项、类型、混合输入和旧三字段兼容。
- `npm run test:llm-explicit-intake-progress`：通过。规则优先、模型有证据补槽位及失效回退未回归。
- `npm run test:workbench-auth-http`：通过。隔离数据库 HTTP 验证完整 JSON、未知字段和混合输入的同源接口行为，并保留登录、强制改密及权限边界。
- `npm run smoke:api`、`npm run test:workbench-user-isolation`、`npm run test:workbench-conversation`、`npm run test:workbench-progress`：通过。Case/Job、账户隔离、对话和进度投影未回归。
- `npm run test:workbench-client-pages`：通过。无头 Chrome 在隔离数据库中完成登录、首次改密、进入工作区、自然语言缺项、模式切换清空、JSON 模板、结构化校验和启动按钮状态的实际交互；未启动流程，不触发平台写入。
- `npm run test:agent-model-config`、`npm run test:agent-hub`：通过。既有模型配置与广场入口未回归。

所有测试均使用合成账户和隔离数据库；未写入业务库、未配置真实模型 Key、未执行 OAuth、未确认 Plan、未调用真实投放平台。

# 同一 Job 深链修正与第 2 次受控创建

- Job：`JOB-MWBV2-20260828133507-78C36B`
- Case：`CASE-LEGACY-2E4217E20C9E26BFB648772C`
- 范围：仅修正 JSZC 字节小游戏调起深链并建立 attempt 2；第 1 次审计不可变。
- 安全：每次只允许一个绑定 draft/plan/payload hash 的真实调用；测试期总上限 3 次；不保存完整深链、raw payload 或 raw response。

## Result

- 受控深链已更新为超管后台值的 hash：`8905fb6969608581a6f8a99a38755bb81cd65d9c08a3f66992d968f73ea3bac5`。
- Draft/Plan V2 通过 readonly preflight，且只发送 `mini_program_info.url`。
- attempt 2 已真实调用并完成只读回查：HTTP `200`、业务 `40000`、未返回对象、回查未命中。
- 写权限已自动撤销；不可重发 attempt 2。下一步仅可先修正 payload 后建立 attempt 3。

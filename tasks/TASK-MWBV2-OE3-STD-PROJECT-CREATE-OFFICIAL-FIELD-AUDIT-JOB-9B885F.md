# TASK-MWBV2-OE3-STD-PROJECT-CREATE-OFFICIAL-FIELD-AUDIT-JOB-9B885F

## Brief

对失败 job `JOB-MWBV2-20260828123736-9B885F` 做一次零写入的 OE3 `std_project/create` 官方字段合同全量审计。

## Scope

- 仅使用本机 3.0 官方知识库：
  - `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md`
  - `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/09-01-巨量营销智擎版-项目管理与优化目标.md`
- 绑定 case `CASE-LEGACY-2E4217E20C9E26BFB648772C`、目标账户 `1871922346964041`、失败 job `JOB-MWBV2-20260828123736-9B885F`。
- 只审计 Header、请求参数表、SDK 示例字段形状、当前最终 payload 的脱敏字段形状。

## Non Goals

- 不调用 OceanEngine 平台。
- 不创建 fresh job。
- 不重试已消费的 create job。
- 不参考旧项目。
- 不修改 payload、运行态、授权范围、预算、出价或资源状态。
- 不保存 token、完整 URL、raw payload、raw response 或原始平台响应。

## Route Context

```text
ad_type=ALL
landing_type=MICRO_GAME
marketing_goal=VIDEO_AND_IMAGE
delivery_medium=BYTE_GAME
native_type=AWEME
advertiser_id=1871922346964041
```

## Output

- Human report: `/Users/hys/Projects/marketing-workbench-v2/docs/.问题排查/20260828-oe3-std-project-create-official-field-audit-JOB-MWBV2-20260828123736-9B885F.md`
- Machine-readable matrix: `/Users/hys/Projects/marketing-workbench-v2/docs/.问题排查/20260828-oe3-std-project-create-field-matrix-JOB-MWBV2-20260828123736-9B885F.json`

## Result

- Status: completed
- Official request/header contract records: 161
- Current final payload shape paths: 69
- Current final payload hash: `sha256:220933a99cf8cd573dba2e5c0380c127fd8f0a7a8e203f7a284c760a665b19cc`
- Main candidate risks:
  - `project_materials.mini_program_info.url` is emitted as an empty string while the official doc says transmitted URLs are correctness-checked.
  - `project_materials.product_info` is conditionally required but the route condition is not fully encoded.
  - `project_materials.external_url_material_list` is conditionally required but the current route uses it for backup landing page without a route-specific condition model.
  - `track_url_setting` is conditionally required and should be validated by nested paths, not only by the parent object.
  - `delivery_type` exists in the official create doc but is omitted by current send policy; omission may be valid by default, but should be explicitly classified.
  - The current official send policy evaluates only top-level payload keys; nested field contracts need their own baseline before the next create attempt.

# Validation evidence

## AC-01

Static fallback baseline

- Backup: `.local/backups/marketing_workbench_v2-20260911T073316Z.dump`
- Applied: `db/086_jszc_qiankun_video_fallback.sql` in one transaction.
- Readback: 10 active Qiankun video assets, 0 local-path/hash dependencies, 10 active required material-pack items, and 10 required route blueprints. Three former pack items and two former blueprints are retired.

## AC-02

Qiankun source-account identity

- Read-only endpoint: `POST /tf/account_info/accountIndex`
- Credential owner used: `fengmeiyu`
- Requested material account: `1760246749825031`
- Response hash: `sha256:275cc1619b1e605013d3074e545d20e2b1a7ae3734f78ccb02d293fbb54a24a0`
- User-approved binding: `qiankun_owner_key=fengmeiyu`, Qiankun record `4770`, agent `265`, identity status `verified`.
- The returned SSO owner key `jushoutoufangongyong` is a virtual shared role and is retained only as evidence; it does not replace the approved real owner.

## AC-03

Source material and material-account inventory

- Qiankun resource index: 10 of 10 requested origin-resource IDs found; all have `resource_type=2` (video). Response hash: `sha256:ea91c5c7b03576f0f502cd2fce41e280c6bd0bf76a7bc693ab2420ed3285c0ea`.
- Exact inventory reconciliation: `file/video/get` scanned all 34 pages and 3,333 records. For all ten source codes, a case-insensitive complete-boundary filename match returned exactly one OceanEngine `id`; `4iG2-1` and `4iG2-18` resolved to separate IDs.
- Aggregate inventory response hash: `sha256:76cf58a8b555cd335f96c6b0abf28ed2e2eeb023a9eb6af52a6afa3f8f924984`.
- Database readback: 10 source rows, 10 distinct `platform_resource_id` values, 10 `oceanengine_video_mapping.status=verified`, and 10 `visible + readback_verified` states.
- Qiankun preheat records and `m_id` values remain audit facts only. No Qiankun preheat write, OceanEngine bind, target-account share, or standard-project create was called.

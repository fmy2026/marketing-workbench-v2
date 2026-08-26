# TASK-MWBV2-OE3-QIANKUN-MEDIA-TAXONOMY-CORRECTION

状态：completed

更新时间：2026-08-26 CST

## 背景

用户补充确认：乾坤“媒体渠道”不是一层，而是三层：

```text
第 1 层：媒体系
第 2 层：媒体
第 3 层：媒体资源位
```

界面截图也显示同一模块下有 `资源位 / 媒体 / 媒体系` 三个页签。

## 核心修正

| 层级 | 乾坤概念 | 接口字段/入口 | v2 对应 |
| --- | --- | --- | --- |
| 第 1 层 | 媒体系 | 页面“媒体系” | 近似对应 v2 `platform` |
| 第 2 层 | 媒体 | `selectList mediaList`、`accountIndex.media_master_id` | 媒体主体 |
| 第 3 层 | 媒体资源位 | `/tf/ad/index mediaId[]`、历史 monitor 的内部 `media_id` | 监测创建所需资源位 |

因此：上一轮把历史 monitor 的 `media_id=310` 与 `selectList mediaList[].value` 直接取交集，属于跨层级比较。结果为 0 只说明“第三层资源位 ID 不在第二层媒体列表中”，不能证明当前没有可用媒体资源位。

## 当前可信事实

- `accountIndex` 已恢复，目标账户唯一命中。
- `qiankun_account_record_id=8448` 已落库。
- `qiankun_agent_id=613` 为账户侧 observed。
- 历史 monitor `245791` 可读，历史资源位为 `media_id=310`。
- `mediaList` 可读，返回 177 项，但它属于第 2 层“媒体”，不是第 3 层“媒体资源位”。
- 当前第 3 层“媒体资源位”的有效候选仍未找到。

## 下一任务建议

下一任务不应再用 `mediaList` 直接验证 `/tf/ad/index mediaId[]`。

应改为寻找第 3 层“媒体资源位”的来源接口或数据入口，再用第 3 层资源位 ID 调用：

```text
POST /tf/ad/changeMediaId
os=3
media_id=<第三层媒体资源位 ID>
```

通过后再核验：

```text
POST /tf/ad/changeMediaAccountId
media_account_id=8448
```

仍不创建 monitor，不刷新 token，不写 raw request/response。

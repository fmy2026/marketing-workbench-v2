# 乾坤 monitor 首次创建：monitorSerialNumberAdd 创建请求模块

更新时间：2026-08-26 CST

## 3. monitorSerialNumberAdd 创建请求

接口：

```text
POST /tf/ad/monitorSerialNumberAdd
```

本次对象：

| 项 | 值 |
| --- | --- |
| 路线 | `oceanengine_3_byte_mini_game` |
| 游戏 | `JSZC` |
| 广告账户 ID | `1871922414575753` |
| 乾坤内部投放账号记录 ID | `8449` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| attempt_no | `1` |
| trigger_reason | `initial_create_once` |
| 执行时间 | `2026-08-26T21:04:53.559+08:00` 至 `2026-08-26T21:04:53.691+08:00` |

公共请求信息：

| 项 | 值 |
| --- | --- |
| 乾坤环境 | 乾坤后台生产环境 |
| 请求体格式 | `application/x-www-form-urlencoded` |
| `Accept` | `application/json` |
| `Content-Type` | `application/x-www-form-urlencoded` |
| 认证 | `X-Passport-Token` 已正确传入；项目文件不保存具体 token 值 |
| array 编码 | 数组字段按 `字段名[]` 多值展开 |

实际创建参数：

| 参数 | 类型 | 值 | 说明 |
| --- | --- | --- | --- |
| `os` | int | `3` | 乾坤小游戏技术系统类型 |
| `package_id` | string | `36820` | 融合拿包 ID |
| `cate_id` | int/string | `122` | 游戏组 ID |
| `vest_id` | int/string | `1414` | 马甲 ID：巨兽战场 |
| `channel` | string | `dymini3k` | 融合渠道 |
| `owner` | string | `fengmeiyu` | 数据归属人 SSO |
| `media_id` | int/string | `310` | 第三层媒体资源位：通投智选（原生竞价） |
| `agent_id` | int/string | `613` | 代理 ID：北京国新汇金股份有限公司 |
| `num` | int | `1` | 生成监测地址数量 |
| `usage` | int | `0` | 用途：普通广告 |
| `monitor_api` | string | `toutiao_wxgame` | 监测 API 类型 |
| `media_account_id` | int/string | `8449` | 乾坤内部投放账号记录 ID；由 `accountIndex` 唯一命中 |
| `server_callback_type` | string/int | `2` | 服务端回调类型；本路线已确认必传 |
| `server_callback_data_types[]` | array | `active` | 服务端回调数据类型 |
| `server_callback_data_types[]` | array | `register` | 服务端回调数据类型 |
| `server_callback_data_types[]` | array | `success_order` | 服务端回调数据类型 |
| `remark` | string | `mwbv2-JSZC-1871922414575753` | v2 创建备注 |

请求字段 manifest：

```text
agent_id
cate_id
channel
media_account_id
media_id
monitor_api
num
os
owner
package_id
remark
server_callback_data_types
server_callback_type
usage
vest_id
```

字段完整性：

| 项 | 值 |
| --- | --- |
| requiredFieldsPresent | `true` |
| create request hash / create plan hash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| callback contract hash | `sha256:224d383b42f1a1a89774f85c267f16758f6b9e5acb4488724b9cfa387ded3819` |
| rawRequestStored | `false` |

创建接口返回摘要：

| 字段 | 值 |
| --- | --- |
| client status | `blocked` |
| httpStatus | `200` |
| apiCode | `500` |
| apiMessage | `服务器繁忙，请稍后重试(400)` |
| responseHash | `sha256:a85b2886b658ea6421161c5c1583dde35d4863025ad732278be57e56992be719` |
| latest_attempt_status | `failed` |
| latest_attempt_error_category | `server_busy` |
| rawResponseStored | `false` |

按乾坤接口文档，成功响应预期形态：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

本次实际业务返回为非成功：`apiCode=500`，`apiMessage=服务器繁忙，请稍后重试(400)`。创建后只读回查未命中 monitor，`monitor_id` 仍为空。

关联证据：

| 项 | 值 |
| --- | --- |
| evidence_artifact_id | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ENSURE` |
| evidence_content_hash | `sha256:efaa299a1f48ff3cf10c4e00de22187a38a8a4332b44c1f3a758c042c2583d7a` |
| run error_summary | `monitor_create_server_busy_retry_available` |

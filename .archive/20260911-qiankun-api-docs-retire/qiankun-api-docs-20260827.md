[TOC]

# 3K 乾坤系统 API 对接文档

---

## 一、鉴权方式

所有 API 请求需要在 HTTP Header 中携带 API Token 进行身份认证：

```
X-Passport-Token: <your-api-token>
```

**Token 获取方式**：由后台管理员在「API Token 管理」页面生成，每个用户仅保留一个有效 Token，有效期 **30 天**。

**请求方式**：所有接口统一使用 `POST` 方法，参数以 `application/x-www-form-urlencoded` 或 `multipart/form-data` 格式提交。

**统一响应格式**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 0 表示成功，非 0 表示失败 |
| msg | string | 提示信息 |
| data | object/array | 业务数据 |

---

## 二、域名说明

| 环境 | 域名 |
|------|------|
| 测试环境 | `https://center-test.3kwan.com` |
| 生产环境 | `https://center.3k.com` |

---

## 三、接口列表

### 1. 获取投放账号密码列表

获取媒体账号列表，包含 `access_token` 等鉴权信息，可用于对接各广告平台的 API。

- **路径**: `/tf/account_info/accountIndex`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mediaMasterId | array | 否 | 媒体统称 ID 列表，如 `[1, 2]` |
| mediaDeptId | int | 否 | 媒体部门 ID |
| type | array | 否 | 账号类型列表 |
| agentId | array | 否 | 代理 ID 列表 |
| ssoOwner | array | 否 | 归属人（SSO 用户 ID）列表 |
| status | array | 否 | 状态列表 |
| accountMode | int | 否 | 投放端 |
| company | array | 否 | 公司主体 ID 列表 |
| accountId | string | 否 | 账号 ID，支持逗号分隔批量查询 |
| advertiserName | string | 否 | 广告主名称，模糊搜索 |
| isAuth | string | 否 | 授权状态筛选 |
| assignStatus | string | 否 | 分配状态：空字符串=未分配，非空=已分配 |
| deptId | array | 否 | 部门 ID 列表 |
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数，默认 10 |
| sorts | object | 否 | 排序，如 `{"id": "desc"}` |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/account_info/accountIndex' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'mediaMasterId[]=1' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 156,
    "list": [
      {
        "id": 1001,
        "account_id": "12345678",
        "media_master_id": 1,
        "media_master_id_name": "广点通",
        "media_version_name": "V2",
        "agent_id": 5,
        "agent_id_name": "上海游民网络科技有限公司",
        "sso_owner": "zhangsan",
        "sso_owner_name": "张三",
        "type": 1,
        "type_name": "企业账号",
        "account_mode": 1,
        "account_mode_name": "ADQ",
        "company": 2,
        "company_name": "某某科技有限公司",
        "status": 1,
        "advertiser_name": "测试广告主",
        "access_token": "xxxxxxxxxxxxxxxxxxxx",
        "format_addtime": "2024-01-15 10:30:00",
        "auth_time": "2024-06-01 08:00:00",
        "remark": "商务备注",
        "pitcher_remark": "投手备注",
        "account_auth_status_name": "已授权",
        "auth_url": "https://..."
      }
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 账号列表 |
| list[].id | int | 记录 ID |
| list[].account_id | string | 媒体账号 ID |
| list[].media_master_id | int | 媒体统称 ID |
| list[].media_master_id_name | string | 媒体统称名称 |
| list[].agent_id | int | 代理 ID |
| list[].agent_id_name | string | 代理名称 |
| list[].sso_owner | string | 归属人 SSO ID |
| list[].sso_owner_name | string | 归属人姓名 |
| list[].advertiser_name | string | 广告主名称 |
| list[].access_token | string | 媒体 API 鉴权 token |
| list[].status | int | 状态：1=正常，2=禁用 |
| list[].account_auth_status_name | string | 授权状态名称 |
| list[].format_addtime | string | 添加时间 |
| list[].company_name | string | 公司主体名称 |

---

### 2. 新增监测序号

为指定融合包创建监测序号，生成监测链接。

- **路径**: `/tf/ad/monitorSerialNumberAdd`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| os | int | 是 | 系统：1=Android，2=iOS，3=微信小游戏，4=鸿蒙 |
| package_id | string | 是 | 融合拿包 ID，多个用英文逗号分隔 |
| cate_id | int | 是 | 游戏组 ID |
| vest_id | int | 是 | 马甲名 ID |
| channel | string | 是 | 融合渠道 |
| owner | string | 是 | 归属人 SSO 用户 ID |
| media_id | int | 是 | 资源位 ID |
| agent_id | int | 是 | 代理 ID |
| num | int | 是 | 生成监测地址数量，范围 1-50 |
| usage | int | 是 | 用途 |
| monitor_api | string | 否 | 监测 API 类型，如 `gdtandroid`、`ttandroid` 等 |
| media_account_id | int | 否 | 媒体账号 ID（投放部门必填） |
| package_download_url | string | 否 | 包下载地址（渠道为 3k/apple3k 时必填） |
| remark | string | 否 | 备注 |
| server_callback_param_list | array | 否 | 服务端上报参数 |
| server_callback_type | int | 否 | 服务端上报模式 |
| server_callback_data_types | array | 否 | 服务端上报数据类型 |
| multiplex_monitor_id | int | 否 | 是否复用计划，1=复用 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/monitorSerialNumberAdd' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'os=1' \
  -d 'package_id=12345' \
  -d 'cate_id=10' \
  -d 'vest_id=20' \
  -d 'channel=3k' \
  -d 'owner=zhangsan' \
  -d 'media_id=100' \
  -d 'agent_id=5' \
  -d 'num=1' \
  -d 'usage=1' \
  -d 'monitor_api=gdtandroid' \
  -d 'media_account_id=2001' \
  -d 'package_download_url=https://example.com/game.apk'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

---

### 3. 根据游戏组 ID、系统获取马甲名列表

选择游戏组后，获取该游戏组下的马甲名下拉列表。

- **路径**: `/tf/ad/changeCateId`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cateId | int | 是 | 游戏组 ID |
| os | int | 是 | 系统：1=Android，2=iOS，3=微信小游戏，4=鸿蒙 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/changeCateId' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'cateId=10' \
  -d 'os=1'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "vestList": [
      {"label": "马甲包A", "value": 20},
      {"label": "马甲包B", "value": 21},
      {"label": "马甲包C", "value": 22}
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| vestList | array | 马甲名列表 |
| vestList[].label | string | 马甲名显示名称 |
| vestList[].value | int | 马甲名 ID |

---

### 4. 根据马甲名获取对应融合拿包 ID 列表

选择马甲名后，获取该马甲下可用的融合拿包 ID 列表。

> 注意：仅支持 iOS（2）、微信小游戏（3）、鸿蒙（4）系统，Android 不支持此接口。

- **路径**: `/tf/ad/changeVestId`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vestId | int | 是 | 马甲名 ID |
| os | int | 是 | 系统：2=iOS，3=微信小游戏，4=鸿蒙 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/changeVestId' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'vestId=20' \
  -d 'os=2'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {"label": "12345", "value": 12345},
    {"label": "12346", "value": 12346},
    {"label": "12347", "value": 12347}
  ]
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| [].label | string | 融合拿包 ID（文本） |
| [].value | int | 融合拿包 ID（数值） |

---

### 5. 获取拿包 ID 基础信息

根据融合拿包 ID 自动获取关联的游戏组、马甲名、归属人、渠道、下载地址等基础信息。不同系统返回的字段略有差异。

- **路径**: `/tf/ad/changePackageId`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| package_id | string | 是 | 融合拿包 ID |
| host | string | 是 | 当前域名，用于拼接下载地址 |
| os | int | 是 | 系统：1=Android，2=iOS，3=微信小游戏，4=鸿蒙 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/changePackageId' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'package_id=12345' \
  -d 'host=center-test.3kwan.com' \
  -d 'os=1'
```

**响应示例（Android）**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "cateId": 10,
    "vestId": 20,
    "vestList": [
      {"label": "马甲包A", "value": 20},
      {"label": "马甲包B", "value": 21}
    ],
    "owner": "zhangsan",
    "channel": "3k",
    "packageDownloadUrl": "https://example.com/game.apk",
    "isTfDepartment": true,
    "hasMonitorSerialNumber": false,
    "mediaId": 100,
    "agentId": 5,
    "mediaList": [
      {"label": "资源位A", "value": 100},
      {"label": "资源位B", "value": 101}
    ],
    "accountIdList": [
      {"label": "账号001", "value": 2001},
      {"label": "账号002", "value": 2002}
    ],
    "monitorApiList": [
      {"label": "广点通Android", "value": "gdtandroid"},
      {"label": "头条Android", "value": "ttandroid"}
    ],
    "mediaSdkList": [
      {"label": "广点通SDK", "value": 1, "disabled": true}
    ],
    "mediaSdkIds": [1],
    "mediaSdkConfigDataTypes": ["active"],
    "mediaSdkConfigDataTypeList": [
      {"label": "激活", "value": "active"}
    ],
    "mediaSdkConfigParamList": []
  }
}
```

**响应示例（iOS）**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "channel": "apple3k",
    "packageDownloadUrl": "https://apps.apple.com/app/id123456",
    "isTfDepartment": false,
    "agentId": 5,
    "mediaSdkList": [],
    "mediaSdkIds": [],
    "mediaSdkConfigDataTypes": [],
    "mediaSdkConfigDataTypeList": [],
    "mediaSdkConfigParamList": []
  }
}
```

**响应示例（微信小游戏）**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "channel": "wxgame"
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| cateId | int | 游戏组 ID |
| vestId | int | 马甲名 ID |
| vestList | array | 马甲名下拉列表 |
| owner | string | 归属人 SSO 用户 ID |
| channel | string | 融合渠道 |
| packageDownloadUrl | string | 包下载地址 |
| isTfDepartment | bool | 是否投放部门 |
| hasMonitorSerialNumber | bool | 是否已有监测序号 |
| mediaId | int | 资源位 ID（已有监测序号时返回） |
| agentId | int | 代理 ID |
| mediaList | array | 资源位列表 |
| accountIdList | array | 投放账号 ID 列表 |
| monitorApiList | array | 监测 API 类型列表 |
| mediaSdkList | array | 媒体 SDK 列表 |
| mediaSdkIds | array | 已选中的媒体 SDK ID |
| mediaSdkConfigDataTypes | array | 已选中的 SDK 上报类型 |
| mediaSdkConfigDataTypeList | array | SDK 上报类型列表 |
| mediaSdkConfigParamList | array | SDK 参数配置 |

---

### 6. 获取监控 API 类型、投放账号 ID 列表

根据资源位和系统获取可用的监测 API 类型列表和投放账号 ID 列表。

- **路径**: `/tf/ad/changeMediaId`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| os | int | 是 | 系统：1=Android，2=iOS，3=微信小游戏，4=鸿蒙 |
| media_id | int | 是 | 资源位 ID |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/changeMediaId' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'os=1' \
  -d 'media_id=100'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "monitorApiList": [
      {"label": "广点通Android", "value": "gdtandroid"},
      {"label": "头条Android", "value": "ttandroid"},
      {"label": "快手Android", "value": "ksandroid"}
    ],
    "accountIdList": [
      {"label": "账号001 (12345678)", "value": 2001},
      {"label": "账号002 (87654321)", "value": 2002}
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| monitorApiList | array | 监测 API 类型下拉列表 |
| monitorApiList[].label | string | API 类型名称 |
| monitorApiList[].value | string | API 类型标识 |
| accountIdList | array | 投放账号 ID 下拉列表 |
| accountIdList[].label | string | 账号显示名称 |
| accountIdList[].value | int | 账号记录 ID |

---

### 7. 获取账号对应的代理信息

根据媒体账号 ID 查询对应的代理 ID。

- **路径**: `/tf/ad/changeMediaAccountId`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| media_account_id | int | 是 | 媒体账号记录 ID |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/changeMediaAccountId' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'media_account_id=2001'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "agentId": 5
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| agentId | int | 代理 ID |

---

### 8. 获取投放监测序号列表

获取已创建的投放监测序号列表，支持多维度筛选和分页。

- **路径**: `/tf/ad/index`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 否 | 序号 ID，支持逗号分隔批量查询 |
| monitorId | string | 否 | 监测 ID，支持逗号分隔批量查询 |
| packageId | string | 否 | 融合拿包 ID，支持逗号分隔批量查询 |
| cateId | array | 否 | 游戏组 ID 列表 |
| gameId | array | 否 | 游戏 ID 列表 |
| vestId | array | 否 | 马甲名 ID 列表 |
| monitorApi | array | 否 | 监测 API 类型列表，如 `["gdtandroid", "ttandroid"]` |
| os | array | 否 | 系统列表，如 `[1, 2]` |
| mediaId | array | 否 | 资源位 ID 列表 |
| agentId | array | 否 | 代理 ID 列表 |
| departmentId | array | 否 | 部门 ID 列表 |
| ssoOwner | array | 否 | 归属人 SSO 用户 ID 列表 |
| channel | array | 否 | 融合渠道列表 |
| addtime | array | 否 | 添加时间范围，如 `["2024-01-01", "2024-12-31"]` |
| mediaAccountId | string | 否 | 投放账号 ID |
| usage | int | 否 | 用途 |
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/tf/ad/index' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 500,
    "list": [
      {
        "id": 10001,
        "monitor_id": 5001,
        "game_id": 100,
        "package_id": 12345,
        "cate_id": "游戏组A (马甲包B)",
        "media_account_id": "账号001",
        "os_name": "Android",
        "media_id": "资源位A",
        "agent_id": "代理A",
        "monitor_api": "广点通Android",
        "sso_owner": "张三",
        "channel": "3k",
        "department_name": "投放一部",
        "remark": "测试备注",
        "addtime": "2024-06-15 10:30:00"
      }
    ],
    "columns": [
      {"title": "投放序号", "name": "id"},
      {"title": "监测ID", "name": "monitor_id"},
      {"title": "融合游戏ID", "name": "game_id"},
      {"title": "融合拿包ID", "name": "package_id"},
      {"title": "游戏组（游戏马甲名）", "name": "cate_id"},
      {"title": "账号ID", "name": "media_account_id"},
      {"title": "系统", "name": "os_name"},
      {"title": "资源位", "name": "media_id"},
      {"title": "代理", "name": "agent_id"},
      {"title": "监测API类型", "name": "monitor_api"},
      {"title": "数据归属人", "name": "sso_owner"},
      {"title": "融合渠道[标识]", "name": "channel"},
      {"title": "部门", "name": "department_name"},
      {"title": "备注", "name": "remark"},
      {"title": "生成时间", "name": "addtime"}
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 监测序号列表 |
| list[].id | int | 投放序号 |
| list[].monitor_id | int | 监测 ID |
| list[].game_id | int | 融合游戏 ID |
| list[].package_id | int | 融合拿包 ID |
| list[].cate_id | string | 游戏组（游戏马甲名） |
| list[].media_account_id | string | 账号 ID 名称 |
| list[].os_name | string | 系统名称 |
| list[].media_id | string | 资源位名称 |
| list[].agent_id | string | 代理名称 |
| list[].monitor_api | string | 监测 API 类型名称 |
| list[].sso_owner | string | 数据归属人姓名 |
| list[].channel | string | 融合渠道 |
| list[].department_name | string | 部门名称 |
| list[].remark | string | 备注 |
| list[].addtime | string | 生成时间 |
| columns | array | 列定义信息（字段名与标题映射） |

---

### 9. 获取系统基础下拉列表

获取系统各类基础下拉数据，如游戏组、马甲名、渠道、代理、媒体等，用于下拉选择控件。

- **路径**: `/ajax/selectList/getList`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 数据源类型，可选值见下方说明 |

**type 参数可选值**：

| 值 | 说明 |
|------|------|
| cateList | 游戏组列表（用户已分配的游戏组） |
| gameList | 游戏列表（用户已分配的游戏） |
| vestList | 马甲名列表 |
| monitorApiList | 监测 API 类型列表 |
| osList | 系统列表 |
| mediaList | 媒体列表 |
| agentList | 代理列表 |
| departmentList | 部门列表 |
| userList | 用户列表 |
| channelList | 渠道列表（用户已分配的渠道） |
| usageList | 广告类型（用途）列表 |
| accountTypeList | 账号类型列表 |
| modelDepartmentList | 媒体部门列表 |
| authList | 授权状态列表 |
| mediaVersionList | 媒体版本列表 |
| companyList | 公司主体列表 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/ajax/selectList/getList' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'type=cateList'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {"label": "游戏组A", "value": 10},
    {"label": "游戏组B", "value": 11},
    {"label": "游戏组C", "value": 12}
  ]
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| [].label | string | 选项显示名称 |
| [].value | int/string | 选项值 |

---

### 10. 获取素材库列表

获取素材库列表，支持按素材类型（视频/图片/落地页/图文/音频/图片列表）分页查询。

- **路径**: `/resource/resource/resource_index`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resource_type | int | 是 | 素材类型：1=视频，2=图片，3=落地页，4=图文，5=音频，6=图片列表 |
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数 |
| origin_resource_id | string | 否 | 素材标识码，支持逗号分隔批量精确查询 |
| origin_resource_ids | string | 否 | 素材标识码，支持逗号分隔模糊查询 |
| parent_resource_id | string | 否 | 父创意系列标识码，精确查询 |
| parent_resource_ids | string | 否 | 父创意系列标识码，模糊查询 |
| demand_ids | string | 否 | 需求 ID 或提需求人，支持逗号分隔 |

> 注：不同素材类型支持不同的筛选参数，具体参数以实际接口行为为准。以上为通用参数，更多筛选条件（如标签、尺寸、方向等）可参考后台素材库页面支持的筛选字段。

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/resource/resource/resource_index' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'resource_type=1' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 320,
    "list": [
      {
        "origin_resource_id": "vid_abc123",
        "resource_name": "宣传视频素材A.mp4",
        "resource_type": 1,
        "resource_type_name": "视频",
        "cate_name": "游戏组A",
        "format_time": "2024-06-15 10:30:00"
      }
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 素材列表 |
| list[].origin_resource_id | string | 素材标识码 |
| list[].resource_name | string | 素材名称 |
| list[].resource_type | int | 素材类型 |
| list[].resource_type_name | string | 素材类型名称 |
| list[].cate_name | string | 所属游戏组名称 |
| list[].format_time | string | 创建时间 |

---

### 11. 获取个人收藏的素材列表

获取当前 API Token 对应用户的个人收藏素材列表，自动关联当前用户，不需要传递用户参数。

- **路径**: `/resource/resource/get_favorites_page`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数 |

> 此接口会自动根据 API Token 关联当前用户，无需传递 `created_user` 参数。

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/resource/resource/get_favorites_page' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 15,
    "list": [
      {
        "favorites_id": 1,
        "name": "我的收藏夹A",
        "material_id": "vid_abc123,vid_def456",
        "created_user": "zhangsan",
        "created_user_desc": "张三",
        "created_time": "2024-06-15 10:30:00",
        "updated_time": "2024-06-20 14:00:00",
        "allow_edit": "1"
      }
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 收藏夹列表 |
| list[].favorites_id | int | 收藏夹 ID |
| list[].name | string | 收藏夹名称 |
| list[].material_id | string | 收藏的素材标识码，逗号分隔 |
| list[].created_user | string | 创建人 SSO ID |
| list[].created_user_desc | string | 创建人姓名 |
| list[].created_time | string | 创建时间 |
| list[].updated_time | string | 更新时间 |
| list[].allow_edit | string | 是否允许编辑：1=可编辑，0=不可编辑 |

---

### 12. 获取素材预热列表

获取素材预热（同步到媒体平台）的记录列表，用于追踪素材同步到各广告平台的状态。

- **路径**: `/resource/resource/sync_material_list`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| materialMark | string | 否 | 素材标识码，支持逗号分隔 |
| mId | string | 否 | 媒体素材 ID，支持逗号分隔 |
| status | array | 否 | 预热状态列表 |
| account | array | 否 | 投放账号 ID 列表 |
| cateId | array | 否 | 游戏组 ID 列表 |
| date | array | 否 | 创建时间范围，如 `["2024-01-01", "2024-06-30"]` |
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数 |
| sortColumn | string | 否 | 排序字段 |
| sortDirection | string | 否 | 排序方向：asc / desc |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/resource/resource/sync_material_list' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 80,
    "list": [
      {
        "id": 1,
        "material_mark": "vid_abc123",
        "media_account_id": 2001,
        "m_id": "media_12345",
        "status": 1,
        "status_name": "预热成功",
        "cate_id": 10,
        "cate_name": "游戏组A",
        "created_at": "2024-06-15 10:30:00"
      }
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 预热记录列表 |
| list[].id | int | 记录 ID |
| list[].material_mark | string | 素材标识码 |
| list[].media_account_id | int | 投放账号 ID |
| list[].m_id | string | 媒体素材 ID |
| list[].status | int | 预热状态 |
| list[].status_name | string | 预热状态名称 |
| list[].cate_id | int | 游戏组 ID |
| list[].cate_name | string | 游戏组名称 |
| list[].created_at | string | 创建时间 |

---

### 13. 重新发起素材预热请求

对指定素材重新发起预热请求（同步到媒体平台）。

- **路径**: `/resource/resource/sync_material_option`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| optStatus | int | 是 | 操作状态码 |
| ids | array | 是 | 需要重新预热的记录 ID 列表 |

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/resource/resource/sync_material_option' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'optStatus=1' \
  -d 'ids[]=1' \
  -d 'ids[]=2'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": []
}
```

---

### 14. 自定义报表列表

获取用户创建的自定义报表列表，支持分页查询。

- **路径**: `/custom/index`
- **方法**: `POST`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNo | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数 |

> 支持更多筛选参数，具体以后台自定义报表页面支持的筛选字段为准。

**请求示例**：

```bash
curl -X POST 'https://center-test.3kwan.com/custom/index' \
  -H 'X-Passport-Token: your-api-token-here' \
  -d 'pageNo=1' \
  -d 'pageSize=10'
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "resultTotal": 25,
    "list": [
      {
        "id": 1,
        "name": "投放日报",
        "theme": "投放分析",
        "created_user": "张三",
        "created_time": "2024-06-15 10:30:00",
        "updated_time": "2024-06-20 14:00:00",
        "origin": 1
      }
    ]
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| resultTotal | int | 总记录数 |
| list | array | 报表列表 |
| list[].id | int | 报表 ID |
| list[].name | string | 报表名称 |
| list[].theme | string | 报表主题 |
| list[].created_user | string | 创建人姓名 |
| list[].created_time | string | 创建时间 |
| list[].updated_time | string | 更新时间 |
| list[].origin | int | 来源：1=本人创建，2=他人分享 |

---

## 四、系统常量参考

### 系统（os）

| 值 | 说明 |
|------|------|
| 1 | Android |
| 2 | iOS |
| 3 | 微信小游戏 |
| 4 | 鸿蒙（HMS） |

### 常见监测 API 类型（monitor_api）

| 值 | 说明 |
|------|------|
| gdtandroid | 广点通 Android |
| gdtios | 广点通 iOS |
| ttandroid | 头条 Android |
| ttios | 头条 iOS |
| ksandroid | 快手 Android |
| ksios | 快手 iOS |
| tf | 3K 短链 |
| weixin_android | 微信 Android |
| wx | 微信 |
| baiduinfo_android | 百度信息流 Android |
| baiduinfo_ios | 百度信息流 iOS |
| baiduinfo_wxgame | 百度微信小游戏 |
| huawei_ads | 华为广告 |

---

## 五、错误码说明

| code | 说明 |
|------|------|
| 0 | 成功 |
| 非 0 | 失败，具体错误信息见 msg 字段 |

常见错误场景：
- Token 无效或过期：请求将被拒绝，不会返回标准 JSON 响应
- 参数校验失败：返回 `code != 0`，`msg` 中包含具体错误描述
- 业务逻辑错误：返回 `code != 0`，`msg` 中包含错误原因
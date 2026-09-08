"""
乾坤系统「创建监测序号」完整脚本（可独立运行）

链路：
  1) accountIndex           → 校验 PASSPORT_TOKEN 是否有效 + 取账户内部参数(agent_id/owner/media_account_id)
  2) monitorSerialNumberAdd → 创建监测序号，打印【完整原始响应】

用法：
    python backend/monitor_create.py  [advertiser_id]

凭证来源（无需改代码，自动读取 backend/config/internal_api.env）：
    INTERNAL_API_BASE_URL  = https://center.3k.com
    PASSPORT_TOKEN         = <X-Passport-Token>

⚠️ 已知阻塞（非脚本问题，乾坤接口设计如此）：
    monitorSerialNumberAdd 返回 HTTP 200 + code:0 + data:{}，【不返回 monitor_id / touchpoint_url】。
    乾坤系统目前也无「查询监测序号列表」接口。
    因此：脚本能「接口调用成功」，但拿不到 monitor_id —— 需从乾坤前端页面人工查看后回填，
    或等乾坤技术人员提供查询接口 / 完善返回值。
"""
import asyncio
import json
import sys
from pathlib import Path

import httpx

BACKEND = Path(__file__).parent
sys.path.insert(0, str(BACKEND))

ENV_FILE = BACKEND / "config" / "internal_api.env"
CACHE_FILE = BACKEND.parent / ".local" / "monitor_cache.json"

# ===== 游戏/路线保底参数（来源：backend/storage/seed_data.py + docs/序列号问题/2-1）=====
DEFAULT_ADVERTISER = "1871922346964041"
OS = 3                # 3=小游戏
PACKAGE_ID = "36820"  # 融合拿包ID
CATE_ID = 122         # 游戏组ID
VEST_ID = 1414        # 马甲名ID（巨兽战场）
CHANNEL = "dymini3k"  # 融合渠道
MEDIA_ID = 310        # 资源位ID（头条微信小游戏）
MONITOR_API = "toutiao_wxgame"


def load_config() -> tuple[str, str]:
    """从 internal_api.env 读取 base_url 与 passport_token"""
    base = "https://center.3k.com"
    token = ""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k == "INTERNAL_API_BASE_URL":
                base = v
            elif k == "PASSPORT_TOKEN":
                token = v
    return base, token


def cache_monitor(advertiser_id: str, monitor_id: str, touchpoint_url=None):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "advertiser_id": advertiser_id,
        "monitor_id": monitor_id,
        "touchpoint_url": touchpoint_url,
        "source": "qiankun_monitorSerialNumberAdd",
    }
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[缓存] 已写入 {CACHE_FILE}：monitor_id={monitor_id}")


async def main():
    advertiser_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ADVERTISER
    base, token = load_config()
    print(f"[配置] BASE={base}")
    print(f"[配置] TOKEN={'<已读取>' if token else '<空，请先写入 internal_api.env>'}")
    print(f"[参数] advertiser_id={advertiser_id} os={OS} package_id={PACKAGE_ID} "
          f"cate_id={CATE_ID} vest_id={VEST_ID} channel={CHANNEL} media_id={MEDIA_ID}")

    headers = {"X-Passport-Token": token}

    async with httpx.AsyncClient(timeout=30) as hc:
        # ---- 1. accountIndex：校验 token + 取账户内部参数 ----
        r = await hc.post(
            f"{base}/tf/account_info/accountIndex",
            headers=headers,
            data={"accountId": advertiser_id, "pageNo": 1, "pageSize": 10},
        )
        print(f"\n=== [1] accountIndex  STATUS={r.status_code}")
        body = r.json()
        if body.get("code") != 0:
            print(f"    ✗ PASSPORT_TOKEN 无效/过期，响应 code={body.get('code')} msg={body.get('msg')}")
            print("    → 请到乾坤后台重新生成 Token，更新 backend/config/internal_api.env 的 PASSPORT_TOKEN 后重试")
            return
        print("    ✓ PASSPORT_TOKEN 有效")
        acct = (body.get("data") or {}).get("list", [{}])[0]
        agent_id = int(acct.get("_agent_id") or acct.get("agent_id") or 0)
        owner = acct.get("_sso_owner") or acct.get("sso_owner") or ""
        media_account_id = int(acct.get("id") or 0)
        print(f"    agent_id={agent_id}  owner={owner}  media_account_id={media_account_id}")

        # ---- 2. monitorSerialNumberAdd：创建监测序号 ----
        data = {
            "os": OS,
            "package_id": PACKAGE_ID,
            "cate_id": CATE_ID,
            "vest_id": VEST_ID,
            "channel": CHANNEL,
            "owner": owner,
            "media_id": MEDIA_ID,
            "agent_id": agent_id,
            "num": 1,
            "usage": 0,
            "monitor_api": MONITOR_API,
            "media_account_id": media_account_id,
            "remark": "auto-created-by-market-ad-agent",
        }
        r = await hc.post(
            f"{base}/tf/ad/monitorSerialNumberAdd",
            headers=headers,
            data=data,
        )
        print(f"\n=== [2] monitorSerialNumberAdd  STATUS={r.status_code}")
        print(f"    完整原始响应: {r.text}")

        body = r.json()
        if body.get("code") != 0:
            print(f"    ✗ 创建失败 code={body.get('code')} msg={body.get('msg')}")
            return

        d = body.get("data") or {}
        mid = (d.get("monitor_id") or d.get("monitorSerialNumber")
               or d.get("serial_number") or d.get("monitorId"))
        url = (d.get("touchpoint_url") or d.get("wxgame_click_url")
               or d.get("click_url") or d.get("url"))

        if mid:
            cache_monitor(advertiser_id, str(mid), url)
            print(f"    ✓ 已拿到 monitor_id={mid}，touchpoint_url={url}")
            print(f"    → 缓存文件 {CACHE_FILE} 可供 Step B 复用")
        else:
            print("    ⚠ 接口「调用成功」(code=0) 但 data 为空 —— 未返回 monitor_id / touchpoint_url")
            print("    → 这是乾坤接口当前的设计限制，脚本无法绕过")
            print("    → 处理方式（三选一）：")
            print("       a) 到乾坤前端「监测序号」列表页查看刚创建的最新序号，手动回填 monitor_id")
            print("       b) 请乾坤技术人员提供「查询监测序号列表」接口")
            print("       c) 请乾坤技术人员在 monitorSerialNumberAdd 返回值中补充 monitor_id + touchpoint_url")


if __name__ == "__main__":
    asyncio.run(main())

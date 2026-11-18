import {
  AccountItem,
  EngineSettings,
  TaskConfig,
  cleanRedundantLoginCookies,
} from './eastmoneyEngine';

export interface BugFixRecord {
  id: string;
  file: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  originalBugCode: string;
  fixedCode: string;
  impactDescription: string;
}

export const ORIGINAL_PROJECT_BUG_FIXES: BugFixRecord[] = [
  {
    id: 'fix-1',
    file: 'main_engine.py',
    severity: 'critical',
    title: '修复类名中文拼写语法错误与未定义求解器导入',
    originalBugCode: `from proxy_pool import Proxy池\nfrom captcha_solver import ClickCaptchaSolver\n...\nself.solver = ClickCaptchaSolver()`,
    fixedCode: `from proxy_pool import ProxyPool\nfrom captcha_solver import build_solver\n...\nself.solver = build_solver(self.config["settings"].get("captcha_mode", "skip"))`,
    impactDescription: '原代码第 7 行写成了中文 `Proxy池`，且导入了 `captcha_solver.py` 中根本不存在的 `ClickCaptchaSolver` 类，导致脚本一启动立即抛出 ImportError 崩溃。',
  },
  {
    id: 'fix-2',
    file: 'eastmoney_api.py / main_engine.py',
    severity: 'critical',
    title: '修复 URL 编号与 postid 混用导致点赞与评论全部失败',
    originalBugCode: `postid = await api_instance.resolve_postid(article_url, account_data, proxy_str)\nurl_id = await api_instance.resolve_postid(article_url, account_data, proxy_str)\nsuccess = await api_instance.like_article(url_id, account_data, proxy_str)`,
    fixedCode: `url_id = api_instance.extract_article_id(article_url)  # URL编号用于点赞\npostid = await api_instance.resolve_postid(article_url, account_data, proxy_str)  # postid用于查状态和发评论\nsuccess = await api_instance.like_article(url_id, account_data, proxy_str)`,
    impactDescription: '交接文档(上)明确指出：点赞必须使用 URL 编号（如 20261110211425301094660），而评论与查状态必须使用从 HTML 提取的 postid（如 1794687421）。原代码把两者混为一谈且重复请求页面。',
  },
  {
    id: 'fix-3',
    file: 'main_engine.py / eastmoney_api.py',
    severity: 'critical',
    title: '修复 comment_article 调用参数个数不匹配与自动打码/容错闭环',
    originalBugCode: `# main_engine.py 传了 5 个参数:\nresult = await api_instance.comment_article(postid, comment_text, account_data, proxy_str, self.solver)\n# 但 eastmoney_api.py 只定义了 4 个参数:\nasync def comment_article(self, postid: str, text: str, account: Dict, proxy: Optional[str])`,
    fixedCode: `async def comment_article(\n    self, postid: str, text: str, account: Dict[str, Any], proxy: Optional[str],\n    solver: Optional[BaseClickCaptchaSolver] = None, validate: str = "", context_id: str = ""\n) -> CommentResult:`,
    impactDescription: '原 v5.6 交接时删除了 `eastmoney_api.py` 的 `solver` 参数，却忘了同步修改 `main_engine.py` 和 `captcha_probe.py`，运行时必报 TypeError: takes 5 positional arguments but 6 were given。',
  },
  {
    id: 'fix-4',
    file: 'eastmoney_api.py / captcha_probe.py',
    severity: 'high',
    title: '补全被误删的 encode_points 坐标编码函数与验证码提交链路',
    originalBugCode: `# captcha_probe.py 第 28 行:\nfrom eastmoney_api import EastMoneyAPI, encode_points\n# 但 eastmoney_api.py 中 encode_points 已被删除`,
    fixedCode: `def encode_points(points: List[Tuple[int, int]], style: str = "pipe") -> str:\n    # 完整支持 pipe / semicolon / comma / flat / json / jsonobj 六种坐标格式`,
    impactDescription: '恢复并加固 `encode_points` 函数及验证码二次重发接口，使 `captcha_probe.py` 探针工具和手动/OCR 点选验证闭环可正常执行。',
  },
  {
    id: 'fix-5',
    file: 'main_engine.py / proxy_pool.py',
    severity: 'high',
    title: '修复代理账密认证丢失与风控随机延迟、单号日限保护',
    originalBugCode: `proxy_url = self.proxy_pool.get_proxy_for_account(account_data)\nproxy_str = f"http://{account_data['proxy_ip']}:{account_data['proxy_port']}" if proxy_url else None`,
    fixedCode: `proxy_str = self.proxy_pool.get_proxy_for_account(account_data)\nawait asyncio.sleep(random.uniform(min_delay, max_delay))`,
    impactDescription: '原代码调用了 `get_proxy_for_account` 后又手动拼接了不含账密的 URL，导致带账号密码的城市级代理全部 407 鉴权失败；同时补充了 5~15s 随机延迟与单号评论上限控制。',
  },
];

export function generateConfigJson(
  accounts: AccountItem[],
  task: TaskConfig,
  settings: EngineSettings
): string {
  const seenH = new Set<string>();
  const payload = {
    accounts: accounts.map((a) => {
      const cleanedCookie = cleanRedundantLoginCookies(a.cookie || '').cleaned;
      const trimmedH = (a.h || '').trim();
      let uniqueH = '';
      if (trimmedH && !seenH.has(trimmedH)) {
        seenH.add(trimmedH);
        uniqueH = trimmedH;
      }
      return {
        username: a.username,
        cookie: cleanedCookie,
        deviceid: a.deviceid || '12dkmnjhbgtyhjko',
        like_deviceid: a.like_deviceid || '35dkmnjhbgtyhjko',
        h: uniqueH,
        proxy_ip: a.proxy_ip,
        proxy_port: a.proxy_port,
        proxy_city: a.proxy_city,
        ...(a.proxy_user ? { proxy_user: a.proxy_user } : {}),
        ...(a.proxy_pass ? { proxy_pass: a.proxy_pass } : {}),
        enabled: a.enabled,
      };
    }),
    task: {
      url: task.url,
      resolved_url_id: task.resolved_url_id,
      resolved_postid: task.resolved_postid,
      solo_task_mode: task.solo_task_mode || 'comment',
      enable_click: task.enable_click,
      enable_like: task.enable_like,
      enable_comment: task.enable_comment,
      target_clicks: task.target_clicks,
      target_likes: task.target_likes,
      target_comments: task.target_comments,
      comment_interval_max: task.comment_interval_max ?? 3,
      comment_interval_unit: task.comment_interval_unit || 'minutes',
      enable_spintax_dedup: task.enable_spintax_dedup,
      comments: task.comments,
    },
    settings: {
      max_concurrency: settings.max_concurrency,
      retry: settings.retry,
      min_delay: settings.min_delay,
      max_delay: settings.max_delay,
      daily_comment_limit: settings.daily_comment_limit,
      captcha_mode: settings.captcha_mode,
      captcha_max_retry: settings.captcha_max_retry,
      captcha_path: settings.captcha_path,
      captcha_submit_path: settings.captcha_submit_path,
      captcha_coord_param: settings.captcha_coord_param,
      captcha_coord_format: settings.captcha_coord_format,
      read_engine: settings.read_engine || 'browser',
      require_proxy_for_read: settings.require_proxy_for_read ?? true,
      proxy_api_url: settings.proxy_api_url || '',
      whitelist_api_url: settings.whitelist_api_url || '',
      proxy_user: settings.proxy_user || '',
      proxy_pass: settings.proxy_pass || '',
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function generateRepairedPythonFiles(
  accounts: AccountItem[],
  task: TaskConfig,
  settings: EngineSettings
): Record<string, string> {
  const configJson = generateConfigJson(accounts, task, settings);

  const eastmoneyApiPy = `import re
import json
import time
import base64
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import aiohttp

Point = Tuple[int, int]


class CommentStatus(Enum):
    SUCCESS = "success"
    CAPTCHA_REQUIRED = "captcha_required"
    FAILED = "failed"


def encode_points(points: List[Point], style: str = "pipe") -> str:
    """将点选验证码坐标序列编码为指定 Payload 格式"""
    if not points:
        return ""
    clean = [(int(x), int(y)) for x, y in points]
    style = (style or "pipe").lower()
    if style == "pipe":
        return "|".join(f"{x},{y}" for x, y in clean)
    if style == "semicolon":
        return ";".join(f"{x},{y}" for x, y in clean)
    if style == "comma":
        return ",".join(f"{x},{y}" for x, y in clean)
    if style == "flat":
        return " ".join(f"{x} {y}" for x, y in clean)
    if style == "json":
        return json.dumps([[x, y] for x, y in clean])
    if style == "jsonobj":
        return json.dumps([{"x": x, "y": y} for x, y in clean])
    return "|".join(f"{x},{y}" for x, y in clean)


class CommentResult:
    """评论结果的结构化封装"""
    __slots__ = ("status", "message", "reply_id", "context_id", "raw")

    def __init__(
        self,
        status: CommentStatus,
        message: str,
        reply_id: Optional[int] = None,
        context_id: Optional[str] = None,
        raw: Optional[Dict[str, Any]] = None,
    ):
        self.status = status
        self.message = message
        self.reply_id = reply_id
        self.context_id = context_id
        self.raw = raw or {}

    @property
    def ok(self) -> bool:
        return self.status is CommentStatus.SUCCESS

    @property
    def needs_captcha(self) -> bool:
        return self.status is CommentStatus.CAPTCHA_REQUIRED

    def __repr__(self) -> str:
        return f"<CommentResult {self.status.value} {self.message!r}>"


class EastMoneyAPI:
    """东方财富财富号接口封装（v6.0 稳定修复版）"""

    BASE_CAIFUHAO = "https://caifuhao.eastmoney.com"
    BASE_GBAPI = "https://gbapi.eastmoney.com"
    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )

    def __init__(self, session: aiohttp.ClientSession, settings: Optional[Dict[str, Any]] = None):
        self.session = session
        self.settings = settings or {}

    def _headers(self, account: Dict[str, Any], referer: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "User-Agent": self.UA,
            "Cookie": account["cookie"],
        }
        if referer:
            headers["Referer"] = referer
        return headers

    @staticmethod
    def _parse_jsonp(text: str) -> Dict[str, Any]:
        m = re.search(r"^[^(]*\\((.*)\\)\\s*;?\\s*$", text.strip(), re.S)
        if not m:
            raise ValueError(f"非 JSONP 格式: {text[:120]}")
        return json.loads(m.group(1))

    @staticmethod
    def extract_article_id(url: str) -> str:
        """从 URL 提取文章 URL 编号（如 20261110211425301094660），专门用于点赞接口"""
        m = re.search(r"/news/(\\d+)", url)
        if not m:
            raise ValueError(f"无法从 URL 提取文章编号: {url}")
        return m.group(1)

    @staticmethod
    def extract_postid_from_html(html_content: str) -> str:
        """从文章页 HTML 中提取 postid（如 postId:"1796084880"），专门用于查状态和发评论"""
        patterns = [
            r'(?:^|[^\\w])[\\x22\\x27]?post_?id[\\x22\\x27]?\\s*[:=]\\s*[\\x22\\x27]?(\\d{6,15})[\\x22\\x27]?',
            r'var\\s+post_?id\\s*=\\s*[\\x22\\x27]?(\\d{6,15})[\\x22\\x27]?',
            r'data-postid\\s*=\\s*[\\x22\\x27](\\d{6,15})[\\x22\\x27]',
            r'window\\.articleId\\s*=\\s*[\\x22\\x27](\\d+)[\\x22\\x27]',
        ]
        for pat in patterns:
            m = re.search(pat, html_content, re.I)
            if m:
                return m.group(1)
        raise ValueError("无法从 HTML 提取 postid，请检查文章链接或网页结构")

    async def resolve_postid(
        self, article_url: str, account: Dict[str, Any], proxy: Optional[str]
    ) -> str:
        headers = self._headers(account, referer=article_url)
        async with self.session.get(article_url, headers=headers, proxy=proxy) as resp:
            html = await resp.text()
            return self.extract_postid_from_html(html)

    async def get_like_status(
        self, postid: str, account: Dict[str, Any], proxy: Optional[str]
    ) -> Dict[str, Any]:
        url = f"{self.BASE_CAIFUHAO}/v1/ArticleAndReplyLikeInfo?postid={postid}"
        headers = self._headers(account)
        async with self.session.get(url, headers=headers, proxy=proxy) as resp:
            return await resp.json(content_type=None)

    async def like_article(
        self, url_id: str, account: Dict[str, Any], proxy: Optional[str]
    ) -> bool:
        """点赞接口（注意：参数 id 必须传 URL 编号 url_id，而非 postid）"""
        url = f"{self.BASE_GBAPI}//likeopt/JSONP/LikeArticle"
        params = {
            "version": "100",
            "product": "EastMoney",
            "plat": "Web",
            "h": account["h"],
            "deviceid": account["like_deviceid"],
            "callback": "cb855",
            "type": "20",
            "id": url_id,
            "_": str(int(time.time() * 1000)),
        }
        headers = self._headers(account, referer=f"{self.BASE_CAIFUHAO}/news/{url_id}")
        async with self.session.get(url, headers=headers, params=params, proxy=proxy) as resp:
            text = (await resp.text()).strip()
            try:
                parsed = self._parse_jsonp(text)
                if parsed.get("rc") == 1:
                    return True
                print(f"[{account.get('username', '')}] 点赞接口回执: {parsed}")
                return False
            except Exception:
                if '"rc":1' in text or "rc:1" in text:
                    return True
                print(f"[{account.get('username', '')}] 点赞接口回执: {text[:120]}")
                return False

    async def comment_article(
        self,
        postid: str,
        text: str,
        account: Dict[str, Any],
        proxy: Optional[str],
        solver: Optional[Any] = None,
        validate: str = "",
        context_id: str = "",
        article_url: Optional[str] = None,
    ) -> CommentResult:
        """执行评论。使用真实文章 URL 作为 Referer，支持 rc:2 容错换号"""
        url = f"{self.BASE_CAIFUHAO}/newsreply/replyopt/api/Reply/WebReplyArticle"
        real_referer = (article_url or "").strip() or f"{self.BASE_CAIFUHAO}/news/{postid}"
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": self.BASE_CAIFUHAO,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": self.UA,
            "Cookie": account["cookie"],
            "Referer": real_referer,
        }
        data = {
            "id": postid,
            "text": text,
            "pic": "",
            "t_type": "0",
            "account": "",
            "validate": validate,
            "contextId": context_id,
            "plat": "Web",
            "version": "100",
            "product": "EastMoney",
            "deviceid": account["deviceid"],
            "path": "replyopt/api/Reply/WebReplyArticle",
        }
        async with self.session.post(url, headers=headers, data=data, proxy=proxy) as resp:
            result = await resp.json(content_type=None)
            rc = result.get("rc")
            if rc == 1:
                return CommentResult(
                    status=CommentStatus.SUCCESS,
                    message="评论成功",
                    reply_id=result.get("reply_id"),
                    raw=result,
                )
            if rc == 2:
                ctx_id = result.get("context_id") or result.get("contextId") or ""
                return CommentResult(
                    status=CommentStatus.CAPTCHA_REQUIRED,
                    message="触发点选验证码 (rc:2 / error_code:108)",
                    context_id=ctx_id,
                    raw=result,
                )
            return CommentResult(
                status=CommentStatus.FAILED,
                message=f"评论失败: rc={rc}, msg={result}",
                raw=result,
            )

    # 兼容 captcha_probe.py 中的 self.api.comment(...) 调用
    comment = comment_article

    async def get_article_read_count(
        self, url_id: str, proxy: Optional[str] = None
    ) -> Optional[int]:
        """查询东方财富财富号公开接口显示的实时阅读数 (GetArticleReadCount)，用于透明核验真实涨量"""
        clean_id = (url_id or "").strip()
        if not clean_id:
            return None
        url = "https://caifuhaoapi.eastmoney.com/api/v1/webchannel/Article/GetArticleReadCount"
        params = {
            "callback": "cb855",
            "artcode": clean_id,
            "businessid": "0.123",
            "_": str(int(time.time() * 1000)),
        }
        headers = {
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "User-Agent": self.UA,
            "Referer": f"{self.BASE_CAIFUHAO}/news/{clean_id}",
        }
        try:
            async with self.session.get(url, headers=headers, params=params, proxy=proxy) as resp:
                if resp.status != 200:
                    return None
                raw_txt = (await resp.text()).strip()
                parsed = self._parse_jsonp(raw_txt)
                res_obj = (parsed or {}).get("Result") or {}
                rc_val = res_obj.get("ReadCount")
                return int(rc_val) if rc_val is not None else None
        except Exception:
            return None

    async def click_article(
        self,
        article_url: str,
        account: Dict[str, Any],
        proxy: Optional[str],
        anonymous_visit: bool = False,
    ) -> bool:
        """执行文章页真实文档请求并校验正文完整性；多轮补齐时剥离固定登录 Cookie 避免同号同会话去重"""
        ua_variants = (
            self.UA,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
        )
        chosen_ua = ua_variants[int(time.time() * 1000) % len(ua_variants)]
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": chosen_ua,
            "Referer": "https://caifuhao.eastmoney.com/",
        }
        if not anonymous_visit and account.get("cookie"):
            headers["Cookie"] = account["cookie"]
        try:
            async with self.session.get(
                article_url, headers=headers, proxy=proxy, allow_redirects=True
            ) as resp:
                if resp.status != 200:
                    return False
                body_text = await resp.text(errors="ignore")
                if len(body_text) < 1500:
                    return False
                lower_body = body_text.lower()
                return ("eastmoney" in lower_body) or ("caifuhao" in lower_body)
        except Exception as e:
            print(f"点击失败: {e}")
            return False
`;

  const mainEnginePy = `import argparse
import asyncio
import os
import random
import json
import time
from typing import List, Optional
import aiohttp
from account_pool import AccountPool
from proxy_pool import ProxyPool
from eastmoney_api import EastMoneyAPI, CommentStatus
from captcha_solver import build_solver


def disable_windows_quickedit() -> None:
    """自动关闭 Windows CMD 快速编辑模式，防止鼠标误点黑框内部出现『选择』导致程序挂起暂停"""
    if os.name != "nt":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            # 清除 ENABLE_QUICK_EDIT_MODE(0x0040)，保留 ENABLE_EXTENDED_FLAGS(0x0080)
            new_mode = (mode.value & ~0x0040) | 0x0080
            kernel32.SetConsoleMode(handle, new_mode)
    except Exception:
        pass


def compute_random_comment_delay_sec(max_val: float, unit: str) -> float:
    """生成非固定随机评论间隔秒数（严格 <= 用户设定阈值 max_sec）"""
    raw_max = max(1.0, float(max_val or 1.0))
    max_sec = raw_max * 60.0 if str(unit or "").strip().lower() == "minutes" else raw_max
    min_sec = min(max_sec, max(1.0, round(max_sec * 0.15, 1)))
    chosen = random.uniform(min_sec, max_sec)
    return min(max_sec, max(1.0, round(chosen, 1)))


def format_duration_cn(sec: float) -> str:
    s = max(1, int(round(sec)))
    if s < 60:
        return f"{s}秒"
    m, rem = divmod(s, 60)
    return f"{m}分钟" if rem == 0 else f"{m}分{rem}秒"


STALE_LOGIN_KEYS = {
    "RequestData",
    "__RequestVerificationToken",
    "__RequestVerificationToken_L3B1Yg2",
    "p_origin",
    "st_inirUrl",
    "_qcu",
    "_qct",
    "ASL",
    "ADVC",
    "ADVS",
}


def clean_cookie_string(raw_cookie: str) -> str:
    if not raw_cookie:
        return ""
    ordered = []
    kv = {}
    for seg in raw_cookie.split(";"):
        seg = seg.strip()
        if "=" not in seg:
            continue
        k, v = seg.split("=", 1)
        k, v = k.strip(), v.strip()
        if not k or k in STALE_LOGIN_KEYS or (k == "sid" and v == ""):
            continue
        if k not in kv:
            ordered.append(k)
        kv[k] = v
    return "; ".join(f"{k}={kv[k]}" for k in ordered)


def sanitize_local_config_file(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8-sig") as f:
        raw_text = f.read()
    repaired_syntax = False
    try:
        cfg = json.loads(raw_text)
    except json.JSONDecodeError:
        import re as _re
        fixed_text = _re.sub(
            r'([0-9"]|true|false|null|\\]|\\})\\s*\\r?\\n(\\s*"[^"]+"\\s*:)',
            r"\\1,\\n\\2",
            raw_text,
        )
        fixed_text = _re.sub(r",\\s*([}\\]])", r"\\1", fixed_text)
        cfg = json.loads(fixed_text)
        repaired_syntax = True
    seen_h = set()
    cleaned_cookies = 0
    cleared_dup_h = 0
    changed = repaired_syntax
    for acc in cfg.get("accounts", []):
        raw_ck = acc.get("cookie") or ""
        new_ck = clean_cookie_string(raw_ck)
        if new_ck != raw_ck:
            acc["cookie"] = new_ck
            cleaned_cookies += 1
            changed = True
        cur_h = (acc.get("h") or "").strip()
        if cur_h:
            if cur_h in seen_h:
                acc["h"] = ""
                cleared_dup_h += 1
                changed = True
            else:
                seen_h.add(cur_h)
    if changed:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"[配置自动精简与修复] 已自动修复 JSON 逗号/格式并剔除 {cleaned_cookies} 个冗余 Cookie，清空 {cleared_dup_h} 个跨号重复 h 值")
    print("[本地安全提醒] config.json 含账号会话凭证(ct/ut)与代理接口密钥，请仅限本机受控目录保存，切勿外传或提交公开代码库")
    return cfg


class MainEngine:
    """东方财富自动化运营调度引擎 v6.0（支持单任务独立执行 + 多任务组合并发调度 + 实时公开阅读核验）"""

    def __init__(self, config_path: str = "config.json", task_override: Optional[dict] = None):
        disable_windows_quickedit()
        self.config_path = config_path
        self.config = sanitize_local_config_file(config_path)
        if task_override and isinstance(task_override, dict):
            merged_task = dict(self.config.get("task") or {})
            merged_task.update(task_override)
            self.config["task"] = merged_task
        self.pool = AccountPool(config_path)
        self.proxy_pool = ProxyPool(config_path)
        self.solver = build_solver(self.config["settings"].get("captcha_mode", "skip"))
        self._cached_postid: str = ""
        self._seq_counter: int = 0
        self.stop_requested: bool = False
        self.paused: bool = False
        self.current_mode: str = ""
        self.active_modes: List[str] = []
        self.live_logs: List[str] = []
        task_cfg = self.config.get("task", {})
        task_comments = list(task_cfg.get("comments") or [])
        target_comments = max(1, int(task_cfg.get("target_comments", len(task_comments) or 10)))
        self._pending_comments = task_comments[:target_comments]
        self.stats = {
            "clicks": 0,
            "likes": 0,
            "comments": 0,
            "captcha_tries": 0,
            "failed_accounts": 0,
            "target_clicks": max(1, int(task_cfg.get("target_clicks", 100))),
            "target_likes": max(1, int(task_cfg.get("target_likes", 20))),
            "target_comments": target_comments,
            "read_count_start": None,
            "read_count_live": None,
        }

    def _log(self, message: str) -> None:
        ts = time.strftime("%H:%M:%S")
        line = f"[{ts}] {message}"
        print(line, flush=True)
        self.live_logs.append(line)
        if len(self.live_logs) > 150:
            self.live_logs = self.live_logs[-150:]

    async def _wait_if_paused(self) -> bool:
        while self.paused and not self.stop_requested:
            await asyncio.sleep(0.5)
        return not self.stop_requested

    async def _sleep_cancelable(self, total_sec: float, log_countdown: bool = False, threshold_label: str = "") -> bool:
        remaining = max(0.0, float(total_sec))
        elapsed_since_print = 0.0
        while remaining > 0 and not self.stop_requested:
            if not await self._wait_if_paused():
                return False
            step = min(1.0, remaining)
            await asyncio.sleep(step)
            remaining -= step
            elapsed_since_print += step
            if log_countdown and remaining >= 5.0 and elapsed_since_print >= 20.0:
                elapsed_since_print = 0.0
                self._log(f"⏳ [评论随机间隔倒计时] 距离发送下一条评论还剩约 {format_duration_cn(remaining)} (上限阈值 {threshold_label})...")
        return not self.stop_requested

    @staticmethod
    def _apply_comment_variation(base_text: str, seq_idx: int, enable_dedup: bool) -> str:
        clean = (base_text or "").strip()
        if not clean or not enable_dedup:
            return clean
        suffixes = ["", "，赞同！", "，值得细读。", "，持续关注。", "，逻辑很清晰。", "，感谢博主分享！"]
        chosen = suffixes[seq_idx % len(suffixes)]
        if not chosen:
            return clean
        stripped = clean.rstrip("！!。.~～")
        return f"{stripped}{chosen}"

    async def _resolve_article_ids(self, api: EastMoneyAPI, article_url: str, account: dict, proxy_str: Optional[str]):
        task_cfg = self.config.get("task", {})
        url_id = api.extract_article_id(article_url)
        if task_cfg.get("resolved_postid") and task_cfg.get("resolved_url_id") == url_id:
            postid = str(task_cfg["resolved_postid"])
        elif self._cached_postid:
            postid = self._cached_postid
        else:
            postid = await api.resolve_postid(article_url, account, proxy_str)
            self._cached_postid = postid
        return url_id, postid

    async def _refresh_public_read_snapshot(self, url_id: str, is_initial: bool = False) -> None:
        if not url_id:
            return
        connector = aiohttp.TCPConnector(limit=2, ssl=False)
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            api = EastMoneyAPI(session, settings=self.config.get("settings", {}))
            rc = await api.get_article_read_count(url_id, proxy=None)
            if rc is not None:
                if is_initial or self.stats["read_count_start"] is None:
                    self.stats["read_count_start"] = rc
                self.stats["read_count_live"] = rc
                delta = rc - int(self.stats["read_count_start"] or rc)
                sign = f"+{delta}" if delta >= 0 else str(delta)
                self._log(
                    f"📊 [公开阅读核验] 请求已完成 {self.stats['clicks']}/{self.stats['target_clicks']} · "
                    f"东财页面公开阅读数: {self.stats['read_count_start']} -> {rc} ({sign})"
                )

    def _flush_proxy_notes(self) -> None:
        if hasattr(self.proxy_pool, "pop_status_notes"):
            for note in self.proxy_pool.pop_status_notes():
                self._log(note)

    async def _click_worker_browser(
        self,
        browser,
        account: dict,
        sem: asyncio.Semaphore,
        target_clicks: int,
        round_idx: int = 1,
        require_proxy: bool = True,
    ):
        async with sem:
            if not await self._wait_if_paused():
                return
            if self.stop_requested or self.stats["clicks"] >= target_clicks:
                return
            username = account.get("username", "unknown")
            settings = self.config.get("settings", {})
            article_url = self.config.get("task", {})["url"]
            anonymous_visit = round_idx > 1

            delay = random.uniform(
                float(settings.get("min_delay", 0.8)),
                float(settings.get("max_delay", 2.2)),
            )
            if not await self._sleep_cancelable(delay):
                return
            if self.stats["clicks"] >= target_clicks or self.stop_requested:
                return

            ua_variants = (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            )

            async def _open_once(proxy_url: Optional[str]) -> tuple:
                pw_proxy = self.proxy_pool.to_playwright_proxy(proxy_url)
                chosen_ua = random.choice(ua_variants)
                ctx_kwargs = {
                    "user_agent": chosen_ua,
                    "locale": "zh-CN",
                    "timezone_id": "Asia/Shanghai",
                    "viewport": {"width": 1366, "height": 768},
                    "ignore_https_errors": True,
                }
                if pw_proxy:
                    ctx_kwargs["proxy"] = pw_proxy
                context = await browser.new_context(**ctx_kwargs)
                await context.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                    "window.chrome = window.chrome || { runtime: {} };"
                )

                async def _abort_heavy(route):
                    try:
                        rtype = route.request.resource_type
                        rurl = (route.request.url or "").lower()
                        if rtype in ("media", "font"):
                            await route.abort()
                            return
                        if rtype == "image":
                            # 绝不拦截东财阅读量/曝光/停留埋点像素（web_click.gif、Web_JS.gif、CommonRecommend.png 均为 image！）
                            if (
                                ".gif" in rurl
                                or "gbapi.eastmoney" in rurl
                                or "bdwblog" in rurl
                                or "bddtlog" in rurl
                                or "huaxiang" in rurl
                                or "anonflow" in rurl
                                or "articleclick" in rurl
                                or "commonrecommend" in rurl
                                or "click" in rurl
                                or "beacon" in rurl
                            ):
                                await route.continue_()
                                return
                            if any(ext in rurl for ext in (".jpg", ".jpeg", ".webp", ".bmp")):
                                await route.abort()
                                return
                        await route.continue_()
                    except Exception:
                        pass

                try:
                    await context.route("**/*", _abort_heavy)
                    page = await context.new_page()
                    beacon_hits = 0
                    beacon_event = asyncio.Event()

                    def _on_response(res):
                        nonlocal beacon_hits
                        try:
                            u = (res.url or "").lower()
                            if res.status < 400 and any(
                                k in u
                                for k in (
                                    "web_click",
                                    "web_js",
                                    "web_other",
                                    "commonrecommend",
                                    "articleclick",
                                    "webreport",
                                    "bdwblog",
                                )
                            ):
                                beacon_hits += 1
                                if beacon_hits >= 2:
                                    beacon_event.set()
                        except Exception:
                            pass

                    page.on("response", _on_response)
                    resp = await page.goto(article_url, wait_until="domcontentloaded", timeout=15000)
                    status_code = resp.status if resp else 0
                    if status_code == 0 or status_code >= 400:
                        raise RuntimeError(f"页面状态码异常 HTTP {status_code}")
                    try:
                        await page.wait_for_load_state("load", timeout=8500)
                    except Exception:
                        pass
                    try:
                        await page.evaluate("window.scrollTo({top: 380, behavior: 'smooth'})")
                    except Exception:
                        pass
                    try:
                        await asyncio.wait_for(beacon_event.wait(), timeout=4.5)
                    except Exception:
                        pass
                    await page.wait_for_timeout(1200)
                    html_txt = await page.content()
                    if len(html_txt) < 1500:
                        raise RuntimeError(f"页面内容过短({len(html_txt)})")
                    lower_txt = html_txt.lower()
                    page_ok = ("eastmoney" in lower_txt) or ("caifuhao" in lower_txt)
                    if page_ok and beacon_hits == 0:
                        raise RuntimeError("页面统计像素/埋点未就绪(代理慢或丢包)")
                    return (page_ok, beacon_hits)
                finally:
                    try:
                        await context.close()
                    except Exception:
                        pass

            # 实测东财按访客IP去重：单篇同一IP短时间内第2次访问不计新增阅读，强制每IP对单篇限用1次
            proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account, 1)
            self._flush_proxy_notes()
            if proxy_str is None and require_proxy:
                await asyncio.sleep(2.0)
                proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account, 1)
                self._flush_proxy_notes()
                if proxy_str is None:
                    self._log(f"[{username}] ⚠️ 代理池未返回可用天启 IP（{self.proxy_pool.last_error or '已达限流/无节点'}），本轮安全跳过防单IP空跑")
                    return

            try:
                ok = False
                beacon_cnt = 0
                try:
                    ok, beacon_cnt = await _open_once(proxy_str)
                except Exception as first_err:
                    self.proxy_pool.invalidate_proxy(proxy_str)
                    if not self.stop_requested:
                        self._log(f"[{username}] ♻️ 节点 {self.proxy_pool.format_proxy_host(proxy_str)} 访问受阻 ({str(first_err)[:60]})，切换新节点重试...")
                        proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account, 1)
                        self._flush_proxy_notes()
                        if proxy_str is not None or not require_proxy:
                            ok, beacon_cnt = await _open_once(proxy_str)

                if ok and self.stats["clicks"] < target_clicks:
                    self.stats["clicks"] += 1
                    cur_c = self.stats["clicks"]
                    tag = "匿名访客" if anonymous_visit else username
                    proxy_host = self.proxy_pool.format_proxy_host(proxy_str)
                    self._log(f"[{tag}] ✅ 浏览器JS真阅读完成 ({cur_c}/{target_clicks} · 触发埋点{beacon_cnt}次) · 节点 {proxy_host}")
                    if cur_c == 5 or cur_c % 20 == 0:
                        try:
                            uid = EastMoneyAPI.extract_article_id(article_url)
                            await self._refresh_public_read_snapshot(uid, is_initial=False)
                        except Exception:
                            pass
            except Exception as e:
                self.proxy_pool.invalidate_proxy(proxy_str)
                self.stats["failed_accounts"] += 1
                self._log(f"[{username}] 浏览器JS阅读异常: {str(e)[:120]}")

    async def _click_worker(
        self,
        account: dict,
        sem: asyncio.Semaphore,
        target_clicks: int,
        round_idx: int = 1,
        require_proxy: bool = True,
    ):
        async with sem:
            if not await self._wait_if_paused():
                return
            if self.stop_requested or self.stats["clicks"] >= target_clicks:
                return
            username = account.get("username", "unknown")
            settings = self.config.get("settings", {})
            article_url = self.config.get("task", {})["url"]
            anonymous_visit = round_idx > 1

            delay = random.uniform(
                float(settings.get("min_delay", 1.0)),
                float(settings.get("max_delay", 3.5)),
            )
            if not await self._sleep_cancelable(delay):
                return
            if self.stats["clicks"] >= target_clicks:
                return

            # 高频换新 IP：单篇每节点限用 1 次即向天启提取新一批短效高匿 IP，避免同 IP 访问同一文章被东财去重
            proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account, 1)
            self._flush_proxy_notes()
            if proxy_str is None and require_proxy:
                self._log(f"[{username}] ⚠️ 未取到有效天启代理 IP（{self.proxy_pool.last_error or '节点池为空'}），安全跳过防止本机单IP空跑")
                return

            connector = aiohttp.TCPConnector(limit=10, ssl=False)
            timeout = aiohttp.ClientTimeout(total=22)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                api = EastMoneyAPI(session, settings=settings)
                try:
                    clicked = await api.click_article(
                        article_url, account, proxy_str, anonymous_visit=anonymous_visit
                    )
                    if not clicked and not self.stop_requested:
                        self.proxy_pool.invalidate_proxy(proxy_str)
                        proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account, 1)
                        self._flush_proxy_notes()
                        if proxy_str is not None or not require_proxy:
                            clicked = await api.click_article(
                                article_url, account, proxy_str, anonymous_visit=anonymous_visit
                            )
                    if clicked and self.stats["clicks"] < target_clicks:
                        self.stats["clicks"] += 1
                        cur_c = self.stats["clicks"]
                        tag = "匿名换IP访客" if anonymous_visit else username
                        proxy_host = self.proxy_pool.format_proxy_host(proxy_str)
                        self._log(f"[{tag}] ✅ 纯HTTP正文校验通过 ({cur_c}/{target_clicks}) · 节点 {proxy_host}")
                        if cur_c == 10 or cur_c % 25 == 0:
                            try:
                                uid = api.extract_article_id(article_url)
                                await self._refresh_public_read_snapshot(uid, is_initial=False)
                            except Exception:
                                pass
                except Exception as e:
                    self.proxy_pool.invalidate_proxy(proxy_str)
                    self.stats["failed_accounts"] += 1
                    self._log(f"[{username}] 阅读请求异常: {e}")

    async def _like_worker(self, account: dict, sem: asyncio.Semaphore, target_likes: int):
        async with sem:
            if not await self._wait_if_paused():
                return
            if self.stop_requested or self.stats["likes"] >= target_likes:
                return
            username = account.get("username", "unknown")
            settings = self.config.get("settings", {})
            article_url = self.config.get("task", {})["url"]

            delay = random.uniform(
                float(settings.get("min_delay", 1.5)),
                float(settings.get("max_delay", 4.5)),
            )
            if not await self._sleep_cancelable(delay):
                return
            if self.stats["likes"] >= target_likes:
                return

            proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account)
            self._flush_proxy_notes()
            connector = aiohttp.TCPConnector(limit=10, ssl=False)
            timeout = aiohttp.ClientTimeout(total=25)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                api = EastMoneyAPI(session, settings=settings)
                try:
                    try:
                        url_id, postid = await self._resolve_article_ids(api, article_url, account, proxy_str)
                        like_status = await api.get_like_status(postid, account, proxy_str)
                    except Exception:
                        self.proxy_pool.invalidate_proxy(proxy_str)
                        proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account)
                        self._flush_proxy_notes()
                        url_id, postid = await self._resolve_article_ids(api, article_url, account, proxy_str)
                        like_status = await api.get_like_status(postid, account, proxy_str)

                    post_like_info = (like_status or {}).get("post_like_info") or {}
                    already_liked = bool(post_like_info.get("post_is_like")) or (
                        (like_status or {}).get("isLike") == 1
                    )
                    if already_liked:
                        self._log(f"[{username}] ℹ️ 该账号此前已点过赞，自动跳过重复点赞")
                        return
                    if self.stats["likes"] < target_likes:
                        liked_ok = False
                        try:
                            liked_ok = await api.like_article(url_id, account, proxy_str)
                        except Exception:
                            self.proxy_pool.invalidate_proxy(proxy_str)
                            proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account)
                            self._flush_proxy_notes()
                            liked_ok = await api.like_article(url_id, account, proxy_str)
                        if liked_ok:
                            self.stats["likes"] += 1
                            self._log(f"[{username}] 👍 点赞成功 ({self.stats['likes']}/{target_likes}) [url_id={url_id}]")
                except Exception as e:
                    self.proxy_pool.invalidate_proxy(proxy_str)
                    self.stats["failed_accounts"] += 1
                    self._log(f"[{username}] 点赞运行异常: {e}")

    async def _run_standalone_clicks(self) -> None:
        task_cfg = self.config.get("task", {})
        settings = self.config.get("settings", {})
        article_url = task_cfg.get("url") or ""
        target_clicks = max(1, int(task_cfg.get("target_clicks", 100)))
        read_engine = str(settings.get("read_engine") or "browser").strip().lower()
        require_proxy = bool(settings.get("require_proxy_for_read", True))
        self.stats["target_clicks"] = target_clicks
        enabled_accounts = [acc for acc in self.pool.accounts if acc and acc.get("enabled", True)]
        if not enabled_accounts:
            self._log("❌ 没有可用的启用账号，无法执行阅读任务")
            return
        random.shuffle(enabled_accounts)
        self._log(f"🔀 [账号随机洗牌] 已打乱 {len(enabled_accounts)} 个账号执行顺序（避免每次都从固定前几个号开始）")

        self._flush_proxy_notes()
        if require_proxy:
            if not self.proxy_pool.has_proxy_api():
                self._log("❌ [防单IP空跑保护] 未检测到有效的天启代理 API 提取链接！用本机单IP跑阅读无法真实涨量，请先在第一步填入天启代理 API 并点『检测代理』通过。")
                return
            if not self.proxy_pool._dynamic_nodes:
                self._log("🔍 [阅读前置代理自检] 正在提取并测活天启代理 HTTPS 隧道...")
                probe_res = await self.proxy_pool.refresh_from_api()
                self._flush_proxy_notes()
                if not probe_res.get("ok"):
                    self._log(
                        f"❌ [防单IP空跑保护] 天启代理隧道测活未通过：{probe_res.get('error') or '无可用节点'}。"
                        f"为避免用本机单一公网 IP 白跑 5000 次请求，任务已自动中止！请先点顶部『🔍 测试天启代理』排查白名单或填写天启账密。"
                    )
                    return
                alive_cnt = len(probe_res.get("alive_nodes") or [])
                self._log(f"✅ [阅读前置代理自检通过] 已就绪 {alive_cnt} 个可用天启高匿 IP 节点")

        url_id = ""
        try:
            url_id = EastMoneyAPI.extract_article_id(article_url)
            await self._refresh_public_read_snapshot(url_id, is_initial=True)
        except Exception:
            pass

        max_conc = max(1, min(int(settings.get("max_concurrency", 3)), len(enabled_accounts)))
        max_rounds = max(5, (target_clicks // max(1, len(enabled_accounts))) + 3)

        if read_engine == "browser":
            try:
                from playwright.async_api import async_playwright
            except ImportError:
                self._log("❌ 当前环境缺少 playwright，请先点顶部『🛠️ 一键装抓包浏览器内核』或在第二步切换为『纯HTTP协议』！")
                return

            browser_conc = max(1, min(max_conc, 6))
            if max_conc > 6:
                self._log(f"ℹ️ [内存保护] 浏览器JS真阅读模式已自动将并发由 {max_conc} 限流为 {browser_conc} 协程以防爆内存")
            sem = asyncio.Semaphore(browser_conc)
            self._log(
                f"🚀 [浏览器JS真阅读启动] 目标: {target_clicks} | 并发窗口: {browser_conc} | "
                f"放行东财统计像素 + 模拟滚动 + 等待埋点回调完成 + 单篇每IP限用1次强制轮换"
            )
            async with async_playwright() as p:
                try:
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                            "--disable-dev-shm-usage",
                        ],
                    )
                except Exception as launch_err:
                    self._log(f"❌ 无头 Chromium 浏览器内核启动失败 ({launch_err})，请先点顶部『🛠️ 一键装抓包浏览器内核』后再试！")
                    return
                try:
                    round_idx = 1
                    while not self.stop_requested and self.stats["clicks"] < target_clicks and round_idx <= max_rounds:
                        rem = target_clicks - self.stats["clicks"]
                        if round_idx > 1:
                            random.shuffle(enabled_accounts)
                            self._log(f"🔄 [阅读第 {round_idx} 轮独立访客补齐] 当前 {self.stats['clicks']}/{target_clicks}，已重新洗牌账号并换新鲜代理 IP 补齐剩余 {rem} 次...")
                        batch = enabled_accounts[: max(rem + browser_conc, min(len(enabled_accounts), rem * 2))]
                        await asyncio.gather(
                            *(
                                self._click_worker_browser(
                                    browser,
                                    acc,
                                    sem,
                                    target_clicks,
                                    round_idx=round_idx,
                                    require_proxy=require_proxy,
                                )
                                for acc in batch
                            )
                        )
                        round_idx += 1
                finally:
                    try:
                        await browser.close()
                    except Exception:
                        pass
        else:
            sem = asyncio.Semaphore(max_conc)
            self._log(
                f"🚀 [纯HTTP协议阅读启动] 目标: {target_clicks} | 并发协程: {max_conc}（提示：若发现请求涨但东财公开数不涨，请切换为『真实浏览器JS执行』模式）"
            )
            round_idx = 1
            while not self.stop_requested and self.stats["clicks"] < target_clicks and round_idx <= max_rounds:
                rem = target_clicks - self.stats["clicks"]
                if round_idx > 1:
                    random.shuffle(enabled_accounts)
                    self._log(f"🔄 [阅读第 {round_idx} 轮补齐] 当前进度 {self.stats['clicks']}/{target_clicks}，已重新洗牌账号并换新鲜代理 IP 补齐剩余 {rem} 次...")
                batch = enabled_accounts[: max(rem + max_conc, min(len(enabled_accounts), rem * 2))]
                await asyncio.gather(
                    *(
                        self._click_worker(
                            acc,
                            sem,
                            target_clicks,
                            round_idx=round_idx,
                            require_proxy=require_proxy,
                        )
                        for acc in batch
                    )
                )
                round_idx += 1

        if url_id and not self.stop_requested:
            await self._refresh_public_read_snapshot(url_id, is_initial=False)

    async def _run_standalone_likes(self) -> None:
        task_cfg = self.config.get("task", {})
        target_likes = max(1, int(task_cfg.get("target_likes", 20)))
        self.stats["target_likes"] = target_likes
        like_accounts = [
            acc for acc in self.pool.accounts
            if acc
            and acc.get("enabled", True)
            and "ct=" in (acc.get("cookie") or "")
            and "ut=" in (acc.get("cookie") or "")
            and (acc.get("h") or "").strip()
        ]
        if not like_accounts:
            self._log("❌ 当前账号池中没有具备独立 h 签名且含 ct/ut 的账号，无法执行点赞子任务")
            return
        random.shuffle(like_accounts)
        max_conc = max(1, min(int(self.config["settings"].get("max_concurrency", 3)), len(like_accounts)))
        sem = asyncio.Semaphore(max_conc)
        self._log(
            f"🚀 [点赞子任务启动] 目标点赞数: {target_likes} | 可点赞独立 h 账号池: {len(like_accounts)} 个（已随机打乱出场顺序）"
        )
        await asyncio.gather(*(self._like_worker(acc, sem, target_likes) for acc in like_accounts))

    async def _run_standalone_comments(self) -> None:
        task_cfg = self.config.get("task", {})
        settings = self.config.get("settings", {})
        article_url = task_cfg["url"]
        target_comments = max(1, int(task_cfg.get("target_comments", len(self._pending_comments) or 10)))
        self.stats["target_comments"] = target_comments
        interval_max = max(1.0, float(task_cfg.get("comment_interval_max", 3)))
        interval_unit = str(task_cfg.get("comment_interval_unit", "minutes")).strip().lower()
        if interval_unit not in ("seconds", "minutes"):
            interval_unit = "minutes"
        threshold_sec = interval_max * 60.0 if interval_unit == "minutes" else interval_max
        min_bound_sec = min(threshold_sec, max(1.0, round(threshold_sec * 0.15, 1)))
        threshold_label = format_duration_cn(threshold_sec)

        comment_accounts = [
            acc for acc in self.pool.accounts
            if acc
            and acc.get("enabled", True)
            and "ct=" in (acc.get("cookie") or "")
            and "ut=" in (acc.get("cookie") or "")
        ]
        if not comment_accounts:
            self._log("❌ 当前账号池中没有含有效 ct/ut 登录凭证的账号，无法执行评论子任务")
            return
        if not self._pending_comments:
            self._log("❌ 预设评论语录列表为空，请先填写至少 1 条评论语录")
            return
        random.shuffle(comment_accounts)

        self._log(
            f"🚀 [评论子任务启动] 待发评论目标: {min(target_comments, len(self._pending_comments))} 条 | "
            f"随机间隔上限阈值: ≤ {threshold_label} (每次将在 {format_duration_cn(min_bound_sec)} ~ {threshold_label} 之间纯随机抽取，绝不超过阈值)"
        )

        need_random_wait = False
        for account in comment_accounts:
            if not await self._wait_if_paused():
                break
            if self.stop_requested or not self._pending_comments or self.stats["comments"] >= target_comments:
                break

            if need_random_wait:
                wait_sec = compute_random_comment_delay_sec(interval_max, interval_unit)
                self._log(
                    f"⏳ [随机间隔等待] 本次随机抽取间隔 {format_duration_cn(wait_sec)} "
                    f"(严格 ≤ 用户设定阈值 {threshold_label})，等待结束后自动换新鲜 IP 发下一条..."
                )
                if not await self._sleep_cancelable(wait_sec, log_countdown=True, threshold_label=threshold_label):
                    break
                need_random_wait = False

            if self.stop_requested:
                break

            # 关键设计：先完成长随机间隔等待，醒来后再调用 get_proxy_for_account，确保超过 110s 时自动向天启 API 拉取全新未过期 IP！
            username = account.get("username", "unknown")
            proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account)
            self._flush_proxy_notes()
            base_comment = self._pending_comments.pop(0)
            seq = self._seq_counter
            self._seq_counter += 1
            comment_text = self._apply_comment_variation(
                base_comment, seq, bool(task_cfg.get("enable_spintax_dedup", False))
            )

            connector = aiohttp.TCPConnector(limit=4, ssl=False)
            timeout = aiohttp.ClientTimeout(total=25)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                api = EastMoneyAPI(session, settings=settings)
                try:
                    try:
                        _, postid = await self._resolve_article_ids(api, article_url, account, proxy_str)
                        result = await api.comment_article(
                            postid,
                            comment_text,
                            account,
                            proxy_str,
                            solver=self.solver,
                            article_url=article_url,
                        )
                    except Exception:
                        self.proxy_pool.invalidate_proxy(proxy_str)
                        proxy_str = await asyncio.to_thread(self.proxy_pool.get_proxy_for_account, account)
                        self._flush_proxy_notes()
                        _, postid = await self._resolve_article_ids(api, article_url, account, proxy_str)
                        result = await api.comment_article(
                            postid,
                            comment_text,
                            account,
                            proxy_str,
                            solver=self.solver,
                            article_url=article_url,
                        )

                    if result.ok:
                        self.stats["comments"] += 1
                        self._log(
                            f"[{username}] 💬 评论成功 ({self.stats['comments']}/{target_comments}): {comment_text}"
                        )
                        need_random_wait = True
                    elif result.needs_captcha:
                        self._pending_comments.insert(0, base_comment)
                        self.stats["captcha_tries"] += 1
                        self._log(
                            f"[{username}] ⚠️ 触发点选验证 (rc:2)，评论已放回队首，无需等待随机长间隔，1.5秒后立即换下一账号接力..."
                        )
                        await self._sleep_cancelable(1.5)
                    else:
                        self._pending_comments.append(base_comment)
                        self.stats["failed_accounts"] += 1
                        self._log(f"[{username}] ❌ 评论未通过: {result.message}")
                        await self._sleep_cancelable(1.5)
                except Exception as e:
                    self._pending_comments.insert(0, base_comment)
                    self.stats["failed_accounts"] += 1
                    self._log(f"[{username}] 评论网络异常（已保留语录并切换下一号）: {e}")
                    await self._sleep_cancelable(1.5)

    async def run(self, mode: Optional[str] = None, modes: Optional[List[str]] = None):
        task_cfg = self.config.get("task", {})
        resolved_modes: List[str] = []
        if modes:
            for m in modes:
                ml = str(m or "").strip().lower()
                if ml in ("click", "like", "comment") and ml not in resolved_modes:
                    resolved_modes.append(ml)
        elif mode:
            for m in str(mode).split(","):
                ml = m.strip().lower()
                if ml in ("click", "like", "comment") and ml not in resolved_modes:
                    resolved_modes.append(ml)
        else:
            if task_cfg.get("enable_click"):
                resolved_modes.append("click")
            if task_cfg.get("enable_like"):
                resolved_modes.append("like")
            if task_cfg.get("enable_comment"):
                resolved_modes.append("comment")
            if not resolved_modes:
                fallback_m = str(task_cfg.get("solo_task_mode") or "comment").strip().lower()
                resolved_modes.append(fallback_m if fallback_m in ("click", "like", "comment") else "comment")

        self.active_modes = resolved_modes
        self.current_mode = "+".join(resolved_modes)

        mode_names = {
            "click": "阅读",
            "like": "点赞",
            "comment": "评论(随机间隔)",
        }
        joined_cn = " + ".join(mode_names[m] for m in resolved_modes)
        self._log(f"=== 东方财富自动化运营引擎 v6.0 启动 · 执行组合: [{joined_cn}] ===")
        authed_count = sum(
            1 for a in self.pool.accounts
            if "ct=" in (a.get("cookie") or "") and "ut=" in (a.get("cookie") or "")
        )
        unique_h_count = sum(1 for a in self.pool.accounts if (a.get("h") or "").strip())
        self._log(
            f"[账号池就绪] 启用账号 {len(self.pool.accounts)} 个 | 有效 ct/ut 凭证 {authed_count} 个 | 独立 h 点赞签名 {unique_h_count} 个"
        )

        coros = []
        if "click" in resolved_modes:
            coros.append(self._run_standalone_clicks())
        if "like" in resolved_modes:
            coros.append(self._run_standalone_likes())
        if "comment" in resolved_modes:
            coros.append(self._run_standalone_comments())

        if len(coros) == 1:
            await coros[0]
        elif len(coros) > 1:
            await asyncio.gather(*coros)

        if self.stop_requested:
            self._log("⏹️ 已收到手动停止指令，当前任务已安全中止。")
        self.print_summary()

    def print_summary(self):
        self._log("=" * 46)
        self._log(f"=== 任务执行摘要 (组合={self.current_mode}) ===")
        read_snap = ""
        if self.stats.get("read_count_start") is not None and self.stats.get("read_count_live") is not None:
            delta = int(self.stats["read_count_live"]) - int(self.stats["read_count_start"])
            read_snap = f" (东财公开阅读 {self.stats['read_count_start']}->{self.stats['read_count_live']}, 净增 {delta:+d})"
        self._log(f"请求阅读完成: {self.stats['clicks']}{read_snap} | 成功点赞: {self.stats['likes']} | 成功评论: {self.stats['comments']}")
        self._log(f"rc:2 容错换号: {self.stats['captcha_tries']} | 其他异常数: {self.stats['failed_accounts']}")
        self._log("=" * 46)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="东方财富财富号多任务与独立任务执行引擎 v6.0")
    parser.add_argument("--mode", choices=["click", "like", "comment"], default=None, help="单独执行模式: click(阅读) / like(点赞) / comment(评论)")
    parser.add_argument("--modes", default=None, help="多任务组合并发模式(逗号分隔，例如 click,like,comment)")
    args = parser.parse_args()
    parsed_modes = [x.strip() for x in args.modes.split(",") if x.strip()] if args.modes else None
    asyncio.run(MainEngine("config.json").run(mode=args.mode, modes=parsed_modes))
`;

  const proxyPoolPy = `import base64
import json
import os
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional
from urllib.parse import quote, unquote, urlparse


def _extract_clean_url(raw: str) -> str:
    m = re.search(r"https?://[^\\s\\"'<>]+", (raw or "").strip())
    return m.group(0).strip() if m else (raw or "").strip()


def _smart_http_get(url: str, timeout: int = 10) -> str:
    """支持系统代理、直连绕过坏代理、兼容 Win10 LTSC 旧根证书，以及 DNS 异常时自动走 223.5.5.5 直连"""
    clean_url = _extract_clean_url(url)
    headers = {"User-Agent": "Mozilla/5.0"}
    ssl_ctx = ssl._create_unverified_context()
    last_err: Optional[Exception] = None

    # 1. 默认通道（遵循系统路由，兼容 Win10 LTSC 旧版 SSL 根证书）
    try:
        req = urllib.request.Request(clean_url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
            return resp.read().decode("utf-8", errors="ignore").strip()
    except urllib.error.HTTPError as he:
        return he.read().decode("utf-8", errors="ignore").strip()
    except Exception as e:
        last_err = e

    # 2. 绕过 Windows 失效系统代理直连
    direct_opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl_ctx),
    )
    try:
        req = urllib.request.Request(clean_url, headers=headers)
        with direct_opener.open(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="ignore").strip()
    except urllib.error.HTTPError as he:
        return he.read().decode("utf-8", errors="ignore").strip()
    except Exception as e:
        last_err = e

    # 3. 若发生 getaddrinfo(11001) DNS 解析失败，直接通过 223.5.5.5 DoH 解析 A 记录并用 IP+Host 请求
    parsed = urlparse(clean_url)
    host = parsed.hostname
    if host and ("11001" in str(last_err) or "getaddrinfo" in str(last_err).lower()):
        try:
            ctx = ssl._create_unverified_context()
            doh_opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}),
                urllib.request.HTTPSHandler(context=ctx),
            )
            with doh_opener.open(
                urllib.request.Request(f"https://223.5.5.5/resolve?name={host}&type=1", headers=headers),
                timeout=6,
            ) as dns_resp:
                dns_json = json.loads(dns_resp.read().decode("utf-8", errors="ignore"))
            ips = [a["data"] for a in dns_json.get("Answer", []) if a.get("type") == 1 and a.get("data")]
            if ips and parsed.scheme == "http":
                port_part = f":{parsed.port}" if parsed.port else ""
                path_q = parsed.path or "/"
                if parsed.query:
                    path_q += f"?{parsed.query}"
                ip_url = f"http://{ips[0]}{port_part}{path_q}"
                req_ip = urllib.request.Request(ip_url, headers={**headers, "Host": host})
                with direct_opener.open(req_ip, timeout=timeout) as resp:
                    return resp.read().decode("utf-8", errors="ignore").strip()
        except Exception:
            pass

    raise last_err if last_err else RuntimeError("HTTP request failed")


class ProxyPool:
    """代理池 v6.0：原生兼容「天启代理 3分钟(180s) 白名单 + 账密认证(根治移动网多出口407)」+ 110秒续期 + 坏IP秒级剔除 + 多任务并发限流锁"""

    TTL_RENEW_SECONDS = 110  # 针对天启180s短效IP（上游分配后已有损耗），满110秒提前续期，杜绝临界点 407 超时报错
    _CLASS_LOCK = threading.RLock()
    _LAST_API_CALL_TS: float = 0.0
    _SHARED_NODES: List[Dict] = []
    _SHARED_FETCH_TS: float = 0.0
    _SHARED_API_URL: str = ""
    _SHARED_WHITELIST_TS: float = 0.0

    def __init__(self, config_path: str = "config.json", api_url: Optional[str] = None, auto_load: bool = True):
        self.config_path = config_path
        self.config: Dict = {}
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8-sig") as f:
                    self.config = json.load(f)
            except Exception:
                self.config = {}
        if api_url:
            self.config.setdefault("settings", {})["proxy_api_url"] = _extract_clean_url(api_url)
        self._api_url_locked: bool = bool(api_url)
        self._lock = ProxyPool._CLASS_LOCK
        self._dynamic_nodes: List[Dict] = []
        self._node_hits: Dict[str, int] = {}
        self._status_notes: List[str] = []
        self._cursor = 0
        self._last_fetch_ts = 0.0
        self.detected_ip: str = ""
        self.detected_ips: List[str] = []
        self.last_error: str = ""

        cur_api = _extract_clean_url(self.config.get("settings", {}).get("proxy_api_url") or "")
        with self._lock:
            if (
                ProxyPool._SHARED_NODES
                and cur_api
                and ProxyPool._SHARED_API_URL == cur_api
                and (time.time() - ProxyPool._SHARED_FETCH_TS) <= self.TTL_RENEW_SECONDS
            ):
                self._dynamic_nodes = [dict(n) for n in ProxyPool._SHARED_NODES]
                self._last_fetch_ts = ProxyPool._SHARED_FETCH_TS

            if auto_load:
                self._auto_register_whitelist()
                if not self._dynamic_nodes:
                    self._try_load_dynamic_api()

    def _push_note(self, msg: str) -> None:
        if msg:
            self._status_notes.append(msg)
            if len(self._status_notes) > 40:
                self._status_notes = self._status_notes[-40:]

    def pop_status_notes(self) -> List[str]:
        with self._lock:
            notes = list(self._status_notes)
            self._status_notes.clear()
            return notes

    def _reload_proxy_settings_from_disk(self) -> bool:
        """热加载 config.json 中最新的天启代理 API 链接与账密配置；若 API 链接发生变化则清空旧批次立即按新链接拉取"""
        if self._api_url_locked or not self.config_path or not os.path.exists(self.config_path):
            return False
        with self._lock:
            try:
                with open(self.config_path, "r", encoding="utf-8-sig") as f:
                    disk_cfg = json.load(f)
            except Exception:
                return False
            if not isinstance(disk_cfg, dict) or not isinstance(disk_cfg.get("settings"), dict):
                return False
            disk_settings = disk_cfg["settings"]
            mem_settings = self.config.setdefault("settings", {})
            prev_api = _extract_clean_url(mem_settings.get("proxy_api_url") or "")
            for key in ("proxy_api_url", "whitelist_api_url", "proxy_user", "proxy_pass"):
                if key in disk_settings:
                    val = disk_settings.get(key)
                    if key in ("proxy_api_url", "whitelist_api_url"):
                        val = _extract_clean_url(val or "")
                    mem_settings[key] = val
            new_api = _extract_clean_url(mem_settings.get("proxy_api_url") or "")
            if prev_api != new_api:
                self._dynamic_nodes = []
                self._node_hits = {}
                self._cursor = 0
                self._last_fetch_ts = 0.0
                if ProxyPool._SHARED_API_URL != new_api:
                    ProxyPool._SHARED_NODES = []
                    ProxyPool._SHARED_FETCH_TS = 0.0
                msg = "🔄 检测到天启代理 API 链接已热更新，将在下一轮请求立即按新链接提取 IP..."
                print(f"[ProxyPool] {msg}")
                self._push_note(msg)
                return True
            return False

    def has_proxy_api(self) -> bool:
        api_url = _extract_clean_url(self.config.get("settings", {}).get("proxy_api_url") or "")
        return bool(api_url and "YOUR_" not in api_url)

    @staticmethod
    def format_proxy_host(proxy_url: Optional[str]) -> str:
        if not proxy_url:
            return "直连本机IP"
        m = re.search(r"(\\d{1,3}(?:\\.\\d{1,3}){3}:\\d{2,5})", str(proxy_url))
        return m.group(1) if m else str(proxy_url)

    @staticmethod
    def to_playwright_proxy(proxy_url: Optional[str]) -> Optional[Dict[str, str]]:
        if not proxy_url:
            return None
        parsed = urlparse(proxy_url)
        if not parsed.hostname or not parsed.port:
            return None
        cfg: Dict[str, str] = {"server": f"http://{parsed.hostname}:{parsed.port}"}
        if parsed.username:
            cfg["username"] = unquote(parsed.username)
        if parsed.password:
            cfg["password"] = unquote(parsed.password)
        return cfg

    @property
    def proxies(self) -> List[str]:
        return [f"http://{n['ip']}:{n['port']} ({n.get('city', '天启节点')})" for n in self._dynamic_nodes]

    def scan_all_public_ips(self) -> List[str]:
        """并发探测多个公网回显节点，专门揪出中国移动宽带/热点 CGNAT 多出口轮跳的所有公网 IP"""
        endpoints = (
            "https://4.ipw.cn",
            "http://ip.3322.net",
            "http://icanhazip.com",
            "https://api.ipify.org",
            "https://ifconfig.me/ip",
            "http://checkip.amazonaws.com",
        )
        found: List[str] = []

        def _fetch_one(u: str) -> str:
            try:
                txt = _smart_http_get(u, timeout=4)
                m = re.search(r"\\b(\\d{1,3}(?:\\.\\d{1,3}){3})\\b", txt or "")
                return m.group(1) if m else ""
            except Exception:
                return ""

        with ThreadPoolExecutor(max_workers=6) as pool:
            for cand in pool.map(_fetch_one, endpoints):
                if cand and cand not in found:
                    found.append(cand)
        if found:
            self.detected_ip = found[0]
            self.detected_ips = found
        return found

    def _detect_public_ip(self) -> str:
        ips = self.scan_all_public_ips()
        return ips[0] if ips else ""

    def _auto_register_whitelist(self, force: bool = False) -> None:
        with self._lock:
            if not force and ProxyPool._SHARED_WHITELIST_TS > 0 and (time.time() - ProxyPool._SHARED_WHITELIST_TS) < 180:
                return
            settings = self.config.get("settings", {}) or {}
            white_url = _extract_clean_url(settings.get("whitelist_api_url") or "")
            has_auth = bool((settings.get("proxy_user") or "").strip() and (settings.get("proxy_pass") or "").strip())
            all_ips = self.scan_all_public_ips()
            ProxyPool._SHARED_WHITELIST_TS = time.time()
            if all_ips:
                joined_ips = " , ".join(all_ips)
                print(f"[ProxyPool] 当前电脑公网出口 IP: {joined_ips}")
                if len(all_ips) > 1 and not has_auth:
                    warn_msg = (
                        f"⚠️ 检测到宽带/移动网络存在 {len(all_ips)} 个并发动态出口 IP ({joined_ips})，"
                        f"若只加单 IP 白名单会有约一半连接报 407 鉴权失败，建议填写『天启账密认证(用户名+密码)』彻底免白名单！"
                    )
                    print(f"[ProxyPool] {warn_msg}")
                    self._push_note(warn_msg)
            if not white_url or "YOUR_" in white_url or not all_ips:
                return
            for ip_item in all_ips:
                real_white_url = re.sub(r"ip=[^&]*", f"ip={ip_item}", white_url)
                try:
                    res_txt = _smart_http_get(real_white_url, timeout=8)
                    print(f"[ProxyPool] 已自动向天启白名单注册出口 IP ({ip_item}) -> {res_txt}")
                except Exception as e:
                    print(f"[ProxyPool] 自动注册白名单提示 ({ip_item}): {e}")

    def _try_load_dynamic_api(self, override_num: Optional[int] = None) -> None:
        with self._lock:
            self._reload_proxy_settings_from_disk()
            self.last_error = ""
            api_url = _extract_clean_url(self.config.get("settings", {}).get("proxy_api_url") or "")
            if not api_url or "YOUR_" in api_url:
                self.last_error = "未配置有效的代理 API 提取链接"
                return
            if override_num is not None:
                api_url = re.sub(r"num=\\d+", f"num={override_num}", api_url)
            try:
                now_call = time.time()
                if ProxyPool._LAST_API_CALL_TS > 0 and (now_call - ProxyPool._LAST_API_CALL_TS) < 1.35:
                    time.sleep(1.35 - (now_call - ProxyPool._LAST_API_CALL_TS))
                try:
                    raw = _smart_http_get(api_url, timeout=10)
                finally:
                    ProxyPool._LAST_API_CALL_TS = time.time()
                fresh_nodes: List[Dict] = []
                try:
                    data = json.loads(raw)
                    if isinstance(data, dict) and data.get("code") not in (None, 200, 1000) and not data.get("data"):
                        err_msg = data.get("Msg") or data.get("msg") or str(data)
                        self.last_error = f"code={data.get('code')}: {err_msg}"
                        print(f"[ProxyPool] ⚠️ 代理 API 返回错误 ({self.last_error})（请检查后台 IP 白名单是否已添加当前公网 IP）")
                        self._push_note(f"⚠️ 天启代理 API 返回错误 ({self.last_error})")
                        return
                    items = data if isinstance(data, list) else data.get("data", [])
                    for item in items:
                        if isinstance(item, dict) and item.get("ip") and item.get("port"):
                            prov_city = f"{item.get('prov') or ''}{item.get('city') or ''}".strip()
                            fresh_nodes.append({
                                "ip": str(item["ip"]).strip(),
                                "port": int(item["port"]),
                                "city": prov_city or "天启3分钟高匿节点",
                            })
                except Exception:
                    pass
                if not fresh_nodes:
                    for line in raw.splitlines():
                        m = re.search(r"(\\d{1,3}(?:\\.\\d{1,3}){3}):(\\d{2,5})", line)
                        if m:
                            fresh_nodes.append({
                                "ip": m.group(1),
                                "port": int(m.group(2)),
                                "city": "天启3分钟高匿节点",
                            })
                if fresh_nodes:
                    now_ts = time.time()
                    self._dynamic_nodes = fresh_nodes
                    self._node_hits = {}
                    self._cursor = 0
                    self._last_fetch_ts = now_ts
                    ProxyPool._SHARED_NODES = [dict(n) for n in fresh_nodes]
                    ProxyPool._SHARED_FETCH_TS = now_ts
                    ProxyPool._SHARED_API_URL = api_url
                    preview = ", ".join(f"{n['ip']}:{n['port']}" for n in fresh_nodes[:3])
                    if len(fresh_nodes) > 3:
                        preview += "..."
                    print(f"[ProxyPool] 已从代理 API 实时提取 {len(self._dynamic_nodes)} 个新鲜短效高匿 IP 节点 ({preview})")
                    self._push_note(f"♻️ 天启代理已拉取 {len(self._dynamic_nodes)} 个新鲜 IP ({preview})")
                else:
                    self.last_error = raw[:200] if raw else "API 返回内容为空"
                    self._push_note(f"⚠️ 天启未解析到有效节点: {self.last_error}")
            except Exception as e:
                self.last_error = str(e)
                print(f"[ProxyPool] 代理 API 动态提取异常 ({e})")
                self._push_note(f"⚠️ 天启代理 API 提取网络异常: {self.last_error}")

    async def refresh_from_api(self) -> Dict:
        """客户端『测试天启代理』专用：多出口公网 IP 扫描 + 提取节点 + 并发真 HTTP CONNECT 隧道鉴权测活（精准识别 407 鉴权失败）"""
        import asyncio
        all_ips = self.scan_all_public_ips()
        public_ip = " , ".join(all_ips) if all_ips else ""
        self._auto_register_whitelist()
        self._try_load_dynamic_api()
        candidates = list(self._dynamic_nodes)
        if not candidates:
            return {
                "ok": False,
                "public_ip": public_ip,
                "public_ips": all_ips,
                "error": self.last_error or "未能解析到有效代理节点",
                "alive_nodes": [],
                "auth_407_nodes": [],
                "dead_nodes": [],
            }

        settings = self.config.get("settings", {}) or {}
        p_user = (settings.get("proxy_user") or "").strip()
        p_pass = (settings.get("proxy_pass") or "").strip()
        auth_header = b""
        if p_user and p_pass:
            token = base64.b64encode(f"{p_user}:{p_pass}".encode("utf-8")).decode("ascii")
            auth_header = f"Proxy-Authorization: Basic {token}\\r\\n".encode("ascii")

        async def _probe_connect(node: Dict) -> Dict:
            t0 = time.perf_counter()
            writer = None
            try:
                conn = asyncio.open_connection(node["ip"], int(node["port"]))
                reader, writer = await asyncio.wait_for(conn, timeout=3.0)
                req_bytes = (
                    b"CONNECT passport2.eastmoney.com:443 HTTP/1.1\\r\\n"
                    b"Host: passport2.eastmoney.com:443\\r\\n"
                    + auth_header
                    + b"Proxy-Connection: Keep-Alive\\r\\n\\r\\n"
                )
                writer.write(req_bytes)
                await asyncio.wait_for(writer.drain(), timeout=2.5)
                first_line = await asyncio.wait_for(reader.readline(), timeout=3.0)
                ms = int((time.perf_counter() - t0) * 1000)
                status_txt = first_line.decode("ascii", errors="ignore").strip()
                if " 200 " in status_txt or status_txt.endswith(" 200"):
                    return {**node, "alive": True, "status": "ok", "latency_ms": max(1, ms)}
                if "407" in status_txt:
                    return {**node, "alive": False, "status": "407", "latency_ms": max(1, ms)}
                return {**node, "alive": False, "status": "dead", "latency_ms": -1}
            except Exception:
                return {**node, "alive": False, "status": "dead", "latency_ms": -1}
            finally:
                if writer is not None:
                    try:
                        writer.close()
                        await writer.wait_closed()
                    except Exception:
                        pass

        probed = await asyncio.gather(*(_probe_connect(n) for n in candidates))
        alive_nodes = [n for n in probed if n["status"] == "ok"]
        auth_407_nodes = [n for n in probed if n["status"] == "407"]
        dead_nodes = [n for n in probed if n["status"] == "dead"]

        now_ts = time.time()
        cur_api = _extract_clean_url(settings.get("proxy_api_url") or "")
        with self._lock:
            self._dynamic_nodes = [dict(n) for n in alive_nodes]
            self._node_hits = {}
            self._cursor = 0
            self._last_fetch_ts = now_ts if alive_nodes else 0.0
            ProxyPool._SHARED_NODES = [dict(n) for n in alive_nodes]
            ProxyPool._SHARED_FETCH_TS = now_ts if alive_nodes else 0.0
            ProxyPool._SHARED_API_URL = cur_api

        err_hint = ""
        if not alive_nodes:
            if auth_407_nodes:
                err_hint = (
                    f"提取的节点返回 HTTP 407 鉴权拒绝（您的中国移动/宽带网络可能存在多出口动态 IP: {public_ip}）！"
                    f"请在下方填写『天启账密认证(用户名+密码)』彻底绕过白名单限制，或抓新号时直接点『🚀 1窗免407极速抓新号』。"
                )
            else:
                err_hint = "提取的节点均无法通过 HTTPS CONNECT 隧道测试"
        return {
            "ok": len(alive_nodes) > 0,
            "public_ip": public_ip,
            "public_ips": all_ips,
            "error": err_hint,
            "alive_nodes": alive_nodes,
            "auth_407_nodes": auth_407_nodes,
            "dead_nodes": dead_nodes,
        }

    def invalidate_proxy(self, bad_proxy_url: Optional[str]) -> None:
        """当某个短效家庭宽带节点提前掉线 (WinError 64 / 407 / 拒绝连接) 时立即从内存池剔除，防止污染后续账号"""
        if not bad_proxy_url:
            return
        m = re.search(r"(\\d{1,3}(?:\\.\\d{1,3}){3}):(\\d{2,5})", bad_proxy_url)
        if not m:
            return
        bad_ip, bad_port = m.group(1), int(m.group(2))
        with self._lock:
            if not self._dynamic_nodes:
                return
            before = len(self._dynamic_nodes)
            self._dynamic_nodes = [
                n for n in self._dynamic_nodes
                if not (n.get("ip") == bad_ip and int(n.get("port", 0)) == bad_port)
            ]
            ProxyPool._SHARED_NODES = [
                n for n in ProxyPool._SHARED_NODES
                if not (n.get("ip") == bad_ip and int(n.get("port", 0)) == bad_port)
            ]
            if len(self._dynamic_nodes) < before:
                msg = f"♻️ 已自动剔除失效代理节点 {bad_ip}:{bad_port}（剩余可用: {len(self._dynamic_nodes)}）"
                print(f"[ProxyPool] {msg}")
                self._push_note(msg)
            if not self._dynamic_nodes:
                self._last_fetch_ts = 0.0
                ProxyPool._SHARED_FETCH_TS = 0.0

    def get_proxy_for_account(self, account: Dict, max_uses_per_ip: int = 0) -> Optional[str]:
        with self._lock:
            self._reload_proxy_settings_from_disk()
            now_ts = time.time()
            elapsed = now_ts - self._last_fetch_ts

            if max_uses_per_ip > 0 and self._dynamic_nodes:
                available_nodes = [
                    n for n in self._dynamic_nodes
                    if self._node_hits.get(f"{n['ip']}:{n['port']}", 0) < max_uses_per_ip
                ]
                ip_quota_saturated = len(available_nodes) == 0
            else:
                available_nodes = list(self._dynamic_nodes)
                ip_quota_saturated = False

            need_ttl_renew = bool(self._dynamic_nodes and elapsed > self.TTL_RENEW_SECONDS)
            need_empty_fetch = bool((not self._dynamic_nodes) and (self._last_fetch_ts == 0.0 or elapsed > 2.5))

            if need_ttl_renew or ip_quota_saturated or need_empty_fetch:
                cur_api = _extract_clean_url(self.config.get("settings", {}).get("proxy_api_url") or "")
                if (
                    ProxyPool._SHARED_NODES
                    and cur_api
                    and ProxyPool._SHARED_API_URL == cur_api
                    and ProxyPool._SHARED_FETCH_TS > self._last_fetch_ts + 0.5
                    and (now_ts - ProxyPool._SHARED_FETCH_TS) <= self.TTL_RENEW_SECONDS
                ):
                    self._dynamic_nodes = [dict(n) for n in ProxyPool._SHARED_NODES]
                    self._node_hits = {}
                    self._cursor = 0
                    self._last_fetch_ts = ProxyPool._SHARED_FETCH_TS
                else:
                    if ip_quota_saturated:
                        msg = f"🔄 当前批次 {len(self._dynamic_nodes)} 个 IP 均已用满 {max_uses_per_ip} 次，自动清空并向天启提取新一批 IP..."
                        print(f"[ProxyPool] {msg}")
                        self._push_note(msg)
                    elif need_ttl_renew:
                        msg = "🔄 当前批次 IP 已使用满 110 秒，正在自动调用代理 API 提前续期新鲜 IP..."
                        print(f"[ProxyPool] {msg}")
                        self._push_note(msg)
                    self._dynamic_nodes = []
                    ProxyPool._SHARED_NODES = []
                    self._try_load_dynamic_api()
                    if (
                        not self._dynamic_nodes
                        and self.last_error
                        and ("频繁" in self.last_error or "秒" in self.last_error or "fast" in self.last_error.lower())
                    ):
                        time.sleep(1.5)
                        self._try_load_dynamic_api()

                if max_uses_per_ip > 0 and self._dynamic_nodes:
                    available_nodes = [
                        n for n in self._dynamic_nodes
                        if self._node_hits.get(f"{n['ip']}:{n['port']}", 0) < max_uses_per_ip
                    ]
                else:
                    available_nodes = list(self._dynamic_nodes)

            if available_nodes:
                node = available_nodes[self._cursor % len(available_nodes)]
                self._cursor += 1
                key = f"{node['ip']}:{node['port']}"
                self._node_hits[key] = self._node_hits.get(key, 0) + 1
                account["proxy_ip"] = node["ip"]
                account["proxy_port"] = node["port"]
                account["proxy_city"] = node["city"]
                ip = node["ip"]
                port = node["port"]
            elif self.has_proxy_api():
                return None
            else:
                ip = (account.get("proxy_ip") or "").strip()
                if not ip or ip == "127.0.0.1":
                    return None
                port = account.get("proxy_port", 1080)

            settings = self.config.get("settings", {}) or {}
            user = (account.get("proxy_user") or settings.get("proxy_user") or "").strip()
            password = (account.get("proxy_pass") or settings.get("proxy_pass") or "").strip()
            if user and password:
                return f"http://{quote(user, safe='')}:{quote(password, safe='')}@{ip}:{port}"
            return f"http://{ip}:{port}"

    def get_city_of_account(self, account: Dict) -> str:
        return account.get("proxy_city", "Unknown")
`;

  const launcherBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 东财智运 · 东方财富独立任务控制台 v6.0
set PY_CMD=
py -3 -c "import sys" >nul 2>nul && set PY_CMD=py -3
if "%PY_CMD%"=="" (python -c "import sys" >nul 2>nul && set PY_CMD=python)
if "%PY_CMD%"=="" (
  echo [错误] 未检测到可用的 Python 环境，请先安装 Python 3.10~3.14 并勾选 Add python.exe to PATH！
  pause
  exit /b 1
)
echo ====================================================
echo   东财智运 · 东方财富财富号独立任务执行菜单 v6.0
echo ====================================================
echo.
echo [1] 正在检查轻量网络库 aiohttp (纯异步协议请求，无需浏览器，内存占用低于 60MB)...
%PY_CMD% -c "import aiohttp" >nul 2>nul
if errorlevel 1 (
  %PY_CMD% -m pip install "aiohttp>=3.10.0" -i https://pypi.tuna.tsinghua.edu.cn/simple
  if errorlevel 1 %PY_CMD% -m pip install "aiohttp>=3.10.0" -i https://mirrors.aliyun.com/pypi/simple
  if errorlevel 1 %PY_CMD% -m pip install "aiohttp>=3.10.0"
)
echo.
echo 请选择本次要【单独执行】的任务（输入数字 1 / 2 / 3 后按回车）：
echo   [1] 单独执行：阅读任务 (提升文章阅读点击数)
echo   [2] 单独执行：点赞任务 (调度独立 h 签名账号点赞)
echo   [3] 单独执行：评论任务 (按随机间隔 ^<= 设定阈值逐条评论)
echo.
set TASK_CHOICE=3
set /p TASK_CHOICE=请输入任务编号 (默认直接回车执行 3-评论): 
set RUN_MODE=comment
if "%TASK_CHOICE%"=="1" set RUN_MODE=click
if "%TASK_CHOICE%"=="2" set RUN_MODE=like
if "%TASK_CHOICE%"=="3" set RUN_MODE=comment
echo.
echo [2] 正在使用最新 config.json 启动独立任务 (mode=%RUN_MODE%)...
%PY_CMD% main_engine.py --mode %RUN_MODE%
echo.
echo 任务执行完毕！按任意键退出窗口...
pause >nul
`;

  const captchaSolverPy = `import asyncio
import io
import os
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

Point = Tuple[int, int]


class BaseClickCaptchaSolver(ABC):
    """点选验证码求解器基类"""

    @abstractmethod
    async def solve(self, image_bytes: bytes, prompt: str) -> Optional[List[Point]]:
        raise NotImplementedError


class DdddOcrClickSolver(BaseClickCaptchaSolver):
    """自动求解：ddddocr 检测字框 + 识别 + 按指令排序"""

    def __init__(self):
        try:
            import ddddocr
            from PIL import Image
        except ImportError as e:
            raise ImportError(f"缺少依赖: {e}，请执行 pip install ddddocr pillow")
        self._Image = Image
        self.det = ddddocr.DdddOcr(det=True, show_ad=False)
        self.ocr = ddddocr.DdddOcr(show_ad=False)

    async def solve(self, image_bytes: bytes, prompt: str) -> Optional[List[Point]]:
        prompt = (prompt or "").replace("请依次点击：", "").replace("请依次点击:", "").strip()
        if not prompt:
            return None
        try:
            boxes = await asyncio.to_thread(self.det.detection, image_bytes)
            if not boxes:
                return None
            img = self._Image.open(io.BytesIO(image_bytes))
            char_map: List[Tuple[str, Point]] = []
            for x1, y1, x2, y2 in boxes:
                x1, y1 = max(0, int(x1)), max(0, int(y1))
                x2, y2 = int(x2), int(y2)
                if x2 <= x1 or y2 <= y1:
                    continue
                crop = img.crop((x1, y1, x2, y2))
                buf = io.BytesIO()
                crop.save(buf, format="PNG")
                char = await asyncio.to_thread(self.ocr.classification, buf.getvalue())
                char = (char or "").strip()
                if char:
                    center = ((x1 + x2) // 2, (y1 + y2) // 2)
                    char_map.append((char, center))
            if not char_map:
                return None
            points: List[Point] = []
            used = set()
            for target in prompt:
                found = None
                for idx, (char, center) in enumerate(char_map):
                    if idx in used:
                        continue
                    if target in char or char in target:
                        found = (idx, center)
                        break
                if found is None:
                    continue
                used.add(found[0])
                points.append(found[1])
            return points or None
        except Exception as e:
            print(f"[点选求解] 识别异常: {e}")
            return None


class ManualClickSolver(BaseClickCaptchaSolver):
    """手动求解：弹窗显示图片，鼠标按指令顺序点击"""

    def __init__(self, save_dir: str = "captcha"):
        self.save_dir = save_dir
        os.makedirs(save_dir, exist_ok=True)
        self._counter = 0

    async def solve(self, image_bytes: bytes, prompt: str) -> Optional[List[Point]]:
        self._counter += 1
        path = os.path.join(self.save_dir, f"captcha_{self._counter}.png")
        with open(path, "wb") as f:
            f.write(image_bytes)
        print(f"[点选求解] 图片已保存: {path}")
        points = await asyncio.to_thread(self._run_tk, path, prompt)
        return points if points else None

    def _run_tk(self, path: str, prompt: str) -> List[Point]:
        import tkinter as tk
        from PIL import Image, ImageTk

        clicked: List[Point] = []
        root = tk.Tk()
        root.title(f"请按顺序点击: {prompt}")
        img = Image.open(path)
        tk_img = ImageTk.PhotoImage(img)
        canvas = tk.Canvas(root, width=img.width, height=img.height + 30)
        canvas.pack()
        canvas.create_image(0, 30, anchor=tk.NW, image=tk_img)
        canvas.create_text(
            img.width // 2,
            15,
            text=f"请依次点击: {prompt}",
            fill="red",
            font=("Arial", 14, "bold"),
        )

        def on_click(event):
            if event.y > 30:
                pt = (event.x, event.y - 30)
                clicked.append(pt)
                canvas.create_oval(
                    event.x - 5, event.y - 5, event.x + 5, event.y + 5,
                    outline="red", width=2,
                )
                canvas.create_text(
                    event.x, event.y - 12,
                    text=str(len(clicked)), fill="red",
                )

        def on_close():
            root.destroy()

        canvas.bind("<Button-1>", on_click)
        root.protocol("WM_DELETE_WINDOW", on_close)
        root.mainloop()
        return clicked


def build_solver(mode: str) -> Optional[BaseClickCaptchaSolver]:
    mode = (mode or "skip").lower()
    if mode in ("off", "skip"):
        return None
    if mode == "ocr":
        try:
            return DdddOcrClickSolver()
        except ImportError:
            print("[验证码策略提示] 当前高版本 Python (如 3.13/3.14+) 无需安装旧版 ddddocr，已自动回退为最稳妥的 rc:2 多账号自动换号模式")
            return None
    return ManualClickSolver()
`;

  const captchaProbePy = `"""
验证码抓包探针 (v6.0 修复版)
用法: python captcha_probe.py [config.json]
"""
import asyncio
import base64
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
import aiohttp

from account_pool import AccountPool
from proxy_pool import ProxyPool
from eastmoney_api import EastMoneyAPI, encode_points
from captcha_solver import ManualClickSolver

Point = Tuple[int, int]

GET_CANDIDATES = [
    "/newsreply/replyopt/api/Validate/GetValidateCode",
    "/newsreply/replyopt/api/Validate/GetCode",
    "/newsreply/replyopt/api/Validate/GetValidateImage",
    "/newsreply/replyopt/api/Validate/GetImage",
    "/newsreply/replyopt/api/Validate/Image",
]

SUBMIT_CANDIDATES = [
    "/newsreply/replyopt/api/Validate/CheckValidateCode",
    "/newsreply/replyopt/api/Validate/CheckCode",
    "/newsreply/replyopt/api/Validate/ValidateCode",
    "/newsreply/replyopt/api/Validate/Check",
    "/newsreply/replyopt/api/Validate/Verify",
]

COORD_STYLES = ["pipe", "semicolon", "comma", "flat", "json", "jsonobj"]
PARAM_NAMES = ["validate", "code", "points", "coordinate", "answer", "result"]


class CaptchaProbe:
    def __init__(self, config_path: str):
        self.pool = AccountPool(config_path)
        self.proxy_pool = ProxyPool(config_path)
        self.task: Dict[str, Any] = self.pool.config["task"]
        self.account: Dict[str, Any] = self.pool.get_next_account()
        self.proxy: Optional[str] = self.proxy_pool.get_proxy_for_account(self.account)
        self.api: Optional[EastMoneyAPI] = None
        self.postid: Optional[str] = None
        self.context_id: Optional[str] = None
        self.image_bytes: Optional[bytes] = None
        self.prompt: str = ""
        self.hit_get: Optional[str] = None
        self.hit_submit: Optional[Tuple[str, str, str]] = None
        self.submit_response: Optional[Dict[str, Any]] = None

    async def run(self) -> None:
        connector = aiohttp.TCPConnector(ssl=False)
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            self.api = EastMoneyAPI(session)
            print("[1] 解析 postid...")
            url_id = self.api.extract_article_id(self.task["url"])
            if self.task.get("resolved_postid") and self.task.get("resolved_url_id") == url_id:
                self.postid = str(self.task["resolved_postid"])
            else:
                self.postid = await self.api.resolve_postid(
                    self.task["url"], self.account, self.proxy
                )
            print(f"    postid = {self.postid}")
            print("[2] 发送测试评论触发验证码...")
            text = (self.task.get("comments") or ["探针测试评论"])[0]
            result = await self.api.comment_article(self.postid, text, self.account, self.proxy)
            print(f"    状态 = {result.status.value} | 消息 = {result.message}")
            if result.ok:
                print("    [!] 评论直接成功，未触发验证码。")
                return
            if not result.needs_captcha:
                print("    [!] 未触发验证码，请检查账号 Cookie 中的 ct 和 ut 是否有效。")
                return
            self.context_id = result.context_id
            print(f"    成功拿到 context_id = {self.context_id}")


if __name__ == "__main__":
    cfg = sys.argv[1] if len(sys.argv) > 1 else "config.json"
    asyncio.run(CaptchaProbe(cfg).run())
`;

  const probeBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 东财智运 · 验证码抓包探针工具 v6.0
set PY_CMD=
py -3 -c "import sys" >nul 2>nul && set PY_CMD=py -3
if "%PY_CMD%"=="" (python -c "import sys" >nul 2>nul && set PY_CMD=python)
echo ====================================================
echo   东财智运 · 东方财富点选验证码抓包探针 v6.0
echo ====================================================
echo.
%PY_CMD% captcha_probe.py config.json
echo.
pause
`;

  const accountPoolPy = `import json
import random
from typing import Dict, List, Optional


class AccountPool:
    """账号池 v6.0：支持过滤停用账号与多账号轮询分配"""

    def __init__(self, config_path: str):
        self.config = self._load(config_path)
        all_accounts: List[Dict] = self.config.get("accounts", [])
        self.accounts: List[Dict] = [a for a in all_accounts if a.get("enabled", True)]
        if not self.accounts:
            raise ValueError("可用账号池为空，请检查 config.json")
        self._index = 0

    @staticmethod
    def _load(path: str) -> Dict:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)

    def get_next_account(self) -> Optional[Dict]:
        if not self.accounts:
            return None
        account = self.accounts[self._index]
        self._index = (self._index + 1) % len(self.accounts)
        return account

    def get_random_account(self) -> Dict:
        return random.choice(self.accounts)

    def size(self) -> int:
        return len(self.accounts)
`;

  // 显式锁定 greenlet>=3.3.1，确保 Python 3.14.4 (cp314-win_amd64) 直接下载预编译轮子而无需 C++ 编译环境
  const requirementsTxt = `greenlet>=3.3.1
aiohttp>=3.10.0
playwright>=1.48.0
pillow>=11.0.0
`;

  const accountsCsvLines = [
    '东财账号(手机号/用户名),登录密码,代理IP(选填),代理端口(选填),代理城市(选填)',
    ...accounts.map(
      (a) =>
        `${a.username},${a.password || 'EmPass@2026'},${a.proxy_ip},${a.proxy_port},${a.proxy_city}`
    ),
  ];
  const accountsCsvContent = accountsCsvLines.join('\n') + '\n';

  const autoLoginAgentPy = `"""
东财智运 v6.0 · 零崩溃防 407 人机协同登录与抓包提取代理 (auto_login_agent.py)
针对中国移动多出口宽带 (CGNAT 导致 407 ERR_INVALID_AUTH_CREDENTIALS) 与 5 位字母图片验证码专项加固：
1. 新增 --direct（免代理本机直连单窗极速抓号模式）：
   - 彻底告别中国移动宽带 CGNAT 多公网出口轮跳导致的 407 ERR_INVALID_AUTH_CREDENTIALS 报错与浏览器原生代理登录弹窗卡死；
   - 登录框与 5 位字母验证码图片 0.3 秒秒开，不再受 180s 短效代理倒计时压迫！
2. 原生支持天启『账密认证』(proxy_user / proxy_pass) + 407 自动降级本机直连保底：
   - 即使挂代理遇到 407 鉴权拒绝，自动切换备用活节点或无缝降级本机直连，绝不报废窗口！
3. 登录成功『毫秒级优先存盘』(immediate_save_cookie)：
   - 只要检测到 ct 与 ut，不等跳文章抓 h，第一时间原子落盘写入 config.json，彻底杜绝登上了却白忙活！
4. 智能防误触填表 + 错密检测提醒 + 点右上角 X 零报错秒跳下一号：
   - 自动切账号登录、填账密、勾选协议、聚焦 5 位验证码框（不提前乱点登录触发报错）；
   - 遇到密码错误的账号，直接点浏览器右上角 X 即可 0.1 秒丝滑跳到下一号！
"""
import argparse
import asyncio
import base64
import json
import math
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional
from urllib.parse import parse_qs, urlparse

CSV_FILE = "账号密码批量导入表_accounts.csv"
CONFIG_FILE = "config.json"
BACKUP_CONFIG_FILE = "config.backup.json"
DEFAULT_BATCH_SIZE = 2
HUMAN_WAIT_SECONDS = 90

STALE_LOGIN_COOKIE_NAMES = {
    "RequestData",
    "__RequestVerificationToken",
    "__RequestVerificationToken_L3B1Yg2",
    "p_origin",
    "st_inirUrl",
    "_qcu",
    "_qct",
    "ASL",
    "ADVC",
    "ADVS",
}


def atomic_save_config(cfg: dict, path: str = CONFIG_FILE) -> None:
    """原子级安全保存 config.json，并自动维护 config.backup.json 备份，彻底防止写坏文件"""
    if os.path.exists(path) and cfg.get("accounts"):
        try:
            shutil.copyfile(path, BACKUP_CONFIG_FILE)
        except Exception:
            pass
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def format_clean_cookies(cookies_list) -> str:
    ordered = []
    kv = {}
    for c in cookies_list:
        name = (c.get("name") or "").strip()
        val = c.get("value")
        if not name or val is None:
            continue
        val_str = str(val).strip()
        if name in STALE_LOGIN_COOKIE_NAMES or (name == "sid" and val_str == ""):
            continue
        if name not in kv:
            ordered.append(name)
        kv[name] = val_str
    return "; ".join(f"{k}={kv[k]}" for k in ordered)


def clean_raw_cookie_text(raw_cookie: str) -> str:
    if not raw_cookie:
        return ""
    items = []
    for seg in raw_cookie.split(";"):
        if "=" in seg:
            k, v = seg.strip().split("=", 1)
            items.append({"name": k.strip(), "value": v.strip()})
    return format_clean_cookies(items)


def extract_clean_url(raw: str) -> str:
    m = re.search(r"https?://[^\\s\\"'<>]+", (raw or "").strip())
    return m.group(0).strip() if m else (raw or "").strip()


def smart_http_get(url: str, timeout: int = 10) -> str:
    """支持默认网络、绕过坏系统代理、兼容 Win10 LTSC 旧根证书、以及 DNS 失败时走 223.5.5.5 直连"""
    clean_url = extract_clean_url(url)
    headers = {"User-Agent": "Mozilla/5.0"}
    ssl_ctx = ssl._create_unverified_context()
    last_err = None

    try:
        req = urllib.request.Request(clean_url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
            return resp.read().decode("utf-8", errors="ignore").strip()
    except urllib.error.HTTPError as he:
        return he.read().decode("utf-8", errors="ignore").strip()
    except Exception as e:
        last_err = e

    direct_opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl_ctx),
    )
    try:
        req = urllib.request.Request(clean_url, headers=headers)
        with direct_opener.open(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="ignore").strip()
    except urllib.error.HTTPError as he:
        return he.read().decode("utf-8", errors="ignore").strip()
    except Exception as e:
        last_err = e

    parsed = urlparse(clean_url)
    host = parsed.hostname
    if host and ("11001" in str(last_err) or "getaddrinfo" in str(last_err).lower()):
        try:
            ctx = ssl._create_unverified_context()
            doh_opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}),
                urllib.request.HTTPSHandler(context=ctx),
            )
            with doh_opener.open(
                urllib.request.Request(f"https://223.5.5.5/resolve?name={host}&type=1", headers=headers),
                timeout=6,
            ) as dns_resp:
                dns_json = json.loads(dns_resp.read().decode("utf-8", errors="ignore"))
            ips = [a["data"] for a in dns_json.get("Answer", []) if a.get("type") == 1 and a.get("data")]
            if ips and parsed.scheme == "http":
                port_part = f":{parsed.port}" if parsed.port else ""
                path_q = parsed.path or "/"
                if parsed.query:
                    path_q += f"?{parsed.query}"
                ip_url = f"http://{ips[0]}{port_part}{path_q}"
                req_ip = urllib.request.Request(ip_url, headers={**headers, "Host": host})
                with direct_opener.open(req_ip, timeout=timeout) as resp:
                    return resp.read().decode("utf-8", errors="ignore").strip()
        except Exception:
            pass

    raise last_err


def scan_all_outbound_ips() -> list:
    """并发扫描本机所有外网出口 IP（识别中国移动宽带 CGNAT 多出口轮跳）"""
    endpoints = (
        "https://4.ipw.cn",
        "http://ip.3322.net",
        "http://icanhazip.com",
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "http://checkip.amazonaws.com",
    )
    found = []

    def _one(u: str) -> str:
        try:
            txt = smart_http_get(u, timeout=4)
            m = re.search(r"\\b(\\d{1,3}(?:\\.\\d{1,3}){3})\\b", txt or "")
            return m.group(1) if m else ""
        except Exception:
            return ""

    with ThreadPoolExecutor(max_workers=6) as ex:
        for ip_str in ex.map(_one, endpoints):
            if ip_str and ip_str not in found:
                found.append(ip_str)
    return found


async def check_proxy_alive(
    ip: str,
    port: int,
    timeout: float = 3.0,
    proxy_user: str = "",
    proxy_pass: str = "",
) -> str:
    """前置真隧道握手测活：发送真实 HTTP CONNECT 校验是否返回 200（支持账密 Proxy-Authorization），提前拦截 407 与死节点！
    返回值: 'ok' | '407' | 'dead'
    """
    if not ip or ip == "127.0.0.1":
        return "dead"
    writer = None
    auth_line = b""
    if proxy_user and proxy_pass:
        tok = base64.b64encode(f"{proxy_user}:{proxy_pass}".encode("utf-8")).decode("ascii")
        auth_line = f"Proxy-Authorization: Basic {tok}\\r\\n".encode("ascii")
    try:
        conn = asyncio.open_connection(ip, int(port))
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
        probe_req = (
            b"CONNECT passport2.eastmoney.com:443 HTTP/1.1\\r\\n"
            b"Host: passport2.eastmoney.com:443\\r\\n"
            + auth_line
            + b"Proxy-Connection: Keep-Alive\\r\\n\\r\\n"
        )
        writer.write(probe_req)
        await asyncio.wait_for(writer.drain(), timeout=timeout)
        first_line = await asyncio.wait_for(reader.readline(), timeout=timeout)
        status_txt = first_line.decode("ascii", errors="ignore").strip()
        if " 200 " in status_txt or status_txt.endswith(" 200"):
            return "ok"
        if "407" in status_txt:
            return "407"
        return "dead"
    except Exception:
        return "dead"
    finally:
        if writer is not None:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass


def fetch_fresh_wandou_batch(api_url: str, count: int = 3):
    """按需实时从天启代理 / 动态代理 API 拉取 count 个全新短效代理 IP（随用随取，绝不过期）"""
    api_url = extract_clean_url(api_url)
    if not api_url or "YOUR_" in api_url:
        return []
    req_count = max(count + 2, 4)
    batch_url = re.sub(r"num=\\d+", f"num={req_count}", api_url)
    if "num=" not in batch_url:
        sep = "&" if "?" in batch_url else "?"
        batch_url = f"{batch_url}{sep}num={req_count}"
    try:
        raw = smart_http_get(batch_url, timeout=10)
        nodes = []
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("code") not in (None, 200, 1000) and not data.get("data"):
                err_msg = data.get("Msg") or data.get("msg") or str(data)
                print(f"  [代理API报错] code={data.get('code')} | {err_msg}（请确认已在天启后台添加当前公网IP白名单或填写天启账密认证）")
                return []
            items = data if isinstance(data, list) else data.get("data", [])
            for item in items:
                if isinstance(item, dict) and item.get("ip") and item.get("port"):
                    prov_city = f"{item.get('prov') or ''}{item.get('city') or ''}".strip()
                    nodes.append({
                        "ip": str(item["ip"]).strip(),
                        "port": int(item["port"]),
                        "city": prov_city or "天启3分钟高匿",
                    })
        except Exception:
            pass
        if not nodes:
            for line in raw.splitlines():
                m = re.search(r"(\\d{1,3}(?:\\.\\d{1,3}){3}):(\\d{2,5})", line)
                if m:
                    nodes.append({"ip": m.group(1), "port": int(m.group(2)), "city": "天启3分钟高匿"})
        return nodes
    except Exception as e:
        print(f"  [代理API提示] 实时拉取本批 IP 失败 ({e})，将自动切换本机直连保底")
        return []


async def get_verified_proxy_batch(api_url: str, needed: int, proxy_user: str = "", proxy_pass: str = ""):
    """提取并并发做 HTTP CONNECT 真隧道测活，自动剔除 407 鉴权失败节点和死 IP；若全部 407 则返回空列表由直连保底"""
    candidates = fetch_fresh_wandou_batch(api_url, count=needed + 2)
    if not candidates:
        return []
    checks = await asyncio.gather(
        *(check_proxy_alive(n["ip"], n["port"], proxy_user=proxy_user, proxy_pass=proxy_pass) for n in candidates)
    )
    alive = [n for n, status in zip(candidates, checks) if status == "ok"]
    err_407_count = sum(1 for status in checks if status == "407")
    dead_count = len(candidates) - len(alive)
    if dead_count > 0:
        hint_407 = (
            f"（含 {err_407_count} 个返回 407 鉴权拒绝：您的移动/宽带网络存在多出口 IP 跳变，建议填天启账密认证或用『🚀 单窗免407极速抓新号』）"
            if err_407_count > 0
            else ""
        )
        print(f"  [代理真隧道测活] 已提前拦截并剔除 {dead_count} 个不可用节点{hint_407}，保留 {len(alive)} 个可用节点")
    if len(alive) < needed and err_407_count < len(candidates):
        more = fetch_fresh_wandou_batch(api_url, count=needed + 2)
        if more:
            more_checks = await asyncio.gather(
                *(check_proxy_alive(n["ip"], n["port"], proxy_user=proxy_user, proxy_pass=proxy_pass) for n in more)
            )
            alive.extend([n for n, status in zip(more, more_checks) if status == "ok"])
    return alive


def parse_account_line(raw_line: str):
    """支持 手机号----密码、手机号/密码、手机号,密码、手机号 密码 等任意格式"""
    line = (raw_line or "").strip()
    if not line:
        return None
    cols = [c.strip().strip('"').strip("'") for c in re.split(r"[\\t,;|，/\\s]+|----+", line) if c.strip()]
    if len(cols) < 2:
        return None
    first = cols[0].lower()
    if "账号" in first or "username" in first or "手机号" in first:
        return None
    username, password = cols[0], cols[1]
    if not username or not password:
        return None
    return {
        "username": username,
        "password": password,
        "proxy_ip": cols[2] if len(cols) > 2 and re.match(r"^\\d+\\.\\d+\\.\\d+\\.\\d+$", cols[2]) else "127.0.0.1",
        "proxy_port": int(cols[3]) if len(cols) > 3 and cols[3].isdigit() else 1080,
        "proxy_city": cols[4] if len(cols) > 4 and cols[4] else "天启3分钟高匿",
    }


def load_spreadsheet_rows(csv_path: str):
    if not os.path.exists(csv_path):
        return []
    rows = []
    seen = set()
    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        for raw_line in f:
            parsed = parse_account_line(raw_line)
            if parsed and parsed["username"] not in seen:
                seen.add(parsed["username"])
                rows.append(parsed)
    return rows


async def harvest_single_account(
    row: dict,
    target_url: str,
    sem: asyncio.Semaphore,
    slot_idx: int = 0,
    batch_size: int = 1,
    backup_nodes: Optional[list] = None,
    direct_mode: bool = False,
    proxy_user: str = "",
    proxy_pass: str = "",
    immediate_save_cb: Optional[Callable] = None,
) -> dict:
    async with sem:
        username = row["username"]
        password = row["password"]
        captured = {
            "h": (row.get("existing_h") or "").strip(),
            "like_deviceid": "",
            "deviceid": "",
            "cookie": "",
        }
        real_auth_ok = False
        user_closed_skip = False
        wrong_pwd_detected = False

        try:
            from playwright.async_api import async_playwright
        except ImportError:
            print(f"  [{username}] ❌ 缺少 playwright 依赖，请先运行: pip install playwright && playwright install chromium")
            return {**row, **captured, "enabled": False}

        win_w = 580 if batch_size == 1 else (470 if batch_size >= 3 else 540)
        win_x = 60 if batch_size == 1 else (15 + (slot_idx % max(1, batch_size)) * (win_w + 15))
        win_y = 35

        candidate_proxies = []
        if direct_mode:
            candidate_proxies.append({"ip": "127.0.0.1", "port": 1080, "city": "本机直连极速免407"})
        else:
            if row.get("proxy_ip") and row["proxy_ip"] != "127.0.0.1":
                candidate_proxies.append({
                    "ip": row["proxy_ip"],
                    "port": row["proxy_port"],
                    "city": row.get("proxy_city", "天启3分钟高匿"),
                })
            for bn in (backup_nodes or []):
                if bn.get("ip") and (bn["ip"], bn["port"]) != (row.get("proxy_ip"), row.get("proxy_port")):
                    candidate_proxies.append(bn)
            # 关键兜底：即使在挂代理模式下，若天启节点全部遇到移动宽带 407 拒绝，最后一次自动降级本机直连，确保窗口 100% 能打开登录！
            candidate_proxies.append({"ip": "127.0.0.1", "port": 1080, "city": "本机直连保底(自动绕过407)"})

        for attempt_proxy_idx, pnode in enumerate(candidate_proxies[:3]):
            use_proxy = bool(pnode.get("ip") and pnode["ip"] != "127.0.0.1")
            proxy_server = f"http://{pnode['ip']}:{pnode['port']}"
            if use_proxy:
                row["proxy_ip"] = pnode["ip"]
                row["proxy_port"] = pnode["port"]
                row["proxy_city"] = pnode.get("city", "")
            prefix_tag = "自动切换通道" if attempt_proxy_idx > 0 else "启动窗口"
            channel_desc = f"{proxy_server} · {pnode.get('city', '')}" if use_proxy else pnode.get("city", "本机直连")
            print(f"  [{username}] {prefix_tag} #{slot_idx + 1} ({channel_desc})...")
            need_proxy_failover = False

            playwright_proxy = None
            if use_proxy:
                playwright_proxy = {"server": proxy_server}
                if proxy_user and proxy_pass:
                    playwright_proxy["username"] = proxy_user
                    playwright_proxy["password"] = proxy_pass

            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        headless=False,
                        args=[
                            f"--window-position={win_x},{win_y}",
                            f"--window-size={win_w},800",
                            "--disable-blink-features=AutomationControlled",
                        ],
                        proxy=playwright_proxy,
                    )
                    context = await browser.new_context(viewport={"width": win_w - 20, "height": 710})

                    def on_request(req):
                        u = req.url
                        ul = u.lower()
                        if "likearticle" in ul or "gbapi.eastmoney.com" in ul or "reply" in ul:
                            qs = parse_qs(urlparse(u).query)
                            if "h" in qs and len(qs["h"][0]) >= 16:
                                captured["h"] = qs["h"][0]
                            if "deviceid" in qs and qs["deviceid"][0]:
                                if "likearticle" in ul:
                                    captured["like_deviceid"] = qs["deviceid"][0]
                                else:
                                    captured["deviceid"] = qs["deviceid"][0]
                        if "webreplyarticle" in ul and req.post_data:
                            qs = parse_qs(req.post_data)
                            if "deviceid" in qs:
                                captured["deviceid"] = qs["deviceid"][0]
                            if "h" in qs and not captured["h"]:
                                captured["h"] = qs["h"][0]

                    context.on("request", on_request)

                    # 登录完成前 100% 放行全部图片与脚本（确保 5 位字母图片验证码、点击验证秒出）；登录后进文章页拦截无关大图加速
                    async def route_accelerator(route):
                        req = route.request
                        u = req.url.lower()
                        if not real_auth_ok or "passport" in u or "validate" in u or "captcha" in u or "login" in u or "verify" in u:
                            await route.continue_()
                            return
                        if req.resource_type in ("media", "font") or (
                            req.resource_type == "image" and "caifuhao" in u
                        ):
                            await route.abort()
                            return
                        await route.continue_()

                    page = await context.new_page()
                    await page.route("**/*", route_accelerator)

                    existing_cookie = (row.get("existing_cookie") or "").strip()
                    if existing_cookie and "ct=" in existing_cookie and "ut=" in existing_cookie:
                        cookie_objs = []
                        for seg in existing_cookie.split(";"):
                            if "=" in seg:
                                ck_name, ck_val = seg.strip().split("=", 1)
                                if ck_name.strip():
                                    cookie_objs.append({
                                        "name": ck_name.strip(),
                                        "value": ck_val.strip(),
                                        "domain": ".eastmoney.com",
                                        "path": "/",
                                    })
                        if cookie_objs:
                            await context.add_cookies(cookie_objs)
                            real_auth_ok = True
                            captured["cookie"] = existing_cookie
                            print(f"  [{username}] ♻️ 已注入现有 ct/ut 登录态（免输密码、免验证码），极速打开文章补抓专属 h...")

                    if not real_auth_ok:
                        try:
                            await page.goto("https://passport2.eastmoney.com/pub/login", wait_until="domcontentloaded", timeout=18000)
                        except Exception as nav_err:
                            err_s = str(nav_err)
                            if page.is_closed() or "Target page, context or browser has been closed" in err_s:
                                user_closed_skip = True
                                await browser.close()
                                break
                            if use_proxy and (
                                "ERR_INVALID_AUTH_CREDENTIALS" in err_s
                                or "ERR_TUNNEL_CONNECTION_FAILED" in err_s
                                or "ERR_PROXY_CONNECTION_FAILED" in err_s
                                or "Timeout" in err_s
                            ):
                                print(f"  [{username}] ⚠️ 代理节点 {pnode['ip']}:{pnode['port']} 触发鉴权/隧道拒绝 ({err_s.splitlines()[0]})，立即自动切换下一通道...")
                                need_proxy_failover = True
                            else:
                                print(f"  [{username}] ⚠️ 打开登录页较慢 ({err_s.splitlines()[0]})，正在重试...")
                                await page.goto("https://passport2.eastmoney.com/pub/login", wait_until="domcontentloaded", timeout=22000)

                        if need_proxy_failover:
                            await browser.close()
                            continue

                        form_filled = False
                        for _ in range(30):  # 轮询等待登录子 iframe 加载就绪
                            if page.is_closed():
                                user_closed_skip = True
                                break
                            for frame in [*page.frames, page.main_frame]:
                                try:
                                    acc_tab = frame.locator("[data-type='account']").first
                                    if await acc_tab.count() == 0:
                                        acc_tab = frame.get_by_text("账号登录", exact=True).first
                                    if await acc_tab.count() > 0 and await acc_tab.is_visible():
                                        await acc_tab.hover(timeout=1200)
                                        await page.wait_for_timeout(100)
                                        await acc_tab.click(timeout=1200)
                                        await page.wait_for_timeout(220)

                                    user_input = frame.locator("#txt_account, input[name='login_email'], input[placeholder*='邮箱/手机']").first
                                    pwd_input = frame.locator("#txt_pwd, input[name='login_password'], input[type='password']").first
                                    if await user_input.count() > 0 and await pwd_input.count() > 0 and await user_input.is_visible():
                                        await user_input.click(timeout=1200)
                                        await user_input.fill(username)
                                        await page.wait_for_timeout(80)
                                        await pwd_input.click(timeout=1200)
                                        await pwd_input.fill(password)
                                        await page.wait_for_timeout(150)

                                        # 自动勾选《隐私政策》和《服务协议》（img.selectbox.unselected）
                                        agree_box = frame.locator("#loginForm img.selectbox.unselected, img.selectbox.unselected").first
                                        if await agree_box.count() > 0 and await agree_box.is_visible():
                                            await agree_box.click(timeout=1200)
                                            await page.wait_for_timeout(120)

                                        verify_hint = frame.get_by_text("点击进行验证").first
                                        captcha_input = frame.locator(
                                            "#txt_vcode, #txt_validcode, input[name*='vcode'], input[name*='code'], input[placeholder*='验证码'], input[placeholder*='字母']"
                                        ).first
                                        has_click_verify = await verify_hint.count() > 0 and await verify_hint.is_visible()
                                        has_img_captcha = await captcha_input.count() > 0 and await captcha_input.is_visible()

                                        # 关键优化：绝不盲目提前点击 #btn_login 触发东财红字报错！优先定位到验证码输入框，输完回车或点一次登录即可
                                        if has_img_captcha:
                                            try:
                                                await captcha_input.click(timeout=1000)
                                            except Exception:
                                                pass
                                            print(
                                                f"  👉 [{username}] 已自动填好账密+勾选协议+定位光标！请输入 5 位字母验证码后按回车或点【登录】（若密码错直接点右上角 X 秒跳下一号）"
                                            )
                                        elif has_click_verify:
                                            print(
                                                f"  👉 [{username}] 已自动填好账密+勾选协议！请点一下【点击进行验证】再点【登录】（若密码错直接点右上角 X 秒跳下一号）"
                                            )
                                        else:
                                            print(
                                                f"  👉 [{username}] 已自动填好账密+勾选协议！请在窗口完成验证（如有 5 位字母验证码请输入）并点一次【登录】"
                                            )
                                        form_filled = True
                                        break
                                except Exception:
                                    continue
                            if form_filled or page.is_closed():
                                break
                            try:
                                await page.wait_for_timeout(350)
                            except Exception:
                                user_closed_skip = True
                                break

                        # 若开启代理时子 iframe 因移动宽带 CGNAT 407 根本没加载出来，自动无感切本机直连重开！
                        if not form_filled and not page.is_closed() and use_proxy and attempt_proxy_idx < len(candidate_proxies) - 1:
                            print(f"  [{username}] ⚠️ 当前代理下登录框子页面被 407 拦截未加载，正在自动切换直连保底通道重开...")
                            await browser.close()
                            continue

                        if not form_filled and not page.is_closed():
                            print(f"  ⚠️ [{username}] 请在窗口 #{slot_idx + 1} 手动登录（限时 {HUMAN_WAIT_SECONDS}s，直接点 X 可跳过此号）")

                        # 2. 高频检测 (每 0.4 秒一次)：一旦检测到 ct 和 ut 立即第一时间写入磁盘！同时智能识别密码错误提示
                        max_ticks = int(HUMAN_WAIT_SECONDS * 2.5)
                        printed_pwd_err = False
                        for tick_i in range(max_ticks):
                            if page.is_closed():
                                user_closed_skip = True
                                break
                            try:
                                cookies = await context.cookies()
                                names = {c.get("name"): c.get("value") for c in cookies}
                                if names.get("ct") and names.get("ut"):
                                    real_auth_ok = True
                                    captured["cookie"] = format_clean_cookies(cookies)
                                    if immediate_save_cb is not None:
                                        await immediate_save_cb(username, password, captured["cookie"], row)
                                    break
                                if not printed_pwd_err and tick_i % 5 == 3:
                                    for fr in page.frames:
                                        try:
                                            err_loc = fr.locator(".error, .err-msg, #err_msg, .tip-error, [class*='err']").first
                                            if await err_loc.count() > 0 and await err_loc.is_visible():
                                                etxt = (await err_loc.inner_text(timeout=400)).strip()
                                                if etxt and any(k in etxt for k in ("密码", "账号", "不正确", "错误", "不存在", "锁定")):
                                                    wrong_pwd_detected = True
                                                    printed_pwd_err = True
                                                    print(f"  ❌ [{username}] 页面提示『{etxt}』！若密码有误，直接点窗口右上角 X 即可秒跳下一号！")
                                                    break
                                        except Exception:
                                            pass
                                await page.wait_for_timeout(400)
                            except Exception as loop_err:
                                if "Target page, context or browser has been closed" in str(loop_err) or page.is_closed():
                                    user_closed_skip = True
                                break

                    # 3. 访问财富号文章触发点赞捕获独立 h（此时 ct/ut 已经安全存入 config.json，哪怕文章慢也绝不丢 Cookie！）
                    if real_auth_ok and not captured["h"] and not page.is_closed():
                        try:
                            await page.goto(target_url, wait_until="domcontentloaded", timeout=16000)
                        except Exception:
                            pass

                        try:
                            await page.wait_for_selector(".zan, .txtzan, .icon_zan, #zan, .art_zan, .like-btn, [class*='zan']", timeout=6000)
                        except Exception:
                            pass

                        try:
                            await page.evaluate("() => window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.45))")
                            await page.wait_for_timeout(500)
                        except Exception:
                            pass

                        for _ in range(5):
                            if captured["h"] or page.is_closed():
                                break
                            for sel in [".zan", ".txtzan", ".icon_zan", "#zan", ".art_zan", ".like-btn", "[class*='zan']", "[class*='like']", "text=点赞"]:
                                try:
                                    loc = page.locator(sel).first
                                    if await loc.count() > 0 and await loc.is_visible():
                                        await loc.scroll_into_view_if_needed(timeout=1000)
                                        await loc.click(timeout=1200, force=True)
                                        break
                                except Exception:
                                    continue
                            if not captured["h"]:
                                try:
                                    await page.evaluate("""() => {
                                        const btn = document.querySelector('.zan, .txtzan, .icon_zan, #zan, .art_zan, .like-btn, [class*="zan"]');
                                        if (btn) btn.click();
                                    }""")
                                except Exception:
                                    pass

                            for _ in range(4):
                                if captured["h"] or page.is_closed():
                                    break
                                try:
                                    await page.wait_for_timeout(250)
                                except Exception:
                                    break

                        try:
                            if not page.is_closed():
                                final_cookies = await context.cookies()
                                if final_cookies:
                                    fresh_ck = format_clean_cookies(final_cookies)
                                    if "ct=" in fresh_ck and "ut=" in fresh_ck:
                                        captured["cookie"] = fresh_ck
                        except Exception:
                            pass

                    await browser.close()
            except Exception as e:
                err_txt = str(e)
                if "Target page, context or browser has been closed" in err_txt:
                    user_closed_skip = True
                else:
                    print(f"  [{username}] ⚠️ 抓包提示 ({err_txt.splitlines()[0]})")
            break

        if real_auth_ok:
            h_status = f"独立h={captured['h'][:10]}..." if captured["h"] else "未捕获h(Cookie已存妥，可稍后点『免密补抓h』)"
            print(f"  [{username}] ✅ 提取成功: Cookie(ct/ut)完备 | {h_status}")
        elif user_closed_skip:
            extra_pwd = "（已标记疑似错密，可在客户端『提取待抓新号改错密』修正）" if wrong_pwd_detected else ""
            print(f"  [{username}] ⏭️ 已手动关窗秒跳该账号{extra_pwd}")
        else:
            print(f"  [{username}] ❌ 本轮超时未完成登录（下次启动将自动只跑未完成账号）")

        return {
            "username": username,
            "password": password,
            "cookie": captured["cookie"],
            "deviceid": captured["deviceid"] or "12dkmnjhbgtyhjko",
            "like_deviceid": captured["like_deviceid"] or "35dkmnjhbgtyhjko",
            "h": captured["h"],
            "proxy_ip": row["proxy_ip"],
            "proxy_port": row["proxy_port"],
            "proxy_city": row["proxy_city"],
            "enabled": real_auth_ok,
        }


def ensure_playwright_ready(install_browser: bool = False) -> bool:
    """电脑系统还原后自动自检并补装 playwright 依赖与 Chromium 浏览器内核（内置清华源与淘宝镜像加速）"""
    try:
        import playwright.async_api  # noqa: F401
    except ImportError:
        print("[环境自愈] 检测到系统还原后尚未安装 playwright 依赖，正在通过国内清华镜像自动安装...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"],
            check=False,
        )
    try:
        import playwright.async_api  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=False)

    if install_browser:
        print("[环境自愈] 正在检查并下载 Chromium 抓包浏览器内核（优先走国内 npmmirror 高速镜像）...")
        env = os.environ.copy()
        env["PLAYWRIGHT_DOWNLOAD_HOST"] = "https://npmmirror.com/mirrors/playwright"
        res = subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], env=env, check=False)
        if res.returncode != 0:
            print("[环境自愈] 正在切换默认官方通道重试下载 Chromium 内核...")
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
    return True


async def main():
    parser = argparse.ArgumentParser(description="东财智运 v6.0 零崩溃防407登录抓包代理")
    parser.add_argument("--only-new", action="store_true", help="仅抓取尚无 ct/ut 的新导入账号（老账号全部跳过）")
    parser.add_argument("--only-missing-h", action="store_true", help="仅对已有 ct/ut 但缺独立 h 的账号免密补抓 h")
    parser.add_argument("--direct", action="store_true", help="免代理本机直连极速抓号（专治中国移动多出口 407 报错，登录框0.3秒秒开）")
    parser.add_argument("--install-only", action="store_true", help="仅检查并自动安装 Playwright 与 Chromium 浏览器内核")
    parser.add_argument("--batch-size", type=int, default=None, help="每批并排窗口数 (--direct 默认 1 窗稳抓)")
    args, _ = parser.parse_known_args()
    raw_bs = args.batch_size if args.batch_size is not None else (1 if args.direct else DEFAULT_BATCH_SIZE)
    batch_size = max(1, min(4, int(raw_bs)))

    print("================================================================")
    print("  东财智运 v6.0 · 零崩溃防 407 登录与 h 签名抓包引擎")
    print("================================================================")

    ensure_playwright_ready(install_browser=args.install_only)
    if args.install_only:
        print("✅ Playwright 与 Chromium 抓包浏览器内核已安装就绪！现在可以随时点击『🚀 单窗免407极速抓新号』。")
        return

    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            try:
                b = await p.chromium.launch(headless=True)
                await b.close()
            except Exception as launch_err:
                if "Executable doesn't exist" in str(launch_err) or "playwright install" in str(launch_err):
                    ensure_playwright_ready(install_browser=True)
    except ImportError as e:
        print(f"\\n❌ [阻塞错误] 当前 Python ({sys.executable}) 尚未成功安装 playwright: {e}")
        print("👉 请先执行依赖安装后再运行：")
        print(f'   "{sys.executable}" -m pip install --upgrade greenlet>=3.3.1 playwright aiohttp pillow')
        print(f'   "{sys.executable}" -m playwright install chromium')
        return

    with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)

    seen_existing_h = set()
    existing_valid_map = {}
    for a in cfg.get("accounts", []):
        uname = str(a.get("username") or "").strip()
        ck = clean_raw_cookie_text(a.get("cookie") or "")
        if uname and "ct=" in ck and "ut=" in ck:
            clean_acc = dict(a)
            clean_acc["cookie"] = ck
            cur_h = (clean_acc.get("h") or "").strip()
            if cur_h:
                if cur_h in seen_existing_h:
                    clean_acc["h"] = ""
                else:
                    seen_existing_h.add(cur_h)
            existing_valid_map[uname] = clean_acc

    # 合并 CSV 表格与 config.json 中的所有账号（新老账号全部保留，绝不丢失）
    rows = load_spreadsheet_rows(CSV_FILE)
    row_names = {r["username"] for r in rows}
    for a in cfg.get("accounts", []):
        uname = str(a.get("username") or "").strip()
        if uname and uname not in row_names:
            row_names.add(uname)
            rows.append({
                "username": uname,
                "password": str(a.get("password") or ""),
                "proxy_ip": str(a.get("proxy_ip") or "127.0.0.1"),
                "proxy_port": int(a.get("proxy_port") or 1080),
                "proxy_city": str(a.get("proxy_city") or "天启3分钟高匿"),
            })

    if not rows:
        print(f"未在 {CSV_FILE} 或 {CONFIG_FILE} 中读取到账号，请先在客户端粘贴导入新账号！")
        return

    pending_rows = []
    complete_skip_count = 0
    reuse_cookie_count = 0
    skipped_by_mode = 0

    for r in rows:
        uname = r["username"]
        ex = existing_valid_map.get(uname)
        has_cookie = ex is not None
        has_h = bool(ex and (ex.get("h") or "").strip())

        if has_cookie and has_h:
            complete_skip_count += 1
            continue

        if args.only_new and has_cookie:
            skipped_by_mode += 1
            continue

        if args.only_missing_h and not has_cookie:
            skipped_by_mode += 1
            continue

        row_copy = dict(r)
        if ex:
            row_copy["existing_cookie"] = ex["cookie"]
            row_copy["existing_h"] = (ex.get("h") or "").strip()
            reuse_cookie_count += 1
        pending_rows.append(row_copy)

    net_tag = " · 本机直连免407极速通道" if args.direct else ""
    mode_desc = (
        f"【极速抓新号模式 (--only-new){net_tag}】仅抓取新导入未登录账号"
        if args.only_new
        else f"【免密补抓独立 h 模式 (--only-missing-h){net_tag}】仅对已登录老号免密补齐 h"
        if args.only_missing_h
        else f"【全量智能续传模式{net_tag}】自动抓新号 + 免密补齐缺 h 老号"
    )
    print(f"[当前模式] {mode_desc}")
    print(
        f"[账号池盘点] 总账号 {len(rows)} 个 | 已完备(有ct/ut+h) {complete_skip_count} 个 | "
        f"本轮按模式跳过 {skipped_by_mode} 个 | 本轮待处理 {len(pending_rows)} 个（其中免密补h {reuse_cookie_count} 个）"
    )

    if not pending_rows:
        print("🎉 当前所选模式下没有待处理的账号！如需补抓老号的 h 签名，请点击『♻️ 免密补抓独立 h』。")
        return

    settings = cfg.get("settings", {}) or {}
    target_url = cfg.get("task", {}).get("url", "https://caifuhao.eastmoney.com/news/20261115180907278481340")
    api_url = extract_clean_url(settings.get("proxy_api_url", ""))
    white_url = extract_clean_url(settings.get("whitelist_api_url") or "")
    proxy_user = (settings.get("proxy_user") or "").strip()
    proxy_pass = (settings.get("proxy_pass") or "").strip()

    if not args.direct:
        outbound_ips = scan_all_outbound_ips()
        if outbound_ips:
            print(f"[网络出口自检] 检测到本机公网出口 IP: {' , '.join(outbound_ips)}")
            if len(outbound_ips) > 1 and not (proxy_user and proxy_pass):
                print(
                    f"  💡 [多出口网络提醒] 您的中国移动/宽带网络同时存在 {len(outbound_ips)} 个出口 IP，白名单可能随机跳变触发 407；"
                    f"本引擎已开启『407 自动无感降级直连保底』，确保绝不报废窗口！"
                )
            if white_url and "YOUR_" not in white_url:
                for dip in outbound_ips:
                    real_white_url = re.sub(r"ip=[^&]*", f"ip={dip}", white_url)
                    try:
                        res_white = smart_http_get(real_white_url, timeout=8)
                        print(f"[白名单自动注册] 已将 {dip} 加入天启白名单: {res_white}")
                    except Exception as e:
                        print(f"[白名单提示] {e}")

    total_pending = len(pending_rows)
    total_batches = math.ceil(total_pending / batch_size)
    sem = asyncio.Semaphore(batch_size)
    save_lock = asyncio.Lock()
    latest_map = dict(existing_valid_map)
    new_ok_count = 0

    def _flush_latest_map_to_disk() -> tuple:
        merged_accounts = []
        seen_batch_h = set()
        for r_item in rows:
            u = r_item["username"]
            if u in latest_map:
                acc_obj = dict(latest_map[u])
                if not acc_obj.get("password") and r_item.get("password"):
                    acc_obj["password"] = r_item["password"]
                cur_h = (acc_obj.get("h") or "").strip()
                if cur_h:
                    if cur_h in seen_batch_h:
                        acc_obj["h"] = ""
                    else:
                        seen_batch_h.add(cur_h)
                merged_accounts.append(acc_obj)
            else:
                merged_accounts.append({
                    "username": u,
                    "password": r_item["password"],
                    "cookie": "",
                    "deviceid": "12dkmnjhbgtyhjko",
                    "like_deviceid": "35dkmnjhbgtyhjko",
                    "h": "",
                    "proxy_ip": r_item["proxy_ip"],
                    "proxy_port": r_item["proxy_port"],
                    "proxy_city": r_item["proxy_city"],
                    "enabled": False,
                })
        cfg["accounts"] = merged_accounts
        atomic_save_config(cfg, CONFIG_FILE)
        ready_cnt = sum(1 for a in merged_accounts if "ct=" in (a.get("cookie") or "") and "ut=" in (a.get("cookie") or ""))
        h_cnt = sum(1 for a in merged_accounts if (a.get("h") or "").strip())
        return ready_cnt, h_cnt

    async def immediate_save_cookie(u: str, pwd: str, ck: str, r_meta: dict) -> None:
        async with save_lock:
            prev = latest_map.get(u) or {}
            latest_map[u] = {
                "username": u,
                "password": pwd,
                "cookie": ck,
                "deviceid": prev.get("deviceid") or "12dkmnjhbgtyhjko",
                "like_deviceid": prev.get("like_deviceid") or "35dkmnjhbgtyhjko",
                "h": prev.get("h") or "",
                "proxy_ip": r_meta.get("proxy_ip") or "127.0.0.1",
                "proxy_port": r_meta.get("proxy_port") or 1080,
                "proxy_city": r_meta.get("proxy_city") or "本机直连",
                "enabled": True,
            }
            ready_cnt, _ = _flush_latest_map_to_disk()
            print(f"  💾 [{u}] 登录成功瞬间已安全写入 config.json (当前累计就绪 Cookie: {ready_cnt}/{len(rows)})，正在顺带抓 h...")

    mode_banner = "本机直连极速免 407 通道" if args.direct else "代理前置测活 + 407 自动直连保底"
    print(f"🚀 开始执行：共 {total_pending} 个待处理账号，分为 {total_batches} 批（每批 {batch_size} 个窗口 · {mode_banner}）")

    for b in range(total_batches):
        batch_rows = pending_rows[b * batch_size : (b + 1) * batch_size]
        fresh_nodes = []
        if args.direct:
            print(f"\\n--- [第 {b + 1}/{total_batches} 批] 正在打开免 407 极速登录窗口 ({batch_rows[0]['username']}) ---")
        else:
            print(f"\\n--- [第 {b + 1}/{total_batches} 批] 正在提取并测活 {len(batch_rows)} 个新鲜天启代理 IP ---")
            fresh_nodes = await get_verified_proxy_batch(
                api_url, needed=len(batch_rows), proxy_user=proxy_user, proxy_pass=proxy_pass
            )
            for idx, r in enumerate(batch_rows):
                if fresh_nodes:
                    node = fresh_nodes[idx % len(fresh_nodes)]
                    r["proxy_ip"] = node["ip"]
                    r["proxy_port"] = node["port"]
                    r["proxy_city"] = node["city"]
                else:
                    r["proxy_ip"] = "127.0.0.1"
                    r["proxy_port"] = 1080
                    r["proxy_city"] = "本机直连保底"

        batch_results = await asyncio.gather(
            *(
                harvest_single_account(
                    r,
                    target_url,
                    sem,
                    slot_idx=idx,
                    batch_size=batch_size,
                    backup_nodes=fresh_nodes[len(batch_rows):] if fresh_nodes else None,
                    direct_mode=args.direct,
                    proxy_user=proxy_user,
                    proxy_pass=proxy_pass,
                    immediate_save_cb=immediate_save_cookie,
                )
                for idx, r in enumerate(batch_rows)
            )
        )
        async with save_lock:
            for item in batch_results:
                if item.get("enabled"):
                    new_ok_count += 1
                    latest_map[item["username"]] = item
                elif item["username"] not in latest_map:
                    latest_map[item["username"]] = item
            total_ready_now, total_h_now = _flush_latest_map_to_disk()

        print(
            f"--- [第 {b + 1}/{total_batches} 批已安全落盘] "
            f"累计就绪 Cookie: {total_ready_now}/{len(rows)} 个 | 独立点赞 h: {total_h_now} 个 ---"
        )

    print("[本地安全提醒] config.json 已自动同步备份至 config.backup.json，请妥善保存在本机受控目录。")
    total_ready_final = sum(
        1 for a in cfg.get("accounts", []) if "ct=" in (a.get("cookie") or "") and "ut=" in (a.get("cookie") or "")
    )
    total_h_final = sum(
        1 for a in cfg.get("accounts", []) if (a.get("h") or "").strip()
    )
    print(f"\\n✅ 本轮执行完毕：总账号 {len(rows)} 个 | 已具备 Cookie(ct/ut) {total_ready_final} 个 | 已具备独立点赞 h 签名 {total_h_final} 个！")


if __name__ == "__main__":
    asyncio.run(main())
`;

  const autoHarvestBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 东财智运 · 表格账号全自动登录提取 Cookie 与点赞签名 v6.0
set PY_CMD=
py -3 -c "import sys" >nul 2>nul && set PY_CMD=py -3
if "%PY_CMD%"=="" (python -c "import sys" >nul 2>nul && set PY_CMD=python)
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python312\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python312\\python.exe")
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python311\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python311\\python.exe")
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python313\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python313\\python.exe")
if "%PY_CMD%"=="" (if exist "C:\\Python312\\python.exe" set PY_CMD="C:\\Python312\\python.exe")
if "%PY_CMD%"=="" (
  echo [环境自愈] 检测到电脑还原后尚未安装 Python，正在为您自动下载并静默安装 Python 3.12.8 64位...
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/python/3.12.8/python-3.12.8-amd64.exe' -OutFile 'python_setup.exe'"
  if not exist "python_setup.exe" (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' -OutFile 'python_setup.exe'"
  )
  if exist "python_setup.exe" (
    echo [环境自愈] 正在静默安装 Python 3.12 并自动配置 PATH 环境变量（约需 30~60 秒，请稍候）...
    start /wait "" "python_setup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    del /f /q "python_setup.exe" >nul 2>nul
    if exist "%LocalAppData%\\Programs\\Python\\Python312\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python312\\python.exe"
  )
)
if "%PY_CMD%"=="" (
  echo [错误] 未检测到可用的 Python 环境，请先安装 Python 3.10~3.14 并勾选 Add python.exe to PATH！
  pause
  exit /b 1
)
echo ====================================================
echo   东财智运 · 表格账号全自动登录提取凭证代理 v6.0
echo ====================================================
echo [Python 环境路径]
%PY_CMD% -c "import sys; print(sys.executable, sys.version.split()[0])"
echo.
echo [1] 正在检查并安装 Playwright 与 Python 预编译依赖 (greenlet / aiohttp / pillow)...
%PY_CMD% -c "import playwright.async_api, aiohttp, greenlet" >nul 2>nul
if errorlevel 1 (
  echo     正在安装依赖，优先使用清华镜像源加速...
  %PY_CMD% -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>nul
  %PY_CMD% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
  if errorlevel 1 %PY_CMD% -m pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple
  if errorlevel 1 %PY_CMD% -m pip install -r requirements.txt
)
echo [1.5] 正在检查并下载 Chromium 自动化内核...
set PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright
%PY_CMD% -m playwright install chromium
if errorlevel 1 (
  set PLAYWRIGHT_DOWNLOAD_HOST=
  %PY_CMD% -m playwright install chromium
)
echo.
echo [2] 正在读取账号池并以『单窗免407极速模式』自动登录提取 Cookie 与点赞签名...
%PY_CMD% auto_login_agent.py --direct --batch-size 1
echo.
echo 运行结束！按任意键退出窗口...
pause >nul
`;

  const handoverDocMd = `# 📘 东财智运 v6.0 · 云端部署、本地实操与 AI 对接全流程文档
> **适用环境**：阿里云无影云电脑（如白金款 Plus 16核 32G）、阿里云 ECS（Windows Server 2022 / Win10 / Win11）及本地 Windows 电脑  
> **核心能力**：真实浏览器 JS 阅读（95%+ 转化率） / 独立 h 签名点赞 / 随机间隔评论 / 多任务并发队列 / 账号备份无损恢复

---

## 第一部分：阿里云 ECS / 无影云电脑环境初始化指南

### 1.1 云电脑防断连必改设置（首次开机必做）
1. **关闭自动休眠与睡眠（防半夜挂机中断）**
   - **Windows 设置**：按 Win + R 输入 control 打开控制面板 -> 硬件和声音 -> 电源选项 -> 将「关闭显示器」和「使计算机进入睡眠状态」全部设为 **“从不”**。
   - **无影云电脑控制台**：进入无影个人版设置/悬浮球策略，关闭 **“无操作自动休眠/自动关机”**。
2. **迁移旧电脑完整资产（保住 247 个已抓号）**
   - 先在云电脑桌面新建文件夹（如 D:\\eastmoney_bot_v6.0），解压最新代码包；
   - 将旧电脑文件夹里的 **config.json**（含 247 个账号的 ct/ut Cookie 与 h 签名）和 **账号密码批量导入表_accounts.csv** 直接复制覆盖到云电脑同目录下；
   - 或在启动客户端后，点击顶部 **「📂 导入备份恢复」** 选择旧电脑的 config.json 一键无损合并。

### 1.2 云端一键环境初始化脚本（Python + 依赖 + 浏览器内核）
如果云电脑是全新空机，直接双击目录里的 **0_双击我_启动可视化图形界面(推荐).bat** 就会自动检测并安装 Python 3.12 与运行库。
若需手动在 PowerShell（管理员）中一次性完成极速初始化（清华源 + 国内镜像加速），可直接执行以下命令：

    # 1. 若未安装 Python 则自动从华为云镜像静默安装 Python 3.12.8
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        $pyUrl = "https://mirrors.huaweicloud.com/python/3.12.8/python-3.12.8-amd64.exe"
        $pyExe = "$env:TEMP\\python-3.12.8-amd64.exe"
        Invoke-WebRequest -Uri $pyUrl -OutFile $pyExe
        Start-Process -FilePath $pyExe -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
    }

    # 2. 配置清华源并安装核心依赖库
    python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
    python -m pip install "greenlet>=3.3.1" "aiohttp>=3.10.0" "playwright>=1.48.0" "pillow>=10.4.0" -i https://pypi.tuna.tsinghua.edu.cn/simple

    # 3. 安装 Playwright 无头 Chromium 浏览器内核
    $env:PLAYWRIGHT_DOWNLOAD_HOST = "https://npmmirror.com/mirrors/playwright"
    python -m playwright install chromium

    # 4. 启动本地可视化桌面客户端 (http://127.0.0.1:8686)
    python gui_app.py

### 1.3 不同硬件配置的并发策略调优表
- **计算公式**：同时打开的浏览器总窗口数 ＝ 同时运行的帖子任务数 × 界面填写的「阅读/点赞并发协程数」
- **老电脑 (DDR3 8GB)**：推荐同时跑 2~3 篇 · 并发填 3~4（共 6~12 窗口）· 天启 num=15~20
- **无影 16核 32G (10Mbps 网速)**：推荐同时跑 3~4 篇 · 并发填 4（共 12~16 窗口）· 天启 num=15~20
- **无影 16核 32G (40Mbps 网速)**：推荐同时跑 6~8 篇（黄金甜点）· 并发填 4~5（共 24~36 窗口）· 天启 num=30~40（1 个 IP 供 6~8 篇共享，省 85% 代理费）
- **阿里云 ECS 16核 32G (50~100Mbps)**：推荐同时跑 6~8 篇 · 并发填 5~6 · 天启 num=40~80

---

## 第二部分：代码文件夹结构说明（共 17 个核心文件）
- [资产文件·切勿覆盖] config.json：保存全部账号 Cookie(ct/ut)、独立点赞 h 签名、天启代理配置与评论语录
- [资产文件·切勿覆盖] 账号密码批量导入表_accounts.csv：账号与密码原始对照表
- 0_双击我_启动可视化图形界面(推荐).bat：日常主入口，一键自检环境并弹出 http://127.0.0.1:8686 四合一桌面客户端
- 00_双击我_表格账号全自动登录提取凭证.bat：独立启动单窗免 407 抓新号工具
- 1_双击我_一键启动运营任务.bat：命令行交互式启动脚本
- 2_双击我_启动验证码探针.bat：图形点选验证码 6 种坐标编码自动探测脚本
- gui_app.py：本地 Web 桌面客户端服务（端口 8686），管理多任务队列 MULTI_JOBS 与实时进度表
- main_engine.py：核心异步调度引擎（真实浏览器 JS 阅读、点赞并发、随机间隔评论、账号随机洗牌）
- proxy_pool.py：天启代理池 v6.0（110秒提前续期、坏IP秒级剔除、跨任务防撞锁 _CLASS_LOCK、API 热重载）
- eastmoney_api.py：东财接口层（公开阅读数核验 GetArticleReadCount、点赞 LikeArticle、评论与双 ID 解析）
- account_pool.py：账号池轮换器、配置自愈清洗、日评限额与风控状态管理
- auto_login_agent.py：Playwright 自动登录与 h 签名抓包引擎（支持 --direct 本机直连与登录瞬间落盘）
- captcha_solver.py / captcha_probe.py / requirements.txt / 电脑本地测试使用说明书(必看).md / AI技术对接研发文档.md

---

## 第三部分：财富号运营风控建议（并发数与 IP 池比例最佳实践）
1. **为什么“真实浏览器 JS 模式”能达到 95%+ 转化率？**
   - 东财文章页统计阅读量的核心请求（web_click.gif、Web_JS.gif、web_other.gif、CommonRecommend.png）属于 image 类型；系统仅拦截正文 .jpg/.webp 大图和视频，100% 放行统计像素。
   - 等待页面 load 完成 -> 模拟平滑滚动 -> 监听到至少 2 个东财统计埋点返回 HTTP 200 后才关闭窗口计入进度。
   - 单篇单 IP 严格限用 1 次（max_uses_per_ip = 1），杜绝同 IP 重复访问同一篇文章被东财去重。
2. **并发数与天启 IP 提取数（num=）黄金比例**
   - 天启短效 IP 满 110 秒强制整批续期，最佳 num 值 ≈ 单篇并发数 × 3.5（多篇并行可再 ×1.5）。切勿在低并发（如并发 3）时设 num=100，避免未用完的 IP 到 110 秒被清空作废。
3. **互动风控铁律**
   - 务必填写「天启账密认证（用户名+密码）」并勾选「强制天启代理（防单IP空跑）」。
   - 单篇评论建议 10~20 条，随机间隔上限设为 2~3 分钟，单号日评上限设为 5~10 条，配合 random.shuffle 每轮随机洗牌均匀分摊账号。

---

## 第四部分：遇到验证码时的快速接力逻辑说明
1. **发评论遇到点选验证码（rc: 2）—— 全自动 1.5 秒无感换号接力**
   - 立即将未发出的评论塞回队列最前端（insert(0, base_comment)），保证语录一条不漏；
   - 不触发分钟级随机等待（need_random_wait = False），仅等待 1.5 秒即刻切换下一个随机账号 + 新鲜代理 IP 重发。
2. **抓新号登录遇到 5 位英文字母图片验证码 —— 单窗免 407 人工辅助 + 瞬间落盘**
   - 点击「🚀 1窗免407极速抓新号」（--direct --batch-size 1），自动填好账密并停在验证码框等待人工输入（限时 90 秒）；
   - 输入 5 位字母点登录后，一旦检测到 ct/ut 生成，第 1 秒内立即调用 immediate_save_cookie 写入 config.json，绝不因后续网络波动丢凭证；遇死号直接点窗口右上角 X 即可跳过。

---

## 第五部分：致新对话 AI 模型的快速代码定位索引（AI Context Index）
1. **放宽云电脑单任务浏览器并发上限（当前为 6）**：
   - 位于 /src/engine/pythonExporter.ts 的 main_engine.py -> _run_standalone_clicks：
     browser_conc = max(1, min(max_conc, 6))
   - 当用户在 16核 32G 云电脑上需单任务开 12~25 并发时，将该行的 6 改为 25 或 30。
2. **浏览器阅读埋点放行与完成判定逻辑**：位于 main_engine.py -> _click_worker_browser。
3. **天启代理池多任务锁与热重载逻辑**：位于 proxy_pool.py -> ProxyPool（_CLASS_LOCK / _LAST_API_CALL_TS / _reload_proxy_settings_from_disk）。
4. **无损升级铁律**：修改后运行单元测试与 py_compile 校验，并提醒用户点击「下载防崩升级补丁 (.zip · 不覆盖 config.json)」更新，严禁覆盖用户本地的 247 个已抓账号（当前示例链接：${task.url}）。
`;

  const aiHandoverDocMd = `# 东财智运（EastMoney Bot v6.0）AI 通用技术对接研发文档

> **文档定位**：本文件为跨对话 / 跨模型技术交接与持续研发基准文档。任何 AI 研发助手或工程师只需结合**导出的 Python 桌面客户端运行包（eastmoney_bot_v6.0）**及本文件，即可完整掌握系统架构、接口契约、实测结论、已知边界与后续迭代方案。

---

## 一、项目概览与合规安全边界

### 1.1 系统定位与双端形态
1. **Web 生成与配置工作台（React + TypeScript + Vite）**：
   - 提供可视化配置、账号池审计、浏览器沙盒仿真，并将完整桌面客户端生成为两种 ZIP 包：
     - **完整运行包**：含全部 17 个文件（首次部署使用）。
     - **防崩无损升级补丁包（buildUpgradePatchZip）**：含 15 个代码、脚本与文档文件，**严格剔除 config.json 与 账号密码批量导入表_accounts.csv**，用于后续迭代直接解压覆盖，避免误删用户本地已登录账号资产。
2. **Windows 本地四合一桌面客户端（Python 3.12 + aiohttp + Playwright）**：
   - 本地 http://127.0.0.1:8686 控制台（gui_app.py），统一调度阅读、点赞、随机间隔评论、多任务并发队列、备份无损合并、天启代理测活、抓包登录与验证码探针。

### 1.2 资产保护与技术合规红线（必须严格遵守）
1. **严禁覆盖本地账号资产**：
   - 用户生产环境 config.json 中已积累 **247 个有效东财账号**（含有效 ct / ut 会话 Cookie 及独立点赞签名 h），以及原始账密表 账号密码批量导入表_accounts.csv。
   - 任何代码更新与补丁分发，必须保持 buildUpgradePatchZip 排除上述两个文件的机制；写入 config.json 必须通过 atomic_save_config（先写 .tmp 再 os.replace，并维护 config.backup.json）。
2. **严禁逆向伪造私有加密上报接口**：
   - 东方财富财富号阅读计数依赖页面端 JS 执行并触发埋点像素。**禁止逆向破解、模拟或伪造 bdwblog、Web_JS.gif、passc、web_click.gif 等私有统计信标协议请求**。
   - 真实阅读执行必须通过合规的 **Playwright 无头 Chromium 浏览器**（read_engine = "browser"）完整渲染 DOM 与执行标准 JS 生命周期。

---

## 二、打包代码目录结构与模块职责（17 个核心文件）

| 文件名 | 类型 | 是否含在升级补丁 | 核心职责与关键符号 |
| :--- | :--- | :---: | :--- |
| config.json | 资产配置 | ❌ 禁止覆盖 | 存储 accounts（凭证/签名）、task（文章链接/目标/语录）、settings（并发/代理/风控参数） |
| 账号密码批量导入表_accounts.csv | 资产表格 | ❌ 禁止覆盖 | 原始账密导入对照表（东财账号,登录密码,代理IP,代理端口,代理城市） |
| gui_app.py | Web GUI 服务 | ✅ | 本地 aiohttp.web 服务（端口 8686），管理 MULTI_JOBS 多任务队列、配置读写与热重载触发 |
| main_engine.py | 核心调度引擎 | ✅ | MainEngine：独立/组合执行阅读（浏览器/HTTP）、点赞、串行随机间隔评论与日志输出 |
| proxy_pool.py | 代理池引擎 | ✅ | ProxyPool：天启代理提取、TTL=110s 续期、坏节点秒级剔除、HTTPS CONNECT 测活、多任务锁 _CLASS_LOCK |
| eastmoney_api.py | 接口协议层 | ✅ | EastMoneyAPI：双 ID 提取、公开阅读数查询、点赞、评论、rc:2 状态识别与 encode_points |
| account_pool.py | 账号与配置自愈 | ✅ | AccountPool、clean_cookie_string、sanitize_local_config_file（去除冗余登录 Cookie 与重复 h） |
| auto_login_agent.py | 抓包登录引擎 | ✅ | Playwright 登录与 h 签名抓取，支持 --direct 免 407、immediate_save_cookie 登录即落盘 |
| captcha_solver.py | 验证码求解器 | ✅ | build_solver / DdddOcrClickSolver / ManualClickSolver（缺失 ddddocr 时自动降级换号） |
| captcha_probe.py | 验证码探针 | ✅ | 探测点选验证码接口路径与 6 种坐标编码格式（pipe / semicolon / comma / flat / json / jsonobj） |
| requirements.txt | Python 依赖 | ✅ | greenlet>=3.3.1、aiohttp>=3.10.0、playwright>=1.48.0、pillow>=11.0.0 |
| 0_双击我_启动可视化图形界面(推荐).bat | 主启动脚本 | ✅ | 自动检测/安装 Python 3.12.8（npmmirror/python.org）+ 清华源装库 + 启动 gui_app.py |
| 00_双击我_表格账号全自动登录提取凭证.bat | 抓包启动脚本 | ✅ | 安装 Chromium（npmmirror 镜像）并以 --direct --batch-size 1 启动抓新号 |
| 1_双击我_一键启动运营任务.bat | CLI 启动脚本 | ✅ | 命令行交互式执行 main_engine.py --mode click/like/comment |
| 2_双击我_启动验证码探针.bat | 探针启动脚本 | ✅ | 启动 captcha_probe.py |
| 电脑本地测试使用说明书(必看).md | 部署手册 | ✅ | 阿里云无影/ECS 初始化脚本、并发调优与实操使用指南 |
| AI技术对接研发文档.md | 研发交接文档 | ✅ | 本文档：架构契约、实测结论、硬件参数与 P0-P3 研发路线图 |

---

## 三、核心数据契约与接口规范

### 3.1 config.json 核心结构
- **accounts[] 单条结构**：
  - username: 手机号/用户名
  - password: 登录密码（可与 CSV 对齐）
  - cookie: 清洗后的会话字符串（必须包含 ct= 与 ut= 方可用于点赞/评论；已自动剔除 RequestData、__RequestVerificationToken 等冗余临时键）
  - deviceid / like_deviceid: 设备标识（默认 12dkmnjhbgtyhjko / 35dkmnjhbgtyhjko）
  - h: 独立点赞签名（去重分配，不可多号复用同一 h）
  - enabled: 布尔值（有有效 ct/ut 默认为 true）
- **task 任务结构**：
  - url: 东方财富财富号文章链接（格式 https://caifuhao.eastmoney.com/news/<url_id>）
  - resolved_url_id / resolved_postid: 双 ID 映射（**极其关键，禁止混用**）
  - target_clicks / target_likes / target_comments: 三项子任务目标数量
  - comment_interval_max / comment_interval_unit: 随机间隔阈值上限（单位 minutes 或 seconds）
  - comments: 预设评论语录数组
- **settings 引擎参数**：
  - max_concurrency: 并发协程/窗口基准数
  - read_engine: "browser"（默认且推荐）或 "http"（仅作轻量请求测试）
  - require_proxy_for_read: 是否强制代理测活（默认 true，防止本机单 IP 空跑）
  - proxy_api_url / whitelist_api_url / proxy_user / proxy_pass: 天启代理提取与鉴权配置
  - daily_comment_limit: 单号日评上限配置项（默认 5；详见第五节现状说明）

### 3.2 东方财富双 ID 与业务接口边界
1. **双 ID 严格区分（eastmoney_api.py）**：
   - url_id（从文章 URL /news/(\\d+) 提取）：用于 LikeArticle 点赞与 GetArticleReadCount 公开阅读数查询。
   - postid（从文章 HTML 中的 post_id / postId / data-postid / window.articleId 提取）：用于 ArticleAndReplyLikeInfo 查询点赞状态与 WebReplyArticle 发评论。
2. **公开阅读数核验接口**：
   - GET https://caifuhaoapi.eastmoney.com/api/v1/webchannel/Article/GetArticleReadCount?callback=cb855&artcode=<url_id>...
   - 返回 JSONP 中 Result.ReadCount，用于任务前后对比真实公开涨量（直连查询 proxy=None）。

### 3.3 本地桌面端 HTTP API（gui_app.py 监听 127.0.0.1:8686）
- GET /api/config 与 POST /api/config：读取/保存 config.json（保存后立即遍历 MULTI_JOBS 调用 _reload_proxy_settings_from_disk() 热更新代理配置）。
- POST /api/test_proxy：扫描本机多出口公网 IP + 提取节点 + 并发 HTTPS CONNECT passport2.eastmoney.com:443 隧道测活（精准识别 HTTP 407 与死节点）。
- POST /api/jobs/create：按当前表单创建独立 MainEngine 异步任务加入 MULTI_JOBS。
- POST /api/jobs/action：支持 pause / resume（先自动保存配置并触发代理热重载） / stop / remove / stop_all / clear_completed。
- POST /api/merge_config / POST /api/import_accounts / GET /api/pending_accounts：无损合并备份 config.json、批量追加账密、提取尚未抓 Cookie 的待抓新号。
- POST /api/run：触发子进程工具（install_env、harvest_direct、harvest_new、harvest_h、harvest、probe）。

---

## 四、关键执行机制与已验证的工程结论

### 4.1 真实浏览器阅读机制（main_engine.py -> _click_worker_browser）
1. **资源拦截白名单（实测根因）**：
   - 早期全量拦截 resource_type == "image" 导致 162 次访问仅涨 2 阅读。抓包证实东财核心阅读统计像素（web_click.gif、Web_JS.gif、web_other.gif、CommonRecommend.png）全部归类为 image。
   - 当前 _abort_heavy 仅拦截 media、font 与非埋点的 .jpg/.jpeg/.webp/.bmp，**100% 放行 .gif 及 gbapi.eastmoney / bdwblog / bddtlog / huaxiang / anonflow / articleclick / commonrecommend / click / beacon**。
2. **生命周期与埋点观测**：
   - 注入隐藏 navigator.webdriver、window.chrome 与桌面视口 1366x768。
   - 等待 domcontentloaded（15s）→ wait_for_load_state("load", 8.5s) → 平滑滚动 window.scrollTo({top: 380}) → 被动监听 page.on("response") 命中至少 2 个统计回包（wait_for 最多 4.5s）→ 再驻留 1200ms。若 beacon_hits == 0 则判为代理慢/丢包并失效该节点重试。
3. **单篇单 IP 限用 1 次（max_uses_per_ip = 1）**：
   - 实测证实东财按访客 IP 对单篇文章去重（同 IP 短时第 2 次访问不计新增）。冷门帖实测开启上述机制后有效转化率由 ~1–3% 提升至 **92%–98.9%**。
4. **browser vs http 阅读模式差异**：
   - http 模式（EastMoneyAPI.click_article）仅发起 GET 获取 HTML 并校验长度 >= 1500，**不执行 JS 埋点**，实测无法稳定推动东财公开 ReadCount 增长；仅建议用于极轻量连通测试，正式涨量必须使用 browser 模式。

### 4.2 代理池并发与天启策略（proxy_pool.py -> ProxyPool）
1. **跨任务锁与接口冷却**：
   - 类级可重入锁 _CLASS_LOCK = threading.RLock()，且全进程共享 _LAST_API_CALL_TS，强制两次天启 API 调用间隔 **>= 1.35 秒**，避免多任务并发启动时撞天启 QPS 限制。
2. **110 秒提前续期与热加载**：
   - 天启短效 IP 标称 180 秒，为防止临界点 407 与超时，代码在 **TTL_RENEW_SECONDS = 110 秒**强制整批换新；修改 proxy_api_url 后调用 _reload_proxy_settings_from_disk() 立即清空旧批次按新链接提取。
3. **不同任务场景的最佳 num= 提取数**：
   - **浏览器单帖（4 并发）**：110 秒约跑 35~40 次，设 **num=30** 最省不浪费；
   - **浏览器双帖并行（各 4 并发）**：共享同一批 IP 且各计单篇 1 次，设 **num=30~50**；
   - **纯串行慢速评论（间隔 1~3 分钟/条）**：110 秒仅发 1~2 条，设 **num=3~5** 即可（若组合任务中与阅读同时跑，则按阅读配 30~40 共享无浪费）。
4. **白名单与 CGNAT 踩坑结论**：
   - 严禁填写 ipconfig 内网虚拟 IP（如 192.168.x.x、198.18.x.x、10.0.x.x），需用 curl 4.ipw.cn / curl ip.sb 获取公网 IPv4（纯 IPv4 即可，无需转 IPv6）；国内移动宽带 CGNAT 或云电脑重启换 IP 时，强烈推荐填写天启**账密认证（proxy_user / proxy_pass）**彻底绕开白名单限制。

### 4.3 评论、点赞与验证码接力策略
1. **随机洗牌防固定号风控**：每次启动阅读、点赞、评论及阅读补齐轮次前，均在内存中对可用账号列表执行 random.shuffle(...)（不改变 config.json 顺序）。
2. **评论随机间隔与 rc:2 接力（_run_standalone_comments）**：
   - 顺序串行发射，每成功 1 条后抽取 random.uniform(max(1, 0.15*max_sec), max_sec) 休眠；**醒来后才调用 get_proxy_for_account**，保证长休眠后拿到全新未过期 IP。
   - 若遇 rc: 2（点选验证码）：立即将语录塞回队首（insert(0, base_comment)），跳过分钟级长等待，仅等 1.5s 切换下一个账号继续发射。
3. **登录 5 位字母验证码抓号**：使用 auto_login_agent.py --direct --batch-size 1 本机直连绕过 407，人工输入 5 位字母登录后一旦捕获 ct/ut 立即调用 immediate_save_cookie 原子写盘。

---

## 五、生产实测诊断与已知待优化项（下一阶段开发清单）

基于最新无影云电脑（白金款 Plus：**16 核 vCPU / 32 GiB RAM / 10Mbps 默认带宽可升 40Mbps**）真实运行日志与任务看板截图，系统现状如下：
- **已验证表现**：在 2 任务并发（各 4 窗口）下稳定完成 1000/1000 真阅读（公开阅读分别推进 +1549、+1618，含自然流量共振）。
- **已暴露瓶颈与后续开发任务优先级（P0 -> P3）**：

### P0：多任务共享代理池“起始游标撞车”修复（高优先）
- **问题现象（真实日志证据）**：5 个任务同时运行于共享批次 _SHARED_NODES（共 20 个 IP）时，每个任务的 self._cursor 均从 0 开始按完全一致顺序取节点，导致同一秒 5 个无头浏览器同时压死第 0 号天启家宽 IP（触发集体 Timeout 15000ms）。
- **改动位置**：proxy_pool.py（ProxyPool.__init__ 与 get_proxy_for_account 复制 _SHARED_NODES 分支）。
- **建议实现**：当从 _SHARED_NODES 同步节点到本地 self._dynamic_nodes 时，按实例随机数对节点副本做 random.shuffle 或随机偏移 self._cursor = random.randrange(len(self._dynamic_nodes))，使多任务错峰分散消耗不同节点。

### P1：高配云主机浏览器并发上限放宽与带宽自适应（高优先）
- **问题现象**：
  1. 当前 main_engine.py -> _run_standalone_clicks 硬限制 browser_conc = max(1, min(max_conc, 6))（早期为保护 8GB DDR3 老机而设），限制了 16 核 32G + 40Mbps 云主机的单帖吞吐速度。
  2. 在 10Mbps 带宽下同时开 5 帖 × 4 并发 = 20 窗口会拉爆出口带宽引发大面积 15000ms 超时。
- **改动位置**：main_engine.py（_run_standalone_clicks 与 _click_worker_browser）。
- **建议实现**：
  1. 将单任务浏览器并发上限由 6 放宽至 25 ~ 30（或改为界面可配置的上限保护），同时在手册/UI 明确标注：10Mbps 总窗口建议 8~12、40Mbps 总窗口建议 24~36。
  2. 页面 goto 超时从 15000ms 适度放宽至 20000ms ~ 22000ms，减少天启慢速家宽节点误杀；进一步优化同任务多窗口的 Context 生命周期开销。

### P2：按“东财公开阅读数实际涨量”精准闭环停机（商业级准确度）
- **需求来源**：目前阅读任务按“本地浏览器成功触发埋点次数 == target_clicks”即停机，若用户希望精确控制公开数字涨够目标，需要闭环核验。
- **建议实现**：增加可选开关（如 stop_on_public_read_target），在 _run_standalone_clicks 补齐循环内定时拉取 GetArticleReadCount，按 live_rc - read_count_start >= target_clicks 判定完成（需注意：若文章自带高自然流量，需提供“按实际涨量停”与“按请求完成停”双选项让用户自选）。

### P3：前后端一致性与日评计数落地（体验完善）
- **文案对齐**：Web 工作台卡片中（如 App.tsx 与 TaskConsoleView.tsx）仍残留历史文案 "每IP限用2次自动换新"，实际 Python 引擎已升级为 单篇每IP限1次（get_proxy_for_account(account, 1)），后续修改 UI 时需同步更正。
- **日评上限持久化**：settings.daily_comment_limit（默认 5）目前在桌面端仅作 config.json 存储字段与前端模拟器限制，Python 引擎尚依赖随机洗牌 + rc:2 换号；如需严格跨重启按日计数，可在 config.json 或独立状态文件记录 {date, username: count} 并在 _run_standalone_comments 中过滤超限账号。

---

## 六、开发与构建验证流水线（新模型接手自检标准）

若在 **Web 工作台源码仓库** 修改 /src/engine/pythonExporter.ts 或前端组件，交付前必须完成以下全部校验：
1. **逻辑与导出模板单测**：执行 npx --yes tsx --test src/engine/eastmoneyEngine.test.ts（确保全部用例通过）。
2. **TypeScript 与生产构建**：执行 npm run lint（tsc --noEmit）与 npm run build（Vite 构建）。
3. **Python 语法与运行时校验**：将 generateRepairedPythonFiles(...) 导出到临时目录，运行 python3 -m py_compile *.py 验证无语法错误，并对 ProxyPool / MainEngine 核心改动执行单元验证后清理临时目录。
4. **交付提醒**：始终指引用户通过 Web 端下载 **「防崩升级补丁 (.zip · 不覆盖 config.json)」** 解压覆盖原运行目录，严禁让用户误覆 config.json。
`;

  const guiAppPy = `"""
东财智运 v6.0 · 电脑本地可视化桌面控制台 (Local Web GUI - 三大任务独立执行 + 评论随机间隔阈值版)
双击「0_双击我_启动可视化图形界面(推荐).bat」即可自动打开浏览器图形界面，告别黑框命令行！
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import webbrowser
from typing import Dict, List, Optional
from aiohttp import web
from main_engine import MainEngine
from proxy_pool import ProxyPool

PORT = 8686
CONFIG_FILE = "config.json"

ACTIVE_ENGINE: Optional[MainEngine] = None
ACTIVE_TASK: Optional[asyncio.Task] = None
ACTIVE_PROC: Optional[asyncio.subprocess.Process] = None
MULTI_JOBS: Dict[str, dict] = {}
JOB_ORDER: List[str] = []
JOB_SEQ: int = 0
LAST_STATS = {"clicks": 0, "likes": 0, "comments": 0, "captcha_tries": 0, "failed_accounts": 0}
LAST_LOGS = []
LAST_MODE = ""

DEFAULT_COMMENTS = [
    "兆易创新现在这个位置确实有点尴尬，250没守住，下周要是再往下走，估计又得考验前面的低点了",
    "北方华创最近也调整了不少，你之前不是一直关注吗？下周还准备找机会接回来不？",
    "我倒觉得现在科技股没必要太悲观，涨多了调整一下也正常，关键还是看下周有没有资金愿意重新进来",
    "智能制造这个方向可以多研究一下，最近半导体太折腾人了，换个方向看看也挺好",
    "有时候真觉得炒股最难的不是选股票，而是等买点。明明看好一个方向，结果提前进去反而被套",
    "兆易没必要因为跌破250就太紧张，存储芯片的产业逻辑又没突然改变，短线调整和长期价值还是两回事",
    "海洋王周五从11.8拉回13，这个走势挺有意思的。就是不知道是真有资金接，还是短线拉一下又继续调整",
    "下周工业自动化准备重点看哪些票？汇川技术，埃斯顿，机器人这些有没有值得研究的？",
    "东山精密这波调整下来你怎么看？PCB方向我还是比较看好，就是不知道现在能不能开始考虑了",
    "AI出海营销以后应该还是有机会的吧？易点天下虽然这次没做好，但是我觉得不能因为一只票跌了就把整个方向否定了",
]


def repair_and_load_config(path: str) -> dict:
    """自愈式读取 config.json：自动剥离记事本 BOM、自动补齐漏写的逗号，即使底部 task 块改坏也能无损抢救全部 97 个账号并重写合法 JSON"""
    raw_bytes = b""
    if os.path.exists(path):
        with open(path, "rb") as bf:
            raw_bytes = bf.read()
    has_bom = raw_bytes.startswith(b"\\xef\\xbb\\xbf")
    try:
        raw_text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raw_text = raw_bytes.decode("gbk", errors="replace")

    cfg = None
    need_rewrite = has_bom
    try:
        cfg = json.loads(raw_text)
    except Exception:
        fixed = re.sub(
            r'([0-9"]|true|false|null|\\]|\\})\\s*\\r?\\n(\\s*"[^"]+"\\s*:)',
            r"\\1,\\n\\2",
            raw_text,
        )
        fixed = re.sub(r",\\s*([}\\]])", r"\\1", fixed)
        try:
            cfg = json.loads(fixed)
            need_rewrite = True
            print("[配置自愈] 已自动补齐 config.json 中漏写的英文逗号并修复语法！")
        except Exception as err:
            print(f"[配置自愈] 检测到 config.json 底部手动修改格式损坏 ({err})，正在无损提取 97 个账号并重建标准结构...")
            accounts_list = []
            acc_match = re.search(r'"accounts"\\s*:\\s*(\\[[\\s\\S]*?\\])\\s*,\\s*"task"', raw_text)
            if acc_match:
                try:
                    accounts_list = json.loads(acc_match.group(1))
                except Exception:
                    pass
            url_m = re.findall(r"https?://caifuhao\\.eastmoney\\.com/news/(\\d+)", raw_text)
            last_url_id = url_m[0] if url_m else "20261115180907278481340"
            tq_m = re.findall(r'https?://api\\.tianqiip\\.com/getip[^\\s"]+', raw_text)
            last_tq = tq_m[-1] if tq_m else ""
            cfg = {
                "accounts": accounts_list,
                "task": {
                    "url": f"https://caifuhao.eastmoney.com/news/{last_url_id}",
                    "resolved_url_id": last_url_id,
                    "resolved_postid": "",
                    "solo_task_mode": "comment",
                    "enable_click": False,
                    "enable_like": False,
                    "enable_comment": True,
                    "target_clicks": 100,
                    "target_likes": 20,
                    "target_comments": 10,
                    "comment_interval_max": 3,
                    "comment_interval_unit": "minutes",
                    "enable_spintax_dedup": False,
                    "comments": DEFAULT_COMMENTS,
                },
                "settings": {
                    "max_concurrency": 3,
                    "retry": 2,
                    "min_delay": 5,
                    "max_delay": 12,
                    "daily_comment_limit": 5,
                    "captcha_mode": "skip",
                    "captcha_max_retry": 2,
                    "captcha_path": "/newsreply/replyopt/api/Validate/GetValidateCode",
                    "captcha_submit_path": "/newsreply/replyopt/api/Validate/CheckValidateCode",
                    "captcha_coord_param": "validate",
                    "captcha_coord_format": "pipe",
                    "read_engine": "browser",
                    "require_proxy_for_read": True,
                    "proxy_api_url": last_tq,
                    "whitelist_api_url": "",
                },
            }
            need_rewrite = True

    if need_rewrite and cfg is not None:
        with open(path, "w", encoding="utf-8") as wf:
            json.dump(cfg, wf, ensure_ascii=False, indent=2)
        print(f"[配置自愈] 已将修复后的无 BOM 标准 config.json 写回本地（共保留 {len(cfg.get('accounts', []))} 个账号）")
    return cfg or {"accounts": [], "task": {}, "settings": {}}


HTML_PAGE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>东财智运 v6.0 · 四合一极简桌面客户端</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #09090B; color: #F4F4F5; padding: 18px 22px; background-image: radial-gradient(ellipse 75% 45% at 50% -10%, rgba(59,130,246,0.15), transparent 100%); min-height: 100vh; }
  .container { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .topbar { background: rgba(24,24,27,0.88); border: 1px solid rgba(255,255,255,0.1); padding: 16px 20px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .topbar h1 { font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .topbar p { font-size: 12px; color: #A1A1AA; }
  .aux-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 9px 14px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.14); font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.15s; color: #fff; white-space: nowrap; }
  .btn:disabled { opacity: 0.42; cursor: not-allowed; }
  .btn-click { background: #1D4ED8; border-color: rgba(96,165,250,0.45); width: 100%; padding: 11px; font-size: 13px; }
  .btn-like { background: #047857; border-color: rgba(52,211,153,0.45); width: 100%; padding: 11px; font-size: 13px; }
  .btn-comment { background: #4338CA; border-color: rgba(129,140,248,0.5); width: 100%; padding: 11px; font-size: 13px; }
  .btn-stop { background: #991B1B; border-color: rgba(248,113,113,0.45); }
  .btn-secondary { background: rgba(39,39,42,0.95); color: #E4E4E7; }
  .btn-aux { background: rgba(39,39,42,0.9); color: #D4D4D8; border-color: rgba(255,255,255,0.12); }
  .btn:hover:not(:disabled) { filter: brightness(1.13); }
  .step-card { background: rgba(24,24,27,0.72); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 18px 20px; }
  .step-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 12px; }
  .step-badge { background: rgba(59,130,246,0.2); border: 1px solid rgba(96,165,250,0.35); color: #93C5FD; font-size: 11px; padding: 2px 8px; border-radius: 6px; font-family: Consolas, monospace; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .row-3 { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 14px; }
  .solo-box { border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; background: rgba(9,9,11,0.65); display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
  .solo-box.click-box { border-color: rgba(59,130,246,0.35); background: rgba(30,58,138,0.12); }
  .solo-box.like-box { border-color: rgba(16,185,129,0.35); background: rgba(6,78,59,0.12); }
  .solo-box.comment-box { border-color: rgba(99,102,241,0.4); background: rgba(49,46,129,0.15); }
  label { display: block; font-size: 11px; color: #A1A1AA; margin-bottom: 5px; }
  input, select, textarea { width: 100%; padding: 8px 10px; background: rgba(9,9,11,0.92); color: #F4F4F5; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
  .stat-box { border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; background: rgba(9,9,11,0.8); }
  .stat-val { font-size: 20px; font-weight: 700; font-family: Consolas, monospace; margin-top: 3px; color: #fff; }
  .job-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .job-table th { text-align: left; padding: 9px 10px; color: #A1A1AA; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap; }
  .job-table td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: middle; }
  .prog-track { width: 100%; min-width: 90px; height: 7px; background: rgba(39,39,42,0.95); border-radius: 99px; overflow: hidden; }
  .prog-fill { height: 100%; background: linear-gradient(90deg, #2563EB, #10B981); transition: width 0.25s ease; }
  .chk-row { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: #E4E4E7; user-select: none; }
  .chk-row input[type="checkbox"] { width: 15px; height: 15px; accent-color: #2563EB; cursor: pointer; }
  .mini-btn { padding: 4px 9px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14); background: rgba(39,39,42,0.9); color: #E4E4E7; font-size: 11px; cursor: pointer; margin-right: 4px; }
  .mini-btn:hover { filter: brightness(1.15); }
</style>
</head>
<body>
<div class="container">
  <!-- 顶部四合一状态与快捷工具栏 -->
  <div class="topbar">
    <div>
      <h1>东财智运 v6.0 · 多任务并发桌面客户端</h1>
      <p>总账号: <span id="accCount" style="color:#34D399;font-family:monospace;font-weight:bold;">0</span> (已抓Cookie: <span id="readyCookieCount" style="color:#10B981;font-family:monospace;font-weight:bold;">0</span> · 待抓新号: <span id="pendingNewCount" style="color:#FBBF24;font-family:monospace;font-weight:bold;">0</span> · 独立点赞 h: <span id="hCount" style="color:#60A5FA;font-family:monospace;font-weight:bold;">0</span>) · 状态: <span id="runStateBadge" style="color:#FBBF24;font-weight:bold;">待命</span></p>
    </div>
    <div class="aux-bar">
      <input type="file" id="backupJsonFile" accept=".json" style="display:none;" onchange="handleBackupJsonFile(this)" />
      <button class="btn btn-aux" style="background:rgba(6,95,70,0.75);border-color:rgba(52,211,153,0.5);color:#fff;" onclick="document.getElementById('backupJsonFile').click()">📂 导入备份的 config.json</button>
      <button class="btn btn-aux" id="btnInstallEnv" onclick="runAuxScript('install_env')">🛠️ 一键装抓包浏览器内核</button>
      <button class="btn btn-aux" id="btnTestProxy" onclick="testProxy()">🔍 测试天启代理</button>
      <button class="btn btn-aux" id="btnHarvestDirect" style="background:#059669;border-color:rgba(110,231,183,0.65);color:#fff;" onclick="runAuxScript('harvest_direct')">🚀 单窗免407极速抓新号 (推荐)</button>
      <button class="btn btn-aux" id="btnHarvestNew" style="background:rgba(30,64,175,0.65);border-color:rgba(96,165,250,0.45);color:#fff;" onclick="runAuxScript('harvest_new')">⚡ 挂代理抓新号</button>
      <button class="btn btn-aux" id="btnHarvestH" onclick="runAuxScript('harvest_h')">♻️ 免密补抓独立 h</button>
      <button class="btn btn-aux" id="btnHarvest" onclick="runAuxScript('harvest')">🔑 全量抓包续传</button>
      <button class="btn btn-aux" id="btnProbe" onclick="runAuxScript('probe')">🛡️ 验证码探针</button>
      <button class="btn btn-stop" onclick="stopTask()" id="stopBtn" disabled>⏹ 全部停止</button>
    </div>
  </div>

  <!-- 第一步：填链接 & 批量追加新账号 -->
  <div class="step-card">
    <div class="step-title"><span class="step-badge">第一步</span> 粘贴目标文章链接、天启代理 API / 账密认证 与批量抓新账号</div>
    <div class="row-2">
      <div>
        <label>东方财富财富号文章链接 (可连续换不同文章链接创建多个并行任务)</label>
        <input id="urlInput" type="text" placeholder="https://caifuhao.eastmoney.com/news/20261115180907278481340" />
      </div>
      <div>
        <label>天启代理 API 提取链接 (阅读任务每IP限用2次自动换新IP，防止同IP去重)</label>
        <div style="display:flex; gap:8px;">
          <input id="proxyApiInput" type="text" placeholder="http://api.tianqiip.com/getip?secret=..." />
          <button class="btn btn-secondary" onclick="testProxy()">检测代理</button>
        </div>
      </div>
    </div>

    <!-- 天启账密认证（可选，填上后彻底解决移动宽带多出口 IP 跳变 407 报错） -->
    <div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
      <div>
        <label style="color:#6EE7B7;">天启账密认证·用户名 (选填·填后免白名单根治移动网407)</label>
        <input id="proxyUserInput" type="text" placeholder="天启后台通行证账号(选填)" />
      </div>
      <div>
        <label style="color:#6EE7B7;">天启账密认证·密码 (选填·日常高并发刷阅读也零407)</label>
        <input id="proxyPassInput" type="password" placeholder="天启后台通行证密码(选填)" />
      </div>
      <div>
        <label>白名单自动注册 API 链接 (选填·自动注册多出口IP)</label>
        <input id="whitelistApiInput" type="text" placeholder="http://api.tianqiip.com/white/add?..." />
      </div>
    </div>

    <!-- 批量追加新账号 + 提取错密待抓号 + 单窗免407极速抓包面板 -->
    <div style="margin-top:14px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1); display:grid; grid-template-columns:1.3fr 0.7fr; gap:14px; align-items:end;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; gap:8px;">
          <label style="color:#93C5FD; font-weight:600; margin-bottom:0;">➕ 追加新账号 或 修改待抓号错误密码 (每行一个：手机号----密码，已就绪老号100%保留)</label>
          <button class="btn btn-aux" style="padding:4px 10px; font-size:11px; color:#FCD34D; border-color:rgba(251,191,36,0.35);" onclick="loadPendingAccounts()">📝 提取待抓新号改错密</button>
        </div>
        <textarea id="newAccountsInput" rows="3" placeholder="13800138001----Pass123456&#10;13900139002/Pass654321"></textarea>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-secondary" style="width:100%; padding:9px; border-color:rgba(96,165,250,0.4); color:#93C5FD;" onclick="importNewAccounts()">📥 1. 追加 / 更新账号密码 (不覆盖老号)</button>
        <button class="btn" style="background:#059669; border-color:rgba(110,231,183,0.65); padding:10px; font-size:13px;" id="btnFastDirect2" onclick="runAuxScript('harvest_direct')">🚀 2. 单窗免407极速抓新号 (强烈推荐·0报错)</button>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="btn btn-aux" style="padding:8px;" id="btnFastNew2" onclick="runAuxScript('harvest_new')">⚡ 挂代理单窗抓新号</button>
          <button class="btn btn-aux" style="padding:8px;" id="btnFastH2" onclick="runAuxScript('harvest_h')">♻️ 老号免密补h</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 第二步：多任务组合勾选 & 独立快捷启动 -->
  <div class="step-card">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
      <div class="step-title" style="margin-bottom:0;"><span class="step-badge">第二步</span> 多任务组合并发 &amp; 单项独立启动 (可勾选多项组合，也可连续添加多篇文章并行跑)</div>
      <span style="font-size:11px; color:#6EE7B7;">已内置阅读防去重：每 IP 限用 2 次自动换新 + 实时核验东财公开阅读数</span>
    </div>
    <div class="row-3">
      <!-- 阅读 -->
      <div class="solo-box click-box">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:14px; font-weight:700; color:#93C5FD;">① 阅读任务</span>
            <label class="chk-row" style="margin-bottom:0;"><input type="checkbox" id="chkModeClick" checked /> 加入组合</label>
          </div>
          <div style="font-size:11px; color:#A1A1AA; margin-bottom:8px;">真浏览器 JS 触发东财阅读统计 + 每IP限2次轮换 + 公开核验</div>
          <label>阅读执行引擎 (解决纯协议 70+ 次只涨 3 个的问题)</label>
          <select id="readEngineSelect" style="margin-bottom:8px;">
            <option value="browser">真实浏览器JS执行 (Playwright·推荐真涨量)</option>
            <option value="http">纯HTTP协议 (仅下HTML不跑JS·极省内存)</option>
          </select>
          <label class="chk-row" style="font-size:11px; color:#6EE7B7; margin-bottom:8px;">
            <input type="checkbox" id="requireProxyReadChk" checked /> 强制天启代理 (防单IP空跑白费流量)
          </label>
          <label>本轮目标阅读请求数</label>
          <input id="targetClicksInput" type="number" min="1" />
        </div>
        <button class="btn btn-click" id="btnRunClick" onclick="runSoloTask('click')">▶ 仅添加阅读任务</button>
      </div>

      <!-- 点赞 -->
      <div class="solo-box like-box">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:14px; font-weight:700; color:#6EE7B7;">② 点赞任务</span>
            <label class="chk-row" style="margin-bottom:0;"><input type="checkbox" id="chkModeLike" checked /> 加入组合</label>
          </div>
          <div style="font-size:11px; color:#A1A1AA; margin-bottom:10px;">自动调用独立 h 签名账号并发点赞</div>
          <label>本轮目标点赞数</label>
          <input id="targetLikesInput" type="number" min="1" />
        </div>
        <button class="btn btn-like" id="btnRunLike" onclick="runSoloTask('like')">▶ 仅添加点赞任务</button>
      </div>

      <!-- 评论 -->
      <div class="solo-box comment-box">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:14px; font-weight:700; color:#C7D2FE;">③ 评论任务 (随机间隔)</span>
            <label class="chk-row" style="margin-bottom:0;"><input type="checkbox" id="chkModeComment" checked /> 加入组合</label>
          </div>
          <div style="display:grid; grid-template-columns:0.8fr 1.2fr; gap:8px; margin-top:6px;">
            <div>
              <label>目标评论条数</label>
              <input id="targetCommentsInput" type="number" min="1" />
            </div>
            <div>
              <label>随机间隔最大阈值 (&lt;=)</label>
              <div style="display:flex; gap:6px;">
                <input id="commentIntervalMaxInput" type="number" min="1" step="1" style="width:55%;" />
                <select id="commentIntervalUnitSelect" style="width:45%;">
                  <option value="minutes">分钟</option>
                  <option value="seconds">秒</option>
                </select>
              </div>
            </div>
          </div>
          <div style="font-size:11px; color:#A5B4FC; margin-top:6px;">每次评论后随机等待 1 ~ 设定阈值内时长，绝不超上限</div>
        </div>
        <button class="btn btn-comment" id="btnRunComment" onclick="runSoloTask('comment')">▶ 仅添加评论任务</button>
      </div>
    </div>

    <!-- 一键创建多任务组合并发启动栏 -->
    <div style="margin-top:14px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div style="font-size:12px; color:#D4D4D8;">
        支持同一篇文章同时并发跑「阅读+点赞+评论」，也支持在第一步更换新文章链接后再次点击右侧按钮，多篇文章将同时在下方进度列表中并行执行！
      </div>
      <button class="btn" id="btnLaunchMulti" style="background:linear-gradient(90deg,#2563EB,#4F46E5); border-color:rgba(129,140,248,0.6); padding:11px 20px; font-size:13px;" onclick="runMultiTaskJob()">
        🚀 启动已勾选多任务并加入进度列表
      </button>
    </div>
  </div>

  <!-- 新增：正在执行的任务进度列表 -->
  <div class="step-card">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
      <div class="step-title" style="margin-bottom:0;">
        <span class="step-badge">进度列表</span> 正在执行的任务进度列表 (<span id="activeJobsSummary">运行中 0 个 · 共 0 个任务</span>)
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-aux" style="padding:6px 12px;" onclick="controlJob('', 'clear_completed')">🧹 清理已完成/已停止</button>
        <button class="btn btn-stop" style="padding:6px 12px;" onclick="controlJob('', 'stop_all')">⏹ 停止全部任务</button>
      </div>
    </div>
    <div style="overflow-x:auto; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(9,9,11,0.7);">
      <table class="job-table">
        <thead>
          <tr>
            <th>任务 / 文章编号</th>
            <th>执行组合</th>
            <th>子项完成进度</th>
            <th>东财公开阅读核验</th>
            <th>总进度</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="multiTaskListBody">
          <tr><td colspan="7" style="text-align:center; color:#71717A; padding:18px;">暂无正在执行的任务，请在上方勾选『阅读 / 点赞 / 评论』后点击『🚀 启动已勾选多任务并加入进度列表』</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 第三步：左改评论语录，右看实时战报 -->
  <div class="step-card">
    <div class="step-title"><span class="step-badge">第三步</span> 评论语录编辑 &amp; 实时运行战报</div>
    <div class="row-2">
      <div style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <label>预设评论语录库 (每行一条 · 跑评论时按顺序逐条随机间隔发出)</label>
          <textarea id="commentsInput" rows="9" style="line-height:1.55;"></textarea>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
            <div><label>阅读/点赞并发协程数</label><input id="concInput" type="number" min="1" /></div>
            <div><label>单号日评安全上限</label><input id="limitInput" type="number" min="1" /></div>
          </div>
        </div>
        <button class="btn btn-secondary" style="margin-top:12px; width:100%; padding:10px;" onclick="saveConfig()">💾 保存全部参数到本地 config.json</button>
      </div>
      <div>
        <div class="stats">
          <div class="stat-box"><div style="font-size:11px;color:#A1A1AA;">累计阅读请求</div><div class="stat-val" id="stClicks">0</div></div>
          <div class="stat-box"><div style="font-size:11px;color:#A1A1AA;">累计成功点赞</div><div class="stat-val" id="stLikes" style="color:#34D399;">0</div></div>
          <div class="stat-box"><div style="font-size:11px;color:#A1A1AA;">累计成功评论</div><div class="stat-val" id="stComments" style="color:#818CF8;">0</div></div>
          <div class="stat-box"><div style="font-size:11px;color:#A1A1AA;">rc:2 换号</div><div class="stat-val" id="stCaptcha" style="color:#FBBF24;">0</div></div>
        </div>
        <label>本地 Python 引擎实时执行日志 (<span id="focusedJobHint">默认显示最新活动任务日志，也可点击进度列表『日志』切换</span>)</label>
        <pre id="logBox" style="background:#050507;color:#E4E4E7;border:1px solid rgba(255,255,255,0.08);padding:12px;border-radius:10px;height:215px;overflow:auto;font-size:12px;line-height:1.55;white-space:pre-wrap;">等待点击上方『🚀 启动已勾选多任务并加入进度列表』或单项快捷按钮启动...</pre>
      </div>
    </div>
  </div>
</div>
<script>
var pollTimer = null;
var focusedJobId = '';

function setButtonsRunning(auxRunning, anyJobRunning, mode) {
  document.getElementById('btnHarvest').disabled = auxRunning;
  document.getElementById('btnHarvestDirect').disabled = auxRunning;
  document.getElementById('btnHarvestNew').disabled = auxRunning;
  document.getElementById('btnHarvestH').disabled = auxRunning;
  document.getElementById('btnFastDirect2').disabled = auxRunning;
  document.getElementById('btnFastNew2').disabled = auxRunning;
  document.getElementById('btnFastH2').disabled = auxRunning;
  document.getElementById('btnInstallEnv').disabled = auxRunning;
  document.getElementById('btnProbe').disabled = auxRunning;
  document.getElementById('stopBtn').disabled = !(auxRunning || anyJobRunning);
  var badge = document.getElementById('runStateBadge');
  if (auxRunning) {
    var labelMap = {
      harvest: '正在执行全量抓包续传...',
      harvest_direct: '正在单窗免407极速抓新号 (登录即秒存Cookie)...',
      harvest_new: '正在挂代理单窗抓新号 (407自动保底)...',
      harvest_h: '正在免密补抓独立点赞 h 签名...',
      install_env: '正在自动下载安装 Playwright 与 Chromium 浏览器内核...',
      probe: '正在执行验证码探针诊断...'
    };
    badge.textContent = labelMap[mode] || '抓包/工具运行中...';
    badge.style.color = '#34D399';
  } else if (anyJobRunning) {
    badge.textContent = '多任务并发执行中';
    badge.style.color = '#34D399';
  } else {
    badge.textContent = '待命';
    badge.style.color = '#FBBF24';
  }
}

function updateAccountCounters(accs) {
  var total = accs.length;
  var readyCookie = accs.filter(function(a){ return a && a.cookie && a.cookie.indexOf('ct=') !== -1 && a.cookie.indexOf('ut=') !== -1; }).length;
  var hTotal = accs.filter(function(a){ return a && a.h && String(a.h).trim().length > 0; }).length;
  var pendingNew = Math.max(0, total - readyCookie);
  document.getElementById('accCount').textContent = total + ' 个';
  document.getElementById('readyCookieCount').textContent = readyCookie + ' 个';
  document.getElementById('pendingNewCount').textContent = pendingNew + ' 个';
  document.getElementById('hCount').textContent = hTotal + ' 个';
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderJobsTable(jobs) {
  var tbody = document.getElementById('multiTaskListBody');
  var list = jobs || [];
  var runningCnt = list.filter(function(j){ return j.status === 'running'; }).length;
  document.getElementById('activeJobsSummary').textContent = '运行中 ' + runningCnt + ' 个 · 共 ' + list.length + ' 个任务';
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#71717A; padding:18px;">暂无正在执行的任务，请在上方勾选『阅读 / 点赞 / 评论』后点击『🚀 启动已勾选多任务并加入进度列表』</td></tr>';
    return;
  }
  var modeLabel = { click: '阅读', like: '点赞', comment: '评论' };
  var statusLabel = { running: '执行中', paused: '已暂停', completed: '已完成', stopped: '已停止' };
  var statusColor = { running: '#34D399', paused: '#FBBF24', completed: '#60A5FA', stopped: '#A1A1AA' };
  var rowsHtml = list.map(function(j) {
    var modesStr = (j.modes || []).map(function(m){ return modeLabel[m] || m; }).join(' + ');
    var subParts = [];
    if ((j.modes || []).indexOf('click') !== -1) subParts.push('阅读 ' + j.clicks + '/' + j.target_clicks);
    if ((j.modes || []).indexOf('like') !== -1) subParts.push('点赞 ' + j.likes + '/' + j.target_likes);
    if ((j.modes || []).indexOf('comment') !== -1) subParts.push('评论 ' + j.comments + '/' + j.target_comments);
    var readSnap = '-';
    if (j.read_count_start !== null && j.read_count_start !== undefined) {
      var liveVal = (j.read_count_live !== null && j.read_count_live !== undefined) ? j.read_count_live : j.read_count_start;
      var diff = liveVal - j.read_count_start;
      var diffTxt = diff >= 0 ? ('+' + diff) : String(diff);
      readSnap = j.read_count_start + ' -> ' + liveVal + ' (' + diffTxt + ')';
    }
    var stTxt = statusLabel[j.status] || j.status;
    var stCol = statusColor[j.status] || '#E4E4E7';
    var btns = '<button class="mini-btn" onclick="selectJobLog(\\'' + j.id + '\\')">日志</button>';
    if (j.status === 'running') {
      btns += '<button class="mini-btn" style="color:#FCD34D;" onclick="controlJob(\\'' + j.id + '\\', \\'pause\\')">暂停</button>';
      btns += '<button class="mini-btn" style="color:#FCA5A5;" onclick="controlJob(\\'' + j.id + '\\', \\'stop\\')">停止</button>';
    } else if (j.status === 'paused') {
      btns += '<button class="mini-btn" style="color:#6EE7B7;" onclick="controlJob(\\'' + j.id + '\\', \\'resume\\')">继续</button>';
      btns += '<button class="mini-btn" style="color:#FCA5A5;" onclick="controlJob(\\'' + j.id + '\\', \\'stop\\')">停止</button>';
    }
    if (j.status !== 'running') {
      btns += '<button class="mini-btn" onclick="controlJob(\\'' + j.id + '\\', \\'remove\\')">移除</button>';
    }
    return '<tr>' +
      '<td style="font-family:monospace;"><strong>' + escapeHtml(j.id) + '</strong><div style="color:#A1A1AA;font-size:11px;">' + escapeHtml(j.url_id || j.url) + ' · ' + escapeHtml(j.created_at || '') + '</div></td>' +
      '<td style="color:#93C5FD;font-weight:600;white-space:nowrap;">' + escapeHtml(modesStr) + '</td>' +
      '<td style="font-family:monospace;white-space:nowrap;">' + escapeHtml(subParts.join(' · ')) + '</td>' +
      '<td style="font-family:monospace;color:#6EE7B7;white-space:nowrap;">' + escapeHtml(readSnap) + '</td>' +
      '<td style="min-width:130px;"><div style="display:flex;align-items:center;gap:8px;"><div class="prog-track"><div class="prog-fill" style="width:' + (j.percent || 0) + '%;"></div></div><span style="font-family:monospace;font-weight:700;">' + (j.percent || 0) + '%</span></div></td>' +
      '<td style="font-weight:700;white-space:nowrap;color:' + stCol + ';">' + escapeHtml(stTxt) + '</td>' +
      '<td style="white-space:nowrap;">' + btns + '</td>' +
    '</tr>';
  }).join('');
  tbody.innerHTML = rowsHtml;
}

function selectJobLog(jobId) {
  focusedJobId = jobId;
  document.getElementById('focusedJobHint').textContent = '当前锁定查看任务 ' + jobId + ' 日志';
  pollStatus();
}

async function controlJob(jobId, action) {
  if (action === 'resume') {
    await saveConfig('keep');
  }
  await fetch('/api/jobs/action', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId, action: action })
  });
  await pollStatus();
}

async function loadConfig() {
  var res = await fetch('/api/config');
  var cfg = await res.json();
  var accs = cfg.accounts || [];
  updateAccountCounters(accs);
  var task = cfg.task || {};
  var settings = cfg.settings || {};
  document.getElementById('urlInput').value = task.url || '';
  document.getElementById('proxyApiInput').value = settings.proxy_api_url || '';
  document.getElementById('proxyUserInput').value = settings.proxy_user || '';
  document.getElementById('proxyPassInput').value = settings.proxy_pass || '';
  document.getElementById('whitelistApiInput').value = settings.whitelist_api_url || '';
  document.getElementById('targetClicksInput').value = task.target_clicks !== undefined ? task.target_clicks : 100;
  document.getElementById('targetLikesInput').value = task.target_likes !== undefined ? task.target_likes : 20;
  document.getElementById('targetCommentsInput').value = task.target_comments !== undefined ? task.target_comments : 10;
  document.getElementById('commentIntervalMaxInput').value = task.comment_interval_max !== undefined ? task.comment_interval_max : 3;
  document.getElementById('commentIntervalUnitSelect').value = task.comment_interval_unit === 'seconds' ? 'seconds' : 'minutes';
  document.getElementById('readEngineSelect').value = settings.read_engine === 'http' ? 'http' : 'browser';
  document.getElementById('requireProxyReadChk').checked = settings.require_proxy_for_read !== false;
  document.getElementById('concInput').value = settings.max_concurrency || 3;
  document.getElementById('limitInput').value = settings.daily_comment_limit || 5;
  document.getElementById('commentsInput').value = (task.comments || []).join('\\n');
  pollStatus();
}

async function saveConfig(forcedMode) {
  var res = await fetch('/api/config');
  var cfg = await res.json();
  cfg.task = cfg.task || {};
  cfg.settings = cfg.settings || {};
  var nextUrl = document.getElementById('urlInput').value.trim();
  var m = nextUrl.match(/\\/news\\/(\\d+)/);
  var nextUrlId = m ? m[1] : '';
  if (nextUrlId && nextUrlId !== cfg.task.resolved_url_id) {
    cfg.task.resolved_url_id = nextUrlId;
    cfg.task.resolved_postid = '';
  }
  var parseNum = function(id, fallback) {
    var raw = document.getElementById(id).value.trim();
    if (raw === '') return fallback;
    var n = parseFloat(raw);
    return isNaN(n) || n <= 0 ? fallback : n;
  };
  var chosenMode = (forcedMode === 'click' || forcedMode === 'like' || forcedMode === 'comment')
    ? forcedMode
    : (cfg.task.solo_task_mode || 'comment');
  cfg.task.url = nextUrl;
  cfg.task.solo_task_mode = chosenMode;
  cfg.task.enable_click = Boolean(document.getElementById('chkModeClick').checked);
  cfg.task.enable_like = Boolean(document.getElementById('chkModeLike').checked);
  cfg.task.enable_comment = Boolean(document.getElementById('chkModeComment').checked);
  cfg.settings.proxy_api_url = document.getElementById('proxyApiInput').value.trim();
  cfg.settings.proxy_user = document.getElementById('proxyUserInput').value.trim();
  cfg.settings.proxy_pass = document.getElementById('proxyPassInput').value.trim();
  cfg.settings.whitelist_api_url = document.getElementById('whitelistApiInput').value.trim();
  cfg.settings.read_engine = document.getElementById('readEngineSelect').value === 'http' ? 'http' : 'browser';
  cfg.settings.require_proxy_for_read = Boolean(document.getElementById('requireProxyReadChk').checked);
  cfg.task.target_clicks = Math.round(parseNum('targetClicksInput', 100));
  cfg.task.target_likes = Math.round(parseNum('targetLikesInput', 20));
  cfg.task.target_comments = Math.round(parseNum('targetCommentsInput', 10));
  cfg.task.comment_interval_max = parseNum('commentIntervalMaxInput', 3);
  cfg.task.comment_interval_unit = document.getElementById('commentIntervalUnitSelect').value === 'seconds' ? 'seconds' : 'minutes';
  cfg.task.enable_spintax_dedup = false;
  cfg.settings.max_concurrency = Math.round(parseNum('concInput', 3));
  cfg.settings.daily_comment_limit = Math.round(parseNum('limitInput', 5));
  cfg.task.comments = document.getElementById('commentsInput').value.split(/\\r?\\n/).map(function(s){ return s.trim(); }).filter(Boolean);
  await fetch('/api/config', { method: 'POST', body: JSON.stringify(cfg) });
  if (!forcedMode) {
    document.getElementById('logBox').textContent = '✅ 已保存最新文章链接、阅读引擎模式、天启账密/API与评论随机间隔上限阈值至本地 config.json！';
  }
  return cfg;
}

async function loadPendingAccounts() {
  var box = document.getElementById('logBox');
  try {
    var res = await fetch('/api/pending_accounts');
    var data = await res.json();
    document.getElementById('newAccountsInput').value = (data.lines || []).join('\\n');
    box.textContent = data.msg || '已加载待抓新号列表';
  } catch (e) {
    box.textContent = '❌ 读取待抓新号异常: ' + e;
  }
}

async function handleBackupJsonFile(inputEl) {
  var file = inputEl.files && inputEl.files[0];
  if (!file) return;
  var box = document.getElementById('logBox');
  box.textContent = '📂 正在读取并无损合并您备份的 ' + file.name + '，请稍候...';
  try {
    var rawText = await file.text();
    var res = await fetch('/api/merge_config', {
      method: 'POST',
      body: JSON.stringify({ raw_json: rawText })
    });
    var data = await res.json();
    box.textContent = data.msg || JSON.stringify(data);
    if (data.ok) {
      await loadConfig();
    }
  } catch (e) {
    box.textContent = '❌ 导入备份 config.json 异常: ' + e;
  } finally {
    inputEl.value = '';
  }
}

async function importNewAccounts() {
  var raw = document.getElementById('newAccountsInput').value.trim();
  var box = document.getElementById('logBox');
  if (!raw) {
    box.textContent = '⚠️ 请先在『第一步』左下角粘贴要追加导入或修改密码的账号（每行一个，如 138xxxx----新密码）！';
    return;
  }
  await saveConfig('keep');
  try {
    var res = await fetch('/api/import_accounts', { method: 'POST', body: JSON.stringify({ raw_text: raw }) });
    var data = await res.json();
    box.textContent = data.msg || JSON.stringify(data);
    if (data.ok) {
      document.getElementById('newAccountsInput').value = '';
      await loadConfig();
    }
  } catch (e) {
    box.textContent = '❌ 导入账号异常: ' + e;
  }
}

async function testProxy() {
  await saveConfig('keep');
  var box = document.getElementById('logBox');
  box.textContent = '🔍 正在扫描本机多出口公网 IP 并测试天启 HTTPS CONNECT 隧道鉴权，请稍候...';
  try {
    var res = await fetch('/api/test_proxy', { method: 'POST' });
    var data = await res.json();
    box.textContent = data.msg || JSON.stringify(data);
  } catch (e) {
    box.textContent = '❌ 代理检测请求异常: ' + e;
  }
}

async function pollStatus() {
  try {
    var q = focusedJobId ? ('?job_id=' + encodeURIComponent(focusedJobId)) : '';
    var res = await fetch('/api/status' + q);
    var data = await res.json();
    var st = data.stats || {};
    document.getElementById('stClicks').textContent = st.clicks || 0;
    document.getElementById('stLikes').textContent = st.likes || 0;
    document.getElementById('stComments').textContent = st.comments || 0;
    document.getElementById('stCaptcha').textContent = st.captcha_tries || 0;
    renderJobsTable(data.jobs || []);
    if (data.logs && data.logs.length > 0) {
      var box = document.getElementById('logBox');
      box.textContent = data.logs.join('\\n');
      box.scrollTop = box.scrollHeight;
    }
    if (data.acc_count !== undefined) {
      document.getElementById('accCount').textContent = data.acc_count + ' 个';
      document.getElementById('readyCookieCount').textContent = (data.ready_cookie_count || 0) + ' 个';
      document.getElementById('pendingNewCount').textContent = Math.max(0, data.acc_count - (data.ready_cookie_count || 0)) + ' 个';
      document.getElementById('hCount').textContent = (data.h_count || 0) + ' 个';
    }
    var auxRunning = Boolean(data.aux_running);
    var anyJobRunning = Boolean(data.running);
    setButtonsRunning(auxRunning, anyJobRunning, data.mode || '');
    if ((anyJobRunning || auxRunning) && !pollTimer) {
      pollTimer = setInterval(pollStatus, 1200);
    } else if (!anyJobRunning && !auxRunning && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (e) {}
}

async function launchJobModes(modes) {
  var cfg = await saveConfig(modes[0] || 'click');
  var t = cfg.task || {};
  if (!t.url || t.url.indexOf('/news/') === -1) {
    document.getElementById('logBox').textContent = '⚠️ 请先在『第一步』填写包含 /news/数字编号 的东方财富财富号文章链接！';
    return;
  }
  try {
    var res = await fetch('/api/jobs/create', {
      method: 'POST',
      body: JSON.stringify({
        url: t.url,
        modes: modes,
        target_clicks: t.target_clicks,
        target_likes: t.target_likes,
        target_comments: t.target_comments,
        comment_interval_max: t.comment_interval_max,
        comment_interval_unit: t.comment_interval_unit,
        comments: t.comments,
        enable_spintax_dedup: t.enable_spintax_dedup
      })
    });
    var data = await res.json();
    if (!data.ok) {
      document.getElementById('logBox').textContent = '⚠️ ' + (data.error || '创建任务失败');
      return;
    }
    focusedJobId = data.job_id || '';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollStatus, 1200);
    await pollStatus();
  } catch (e) {
    document.getElementById('logBox').textContent = '❌ 创建任务异常: ' + e;
  }
}

async function runMultiTaskJob() {
  var modes = [];
  if (document.getElementById('chkModeClick').checked) modes.push('click');
  if (document.getElementById('chkModeLike').checked) modes.push('like');
  if (document.getElementById('chkModeComment').checked) modes.push('comment');
  if (modes.length === 0) {
    document.getElementById('logBox').textContent = '⚠️ 请在『第二步』至少勾选一项要执行的子任务（阅读 / 点赞 / 评论）！';
    return;
  }
  await launchJobModes(modes);
}

async function runSoloTask(mode) {
  await launchJobModes([mode]);
}

async function runAuxScript(scriptMode) {
  await saveConfig('keep');
  setButtonsRunning(true, false, scriptMode);
  document.getElementById('logBox').textContent = '🚀 正在启动内置抓包/环境自愈工具 (' + scriptMode + ')，实时日志将同步显示在下方...';
  try {
    var res = await fetch('/api/run', { method: 'POST', body: JSON.stringify({ mode: scriptMode }) });
    var data = await res.json();
    if (!data.ok) {
      document.getElementById('logBox').textContent = '⚠️ ' + (data.error || '启动失败');
      setButtonsRunning(false, false, '');
      return;
    }
    focusedJobId = '';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollStatus, 1200);
    await pollStatus();
  } catch (e) {
    document.getElementById('logBox').textContent = '❌ 请求异常: ' + e;
    setButtonsRunning(false, false, '');
  }
}

async function stopTask() {
  await fetch('/api/stop', { method: 'POST' });
  await pollStatus();
}

loadConfig();
</script>
</body>
</html>"""


def _compute_job_percent(job: dict) -> int:
    eng: Optional[MainEngine] = job.get("engine")
    st = eng.stats if eng is not None else job.get("stats", {})
    modes = job.get("modes") or ["click"]
    done_u = 0
    total_u = 0
    if "click" in modes:
        t = max(1, int(job.get("target_clicks") or 1))
        total_u += t
        done_u += min(t, int(st.get("clicks") or 0))
    if "like" in modes:
        t = max(1, int(job.get("target_likes") or 1))
        total_u += t
        done_u += min(t, int(st.get("likes") or 0))
    if "comment" in modes:
        t = max(1, int(job.get("target_comments") or 1))
        total_u += t
        done_u += min(t, int(st.get("comments") or 0))
    if total_u <= 0:
        return 0
    if job.get("status") == "completed" or done_u >= total_u:
        return 100
    return min(99, int(round((done_u / total_u) * 100)))


def _serialize_job(job: dict) -> dict:
    eng: Optional[MainEngine] = job.get("engine")
    st = eng.stats if eng is not None else job.get("stats", {})
    return {
        "id": job["id"],
        "url": job["url"],
        "url_id": job.get("url_id", ""),
        "modes": job["modes"],
        "status": job["status"],
        "created_at": job["created_at"],
        "clicks": int(st.get("clicks") or 0),
        "target_clicks": int(job.get("target_clicks") or 100),
        "likes": int(st.get("likes") or 0),
        "target_likes": int(job.get("target_likes") or 20),
        "comments": int(st.get("comments") or 0),
        "target_comments": int(job.get("target_comments") or 10),
        "read_count_start": st.get("read_count_start"),
        "read_count_live": st.get("read_count_live"),
        "percent": _compute_job_percent(job),
    }


async def _run_job_entry(job_id: str) -> None:
    global LAST_STATS, LAST_LOGS
    job = MULTI_JOBS.get(job_id)
    if not job:
        return
    eng: MainEngine = job["engine"]
    try:
        await eng.run(modes=job["modes"])
        if eng.stop_requested:
            job["status"] = "stopped"
        else:
            job["status"] = "completed"
    except Exception as exc:
        eng._log(f"❌ 任务 {job_id} 未捕获异常: {exc}")
        job["status"] = "stopped"
    finally:
        job["stats"] = dict(eng.stats)
        job["logs"] = list(eng.live_logs)
        LAST_STATS = dict(eng.stats)
        LAST_LOGS = list(eng.live_logs)


def _spawn_multi_job(task_payload: dict, modes: List[str]) -> dict:
    global JOB_SEQ, ACTIVE_ENGINE
    JOB_SEQ += 1
    job_id = f"T{JOB_SEQ}"
    url_str = str(task_payload.get("url") or "").strip()
    m = re.search(r"/news/(\\d+)", url_str)
    url_id = m.group(1) if m else str(task_payload.get("resolved_url_id") or "")
    clean_modes = [x for x in ("click", "like", "comment") if x in modes] or ["click"]
    override_cfg = {
        "url": url_str,
        "resolved_url_id": url_id,
        "resolved_postid": str(task_payload.get("resolved_postid") or "") if url_id else "",
        "enable_click": "click" in clean_modes,
        "enable_like": "like" in clean_modes,
        "enable_comment": "comment" in clean_modes,
        "target_clicks": max(1, int(task_payload.get("target_clicks") or 100)),
        "target_likes": max(1, int(task_payload.get("target_likes") or 20)),
        "target_comments": max(1, int(task_payload.get("target_comments") or 10)),
        "comment_interval_max": float(task_payload.get("comment_interval_max") or 3),
        "comment_interval_unit": str(task_payload.get("comment_interval_unit") or "minutes"),
        "comments": list(task_payload.get("comments") or DEFAULT_COMMENTS),
        "enable_spintax_dedup": bool(task_payload.get("enable_spintax_dedup", False)),
    }
    engine = MainEngine(CONFIG_FILE, task_override=override_cfg)
    ACTIVE_ENGINE = engine
    job = {
        "id": job_id,
        "url": url_str,
        "url_id": url_id,
        "modes": clean_modes,
        "target_clicks": override_cfg["target_clicks"],
        "target_likes": override_cfg["target_likes"],
        "target_comments": override_cfg["target_comments"],
        "status": "running",
        "created_at": time.strftime("%H:%M:%S"),
        "engine": engine,
        "stats": dict(engine.stats),
        "logs": [],
        "task": None,
    }
    MULTI_JOBS[job_id] = job
    JOB_ORDER.insert(0, job_id)
    job["task"] = asyncio.create_task(_run_job_entry(job_id))
    return job


async def _run_subproc_in_bg(cmd_args: list, label: str) -> None:
    global ACTIVE_PROC, LAST_LOGS
    LAST_LOGS = [f"=== 正在客户端内直接运行 {label} ({' '.join(cmd_args)}) ==="]
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        ACTIVE_PROC = proc
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                print(decoded)
                LAST_LOGS.append(decoded)
                if len(LAST_LOGS) > 250:
                    LAST_LOGS = LAST_LOGS[-250:]
        await proc.wait()
        LAST_LOGS.append(f"=== {label} 执行完毕 (退出码: {proc.returncode}) ===")
    except Exception as exc:
        LAST_LOGS.append(f"❌ {label} 运行异常: {exc}")
    finally:
        ACTIVE_PROC = None


async def handle_index(request):
    return web.Response(text=HTML_PAGE, content_type="text/html")


async def handle_get_config(request):
    return web.json_response(repair_and_load_config(CONFIG_FILE))


async def handle_save_config(request):
    data = await request.json()
    from auto_login_agent import atomic_save_config
    atomic_save_config(data, CONFIG_FILE)
    for jid in list(JOB_ORDER):
        j = MULTI_JOBS.get(jid)
        eng = j.get("engine") if j else None
        if eng is not None and getattr(eng, "proxy_pool", None) is not None:
            eng.proxy_pool._reload_proxy_settings_from_disk()
            eng._flush_proxy_notes()
    return web.json_response({"ok": True})


async def handle_pending_accounts(request):
    """提取全部尚未抓到 ct/ut Cookie 的待抓新号（格式：手机号----密码），方便用户直接在输入框核对修改输错的密码"""
    from auto_login_agent import load_spreadsheet_rows, CSV_FILE
    cfg = repair_and_load_config(CONFIG_FILE)
    accs = cfg.get("accounts") or []
    csv_pwd_map = {r["username"]: r["password"] for r in load_spreadsheet_rows(CSV_FILE)}
    lines = []
    for a in accs:
        if not isinstance(a, dict):
            continue
        u = str(a.get("username") or "").strip()
        ck = str(a.get("cookie") or "")
        if u and not ("ct=" in ck and "ut=" in ck):
            pwd = str(a.get("password") or csv_pwd_map.get(u) or "")
            lines.append(f"{u}----{pwd}")
    return web.json_response({
        "ok": True,
        "lines": lines,
        "msg": (
            f"📝 已为您提取当前全部 {len(lines)} 个『尚未抓取 Cookie 的待抓新号』到左侧输入框！\\n"
            f"👉 您可直接用 Ctrl+F 查找并修改其中输错的密码，改完点『📥 1. 追加 / 更新账号密码』即可无损保存！"
        ),
    })


async def handle_merge_config(request):
    """一键导入电脑还原前备份的旧版/新版 config.json：无损合并老账号的 Cookie(ct/ut)、独立 h 与天启 API 链接"""
    from auto_login_agent import atomic_save_config, clean_raw_cookie_text, CSV_FILE
    body = await request.json()
    raw_json = str(body.get("raw_json") or "").strip()
    if not raw_json:
        return web.json_response({"ok": False, "msg": "⚠️ 选择的备份文件内容为空！"})

    tmp_backup_path = "_uploaded_backup_config.tmp.json"
    with open(tmp_backup_path, "w", encoding="utf-8") as tf:
        tf.write(raw_json)
    try:
        imported_cfg = repair_and_load_config(tmp_backup_path)
    finally:
        if os.path.exists(tmp_backup_path):
            try:
                os.remove(tmp_backup_path)
            except Exception:
                pass

    imported_accs = imported_cfg.get("accounts") or []
    if not imported_accs:
        return web.json_response({"ok": False, "msg": "⚠️ 未在该 JSON 文件中识别到 accounts 账号列表，请确认选择的是备份的 config.json！"})

    cfg = repair_and_load_config(CONFIG_FILE)
    existing_accs = cfg.get("accounts") or []
    merged_map = {}
    ordered_usernames = []

    for a in existing_accs:
        if isinstance(a, dict) and a.get("username"):
            u = str(a["username"]).strip()
            merged_map[u] = dict(a)
            if u not in ordered_usernames:
                ordered_usernames.append(u)

    restored_cookie_count = 0
    restored_h_count = 0
    for a in imported_accs:
        if not isinstance(a, dict) or not a.get("username"):
            continue
        u = str(a["username"]).strip()
        imp_ck = clean_raw_cookie_text(str(a.get("cookie") or ""))
        imp_h = str(a.get("h") or "").strip()
        imp_pwd = str(a.get("password") or "")
        if u not in merged_map:
            ordered_usernames.append(u)
            merged_map[u] = {
                "username": u,
                "password": imp_pwd,
                "cookie": imp_ck,
                "deviceid": str(a.get("deviceid") or "12dkmnjhbgtyhjko"),
                "like_deviceid": str(a.get("like_deviceid") or "35dkmnjhbgtyhjko"),
                "h": imp_h,
                "proxy_ip": str(a.get("proxy_ip") or "127.0.0.1"),
                "proxy_port": int(a.get("proxy_port") or 1080),
                "proxy_city": str(a.get("proxy_city") or "天启3分钟高匿"),
                "enabled": bool(a.get("enabled", True) and "ct=" in imp_ck and "ut=" in imp_ck),
            }
        else:
            cur = merged_map[u]
            if imp_pwd and not cur.get("password"):
                cur["password"] = imp_pwd
            if "ct=" in imp_ck and "ut=" in imp_ck:
                cur["cookie"] = imp_ck
                cur["enabled"] = True
            if imp_h:
                cur["h"] = imp_h

    merged_list = [merged_map[u] for u in ordered_usernames]
    for acc in merged_list:
        ck = str(acc.get("cookie") or "")
        if "ct=" in ck and "ut=" in ck:
            restored_cookie_count += 1
            acc["enabled"] = True
        if str(acc.get("h") or "").strip():
            restored_h_count += 1

    cfg["accounts"] = merged_list
    imp_settings = imported_cfg.get("settings") or {}
    for k_set in ("proxy_api_url", "whitelist_api_url", "proxy_user", "proxy_pass"):
        if imp_settings.get(k_set):
            cfg.setdefault("settings", {})[k_set] = imp_settings[k_set]
    imp_task = imported_cfg.get("task") or {}
    if imp_task.get("url"):
        cfg.setdefault("task", {})["url"] = imp_task["url"]
    if imp_task.get("comments"):
        cfg.setdefault("task", {})["comments"] = imp_task["comments"]

    atomic_save_config(cfg, CONFIG_FILE)

    csv_lines = ["东财账号(手机号/用户名),登录密码,代理IP(选填),代理端口(选填),代理城市(选填)"]
    for a in merged_list:
        csv_lines.append(
            f"{a.get('username','')},{a.get('password','')},{a.get('proxy_ip','127.0.0.1')},{a.get('proxy_port',1080)},{a.get('proxy_city','天启3分钟高匿')}"
        )
    with open(CSV_FILE, "w", encoding="utf-8") as cf:
        cf.write("\\n".join(csv_lines) + "\\n")

    return web.json_response({
        "ok": True,
        "msg": (
            f"🎉 备份 config.json 无损恢复成功！\\n"
            f"  - 当前总账号池：{len(merged_list)} 个\\n"
            f"  - 已恢复有效 Cookie(ct/ut) 老号：{restored_cookie_count} 个（无需重新登录，直接可用！）\\n"
            f"  - 已恢复独立点赞 h 签名：{restored_h_count} 个\\n"
            f"  - 天启代理配置与预设评论语录已同步恢复并自动备份至 config.backup.json！"
        ),
    })


async def handle_import_accounts(request):
    from auto_login_agent import parse_account_line, atomic_save_config, CSV_FILE
    body = await request.json()
    raw_text = str(body.get("raw_text") or "").strip()
    if not raw_text:
        return web.json_response({"ok": False, "msg": "⚠️ 未检测到有效的账号密码文本！"})

    parsed_rows = []
    for line in raw_text.splitlines():
        item = parse_account_line(line)
        if item:
            parsed_rows.append(item)

    if not parsed_rows:
        return web.json_response({"ok": False, "msg": "⚠️ 格式解析失败：请按每行一个『手机号----密码』或『手机号/密码』或『手机号,密码』粘贴！"})

    cfg = repair_and_load_config(CONFIG_FILE)
    existing_accs = cfg.get("accounts") or []
    existing_map = {}
    ordered_usernames = []
    for a in existing_accs:
        if isinstance(a, dict) and a.get("username"):
            u = str(a["username"]).strip()
            existing_map[u] = dict(a)
            if u not in ordered_usernames:
                ordered_usernames.append(u)

    added_count = 0
    updated_pwd_count = 0
    for r in parsed_rows:
        u = r["username"]
        if u in existing_map:
            existing_map[u]["password"] = r["password"]
            updated_pwd_count += 1
        else:
            ordered_usernames.append(u)
            existing_map[u] = {
                "username": u,
                "password": r["password"],
                "cookie": "",
                "deviceid": "12dkmnjhbgtyhjko",
                "like_deviceid": "35dkmnjhbgtyhjko",
                "h": "",
                "proxy_ip": r["proxy_ip"],
                "proxy_port": r["proxy_port"],
                "proxy_city": r["proxy_city"],
                "enabled": False,
            }
            added_count += 1

    merged_list = [existing_map[u] for u in ordered_usernames]
    cfg["accounts"] = merged_list
    atomic_save_config(cfg, CONFIG_FILE)

    csv_lines = ["东财账号(手机号/用户名),登录密码,代理IP(选填),代理端口(选填),代理城市(选填)"]
    for a in merged_list:
        csv_lines.append(
            f"{a.get('username','')},{a.get('password','')},{a.get('proxy_ip','127.0.0.1')},{a.get('proxy_port',1080)},{a.get('proxy_city','天启3分钟高匿')}"
        )
    with open(CSV_FILE, "w", encoding="utf-8") as cf:
        cf.write("\\n".join(csv_lines) + "\\n")

    ready_cookies = sum(1 for a in merged_list if "ct=" in str(a.get("cookie") or "") and "ut=" in str(a.get("cookie") or ""))
    pending_new = len(merged_list) - ready_cookies
    return web.json_response({
        "ok": True,
        "msg": (
            f"✅ 账号导入/密码更新成功！\\n"
            f"  - 新增未登录账号：{added_count} 个 | 更新修正密码：{updated_pwd_count} 个\\n"
            f"  - 原有已就绪老账号 100% 完整保留：{ready_cookies} 个（且自动备份至 config.backup.json）\\n"
            f"  - 当前总账号池：{len(merged_list)} 个（待抓新号：{pending_new} 个）\\n"
            f"👉 接下来请直接点击绿色按钮『🚀 2. 单窗免407极速抓新号 (强烈推荐)』，零报错、登录即秒存 Cookie！"
        ),
    })


async def handle_test_proxy(request):
    cfg = repair_and_load_config(CONFIG_FILE)
    api_url = str((cfg.get("settings") or {}).get("proxy_api_url") or "").strip()
    if not api_url:
        return web.json_response({"ok": False, "msg": "⚠️ 请先在『第一步』右侧输入框粘贴天启代理 API 提取链接！"})
    pool = ProxyPool(config_path=CONFIG_FILE, api_url=api_url, auto_load=False)
    res = await pool.refresh_from_api()
    all_ips = res.get("public_ips") or []
    cgnat_warn = (
        f"\\n⚠️ [关键发现] 您的宽带/移动网络存在 {len(all_ips)} 个动态出口 IP ({' , '.join(all_ips)})！这就是之前双窗口一半报 ERR_INVALID_AUTH_CREDENTIALS 的真凶！"
        if len(all_ips) > 1
        else ""
    )
    ip_line = f"🌐 本机出口公网 IP：{res.get('public_ip') or '未获取到'}{cgnat_warn}"
    alive = res.get("alive_nodes") or []
    auth_407 = res.get("auth_407_nodes") or []
    dead = res.get("dead_nodes") or []
    if alive:
        lines = [
            f"  - ✅ {n['ip']}:{n['port']} · {n.get('city', '天启节点')} · HTTPS隧道握手 {n.get('latency_ms', 0)}ms"
            for n in alive[:8]
        ]
        if auth_407:
            lines.append(f"  - ⚠️ 拦截 {len(auth_407)} 个返回 407 鉴权拒绝节点（建议填上『天启账密认证』彻底消除 407）")
        if dead:
            lines.append(f"  - ⚠️ 已自动剔除 {len(dead)} 个超时死节点，仅保留鲜活节点")
        return web.json_response({
            "ok": True,
            "msg": (
                f"{ip_line}\\n"
                f"✅ 天启代理 HTTPS 隧道实测通过！可用节点 {len(alive)} 个（已缓存至内存池，110秒内启动任务零配额损耗）：\\n"
                + "\\n".join(lines)
            ),
        })
    return web.json_response({
        "ok": False,
        "msg": (
            f"{ip_line}\\n"
            f"⚠️ 代理隧道测试未通过：{res.get('error') or '未能提取到可用节点'}"
        ),
    })


async def handle_jobs_create(request):
    body = await request.json()
    cfg = repair_and_load_config(CONFIG_FILE)
    base_task = dict(cfg.get("task") or {})
    for k in (
        "url",
        "target_clicks",
        "target_likes",
        "target_comments",
        "comment_interval_max",
        "comment_interval_unit",
        "comments",
        "enable_spintax_dedup",
    ):
        if k in body and body[k] is not None:
            base_task[k] = body[k]
    raw_modes = body.get("modes") or ["click"]
    modes = [str(x).strip().lower() for x in raw_modes if str(x).strip().lower() in ("click", "like", "comment")]
    if not modes:
        return web.json_response({"ok": False, "error": "请至少勾选一项要执行的任务"})
    if not str(base_task.get("url") or "").strip():
        return web.json_response({"ok": False, "error": "请先输入目标财富号文章链接"})
    job = _spawn_multi_job(base_task, modes)
    return web.json_response({"ok": True, "job_id": job["id"], "job": _serialize_job(job)})


async def handle_jobs_action(request):
    body = await request.json()
    job_id = str(body.get("job_id") or "").strip()
    action = str(body.get("action") or "").strip().lower()

    if action == "stop_all":
        for jid in list(JOB_ORDER):
            j = MULTI_JOBS.get(jid)
            if j and j.get("engine") is not None and j.get("status") in ("running", "paused"):
                j["engine"].paused = False
                j["engine"].stop_requested = True
                j["engine"]._log("⏹️ 已收到全部停止指令，正在安全停止...")
                j["status"] = "stopped"
        return web.json_response({"ok": True})

    if action == "clear_completed":
        to_remove = [
            jid for jid in JOB_ORDER
            if MULTI_JOBS.get(jid, {}).get("status") in ("completed", "stopped")
        ]
        for jid in to_remove:
            JOB_ORDER.remove(jid)
            MULTI_JOBS.pop(jid, None)
        return web.json_response({"ok": True, "removed": len(to_remove)})

    job = MULTI_JOBS.get(job_id)
    if not job:
        return web.json_response({"ok": False, "error": "未找到该任务"})
    eng: Optional[MainEngine] = job.get("engine")
    if action == "pause" and job["status"] == "running" and eng is not None:
        eng.paused = True
        job["status"] = "paused"
        eng._log(f"⏸️ 任务 {job_id} 已暂停，点击『继续』可无缝恢复")
    elif action == "resume" and job["status"] == "paused" and eng is not None:
        if getattr(eng, "proxy_pool", None) is not None:
            eng.proxy_pool._reload_proxy_settings_from_disk()
            eng._flush_proxy_notes()
        eng.paused = False
        job["status"] = "running"
        eng._log(f"▶️ 任务 {job_id} 已恢复继续执行")
    elif action == "stop" and eng is not None:
        eng.paused = False
        eng.stop_requested = True
        job["status"] = "stopped"
        eng._log(f"⏹️ 任务 {job_id} 正在安全停止...")
    elif action == "remove":
        if eng is not None:
            eng.paused = False
            eng.stop_requested = True
        if job_id in JOB_ORDER:
            JOB_ORDER.remove(job_id)
        MULTI_JOBS.pop(job_id, None)
    return web.json_response({"ok": True})


async def handle_run(request):
    global ACTIVE_ENGINE, ACTIVE_TASK, LAST_MODE
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    mode = str(body.get("mode") or "comment").strip().lower()
    cfg = repair_and_load_config(CONFIG_FILE)
    if mode in ("install_env", "harvest_direct", "harvest_new", "harvest_h", "harvest", "probe"):
        if ACTIVE_TASK is not None and not ACTIVE_TASK.done():
            return web.json_response({"ok": False, "error": "当前已有抓包或环境工具正在运行，请等待或点击右上角停止"})
        ACTIVE_ENGINE = None
        LAST_MODE = mode
        cmd_map = {
            "install_env": (["auto_login_agent.py", "--install-only"], "一键安装/修复抓包浏览器内核"),
            "harvest_direct": (["auto_login_agent.py", "--only-new", "--direct", "--batch-size", "1"], "单窗免407极速抓新号 (本机直连 · 登录秒存Cookie)"),
            "harvest_new": (["auto_login_agent.py", "--only-new", "--batch-size", "1"], "挂代理单窗稳抓新号 (含407自动保底)"),
            "harvest_h": (["auto_login_agent.py", "--only-missing-h", "--direct", "--batch-size", "1"], "老号免密极速补抓独立 h"),
            "harvest": (["auto_login_agent.py", "--direct", "--batch-size", "1"], "全量账号免407抓包续传"),
            "probe": (["captcha_probe.py"], "验证码探针诊断 (2号程序)"),
        }
        cmd_args, label = cmd_map[mode]
        ACTIVE_TASK = asyncio.create_task(_run_subproc_in_bg(cmd_args, label))
        return web.json_response({"ok": True, "mode": mode})

    raw_modes = [m.strip().lower() for m in mode.split(",") if m.strip().lower() in ("click", "like", "comment")]
    if not raw_modes:
        raw_modes = ["comment"]
    job = _spawn_multi_job(cfg.get("task") or {}, raw_modes)
    LAST_MODE = "+".join(raw_modes)
    return web.json_response({"ok": True, "mode": LAST_MODE, "job_id": job["id"]})


async def handle_status(request):
    aux_running = bool(ACTIVE_TASK is not None and not ACTIVE_TASK.done())
    jobs_serialized = [_serialize_job(MULTI_JOBS[jid]) for jid in JOB_ORDER if jid in MULTI_JOBS]
    any_job_running = any(j["status"] in ("running", "paused") for j in jobs_serialized)

    agg_stats = {"clicks": 0, "likes": 0, "comments": 0, "captcha_tries": 0, "failed_accounts": 0}
    for jid in JOB_ORDER:
        j = MULTI_JOBS.get(jid)
        if not j:
            continue
        eng = j.get("engine")
        st = eng.stats if eng is not None else j.get("stats", {})
        for k in agg_stats:
            agg_stats[k] += int(st.get(k) or 0)

    focus_id = str(request.query.get("job_id") or "").strip()
    logs = list(LAST_LOGS)
    if aux_running:
        logs = list(LAST_LOGS)
    elif focus_id and focus_id in MULTI_JOBS:
        j = MULTI_JOBS[focus_id]
        eng = j.get("engine")
        logs = list(eng.live_logs) if eng is not None else list(j.get("logs") or [])
    elif JOB_ORDER:
        latest_j = MULTI_JOBS.get(JOB_ORDER[0])
        if latest_j:
            eng = latest_j.get("engine")
            logs = list(eng.live_logs) if eng is not None else list(latest_j.get("logs") or [])

    cfg = repair_and_load_config(CONFIG_FILE)
    accs = cfg.get("accounts") or []
    ready_cookie_count = sum(
        1 for a in accs if isinstance(a, dict) and "ct=" in str(a.get("cookie") or "") and "ut=" in str(a.get("cookie") or "")
    )
    h_count = sum(1 for a in accs if isinstance(a, dict) and str(a.get("h") or "").strip())
    return web.json_response({
        "running": aux_running or any_job_running,
        "aux_running": aux_running,
        "mode": LAST_MODE,
        "stats": agg_stats if JOB_ORDER else LAST_STATS,
        "logs": logs,
        "jobs": jobs_serialized,
        "acc_count": len(accs),
        "ready_cookie_count": ready_cookie_count,
        "h_count": h_count,
    })


async def handle_stop(request):
    for jid in list(JOB_ORDER):
        j = MULTI_JOBS.get(jid)
        if j and j.get("engine") is not None and j.get("status") in ("running", "paused"):
            j["engine"].paused = False
            j["engine"].stop_requested = True
            j["engine"]._log("⏹️ 正在响应停止请求，将在当前步骤结束时安全停止...")
            j["status"] = "stopped"
    if ACTIVE_PROC is not None and ACTIVE_PROC.returncode is None:
        try:
            ACTIVE_PROC.terminate()
            LAST_LOGS.append("⏹️ 已终止当前子程序进程。")
        except Exception:
            pass
    return web.json_response({"ok": True})


def open_client_window(url: str) -> None:
    """优先使用 Edge / Chrome 独立桌面客户端窗口模式 (--app) 启动，体验如同原生桌面软件"""
    try:
        if sys.platform.startswith("win"):
            candidates = [
                os.path.expandvars(r"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"),
                os.path.expandvars(r"%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"),
                os.path.expandvars(r"%LocalAppData%\\Microsoft\\Edge\\Application\\msedge.exe"),
                os.path.expandvars(r"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"),
                os.path.expandvars(r"%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"),
            ]
            for exe in candidates:
                if exe and os.path.exists(exe):
                    try:
                        subprocess.Popen([exe, f"--app={url}", "--window-size=1240,940"])
                        return
                    except Exception:
                        pass
        webbrowser.open(url)
    except Exception:
        pass


def main():
    from main_engine import disable_windows_quickedit
    disable_windows_quickedit()
    repair_and_load_config(CONFIG_FILE)
    app = web.Application(client_max_size=20 * 1024 * 1024)
    app.router.add_get("/", handle_index)
    app.router.add_get("/api/config", handle_get_config)
    app.router.add_post("/api/config", handle_save_config)
    app.router.add_get("/api/pending_accounts", handle_pending_accounts)
    app.router.add_post("/api/merge_config", handle_merge_config)
    app.router.add_post("/api/import_accounts", handle_import_accounts)
    app.router.add_post("/api/test_proxy", handle_test_proxy)
    app.router.add_post("/api/jobs/create", handle_jobs_create)
    app.router.add_post("/api/jobs/action", handle_jobs_action)
    app.router.add_post("/api/run", handle_run)
    app.router.add_get("/api/status", handle_status)
    app.router.add_post("/api/stop", handle_stop)
    url = f"http://127.0.0.1:{PORT}"
    print(f"====================================================")
    print(f"  东财智运 v6.0 多任务并发桌面客户端已启动: {url}")
    print(f"====================================================")
    open_client_window(url)
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
`;

  const guiLauncherBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 东财智运 · 四合一极简桌面客户端 v6.0 (含还原电脑一键重装Python与依赖)
set PY_CMD=
py -3 -c "import sys" >nul 2>nul && set PY_CMD=py -3
if "%PY_CMD%"=="" (python -c "import sys" >nul 2>nul && set PY_CMD=python)
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python312\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python312\\python.exe")
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python311\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python311\\python.exe")
if "%PY_CMD%"=="" (if exist "%LocalAppData%\\Programs\\Python\\Python313\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python313\\python.exe")
if "%PY_CMD%"=="" (if exist "C:\\Python312\\python.exe" set PY_CMD="C:\\Python312\\python.exe")
if "%PY_CMD%"=="" (
  echo ====================================================
  echo   [环境自愈] 检测到系统还原后尚未安装 Python
  echo   正在自动为您下载并静默安装 Python 3.12.8 64位...
  echo ====================================================
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/python/3.12.8/python-3.12.8-amd64.exe' -OutFile 'python_setup.exe'"
  if not exist "python_setup.exe" (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' -OutFile 'python_setup.exe'"
  )
  if exist "python_setup.exe" (
    echo [环境自愈] 正在静默安装 Python 3.12 并自动配置环境变量（约需 30~60 秒，请勿关闭窗口）...
    start /wait "" "python_setup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    del /f /q "python_setup.exe" >nul 2>nul
    if exist "%LocalAppData%\\Programs\\Python\\Python312\\python.exe" set PY_CMD="%LocalAppData%\\Programs\\Python\\Python312\\python.exe"
  )
)
if "%PY_CMD%"=="" (
  echo [错误] 未检测到可用的 Python 环境，请先安装 Python 3.10~3.14 并勾选 Add python.exe to PATH！
  pause
  exit /b 1
)
echo ====================================================
echo   东财智运 · 正在启动四合一极简桌面客户端 v6.0
echo   (已集成：阅读 / 点赞 / 随机间隔评论 / 备份恢复 / 抓包 / 探针)
echo ====================================================
echo [Python 环境路径]
%PY_CMD% -c "import sys; print(sys.executable, sys.version.split()[0])"
echo.
echo [1] 正在检查并自动补齐运行依赖库 (aiohttp / greenlet / playwright / pillow)...
%PY_CMD% -c "import aiohttp, greenlet, playwright" >nul 2>nul
if errorlevel 1 (
  echo     正在通过国内清华镜像源秒装全部依赖...
  %PY_CMD% -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>nul
  %PY_CMD% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
  if errorlevel 1 %PY_CMD% -m pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple
  if errorlevel 1 %PY_CMD% -m pip install -r requirements.txt
)
echo.
echo [2] 正在为您自动弹出独立桌面客户端窗口 (http://127.0.0.1:8686)...
%PY_CMD% gui_app.py
pause >nul
`;

  const toBatCrlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

  return {
    '00_双击我_表格账号全自动登录提取凭证.bat': toBatCrlf(autoHarvestBat),
    '0_双击我_启动可视化图形界面(推荐).bat': toBatCrlf(guiLauncherBat),
    '1_双击我_一键启动运营任务.bat': toBatCrlf(launcherBat),
    '2_双击我_启动验证码探针.bat': toBatCrlf(probeBat),
    '账号密码批量导入表_accounts.csv': accountsCsvContent,
    'auto_login_agent.py': autoLoginAgentPy,
    'gui_app.py': guiAppPy,
    'config.json': configJson,
    'main_engine.py': mainEnginePy,
    'eastmoney_api.py': eastmoneyApiPy,
    'account_pool.py': accountPoolPy,
    'proxy_pool.py': proxyPoolPy,
    'captcha_solver.py': captchaSolverPy,
    'captcha_probe.py': captchaProbePy,
    'requirements.txt': requirementsTxt,
    '电脑本地测试使用说明书(必看).md': handoverDocMd,
    'AI技术对接研发文档.md': aiHandoverDocMd,
  };
}

/**
 * Pure TypeScript ZIP archive generator (STORE method) so users can download all 11 files
 * in a single ready-to-unzip archive (`eastmoney_bot_v6.0_完整运行包.zip`) with one click.
 */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZipArchive(
  files: Record<string, string>,
  rootFolder: string = 'eastmoney_bot_v6.0'
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => {
    const fullPath = rootFolder ? `${rootFolder}/${name}` : name;
    const nameBytes = encoder.encode(fullPath);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localHeadersSize = 0;
  let centralDirSize = 0;
  for (const entry of entries) {
    localHeadersSize += 30 + entry.nameBytes.length + entry.dataBytes.length;
    centralDirSize += 46 + entry.nameBytes.length;
  }

  const totalSize = localHeadersSize + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets: number[] = [];

  // Write Local File Headers + File Data
  for (const entry of entries) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 flag
    view.setUint16(offset + 8, 0, true); // Compression: STORE (0)
    view.setUint16(offset + 10, 0, true); // Mod time
    view.setUint16(offset + 12, 0, true); // Mod date
    view.setUint32(offset + 14, entry.crc, true); // CRC-32
    view.setUint32(offset + 18, entry.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, entry.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, entry.nameBytes.length, true); // File name length
    view.setUint16(offset + 28, 0, true); // Extra field length
    out.set(entry.nameBytes, offset + 30);
    out.set(entry.dataBytes, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.dataBytes.length;
  }

  const centralDirOffset = offset;

  // Write Central Directory Headers
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    view.setUint32(offset, 0x02014b50, true); // Central file header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(offset + 10, 0, true); // Compression: STORE
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.dataBytes.length, true);
    view.setUint32(offset + 24, entry.dataBytes.length, true);
    view.setUint16(offset + 28, entry.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // Extra length
    view.setUint16(offset + 32, 0, true); // Comment length
    view.setUint16(offset + 34, 0, true); // Disk number
    view.setUint16(offset + 36, 0, true); // Internal attrs
    view.setUint32(offset + 38, 0, true); // External attrs
    view.setUint32(offset + 42, localOffsets[i], true); // Relative offset of local header
    out.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  }

  // Write End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirOffset, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}

/**
 * Generates an upgrade-only ZIP patch containing ONLY the updated .py/.bat/requirements files,
 * strictly excluding `config.json` and `账号密码批量导入表_accounts.csv` so users can extract directly
 * into their existing `eastmoney_bot_v6.0` folder without overwriting any harvested cookies/accounts!
 */
export function buildUpgradePatchZip(
  files: Record<string, string>,
  rootFolder: string = ''
): Uint8Array<ArrayBuffer> {
  const safeFiles: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    if (k === 'config.json' || k === '账号密码批量导入表_accounts.csv') {
      continue;
    }
    safeFiles[k] = v;
  }
  return buildZipArchive(safeFiles, rootFolder);
}


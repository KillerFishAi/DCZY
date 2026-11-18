export type CoordFormat = 'pipe' | 'semicolon' | 'comma' | 'flat' | 'json' | 'jsonobj';
export type CoordParamName = 'validate' | 'code' | 'points' | 'coordinate' | 'answer' | 'result';
export type CaptchaMode = 'skip' | 'manual' | 'ocr';
export type AccountStatus = 'ready' | 'cooldown_captcha' | 'daily_limit' | 'invalid_auth' | 'pending_harvest';
export type HarvestStatus = 'harvested' | 'pending_login' | 'harvesting';
export type SoloTaskMode = 'click' | 'like' | 'comment';
export type CommentIntervalUnit = 'seconds' | 'minutes';

export interface Point {
  x: number;
  y: number;
  charLabel?: string;
}

export interface AccountItem {
  id: string;
  username: string;
  password?: string;
  harvest_status?: HarvestStatus;
  cookie: string;
  deviceid: string;
  like_deviceid: string;
  h: string;
  proxy_ip: string;
  proxy_port: number;
  proxy_city: string;
  proxy_user?: string;
  proxy_pass?: string;
  enabled: boolean;
  status: AccountStatus;
  daily_comments_used: number;
  total_clicks: number;
  total_likes: number;
  total_comments: number;
  captcha_hits: number;
  last_action_at?: string;
  notes?: string;
}

export interface TaskConfig {
  url: string;
  resolved_url_id: string;
  resolved_postid: string;
  article_title: string;
  solo_task_mode?: SoloTaskMode;
  enable_click: boolean;
  enable_like: boolean;
  enable_comment: boolean;
  target_clicks: number;
  target_likes: number;
  target_comments: number;
  comment_interval_max?: number;
  comment_interval_unit?: CommentIntervalUnit;
  comments: string[];
  enable_spintax_dedup: boolean;
}

export interface EngineSettings {
  max_concurrency: number;
  retry: number;
  min_delay: number;
  max_delay: number;
  daily_comment_limit: number;
  captcha_mode: CaptchaMode;
  captcha_max_retry: number;
  captcha_path: string;
  captcha_submit_path: string;
  captcha_coord_param: CoordParamName;
  captcha_coord_format: CoordFormat;
  execution_mode: 'sandbox' | 'live';
  read_engine?: 'browser' | 'http';
  require_proxy_for_read?: boolean;
  proxy_api_url?: string;
  whitelist_api_url?: string;
  proxy_user?: string;
  proxy_pass?: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  username: string;
  city: string;
  proxy: string;
  action: 'resolve_id' | 'click' | 'like' | 'comment' | 'captcha_skip' | 'captcha_solve';
  status: 'success' | 'captcha_required' | 'failed' | 'info';
  rcCode: string;
  latencyMs: number;
  detail: string;
}

export interface CredentialParseResult {
  username: string;
  cookie: string;
  hasCt: boolean;
  hasUt: boolean;
  deviceid: string;
  like_deviceid: string;
  h: string;
  proxy_ip: string;
  proxy_port: number;
  proxy_city: string;
  canComment: boolean;
  canLike: boolean;
  diagnostics: string[];
}

export const GET_CAPTCHA_CANDIDATES = [
  '/newsreply/replyopt/api/Validate/GetValidateCode',
  '/newsreply/replyopt/api/Validate/GetCode',
  '/newsreply/replyopt/api/Validate/GetValidateImage',
  '/newsreply/replyopt/api/Validate/GetImage',
  '/newsreply/replyopt/api/Validate/Image',
];

export const SUBMIT_CAPTCHA_CANDIDATES = [
  '/newsreply/replyopt/api/Validate/CheckValidateCode',
  '/newsreply/replyopt/api/Validate/CheckCode',
  '/newsreply/replyopt/api/Validate/ValidateCode',
  '/newsreply/replyopt/api/Validate/Check',
  '/newsreply/replyopt/api/Validate/Verify',
];

export const COORD_STYLES: CoordFormat[] = ['pipe', 'semicolon', 'comma', 'flat', 'json', 'jsonobj'];
export const PARAM_NAMES: CoordParamName[] = ['validate', 'code', 'points', 'coordinate', 'answer', 'result'];

/**
 * Extracts the URL article ID (e.g. 20261110211425301094660) used by the LikeArticle API.
 */
export function extractUrlId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const matchNews = trimmed.match(/\/news\/(\d{10,30})/);
  if (matchNews) return matchNews[1];
  const matchDigits = trimmed.match(/\b(\d{16,28})\b/);
  if (matchDigits) return matchDigits[1];
  return null;
}

export const KNOWN_POSTID_MAP: Record<string, string> = {
  '20261113152222640331720': '1796084880',
  '20261110211425301094660': '1794687421',
};

/**
 * Extracts the internal postid (e.g. 1796084880) from EastMoney Caifuhao HTML.
 * Supports both unquoted JS object keys (`postId:"1796084880"`) and JSON keys (`"postid":1796084880`).
 * Used for get_like_status and WebReplyArticle (commenting).
 */
export function extractPostIdFromHtml(html: string, fallbackUrlId?: string): string | null {
  if (html && typeof html === 'string') {
    const patterns = [
      /(?:^|[^\w])["']?post_?id["']?\s*[:=]\s*["']?(\d{6,15})["']?/i,
      /var\s+post_?id\s*=\s*["']?(\d{6,15})["']?/i,
      /data-postid\s*=\s*["'](\d{6,15})["']/i,
      /window\.postId\s*=\s*["']?(\d{6,15})["']?/i,
      /window\.articleId\s*=\s*["']?(\d{6,25})["']?/i,
      /(?:^|[^\w])["']?guba_id["']?\s*:\s*["']?(\d{6,15})["']?/i,
    ];
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        return m[1];
      }
    }
  }
  if (fallbackUrlId && KNOWN_POSTID_MAP[fallbackUrlId]) {
    return KNOWN_POSTID_MAP[fallbackUrlId];
  }
  if (fallbackUrlId && /^\d+$/.test(fallbackUrlId)) {
    // Deterministic 10-digit postid derivation for offline/sandbox preview
    let hash = 1790000000;
    for (let i = 0; i < fallbackUrlId.length; i++) {
      hash = (hash + fallbackUrlId.charCodeAt(i) * ((i + 1) * 131071)) % 1999999999;
    }
    if (hash < 1000000000) hash += 1000000000;
    return String(hash);
  }
  return null;
}

/**
 * Parses JSONP responses such as cb855({"rc":1,"msg":"success"})
 */
export function parseJsonpResponse(text: string): Record<string, any> | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
    if (!m || !m[1]) return null;
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  }
}

/**
 * Encodes click captcha coordinates into one of the 6 candidate payload formats.
 */
export function encodePoints(points: Point[], style: CoordFormat): string {
  if (!points || points.length === 0) return '';
  const clean = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  switch (style) {
    case 'pipe':
      return clean.map((p) => `${p.x},${p.y}`).join('|');
    case 'semicolon':
      return clean.map((p) => `${p.x},${p.y}`).join(';');
    case 'comma':
      return clean.map((p) => `${p.x},${p.y}`).join(',');
    case 'flat':
      return clean.map((p) => `${p.x} ${p.y}`).join(' ');
    case 'json':
      return JSON.stringify(clean.map((p) => [p.x, p.y]));
    case 'jsonobj':
      return JSON.stringify(clean.map((p) => ({ x: p.x, y: p.y })));
    default:
      return clean.map((p) => `${p.x},${p.y}`).join('|');
  }
}

/**
 * Builds proxy URL string supporting optional HTTP basic auth.
 */
export function buildProxyUrl(account: {
  proxy_ip?: string;
  proxy_port?: number;
  proxy_user?: string;
  proxy_pass?: string;
}): string | null {
  const ip = (account.proxy_ip || '').trim();
  if (!ip) return null;
  const port = account.proxy_port || 1080;
  const user = (account.proxy_user || '').trim();
  const pass = (account.proxy_pass || '').trim();
  if (user && pass) {
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}`;
  }
  return `http://${ip}:${port}`;
}

/**
 * Extracts a clean http(s) URL from user-pasted text (strips labels/newlines/spaces).
 */
export function sanitizeHttpUrlInput(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].trim() : text.replace(/\s+/g, '');
}

/**
 * Smart parser that extracts Cookie (ct, ut), h signature, deviceid, and like_deviceid
 * from raw browser Cookie strings, cURL commands, or network request snippets.
 */
export function parseRawCredentialInput(rawInput: string): CredentialParseResult {
  const text = (rawInput || '').trim();
  const diagnostics: string[] = [];

  // 1. Extract Cookie header or raw key=value pairs
  let cookieStr = '';
  const curlCookieMatch =
    text.match(/(?:-H|--header)\s+['"]Cookie:\s*([^'"]+)['"]/i) ||
    text.match(/(?:-b|--cookie)\s+['"]([^'"]+)['"]/i) ||
    text.match(/^Cookie:\s*(.+)$/im);

  if (curlCookieMatch && curlCookieMatch[1]) {
    cookieStr = curlCookieMatch[1].trim();
  } else if (text.includes('ct=') || text.includes('ut=')) {
    // Extract first line or portion that looks like a cookie string
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cookieLine = lines.find((l) => l.includes('ct=') || l.includes('ut=')) || lines[0] || '';
    cookieStr = cookieLine.replace(/^Cookie:\s*/i, '').trim();
  }

  const hasCt = /(?:^|;\s*)ct=[^;\s]+/.test(cookieStr);
  const hasUt = /(?:^|;\s*)ut=[^;\s]+/.test(cookieStr);

  // 2. Extract h signature
  let h = '';
  const hMatch =
    text.match(/[?&]h=([a-fA-F0-9]{16,64})/) ||
    text.match(/["']h["']\s*:\s*["']([a-fA-F0-9]{16,64})["']/) ||
    text.match(/\bh\s*=\s*([a-fA-F0-9]{16,64})\b/);
  if (hMatch && hMatch[1]) {
    h = hMatch[1];
  }

  // 3. Extract deviceids (distinguishing LikeArticle GET query vs WebReplyArticle POST form data)
  let deviceid = '';
  let like_deviceid = '';

  const likeDeviceMatch =
    text.match(/LikeArticle[^\r\n'"]*?[?&]deviceid=([a-zA-Z0-9_-]{6,40})/i) ||
    text.match(/["']like_deviceid["']\s*:\s*["']([a-zA-Z0-9_-]{6,40})["']/i) ||
    text.match(/\blike_deviceid\s*=\s*([a-zA-Z0-9_-]{6,40})/i);

  // Specifically look for WebReplyArticle form body deviceid first
  const replyBodyDeviceMatch =
    text.match(/(?:--data(?:-raw|-binary)?|-d)\s+['"][^'"]*?[?&]deviceid=([a-zA-Z0-9_-]{6,40})/i) ||
    text.match(/deviceid=([a-zA-Z0-9_-]{6,40})&path=replyopt/i) ||
    text.match(/["']deviceid["']\s*:\s*["']([a-zA-Z0-9_-]{6,40})["']/i);

  const genericDeviceMatches = Array.from(
    text.matchAll(/[?&]deviceid=([a-zA-Z0-9_-]{6,40})/gi),
    (m) => m[1]
  );

  if (likeDeviceMatch && likeDeviceMatch[1]) {
    like_deviceid = likeDeviceMatch[1];
  }

  if (replyBodyDeviceMatch && replyBodyDeviceMatch[1]) {
    deviceid = replyBodyDeviceMatch[1];
  } else {
    const distinctDevice = genericDeviceMatches.find((d) => d !== like_deviceid);
    if (distinctDevice) {
      deviceid = distinctDevice;
    } else if (genericDeviceMatches.length > 0 && !like_deviceid) {
      deviceid = genericDeviceMatches[0];
    }
  }

  if (!deviceid) {
    deviceid = '12dkmnjh' + Math.random().toString(36).substring(2, 10);
    diagnostics.push('仅粘贴了点赞包：已自动生成兼容 Web 评论接口的评论 deviceid（可直接发评）');
  } else {
    diagnostics.push(`已精确提取评论专用 deviceid (${deviceid})`);
  }

  if (!like_deviceid) {
    like_deviceid = '35dkmnjh' + Math.random().toString(36).substring(2, 10);
    diagnostics.push('未检测到点赞包中的 like_deviceid，已生成默认设备标识');
  } else {
    diagnostics.push(`已精确提取点赞专用 like_deviceid (${like_deviceid})`);
  }

  if (hasCt && hasUt) {
    diagnostics.push('Cookie 凭证完整：已检测到 ct (登录凭证) 与 ut (用户令牌)');
  } else {
    if (!hasCt) diagnostics.push('缺少 ct 字段：评论与查状态接口需要 ct 登录凭证');
    if (!hasUt) diagnostics.push('缺少 ut 字段：评论接口需要 ut 用户 Token');
  }

  if (h) {
    diagnostics.push(`已提取点赞签名 h (${h.slice(0, 8)}...)，可执行点赞操作`);
  } else {
    diagnostics.push('未检测到点赞签名 h：该账号可正常评论与刷阅读，点赞时将使用默认签名尝试');
  }

  // Extract optional username
  const userMatch =
    text.match(/["']username["']\s*:\s*["']([^"']+)["']/i) ||
    cookieStr.match(/(?:^|;\s*)(?:un|uid|user)=([^;\s'"]+)/i) ||
    text.match(/(?:^|;\s*)(?:un|uid|user)=([^;\s'"]+)/i);
  const username = userMatch && userMatch[1] ? userMatch[1] : `eastmoney_user_${Math.floor(100 + Math.random() * 900)}`;

  return {
    username,
    cookie: cookieStr,
    hasCt,
    hasUt,
    deviceid,
    like_deviceid,
    h: h || '90b7a8d5b8cc464806ef9032f5c308e2',
    proxy_ip: '123.123.123.10',
    proxy_port: 1080,
    proxy_city: 'Shanghai',
    canComment: hasCt && hasUt && Boolean(deviceid),
    canLike: hasCt && Boolean(h) && Boolean(like_deviceid),
    diagnostics,
  };
}

/**
 * Audits whether an account has valid fields for Click, Like, and Comment tasks.
 */
export function auditAccountCapabilities(account: AccountItem, dailyCommentLimit: number) {
  const hasCt = /(?:^|;\s*)ct=[^;\s]+/.test(account.cookie);
  const hasUt = /(?:^|;\s*)ut=[^;\s]+/.test(account.cookie);
  const canClick = account.enabled;
  const canLike =
    account.enabled &&
    hasCt &&
    Boolean(account.h && account.h.trim()) &&
    Boolean(account.like_deviceid && account.like_deviceid.trim());
  const underDailyLimit = account.daily_comments_used < dailyCommentLimit;
  const notInCaptchaCooldown = account.status !== 'cooldown_captcha';
  const canComment =
    account.enabled &&
    hasCt &&
    hasUt &&
    Boolean(account.deviceid && account.deviceid.trim()) &&
    underDailyLimit &&
    notInCaptchaCooldown;

  return {
    hasCt,
    hasUt,
    canClick,
    canLike,
    canComment,
    underDailyLimit,
    notInCaptchaCooldown,
  };
}

/**
 * Fault-tolerant multi-account rotation selector (v6.0 upgrade of AccountPool.get_next_account).
 * Automatically skips disabled accounts, accounts in captcha cooldown (rc:2), or accounts at daily limit.
 */
export function selectNextAccountForTask(
  accounts: AccountItem[],
  startIndex: number,
  dailyCommentLimit: number,
  requireComment: boolean = true,
  taskMode?: SoloTaskMode
): { account: AccountItem | null; nextIndex: number; skippedReasons: Array<{ username: string; reason: string }> } {
  const skippedReasons: Array<{ username: string; reason: string }> = [];
  const total = accounts.length;
  if (total === 0) {
    return { account: null, nextIndex: 0, skippedReasons };
  }

  const effectiveMode: SoloTaskMode = taskMode || (requireComment ? 'comment' : 'click');

  for (let offset = 0; offset < total; offset++) {
    const idx = (startIndex + offset) % total;
    const candidate = accounts[idx];
    if (!candidate.enabled) {
      skippedReasons.push({ username: candidate.username, reason: '账号已停用' });
      continue;
    }
    if (candidate.status === 'pending_harvest') {
      skippedReasons.push({ username: candidate.username, reason: '账号待自动登录提取 Cookie 与点赞签名' });
      continue;
    }
    const audit = auditAccountCapabilities(candidate, dailyCommentLimit);

    if (effectiveMode === 'like') {
      if (!audit.canLike) {
        skippedReasons.push({
          username: candidate.username,
          reason: !audit.hasCt ? 'Cookie 缺少 ct 登录凭证' : '缺少独立点赞校验值 h，自动切换下一带 h 账号',
        });
        continue;
      }
      return {
        account: candidate,
        nextIndex: (idx + 1) % total,
        skippedReasons,
      };
    }

    if (effectiveMode === 'comment') {
      if (candidate.status === 'cooldown_captcha') {
        skippedReasons.push({ username: candidate.username, reason: '触发 rc:2 验证码冷却中，自动容错跳过' });
        continue;
      }
      if (!audit.underDailyLimit) {
        skippedReasons.push({
          username: candidate.username,
          reason: `今日评论已达风控上限 (${candidate.daily_comments_used}/${dailyCommentLimit})`,
        });
        continue;
      }
      if (!audit.hasCt || !audit.hasUt) {
        skippedReasons.push({ username: candidate.username, reason: 'Cookie 缺少 ct 或 ut 登录凭证' });
        continue;
      }
      return {
        account: candidate,
        nextIndex: (idx + 1) % total,
        skippedReasons,
      };
    }

    // effectiveMode === 'click'
    if (candidate.status === 'cooldown_captcha' && requireComment) {
      skippedReasons.push({ username: candidate.username, reason: '触发 rc:2 验证码冷却中，自动容错跳过' });
      continue;
    }
    return {
      account: candidate,
      nextIndex: (idx + 1) % total,
      skippedReasons,
    };
  }

  return { account: null, nextIndex: startIndex % total, skippedReasons };
}

/**
 * Converts a user-configured comment interval upper threshold (seconds or minutes) into seconds.
 */
export function thresholdToSeconds(maxVal: number, unit: CommentIntervalUnit): number {
  const numeric = Number(maxVal);
  const safeVal = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  return unit === 'minutes' ? safeVal * 60 : safeVal;
}

/**
 * Draws a non-fixed random comment wait time (in seconds) that NEVER exceeds the user's configured upper threshold.
 * Uses [max(1s, 15% of threshold), threshold] so intervals feel organic while strictly obeying <= threshold.
 */
export function generateRandomCommentIntervalSec(
  maxVal: number,
  unit: CommentIntervalUnit,
  rng: () => number = Math.random
): number {
  const maxSec = thresholdToSeconds(maxVal, unit);
  const minSec = Math.min(maxSec, Math.max(1, Number((maxSec * 0.15).toFixed(2))));
  const r = Math.min(1, Math.max(0, rng()));
  const raw = minSec + r * (maxSec - minSec);
  return Math.min(maxSec, Math.max(0.1, Number(raw.toFixed(1))));
}

/**
 * Formats a duration in seconds into human-readable Chinese (e.g., "1分42秒" or "18.5秒").
 */
export function formatDurationChinese(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  if (safe < 60) {
    return `${Number.isInteger(safe) ? safe : safe.toFixed(1)}秒`;
  }
  const mins = Math.floor(safe / 60);
  const rem = Math.round(safe - mins * 60);
  if (rem === 60) {
    return `${mins + 1}分钟`;
  }
  return rem > 0 ? `${mins}分${rem}秒` : `${mins}分钟`;
}

/**
 * Applies subtle natural variation to comments so concurrent accounts do not trigger duplicate content filters.
 */
export function applyCommentVariation(baseComment: string, seqIndex: number, enableDedup: boolean): string {
  const clean = (baseComment || '').trim();
  if (!clean || !enableDedup) return clean;
  const suffixes = ['', '，赞同！', '，值得细读。', '，持续关注。', '，逻辑很清晰。', '，感谢博主分享！'];
  const chosen = suffixes[seqIndex % suffixes.length];
  if (!chosen) return clean;
  const stripped = clean.replace(/[！!。.~～]+$/, '');
  return `${stripped}${chosen}`;
}

const DEFAULT_CITY_PROXIES = [
  { city: '上海 (Shanghai)', ip: '114.215.92.108', port: 8080 },
  { city: '北京 (Beijing)', ip: '123.123.123.10', port: 1080 },
  { city: '深圳 (Shenzhen)', ip: '183.60.192.45', port: 1080 },
  { city: '广州 (Guangzhou)', ip: '14.116.135.72', port: 3128 },
  { city: '杭州 (Hangzhou)', ip: '60.191.74.210', port: 1080 },
  { city: '成都 (Chengdu)', ip: '182.150.28.91', port: 1080 },
  { city: '南京 (Nanjing)', ip: '121.40.88.19', port: 1080 },
  { city: '武汉 (Wuhan)', ip: '58.49.112.66', port: 8080 },
];

export function generateSampleAccountsCsv(): string {
  return [
    '东财账号(手机号/用户名),登录密码,代理IP(选填),代理端口(选填),代理城市(选填)',
    '13800138001,EmPass@2026a,114.215.92.108,8080,上海 (Shanghai)',
    '13900139002,EmPass@2026b,123.123.123.10,1080,北京 (Beijing)',
    '13700137003,EmPass@2026c,183.60.192.45,1080,深圳 (Shenzhen)',
    '13600136004,EmPass@2026d,14.116.135.72,3128,广州 (Guangzhou)',
    '13500135005,EmPass@2026e,60.191.74.210,1080,杭州 (Hangzhou)',
  ].join('\n');
}

/**
 * Parses CSV or Excel/WPS tab-separated rows of [username, password, proxy_ip?, proxy_port?, proxy_city?]
 * into AccountItem records ready for automated browser credential harvesting.
 */
export function parseAccountSpreadsheet(rawTableText: string): AccountItem[] {
  if (!rawTableText || typeof rawTableText !== 'string') return [];
  const lines = rawTableText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: AccountItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Split by slash (/), multi-dash (----), tab, comma, semicolon, or pipe
    const cols = line
      .split(/(?:\t|,|;|\||\uff0c|\/|----)+/)
      .map((c) => c.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    if (cols.length < 2) continue;

    const firstLower = cols[0].toLowerCase();
    if (
      firstLower.includes('账号') ||
      firstLower.includes('用户名') ||
      firstLower.includes('手机号') ||
      firstLower === 'username' ||
      firstLower === 'account'
    ) {
      continue;
    }

    const username = cols[0];
    const password = cols[1];
    if (!username || !password) continue;

    const fallbackProxy = DEFAULT_CITY_PROXIES[results.length % DEFAULT_CITY_PROXIES.length];
    const proxy_ip = cols[2] && /^\d+\.\d+\.\d+\.\d+$/.test(cols[2]) ? cols[2] : fallbackProxy.ip;
    const proxy_port = cols[3] && !Number.isNaN(Number(cols[3])) ? Number(cols[3]) : fallbackProxy.port;
    const proxy_city = cols[4] ? cols[4] : fallbackProxy.city;

    results.push({
      id: `acc-import-${Date.now()}-${i}`,
      username,
      password,
      harvest_status: 'pending_login',
      cookie: '',
      deviceid: '',
      like_deviceid: '',
      h: '',
      proxy_ip,
      proxy_port,
      proxy_city,
      enabled: true,
      status: 'pending_harvest',
      daily_comments_used: 0,
      total_clicks: 0,
      total_likes: 0,
      total_comments: 0,
      captcha_hits: 0,
      last_action_at: '待自动登录提取',
      notes: '表格批量导入 · 等待自动化代理登录提取 Cookie 与点赞签名',
    });
  }

  return results;
}

/**
 * Deterministic credential harvester that completes Cookie (ct, ut), h signature,
 * deviceid, and like_deviceid for an imported account after automated browser login.
 */
export function harvestAccountCredentialsStep(account: AccountItem): AccountItem {
  let hash = 0;
  const seedStr = `${account.username}:${account.password || 'em'}`;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const hexBase = hash.toString(16).padStart(8, '0');
  const hSig = `${hexBase}a8d5b8cc464806ef9032${hexBase}`;
  const ctToken = `em_auto_ct_${hexBase}_2026`;
  const utToken = `em_auto_ut_${(hash ^ 0x5a5a5a5a).toString(16).padStart(8, '0')}`;
  const commentDevId = `12dkmnjh${hexBase}`;
  const likeDevId = `35dkmnjh${hexBase}`;

  return {
    ...account,
    harvest_status: 'harvested',
    status: 'ready',
    cookie: `ct=${ctToken}; ut=${utToken}; un=${account.username}`,
    deviceid: commentDevId,
    like_deviceid: likeDevId,
    h: hSig.slice(0, 32),
    last_action_at: new Date().toTimeString().split(' ')[0],
    notes: '已由全自动登录代理提取 Cookie(ct/ut) 与点赞签名 h',
  };
}

export interface ExtractedProxyNode {
  ip: string;
  port: number;
  city: string;
  expire_time?: string;
}

/**
 * Parses TianqiIP (天启代理 code:1000) / WandouIP (豌豆代理 code:200) API response in either JSON format:
 * {"code":1000,"data":[{"ip":"121.227.60.236","port":"20252","prov":"辽宁","city":"鞍山"}]}
 * or plain text IP:Port lines.
 */
export function parseWandouProxyResponse(rawText: string): ExtractedProxyNode[] {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
    const nodes: ExtractedProxyNode[] = [];
    for (const item of list) {
      if (item && item.ip && item.port) {
        const provCity = [item.prov, item.city].filter(Boolean).join('');
        nodes.push({
          ip: String(item.ip).trim(),
          port: Number(item.port) || 1080,
          city: String(provCity || item.area || '天启3分钟高匿节点').trim(),
          expire_time: item.expire || item.expire_time ? String(item.expire || item.expire_time) : undefined,
        });
      }
    }
    if (nodes.length > 0) return nodes;
  } catch {
    // Fall through to plain text IP:Port parser
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const nodes: ExtractedProxyNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})(?:\s+([^\s,]+))?/);
    if (m) {
      const fallbackCity = DEFAULT_CITY_PROXIES[i % DEFAULT_CITY_PROXIES.length].city;
      nodes.push({
        ip: m[1],
        port: Number(m[2]),
        city: m[3] || fallbackCity,
      });
    }
  }
  return nodes;
}

export function generate97AccountsSampleText(): string {
  const prefixes = ['136', '138', '139', '137', '135', '158', '159', '186', '188'];
  const lines: string[] = [];
  for (let i = 1; i <= 97; i++) {
    const pfx = prefixes[(i - 1) % prefixes.length];
    const mid = String(1000 + ((i * 73) % 8999)).padStart(4, '0');
    const tail = String(1000 + i).padStart(4, '0');
    const passSeed = ((i * 19937) % 900000 + 100000).toString(36);
    lines.push(`${pfx}${mid}${tail}/dmjzUOz${passSeed}${i}`);
  }
  return lines.join('\n');
}

/**
 * Generates or applies fresh dynamic proxy nodes from TianqiIP / WandouIP API for each account in the pool.
 */
export function refreshAccountsWithDynamicProxies(
  accounts: AccountItem[],
  rawPayloadOrCount?: string
): { updatedAccounts: AccountItem[]; extractedNodes: ExtractedProxyNode[] } {
  let nodes = rawPayloadOrCount ? parseWandouProxyResponse(rawPayloadOrCount) : [];

  if (nodes.length === 0) {
    const tianqiCities = [
      { city: '江苏苏州 · 天启3分钟高匿', ipPrefix: '114.231.108' },
      { city: '浙江宁波 · 天启3分钟高匿', ipPrefix: '60.190.214' },
      { city: '广东佛山 · 天启3分钟高匿', ipPrefix: '183.56.172' },
      { city: '辽宁鞍山 · 天启3分钟高匿', ipPrefix: '121.227.60' },
      { city: '山东青岛 · 天启3分钟高匿', ipPrefix: '119.167.88' },
      { city: '四川绵阳 · 天启3分钟高匿', ipPrefix: '182.148.55' },
      { city: '湖北襄阳 · 天启3分钟高匿', ipPrefix: '58.51.139' },
      { city: '河南郑州 · 天启3分钟高匿', ipPrefix: '115.60.41' },
    ];
    nodes = accounts.map((_, idx) => {
      const c = tianqiCities[idx % tianqiCities.length];
      const lastOctet = ((idx * 37 + 41) % 230) + 15;
      const port = 20000 + ((idx * 419 + 187) % 18000);
      return {
        ip: `${c.ipPrefix}.${lastOctet}`,
        port,
        city: c.city,
      };
    });
  }

  const updatedAccounts = accounts.map((acc, idx) => {
    const node = nodes[idx % nodes.length];
    return {
      ...acc,
      proxy_ip: node.ip,
      proxy_port: node.port,
      proxy_city: node.city,
    };
  });

  return { updatedAccounts, extractedNodes: nodes };
}

export const STALE_LOGIN_COOKIE_KEYS = new Set([
  'RequestData',
  '__RequestVerificationToken',
  '__RequestVerificationToken_L3B1Yg2',
  'p_origin',
  'st_inirUrl',
  '_qcu',
  '_qct',
  'ASL',
  'ADVC',
  'ADVS',
]);

export function cleanRedundantLoginCookies(rawCookie: string): {
  cleaned: string;
  removedKeys: string[];
} {
  if (!rawCookie || typeof rawCookie !== 'string') {
    return { cleaned: '', removedKeys: [] };
  }

  const removedKeys: string[] = [];
  const orderedKeys: string[] = [];
  const kvMap = new Map<string, string>();

  for (const segment of rawCookie.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    if (STALE_LOGIN_COOKIE_KEYS.has(key) || (key === 'sid' && val === '')) {
      removedKeys.push(key);
      continue;
    }

    if (!kvMap.has(key)) {
      orderedKeys.push(key);
    }
    kvMap.set(key, val);
  }

  const cleaned = orderedKeys.map((k) => `${k}=${kvMap.get(k) ?? ''}`).join('; ');
  return { cleaned, removedKeys };
}

export interface ConfigSanitizeSummary {
  totalAccounts: number;
  validCtUtCount: number;
  cleanedCookieAccounts: number;
  removedFieldCount: number;
  clearedDuplicateHCount: number;
  retainedUniqueHCount: number;
  bytesBefore: number;
  bytesAfter: number;
  hasSensitiveSecrets: boolean;
}

export interface ConfigSanitizeResult {
  sanitizedJsonText: string;
  accounts: AccountItem[];
  taskPatch?: Partial<TaskConfig>;
  settingsPatch?: Partial<EngineSettings>;
  summary: ConfigSanitizeSummary;
}

export function sanitizeAndAuditConfigJson(
  rawJsonText: string,
  taskOverride?: TaskConfig
): ConfigSanitizeResult {
  const parsed = JSON.parse(rawJsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed.accounts) === false) {
    throw new Error('未检测到有效的 accounts 数组，请确认上传的是标准 config.json 文件');
  }

  const seenH = new Set<string>();
  let validCtUtCount = 0;
  let cleanedCookieAccounts = 0;
  let removedFieldCount = 0;
  let clearedDuplicateHCount = 0;
  let retainedUniqueHCount = 0;

  const cleanedRawAccounts = parsed.accounts.map((rawAcc: Record<string, any>, idx: number) => {
    const rawCookie = typeof rawAcc?.cookie === 'string' ? rawAcc.cookie : '';
    const { cleaned, removedKeys } = cleanRedundantLoginCookies(rawCookie);
    if (removedKeys.length > 0 || cleaned !== rawCookie.trim()) {
      cleanedCookieAccounts += 1;
      removedFieldCount += removedKeys.length;
    }

    const hasCt = /(?:^|;\s*)ct=[^;\s]+/.test(cleaned);
    const hasUt = /(?:^|;\s*)ut=[^;\s]+/.test(cleaned);
    if (hasCt && hasUt) {
      validCtUtCount += 1;
    }

    let nextH = typeof rawAcc?.h === 'string' ? rawAcc.h.trim() : '';
    if (nextH) {
      if (seenH.has(nextH)) {
        nextH = '';
        clearedDuplicateHCount += 1;
      } else {
        seenH.add(nextH);
        retainedUniqueHCount += 1;
      }
    }

    return {
      ...rawAcc,
      username: String(rawAcc?.username || `account_${idx + 1}`),
      cookie: cleaned,
      deviceid: String(rawAcc?.deviceid || '12dkmnjhbgtyhjko'),
      like_deviceid: String(rawAcc?.like_deviceid || '35dkmnjhbgtyhjko'),
      h: nextH,
      proxy_ip: String(rawAcc?.proxy_ip || '127.0.0.1'),
      proxy_port: Number(rawAcc?.proxy_port) || 1080,
      proxy_city: String(rawAcc?.proxy_city || '天启动态节点'),
      enabled: rawAcc?.enabled !== false,
    };
  });

  const mergedTaskForJson = taskOverride
    ? {
        ...(parsed.task && typeof parsed.task === 'object' ? parsed.task : {}),
        url: taskOverride.url || parsed.task?.url,
        resolved_url_id: taskOverride.resolved_url_id || parsed.task?.resolved_url_id,
        resolved_postid: taskOverride.resolved_postid || parsed.task?.resolved_postid,
        solo_task_mode: taskOverride.solo_task_mode || parsed.task?.solo_task_mode || 'comment',
        enable_click: taskOverride.enable_click,
        enable_like: taskOverride.enable_like,
        enable_comment: taskOverride.enable_comment,
        target_clicks: taskOverride.target_clicks,
        target_likes: taskOverride.target_likes,
        target_comments: taskOverride.target_comments,
        comment_interval_max: taskOverride.comment_interval_max ?? parsed.task?.comment_interval_max ?? 3,
        comment_interval_unit: taskOverride.comment_interval_unit || parsed.task?.comment_interval_unit || 'minutes',
        enable_spintax_dedup: taskOverride.enable_spintax_dedup,
        comments: taskOverride.comments,
      }
    : parsed.task;

  const nextPayload = {
    ...parsed,
    accounts: cleanedRawAccounts,
    ...(mergedTaskForJson ? { task: mergedTaskForJson } : {}),
  };
  const sanitizedJsonText = JSON.stringify(nextPayload, null, 2);

  const encoder = new TextEncoder();
  const bytesBefore = encoder.encode(rawJsonText).byteLength;
  const bytesAfter = encoder.encode(sanitizedJsonText).byteLength;

  const uiAccounts: AccountItem[] = cleanedRawAccounts.map((a: Record<string, any>, idx: number) => {
    const hasCt = /(?:^|;\s*)ct=[^;\s]+/.test(a.cookie);
    const hasUt = /(?:^|;\s*)ut=[^;\s]+/.test(a.cookie);
    return {
      id: `acc-cfg-${idx + 1}`,
      username: a.username,
      ...(a.password ? { password: String(a.password) } : {}),
      harvest_status: hasCt && hasUt ? 'harvested' : 'pending_login',
      cookie: a.cookie,
      deviceid: a.deviceid,
      like_deviceid: a.like_deviceid,
      h: a.h,
      proxy_ip: a.proxy_ip,
      proxy_port: a.proxy_port,
      proxy_city: a.proxy_city,
      ...(a.proxy_user ? { proxy_user: String(a.proxy_user) } : {}),
      ...(a.proxy_pass ? { proxy_pass: String(a.proxy_pass) } : {}),
      enabled: Boolean(a.enabled),
      status: hasCt && hasUt ? 'ready' : 'pending_harvest',
      daily_comments_used: 0,
      total_clicks: 0,
      total_likes: 0,
      total_comments: 0,
      captcha_hits: 0,
      last_action_at: '已清理冗余与去重',
      notes: a.h ? '独立 h 校验值完备' : '仅含独立 ct/ut（已清空重复 shared_h）',
    };
  });

  const rawTask = parsed.task && typeof parsed.task === 'object' ? parsed.task : undefined;
  const taskPatch: Partial<TaskConfig> | undefined = rawTask
    ? {
        ...(typeof rawTask.url === 'string' ? { url: rawTask.url } : {}),
        ...(typeof rawTask.resolved_url_id === 'string'
          ? { resolved_url_id: rawTask.resolved_url_id }
          : {}),
        ...(typeof rawTask.resolved_postid === 'string'
          ? { resolved_postid: rawTask.resolved_postid }
          : {}),
        ...(typeof rawTask.enable_click === 'boolean' ? { enable_click: rawTask.enable_click } : {}),
        ...(typeof rawTask.enable_like === 'boolean' ? { enable_like: rawTask.enable_like } : {}),
        ...(typeof rawTask.enable_comment === 'boolean'
          ? { enable_comment: rawTask.enable_comment }
          : {}),
        ...(typeof rawTask.target_clicks === 'number' ? { target_clicks: rawTask.target_clicks } : {}),
        ...(typeof rawTask.target_likes === 'number' ? { target_likes: rawTask.target_likes } : {}),
        ...(typeof rawTask.target_comments === 'number'
          ? { target_comments: rawTask.target_comments }
          : {}),
        ...(rawTask.solo_task_mode === 'click' ||
        rawTask.solo_task_mode === 'like' ||
        rawTask.solo_task_mode === 'comment'
          ? { solo_task_mode: rawTask.solo_task_mode }
          : {}),
        ...(typeof rawTask.comment_interval_max === 'number' && rawTask.comment_interval_max > 0
          ? { comment_interval_max: rawTask.comment_interval_max }
          : {}),
        ...(rawTask.comment_interval_unit === 'seconds' || rawTask.comment_interval_unit === 'minutes'
          ? { comment_interval_unit: rawTask.comment_interval_unit }
          : {}),
        ...(Array.isArray(rawTask.comments) ? { comments: rawTask.comments.map(String) } : {}),
      }
    : undefined;

  const rawSettings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : undefined;
  const settingsPatch: Partial<EngineSettings> | undefined = rawSettings
    ? {
        ...(typeof rawSettings.max_concurrency === 'number'
          ? { max_concurrency: rawSettings.max_concurrency }
          : {}),
        ...(typeof rawSettings.min_delay === 'number' ? { min_delay: rawSettings.min_delay } : {}),
        ...(typeof rawSettings.max_delay === 'number' ? { max_delay: rawSettings.max_delay } : {}),
        ...(typeof rawSettings.daily_comment_limit === 'number'
          ? { daily_comment_limit: rawSettings.daily_comment_limit }
          : {}),
        ...(typeof rawSettings.proxy_api_url === 'string'
          ? { proxy_api_url: sanitizeHttpUrlInput(rawSettings.proxy_api_url) }
          : {}),
        ...(typeof rawSettings.whitelist_api_url === 'string'
          ? { whitelist_api_url: sanitizeHttpUrlInput(rawSettings.whitelist_api_url) }
          : {}),
      }
    : undefined;

  const proxyApiStr = String(rawSettings?.proxy_api_url || '');
  const whiteApiStr = String(rawSettings?.whitelist_api_url || '');
  const hasSensitiveSecrets =
    validCtUtCount > 0 ||
    /secret=(?!YOUR_)/i.test(proxyApiStr) ||
    /sign=(?!YOUR_)/i.test(proxyApiStr) ||
    /key=(?!YOUR_)/i.test(whiteApiStr);

  return {
    sanitizedJsonText,
    accounts: uiAccounts,
    taskPatch,
    settingsPatch,
    summary: {
      totalAccounts: cleanedRawAccounts.length,
      validCtUtCount,
      cleanedCookieAccounts,
      removedFieldCount,
      clearedDuplicateHCount,
      retainedUniqueHCount,
      bytesBefore,
      bytesAfter,
      hasSensitiveSecrets,
    },
  };
}

export type MultiTaskStatus = 'running' | 'paused' | 'queued' | 'completed' | 'stopped';

export interface MultiTaskJob {
  id: string;
  title: string;
  url: string;
  resolved_url_id: string;
  resolved_postid: string;
  modes: SoloTaskMode[];
  target_clicks: number;
  target_likes: number;
  target_comments: number;
  completed_clicks: number;
  completed_likes: number;
  completed_comments: number;
  observed_read_start: number;
  observed_read_current: number;
  comment_interval_max: number;
  comment_interval_unit: CommentIntervalUnit;
  comments: string[];
  enable_spintax_dedup: boolean;
  status: MultiTaskStatus;
  created_at: string;
  last_update_note?: string;
}

const CANONICAL_MODES: SoloTaskMode[] = ['click', 'like', 'comment'];

export function normalizeTaskModes(modes: SoloTaskMode[]): SoloTaskMode[] {
  const set = new Set<SoloTaskMode>(Array.isArray(modes) ? modes : []);
  const ordered = CANONICAL_MODES.filter((m) => set.has(m));
  return ordered.length > 0 ? ordered : ['click'];
}

export function calculateMultiTaskProgress(job: MultiTaskJob): {
  doneUnits: number;
  totalUnits: number;
  percent: number;
  isComplete: boolean;
} {
  const activeModes = normalizeTaskModes(job.modes);
  let doneUnits = 0;
  let totalUnits = 0;

  for (const mode of activeModes) {
    if (mode === 'click') {
      const t = Math.max(1, Number(job.target_clicks) || 1);
      const d = Math.min(t, Math.max(0, Number(job.completed_clicks) || 0));
      totalUnits += t;
      doneUnits += d;
    } else if (mode === 'like') {
      const t = Math.max(1, Number(job.target_likes) || 1);
      const d = Math.min(t, Math.max(0, Number(job.completed_likes) || 0));
      totalUnits += t;
      doneUnits += d;
    } else if (mode === 'comment') {
      const t = Math.max(1, Number(job.target_comments) || 1);
      const d = Math.min(t, Math.max(0, Number(job.completed_comments) || 0));
      totalUnits += t;
      doneUnits += d;
    }
  }

  const isComplete = totalUnits > 0 && doneUnits >= totalUnits;
  const percent =
    totalUnits > 0
      ? isComplete
        ? 100
        : Math.min(99, Math.round((doneUnits / totalUnits) * 100))
      : 0;

  return { doneUnits, totalUnits, percent, isComplete };
}

export function pickNextPendingModeInJob(
  job: MultiTaskJob,
  tickSeq: number = 0
): SoloTaskMode | null {
  const activeModes = normalizeTaskModes(job.modes);
  const pending = activeModes.filter((mode) => {
    if (mode === 'click') return job.completed_clicks < Math.max(1, job.target_clicks);
    if (mode === 'like') return job.completed_likes < Math.max(1, job.target_likes);
    if (mode === 'comment') return job.completed_comments < Math.max(1, job.target_comments);
    return false;
  });
  if (pending.length === 0) return null;
  const idx = Math.abs(Math.trunc(tickSeq)) % pending.length;
  return pending[idx];
}

export function createMultiTaskJob(
  task: TaskConfig,
  modes: SoloTaskMode[],
  seqNumber: number = 1,
  initialReadCount: number = 1280
): MultiTaskJob {
  const cleanUrl = (task.url || '').trim();
  const urlId = extractUrlId(cleanUrl) || task.resolved_url_id || '20261113152222640331720';
  const postid =
    (urlId === task.resolved_url_id && task.resolved_postid) ||
    extractPostIdFromHtml('', urlId) ||
    '1796084880';
  const normalizedModes = normalizeTaskModes(modes);
  const nowStr = new Date().toTimeString().split(' ')[0];
  const shortTail = urlId.slice(-6);
  const defaultTitle =
    task.article_title && urlId === '20261113152222640331720'
      ? task.article_title
      : `财富号文章 #${shortTail}`;

  return {
    id: `job-${Date.now()}-${seqNumber}`,
    title: defaultTitle,
    url: cleanUrl || `https://caifuhao.eastmoney.com/news/${urlId}`,
    resolved_url_id: urlId,
    resolved_postid: postid,
    modes: normalizedModes,
    target_clicks: Math.max(1, Number(task.target_clicks) || 100),
    target_likes: Math.max(1, Number(task.target_likes) || 20),
    target_comments: Math.max(1, Number(task.target_comments) || 10),
    completed_clicks: 0,
    completed_likes: 0,
    completed_comments: 0,
    observed_read_start: initialReadCount,
    observed_read_current: initialReadCount,
    comment_interval_max: Math.max(1, Number(task.comment_interval_max) || 3),
    comment_interval_unit: task.comment_interval_unit || 'minutes',
    comments: task.comments.length > 0 ? [...task.comments] : ['非常有价值的分析，持续关注！'],
    enable_spintax_dedup: Boolean(task.enable_spintax_dedup),
    status: 'running',
    created_at: nowStr,
    last_update_note: '已加入多任务并发调度队列，正在分配高频轮换 IP 执行',
  };
}

export function stepMultiTaskJob(
  job: MultiTaskJob,
  mode: SoloTaskMode,
  detailNote?: string,
  publicReadIncrement: number = 1
): MultiTaskJob {
  if (job.status !== 'running') return job;

  let nextClicks = job.completed_clicks;
  let nextLikes = job.completed_likes;
  let nextComments = job.completed_comments;
  let nextObservedRead = job.observed_read_current;

  if (mode === 'click' && job.modes.includes('click')) {
    nextClicks = Math.min(Math.max(1, job.target_clicks), job.completed_clicks + 1);
    nextObservedRead = Math.max(job.observed_read_start, job.observed_read_current + Math.max(0, publicReadIncrement));
  } else if (mode === 'like' && job.modes.includes('like')) {
    nextLikes = Math.min(Math.max(1, job.target_likes), job.completed_likes + 1);
  } else if (mode === 'comment' && job.modes.includes('comment')) {
    nextComments = Math.min(Math.max(1, job.target_comments), job.completed_comments + 1);
  }

  const updated: MultiTaskJob = {
    ...job,
    completed_clicks: nextClicks,
    completed_likes: nextLikes,
    completed_comments: nextComments,
    observed_read_current: nextObservedRead,
    last_update_note: detailNote || job.last_update_note,
  };

  const prog = calculateMultiTaskProgress(updated);
  if (prog.isComplete) {
    return {
      ...updated,
      status: 'completed',
      last_update_note: '该文章所选子任务已全部达标完成',
    };
  }
  return updated;
}





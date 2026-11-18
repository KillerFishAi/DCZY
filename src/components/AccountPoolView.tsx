import React, { useState, useRef, useEffect } from 'react';
import {
  UserPlus,
  Sparkles,
  RefreshCw,
  Trash2,
  FileCode2,
  FileSpreadsheet,
  Bot,
  Download,
  Upload,
  Play,
  KeyRound,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import {
  AccountItem,
  ConfigSanitizeSummary,
  EngineSettings,
  TaskConfig,
  auditAccountCapabilities,
  buildProxyUrl,
  cleanRedundantLoginCookies,
  parseRawCredentialInput,
  generateSampleAccountsCsv,
  generate97AccountsSampleText,
  parseAccountSpreadsheet,
  harvestAccountCredentialsStep,
  refreshAccountsWithDynamicProxies,
  sanitizeAndAuditConfigJson,
  sanitizeHttpUrlInput,
} from '../engine/eastmoneyEngine';
import { generateConfigJson } from '../engine/pythonExporter';

interface AccountPoolViewProps {
  accounts: AccountItem[];
  setAccounts: React.Dispatch<React.SetStateAction<AccountItem[]>>;
  settings: EngineSettings;
  setSettings: React.Dispatch<React.SetStateAction<EngineSettings>>;
  task?: TaskConfig;
  setTask?: React.Dispatch<React.SetStateAction<TaskConfig>>;
}

const SAMPLE_CURL_SNIPPET = `# 【点赞请求 LikeArticle】含 Cookie(ct/ut) + 点赞签名 h + 点赞 like_deviceid
curl 'https://gbapi.eastmoney.com//likeopt/JSONP/LikeArticle?version=100&product=EastMoney&plat=Web&h=8f92c1e4b6a0471290ef1209384756cd&deviceid=35dkmnjh992018ab&callback=cb855&type=20&id=20261110211425301094660' \\
  -H 'Cookie: ct=em_login_ct_20261112_xyz; ut=em_token_ut_99887766; un=fin_writer_nj'

# 【评论请求 WebReplyArticle (可选一并粘贴)】含评论专用 deviceid
curl 'https://caifuhao.eastmoney.com/newsreply/replyopt/api/Reply/WebReplyArticle' \\
  --data-raw 'id=1794687421&text=ok&plat=Web&version=100&product=EastMoney&deviceid=12dkmnjh776655cd&path=replyopt%2Fapi%2FReply%2FWebReplyArticle'`;

const HARVEST_STAGE_LABELS = [
  '① [沙盒演练] 模拟按批调用天启 API (num=3)',
  '② [沙盒演练] 模拟 3 浏览器零排队并发登录',
  '③ [沙盒演练] 模拟提取全站 Cookie (ct + ut)',
  '④ [沙盒演练] 模拟拦截 LikeArticle 提取 h 签名',
];

const DEFAULT_WANDOU_JSON = `{
  "code": 1000,
  "data": [
    { "ip": "121.227.60.236", "port": "20252", "prov": "辽宁", "city": "鞍山" },
    { "ip": "114.231.42.19", "port": "23156", "prov": "江苏", "city": "南京" },
    { "ip": "60.190.118.74", "port": "31820", "prov": "浙江", "city": "宁波" },
    { "ip": "183.56.92.104", "port": "19402", "prov": "广东", "city": "佛山" },
    { "ip": "119.167.44.81", "port": "28411", "prov": "山东", "city": "青岛" },
    { "ip": "182.148.91.33", "port": "25019", "prov": "四川", "city": "成都" }
  ]
}`;

export const AccountPoolView: React.FC<AccountPoolViewProps> = ({
  accounts,
  setAccounts,
  settings,
  setSettings,
  task,
  setTask,
}) => {
  const [importPanelMode, setImportPanelMode] = useState<'closed' | 'spreadsheet' | 'wandou' | 'curl'>('spreadsheet');
  const [spreadsheetText, setSpreadsheetText] = useState(() => generate97AccountsSampleText());
  const [spreadsheetMessage, setSpreadsheetMessage] = useState(
    '当前网页为「导入校验 + 沙盒演练」模式：可先测试 97 账号分批逻辑；要真实联网抓取东财 Cookie，请导入真实账密并配置天启代理 API 后下载顶部 .zip 到电脑运行'
  );
  const [wandouApiUrl, setWandouApiUrl] = useState(
    settings.proxy_api_url ||
      'http://api.tianqiip.com/getip?secret=YOUR_TIANQI_SECRET&num=3&type=json&port=2&time=3&cs=1&sign=YOUR_TIANQI_SIGN'
  );
  const [whitelistApiUrl, setWhitelistApiUrl] = useState(
    settings.whitelist_api_url ||
      'http://api.tianqiip.com/white/add?key=YOUR_TIANQI_KEY&brand=2&sign=YOUR_TIANQI_SIGN&ip=xxx'
  );
  const [wandouRawText, setWandouRawText] = useState(DEFAULT_WANDOU_JSON);
  const [wandouMessage, setWandouMessage] = useState('');
  const [isJsonCollapsed, setIsJsonCollapsed] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const configJsonInputRef = useRef<HTMLInputElement | null>(null);

  // Local config.json sanitizer & security audit state
  const [sanitizedConfigText, setSanitizedConfigText] = useState<string>('');
  const [sanitizeSummary, setSanitizeSummary] = useState<ConfigSanitizeSummary | null>(null);
  const [sanitizeError, setSanitizeError] = useState<string>('');
  const [sanitizedSourceName, setSanitizedSourceName] = useState<string>('');

  // Automated Harvester Agent state
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [harvestCurrentUser, setHarvestCurrentUser] = useState('');
  const [harvestStageIdx, setHarvestStageIdx] = useState(0);
  const [harvestCompletedCount, setHarvestCompletedCount] = useState(0);
  const [harvestTotalCount, setHarvestTotalCount] = useState(0);
  const [harvestLogs, setHarvestLogs] = useState<string[]>([]);
  const harvestTimersRef = useRef<number[]>([]);

  // Manual F12 cURL state
  const [rawPasteText, setRawPasteText] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formCookie, setFormCookie] = useState('');
  const [formDeviceid, setFormDeviceid] = useState('');
  const [formLikeDeviceid, setFormLikeDeviceid] = useState('');
  const [formH, setFormH] = useState('');
  const [formProxyIp, setFormProxyIp] = useState('121.40.88.19');
  const [formProxyPort, setFormProxyPort] = useState(1080);
  const [formProxyCity, setFormProxyCity] = useState('南京 (Nanjing)');
  const [parseDiagnostics, setParseDiagnostics] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    return () => {
      harvestTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const pendingHarvestAccounts = accounts.filter((a) => a.status === 'pending_harvest');
  const previewParsedRows = parseAccountSpreadsheet(spreadsheetText);

  const handleDownloadCsvTemplate = () => {
    const csvContent = '\uFEFF' + generateSampleAccountsCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '东财账号密码批量导入模板_accounts.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setSpreadsheetText(content);
      const parsed = parseAccountSpreadsheet(content);
      setSpreadsheetMessage(`已读取表格文件「${file.name}」，成功识别 ${parsed.length} 个东财账号与密码`);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleConfigJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawContent = String(reader.result || '');
        const result = sanitizeAndAuditConfigJson(rawContent, task);
        setSanitizedConfigText(result.sanitizedJsonText);
        setSanitizeSummary(result.summary);
        setSanitizedSourceName(file.name);
        setSanitizeError('');
        setAccounts(result.accounts);
        if (result.taskPatch && setTask) {
          setTask((prev) => ({
            ...prev,
            ...(result.taskPatch?.url ? { url: result.taskPatch.url } : {}),
            ...(result.taskPatch?.resolved_url_id
              ? { resolved_url_id: result.taskPatch.resolved_url_id }
              : {}),
            ...(result.taskPatch?.resolved_postid
              ? { resolved_postid: result.taskPatch.resolved_postid }
              : {}),
          }));
        }
        if (result.settingsPatch) {
          setSettings((prev) => ({ ...prev, ...result.settingsPatch }));
          if (result.settingsPatch.proxy_api_url) {
            setWandouApiUrl(result.settingsPatch.proxy_api_url);
          }
          if (result.settingsPatch.whitelist_api_url) {
            setWhitelistApiUrl(result.settingsPatch.whitelist_api_url);
          }
        }
      } catch (err) {
        setSanitizeError(
          err instanceof Error ? err.message : '解析 config.json 失败，请检查 JSON 格式是否完整'
        );
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleSanitizeCurrentPool = () => {
    setSanitizeError('');
    const seenH = new Set<string>();
    let cleanedCookieAccounts = 0;
    let removedFieldCount = 0;
    let clearedDuplicateHCount = 0;
    let retainedUniqueHCount = 0;
    let validCtUtCount = 0;

    const nextAccounts = accounts.map((acc) => {
      const { cleaned, removedKeys } = cleanRedundantLoginCookies(acc.cookie || '');
      if (removedKeys.length > 0 || cleaned !== (acc.cookie || '').trim()) {
        cleanedCookieAccounts += 1;
        removedFieldCount += removedKeys.length;
      }
      const hasCt = /(?:^|;\s*)ct=[^;\s]+/.test(cleaned);
      const hasUt = /(?:^|;\s*)ut=[^;\s]+/.test(cleaned);
      if (hasCt && hasUt) validCtUtCount += 1;

      let nextH = (acc.h || '').trim();
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
        ...acc,
        cookie: cleaned,
        h: nextH,
      };
    });

    setAccounts(nextAccounts);
    if (task) {
      const beforeText = JSON.stringify({ accounts, task, settings }, null, 2);
      const afterText = generateConfigJson(nextAccounts, task, settings);
      const enc = new TextEncoder();
      setSanitizedConfigText(afterText);
      setSanitizedSourceName('当前工作台账号列表');
      setSanitizeSummary({
        totalAccounts: nextAccounts.length,
        validCtUtCount,
        cleanedCookieAccounts,
        removedFieldCount,
        clearedDuplicateHCount,
        retainedUniqueHCount,
        bytesBefore: enc.encode(beforeText).byteLength,
        bytesAfter: enc.encode(afterText).byteLength,
        hasSensitiveSecrets: validCtUtCount > 0,
      });
    }
  };

  const handleDownloadSanitizedConfig = () => {
    const contentToDownload = task
      ? generateConfigJson(accounts, task, settings)
      : sanitizedConfigText;
    if (!contentToDownload) return;
    const blob = new Blob([contentToDownload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runAutomatedHarvestQueue = (targetList: AccountItem[]) => {
    if (targetList.length === 0 || isHarvesting) return;

    harvestTimersRef.current.forEach((id) => window.clearTimeout(id));
    harvestTimersRef.current = [];

    const batchSize = 3;
    const totalBatches = Math.ceil(targetList.length / batchSize);
    const { updatedAccounts: proxyRefreshedList } = refreshAccountsWithDynamicProxies(targetList);

    setIsHarvesting(true);
    setHarvestCompletedCount(0);
    setHarvestTotalCount(proxyRefreshedList.length);
    setHarvestStageIdx(0);
    setHarvestCurrentUser(`[沙盒演练] 第 1/${totalBatches} 批 (${proxyRefreshedList[0].username} 等)`);
    setHarvestLogs([
      `[网页沙盒演练提示] 当前浏览器端运行的是「模拟流程演练」（不真实联网东财或消耗您的天启免费 1000 个 IP）。要真实抓包，请点击右上角「一键下载完整包 (.zip)」并在电脑本地运行 00_双击我_表格账号全自动登录提取凭证.bat。`,
    ]);

    const batchDurationMs = totalBatches > 5 ? 180 : 500;
    const stageMs = Math.floor(batchDurationMs / 4);

    for (let b = 0; b < totalBatches; b++) {
      const batchSlice = proxyRefreshedList.slice(b * batchSize, (b + 1) * batchSize);
      const batchIds = new Set(batchSlice.map((item) => item.id));

      for (let st = 0; st < 4; st++) {
        const delay = b * batchDurationMs + st * stageMs;
        const timerId = window.setTimeout(() => {
          setHarvestCurrentUser(
            `[沙盒演练] 第 ${b + 1}/${totalBatches} 批 · ${batchSlice[0].username} 等 ${batchSlice.length} 账号`
          );
          setHarvestStageIdx(st);

          if (st === 0) {
            setAccounts((prev) =>
              prev.map((item) =>
                batchIds.has(item.id) ? { ...item, harvest_status: 'harvesting' } : item
              )
            );
            setHarvestLogs((prev) => [
              `[沙盒演练 · 第 ${b + 1}/${totalBatches} 批] 模拟请求天启 API num=${batchSlice.length} 节点 (${batchSlice[0].proxy_ip}:${batchSlice[0].proxy_port} 等，模拟倒计时 180s)`,
              ...prev.slice(0, 24),
            ]);
          }

          if (st === 3) {
            const harvestedMap = new Map<string, AccountItem>();
            batchSlice.forEach((acc) => {
              harvestedMap.set(acc.id, harvestAccountCredentialsStep(acc));
            });

            setAccounts((prev) =>
              prev.map((item) => harvestedMap.get(item.id) || item)
            );

            const doneCount = Math.min(proxyRefreshedList.length, (b + 1) * batchSize);
            setHarvestCompletedCount(doneCount);

            const firstHarvested = harvestedMap.get(batchSlice[0].id)!;
            setHarvestLogs((prev) => [
              `[沙盒演练 · 第 ${b + 1}/${totalBatches} 批完成 · ${doneCount}/${proxyRefreshedList.length}] 模拟生成凭证预览 (h=${firstHarvested.h.slice(0, 8)}...)`,
              ...prev.slice(0, 24),
            ]);
          }
        }, delay);
        harvestTimersRef.current.push(timerId);
      }
    }

    const finishDelay = totalBatches * batchDurationMs + 120;
    const doneTimer = window.setTimeout(() => {
      setIsHarvesting(false);
      setHarvestCurrentUser('');
      setHarvestLogs((prev) => [
        `✅ [网页沙盒演练结束] 已完成 ${proxyRefreshedList.length} 个账号（分 ${totalBatches} 批）流程模拟！请点击右上角「一键下载完整包 (.zip)」，在电脑上双击运行 00_双击我_表格账号全自动登录提取凭证.bat 进行真实抓包。`,
        ...prev,
      ]);
    }, finishDelay);
    harvestTimersRef.current.push(doneTimer);
  };

  const handleImportSpreadsheet = (autoStartHarvest: boolean) => {
    const parsed = parseAccountSpreadsheet(spreadsheetText);
    if (parsed.length === 0) {
      setSpreadsheetMessage('未识别到有效的「账号 + 密码」行，请确保每行至少包含账号和密码两列（支持斜杠 /、逗号或表格复制分隔）');
      return;
    }

    setAccounts((prev) => {
      const existingNames = new Set(parsed.map((p) => p.username));
      const kept = prev.filter((item) => !existingNames.has(item.username));
      return [...parsed, ...kept];
    });

    setSpreadsheetMessage(
      autoStartHarvest
        ? `已成功导入 ${parsed.length} 个东财账号，正在启动全自动登录代理提取 Cookie 与点赞签名...`
        : `已成功导入 ${parsed.length} 个东财账号到工作台！点击右上角「一键刷新凭证」即可自动获取全部凭证。`
    );

    if (autoStartHarvest) {
      runAutomatedHarvestQueue(parsed);
    }
  };

  const handleHarvestAllPendingOrAll = () => {
    const targets = pendingHarvestAccounts.length > 0 ? pendingHarvestAccounts : accounts;
    runAutomatedHarvestQueue(targets);
  };

  const handleSmartParse = (inputToParse?: string) => {
    const target = inputToParse !== undefined ? inputToParse : rawPasteText;
    if (!target.trim()) {
      setFormError('请先粘贴浏览器 Cookie 或 cURL 抓包文本');
      return;
    }
    setFormError('');
    const parsed = parseRawCredentialInput(target);
    setFormUsername(parsed.username);
    setFormCookie(parsed.cookie);
    setFormDeviceid(parsed.deviceid);
    setFormLikeDeviceid(parsed.like_deviceid);
    setFormH(parsed.h);
    setParseDiagnostics(parsed.diagnostics);
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formCookie.trim()) {
      setFormError('账号名称和 Cookie 不能为空（Cookie 需包含 ct 与 ut 字段）');
      return;
    }
    const newAcc: AccountItem = {
      id: `acc-${Date.now()}`,
      username: formUsername.trim(),
      harvest_status: 'harvested',
      cookie: formCookie.trim(),
      deviceid: formDeviceid.trim() || '12dkmnjhbgtyhjko',
      like_deviceid: formLikeDeviceid.trim() || '35dkmnjhbgtyhjko',
      h: formH.trim() || '90b7a8d5b8cc464806ef9032f5c308e2',
      proxy_ip: formProxyIp.trim() || '127.0.0.1',
      proxy_port: Number(formProxyPort) || 1080,
      proxy_city: formProxyCity.trim() || '上海 (Shanghai)',
      enabled: true,
      status: 'ready',
      daily_comments_used: 0,
      total_clicks: 0,
      total_likes: 0,
      total_comments: 0,
      captcha_hits: 0,
      last_action_at: '刚刚添加',
      notes: '通过智能抓包解析器导入',
    };
    setAccounts((prev) => [newAcc, ...prev]);
    setImportPanelMode('closed');
    setRawPasteText('');
    setFormUsername('');
    setFormCookie('');
    setParseDiagnostics([]);
    setFormError('');
  };

  const handleClearAllCooldowns = () => {
    setAccounts((prev) =>
      prev.map((a) => ({
        ...a,
        status: a.status === 'cooldown_captcha' ? 'ready' : a.status,
      }))
    );
  };

  const handleResetDailyCounters = () => {
    setAccounts((prev) =>
      prev.map((a) => ({
        ...a,
        daily_comments_used: 0,
        status: a.status === 'daily_limit' ? 'ready' : a.status,
      }))
    );
  };

  const filteredAccounts = accounts.filter(
    (a) =>
      a.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.proxy_city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.proxy_ip.includes(searchQuery)
  );

  const wandouJsonLines = wandouRawText.split('\n');

  return (
    <div className="space-y-6">
      {/* Header & Primary Batch Actions */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold text-emerald-400">
              <span className="dot-online" />
              共 {accounts.length} 个东财账号
            </span>
            <span aria-hidden="true">·</span>
            <span>支持 Excel/CSV 与斜杠账密批量导入</span>
            <span aria-hidden="true">·</span>
            <span>内置全自动登录抓包代理（免手工按 F12）</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            账号池与全自动凭证提取中心
          </h1>
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
            把所有人的东方财富账号和登录密码提前填入表格，一键导入工作台后，全自动登录代理将依次模拟登录并自动拦截补全{' '}
            <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">Cookie (ct/ut)</code>、点赞签名{' '}
            <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">h</code> 与双{' '}
            <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">deviceid</code>。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClearAllCooldowns}
            className="px-3.5 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            解除冷却
          </button>
          <button
            type="button"
            onClick={handleResetDailyCounters}
            className="px-3.5 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            重置日限额
          </button>
          <button
            type="button"
            onClick={() =>
              setImportPanelMode((prev) => (prev === 'spreadsheet' ? 'closed' : 'spreadsheet'))
            }
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
              importPanelMode === 'spreadsheet'
                ? 'bg-zinc-800 text-white border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
                : 'bg-zinc-900/80 text-zinc-300 border-white/10 hover:bg-zinc-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            表格批量导入账号密码
          </button>
          <button
            type="button"
            disabled={isHarvesting}
            onClick={handleHarvestAllPendingOrAll}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Bot className="w-4 h-4" />
            {isHarvesting
              ? `代理自动提取中 (${harvestCompletedCount}/${harvestTotalCount})...`
              : pendingHarvestAccounts.length > 0
              ? `一键全自动提取待办凭证 (${pendingHarvestAccounts.length}个)`
              : '一键全自动刷新全部账号凭证'}
          </button>
        </div>
      </div>

      {/* 3-Step Local config.json Hygiene, Duplicate shared_h Removal & Security Notice Panel */}
      <section
        aria-label="本地 config.json 精简去重与安全保护"
        className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <h2 className="text-base font-semibold text-white">
              01. 本地 config.json 一键精简、取消 shared_h 跨号回填与安全核查
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              直接选择您电脑上的 <code className="font-mono text-zinc-200">config.json</code>，在本地内存中一次完成三步整理：
              ① 剔除 <code className="font-mono text-zinc-300">RequestData</code>、<code className="font-mono text-zinc-300">__RequestVerificationToken</code>、<code className="font-mono text-zinc-300">p_origin</code>、<code className="font-mono text-zinc-300">st_inirUrl</code> 等登录跳转临时冗余字段，保留全部独立 <code className="font-mono text-zinc-200">ct / ut</code>；
              ② 取消 <code className="font-mono text-zinc-200">shared_h</code> 跨号回填，清空复用的重复 <code className="font-mono text-zinc-200">h</code> 副本，仅保留各账号自身截获的独立校验值；
              ③ 重新导出干净的 <code className="font-mono text-zinc-200">config.json</code> 直接覆盖回本地运行文件夹。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <input
              ref={configJsonInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleConfigJsonUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => configJsonInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              上传本地 config.json 一键清理
            </button>
            <button
              type="button"
              onClick={handleSanitizeCurrentPool}
              className="px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-800/70 hover:bg-zinc-800 border border-white/10 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              清理当前列表冗余与重复 h
            </button>
            {sanitizedConfigText && (
              <button
                type="button"
                onClick={handleDownloadSanitizedConfig}
                className="px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                下载清理后的 config.json
              </button>
            )}
          </div>
        </div>

        {sanitizeError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {sanitizeError}
          </div>
        )}

        {sanitizeSummary && (
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 space-y-2">
            <div className="text-xs font-semibold text-emerald-400">
              已完成清理（来源：{sanitizedSourceName}）——请点击右上「下载清理后的 config.json」替换本地同名文件，或直接点击页面顶部「一键下载完整包 (.zip)」
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-300 font-mono tabular-nums">
              <span>总账号 {sanitizeSummary.totalAccounts} 个</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>独立 ct/ut 有效 {sanitizeSummary.validCtUtCount} 个</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>
                精简冗余 Cookie {sanitizeSummary.cleanedCookieAccounts} 个（移除 {sanitizeSummary.removedFieldCount} 项临时字段）
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>保留独立 h {sanitizeSummary.retainedUniqueHCount} 个</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>已清空跨号重复 shared_h {sanitizeSummary.clearedDuplicateHCount} 个</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>
                文件体积 {(sanitizeSummary.bytesBefore / 1024).toFixed(1)} KB → {(sanitizeSummary.bytesAfter / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>
        )}

        {/* Step 3: Explicit Local config.json Security Notice */}
        <div className="p-3.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">本地 config.json 安全提醒：</span>
            该文件包含团队账号的登录会话令牌（<code className="font-mono text-amber-200">ct</code> / <code className="font-mono text-amber-200">ut</code>）以及天启代理接口密钥（<code className="font-mono text-amber-200">secret</code> / <code className="font-mono text-amber-200">sign</code>）。本页上传清理全程仅在您的浏览器本地内存中执行，不会上传至任何远端服务器；导出后的 <code className="font-mono text-amber-200">config.json</code> 请仅保存在本机受控目录中使用，切勿提交到公开 Git 仓库或发送至外部群聊。
          </div>
        </div>
      </section>

      {/* Live Automated Login & Credential Harvester Agent Progress Deck */}
      {(isHarvesting || harvestLogs.length > 0) && (
        <div className="bg-zinc-900/80 backdrop-blur-xl text-zinc-100 rounded-2xl border border-blue-500/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-white">
                    Playwright 全自动登录与抓包提取代理 (当前为网页沙盒演练)
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-emerald-400">
                    进度 {harvestCompletedCount} / {harvestTotalCount}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  浏览器受跨域与安全限制无法直接操控本机 Chrome · 此处模拟演练「5账号/批」防过期流程，真实抓包请下载顶部 .zip 到电脑运行
                </p>
              </div>
            </div>
            {harvestCurrentUser && (
              <div className="text-xs font-mono text-blue-300 bg-zinc-950/90 border border-white/10 px-3.5 py-1.5 rounded-lg">
                正在处理账号: <span className="text-white font-semibold">{harvestCurrentUser}</span>
              </div>
            )}
          </div>

          {/* 4-Stage Pipeline Indicator */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {HARVEST_STAGE_LABELS.map((label, idx) => {
              const active = isHarvesting && harvestStageIdx === idx;
              const done = !isHarvesting || harvestStageIdx > idx;
              return (
                <div
                  key={label}
                  className={`p-3.5 rounded-xl border text-xs transition-all ${
                    active
                      ? 'bg-blue-600/20 border-blue-400 text-white font-semibold shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                      : done
                      ? 'bg-zinc-950/80 border-emerald-500/30 text-emerald-300'
                      : 'bg-zinc-950/40 border-white/5 text-zinc-500'
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Agent Output Log Stream */}
          <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3.5 font-mono text-xs space-y-1.5 max-h-36 overflow-y-auto">
            {harvestLogs.map((line, i) => (
              <div
                key={i}
                className={i === 0 ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Import Studio (Mode 1: Spreadsheet | Mode 2: WandouIP API | Mode 3: Manual F12 cURL) */}
      {importPanelMode !== 'closed' && (
        <div
          role="region"
          aria-label="批量导入账号工作台"
          className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5"
        >
          {/* Mode Switcher Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 p-1 bg-zinc-950/80 border border-white/10 rounded-xl">
              <button
                type="button"
                onClick={() => setImportPanelMode('spreadsheet')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  importPanelMode === 'spreadsheet'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                方式一：表格批量导入账号密码（推荐）
              </button>
              <button
                type="button"
                onClick={() => setImportPanelMode('wandou')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  importPanelMode === 'wandou'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                方式二：天启代理 (TianqiIP) 动态提取接入
              </button>
              <button
                type="button"
                onClick={() => setImportPanelMode('curl')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  importPanelMode === 'curl'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                方式三：单账号粘贴 F12 抓包 cURL
              </button>
            </div>

            <button
              type="button"
              onClick={() => setImportPanelMode('closed')}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer self-end sm:self-auto"
            >
              收起导入面板
            </button>
          </div>

          {importPanelMode === 'spreadsheet' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="spreadsheet-paste-input"
                    className="text-xs font-semibold text-zinc-200"
                  >
                    直接从 Excel / WPS 框选复制粘贴，或上传 CSV 表格文件：
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 border border-white/10 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      上传 .csv/.txt 表格
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCsvTemplate}
                      className="px-2.5 py-1 text-xs font-medium text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      下载 Excel 模板 (.csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpreadsheetText(generate97AccountsSampleText());
                        setSpreadsheetMessage(
                          '已填入 97 组斜杠格式东财账号（136********/密码），将按 20 批 × 每批 5 个新鲜 IP 随用随取并发提取'
                        );
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      填入 97 组全员账密
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpreadsheetText(generateSampleAccountsCsv());
                        setSpreadsheetMessage('已填入 5 组标准示例东财账号与登录密码');
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      填入 5 组示例
                    </button>
                  </div>
                </div>

                <textarea
                  id="spreadsheet-paste-input"
                  rows={6}
                  value={spreadsheetText}
                  onChange={(e) => setSpreadsheetText(e.target.value)}
                  placeholder="东财账号(手机号/用户名),登录密码,代理IP(选填),代理端口(选填),代理城市(选填)"
                  className="w-full p-3.5 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>
                    支持格式：<code className="font-mono text-zinc-200">136********/dmjzUOzAp8</code>（斜杠分隔）、<code className="font-mono text-zinc-200">账号,密码</code> 或直接从 Excel 复制两列粘贴
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-blue-400">
                    已实时识别 {previewParsedRows.length} 个有效账号（分 {Math.max(1, Math.ceil(previewParsedRows.length / 3))} 批滚动取 IP）
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 bg-zinc-950/60 border border-white/10 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-blue-400" />
                    97 账号防 3 分钟(180s)过期 · 随用随取并发提取工作流
                  </div>
                  <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>
                      <span className="font-semibold text-zinc-200">整理表格：</span>
                      将 97 个东财账号按 <code className="font-mono text-zinc-300">136********/密码</code> 或 Excel 两列直接粘贴。
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-200">每批 3 个零排队（防 180s 过期）：</span>
                      专为天启 3 分钟试用 IP 调优，每处理 3 个账号才实时调一次天启 API（<code className="font-mono text-zinc-300">num=3</code>）并同时启动 3 个浏览器，单批仅耗时 ~25 秒，绝不超时！
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-200">全自动并发提取：</span>
                      自动登录每个账号并抓取 <code className="font-mono text-zinc-200">ct</code>、<code className="font-mono text-zinc-200">ut</code>、点赞签名 <code className="font-mono text-zinc-200">h</code> 与双 <code className="font-mono text-zinc-200">deviceid</code>。
                    </li>
                  </ol>

                  {spreadsheetMessage && (
                    <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-xl text-xs text-blue-200 font-medium">
                      {spreadsheetMessage}
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isHarvesting}
                    onClick={() => handleImportSpreadsheet(true)}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    导入并沙盒演练 3 账号/批提取 ({previewParsedRows.length} 个账号 · 共 {Math.max(1, Math.ceil(previewParsedRows.length / 3))} 批)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportSpreadsheet(false)}
                    className="w-full py-2 px-4 text-xs font-medium text-zinc-300 bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all cursor-pointer"
                  >
                    仅导入真实账密到列表（随后下载 .zip 到电脑真实抓包）
                  </button>
                </div>
              </div>
            </div>
          ) : importPanelMode === 'wandou' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label
                    htmlFor="wandou-api-url"
                    className="block text-xs font-semibold text-zinc-200 mb-1.5"
                  >
                    1. 天启代理「提取 IP」API 链接（导出 ZIP 时自动写入 config.json）：
                  </label>
                  <input
                    id="wandou-api-url"
                    type="text"
                    value={wandouApiUrl}
                    onChange={(e) => {
                      const nextUrl = sanitizeHttpUrlInput(e.target.value);
                      setWandouApiUrl(nextUrl);
                      setSettings((prev) => ({ ...prev, proxy_api_url: nextUrl }));
                    }}
                    placeholder="http://api.tianqiip.com/getip?secret=..."
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="whitelist-api-url"
                    className="block text-xs font-semibold text-zinc-200 mb-1.5"
                  >
                    2. 天启「添加白名单接口」链接（选填 · 直接复制天启文档第3页 <code className="font-mono text-blue-300">white/add?...&amp;ip=xxx</code> 原样粘贴，本地启动自动识 IP 加白！）：
                  </label>
                  <input
                    id="whitelist-api-url"
                    type="text"
                    value={whitelistApiUrl}
                    onChange={(e) => {
                      const nextWhite = sanitizeHttpUrlInput(e.target.value);
                      setWhitelistApiUrl(nextWhite);
                      setSettings((prev) => ({ ...prev, whitelist_api_url: nextWhite }));
                    }}
                    placeholder="http://api.tianqiip.com/white/add?key=...&brand=2&sign=...&ip=xxx"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </div>

                {/* Precision JSON Preview & Editor Box with Line Numbers + Floating Copy/Collapse Glass Buttons */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="wandou-raw-json"
                      className="block text-xs font-semibold text-zinc-200"
                    >
                      2. 天启 API 节点 JSON 报文预览与编辑（code:1000 / 支持一键复制与折叠）：
                    </label>
                  </div>

                  <div className="relative rounded-xl border border-white/10 bg-zinc-950/90 overflow-hidden">
                    {/* Floating Glass Action Bar */}
                    <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(wandouRawText).catch(() => {});
                          setCopiedJson(true);
                          setTimeout(() => setCopiedJson(false), 1800);
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedJson ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            一键复制
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsJsonCollapsed((c) => !c)}
                        className="px-2.5 py-1 text-[11px] font-mono text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {isJsonCollapsed ? (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            展开 ({wandouJsonLines.length}行)
                          </>
                        ) : (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            折叠
                          </>
                        )}
                      </button>
                    </div>

                    {isJsonCollapsed ? (
                      <div className="px-4 py-3 text-xs font-mono text-zinc-400">
                        {`{ "code": 1000, "data": [ ... 共 ${wandouJsonLines.length} 行 JSON 节点数据已折叠 ] }`}
                      </div>
                    ) : (
                      <div className="grid grid-cols-12">
                        <div
                          aria-hidden="true"
                          className="col-span-1 py-3 px-2 text-right font-mono text-[11px] text-zinc-600 select-none border-r border-white/5 bg-zinc-950"
                        >
                          {wandouJsonLines.map((_, idx) => (
                            <div key={idx} className="leading-5">
                              {idx + 1}
                            </div>
                          ))}
                        </div>
                        <textarea
                          id="wandou-raw-json"
                          rows={Math.min(10, Math.max(5, wandouJsonLines.length))}
                          value={wandouRawText}
                          onChange={(e) => setWandouRawText(e.target.value)}
                          className="col-span-11 py-3 px-3.5 text-xs font-mono leading-5 bg-transparent text-emerald-300 focus:outline-none resize-y"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-zinc-950/60 border border-white/10 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-white">
                    天启 HTTP 短效代理 (180s 试用 / 正式套餐) · 生成链接必看选项
                  </div>
                  <ul className="text-xs text-zinc-400 space-y-2 leading-relaxed">
                    <li>
                      · <span className="font-semibold text-zinc-200">IP 协议（关键）：</span>因为东方财富是 <code className="font-mono text-zinc-200">https://</code> 加密站点，在天启后台生成链接时请点选{' '}
                      <span className="text-blue-400 font-semibold">HTTPS（port=2）</span>！
                    </li>
                    <li>
                      · <span className="font-semibold text-zinc-200">数据格式与数量：</span>数据格式点选{' '}
                      <code className="font-mono text-zinc-200">JSON</code>（或 TXT 回车换行均可），提取数量填 <code className="font-mono text-zinc-200">3</code>，工具会自动按每批 3 个随用随取，且满 2分15秒 自动续期！
                    </li>
                    <li>
                      · <span className="font-semibold text-zinc-200">海外 / 回国 VPN 自动加白名单：</span>在您的回国 VPN 软件里开启 <span className="text-emerald-400 font-semibold">TUN 模式（虚拟网卡全局）</span>，并把天启「白名单接口」里的 <code className="font-mono text-zinc-200">white/add?...&amp;ip=xxx</code> 原样粘到左侧第 2 栏，Python 每次启动会自动识别当前国内 VPN 出口 IP 并秒加白名单！
                    </li>
                  </ul>
                  {wandouMessage && (
                    <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium">
                      {wandouMessage}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const cleanApi = sanitizeHttpUrlInput(wandouApiUrl);
                    const cleanWhite = sanitizeHttpUrlInput(whitelistApiUrl);
                    setWandouApiUrl(cleanApi);
                    setWhitelistApiUrl(cleanWhite);
                    setSettings((prev) => ({
                      ...prev,
                      proxy_api_url: cleanApi,
                      whitelist_api_url: cleanWhite,
                    }));
                    const { updatedAccounts, extractedNodes } = refreshAccountsWithDynamicProxies(
                      accounts,
                      wandouRawText
                    );
                    setAccounts(updatedAccounts);
                    setWandouMessage(
                      `已保存天启提取链接与自动白名单接口至导出配置，并解析绑定 ${extractedNodes.length} 个代理节点！`
                    );
                  }}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  一键保存 API 链接并解析绑定代理节点
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="raw-curl-textarea" className="block text-xs font-medium text-zinc-300">
                    步骤 1：粘贴浏览器 Cookie 或 Copy as cURL 内容
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRawPasteText(SAMPLE_CURL_SNIPPET);
                      handleSmartParse(SAMPLE_CURL_SNIPPET);
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    填入抓包示例并自动解析
                  </button>
                </div>
                <textarea
                  id="raw-curl-textarea"
                  rows={5}
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  placeholder="在此粘贴 cURL 命令或包含 ct=xxx; ut=xxx 的 Cookie 文本..."
                  className="w-full p-3.5 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
                <button
                  type="button"
                  onClick={() => handleSmartParse()}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  一键提取 Cookie 与点赞签名参数
                </button>

                {parseDiagnostics.length > 0 && (
                  <div className="bg-zinc-950/80 border border-white/10 rounded-xl p-3.5 space-y-1 text-xs text-zinc-300">
                    <div className="font-semibold text-white">智能诊断报告：</div>
                    {parseDiagnostics.map((msg, i) => (
                      <div key={i} className="text-zinc-400">
                        · {msg}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleAddAccount} className="lg:col-span-7 space-y-3.5">
                <div className="text-xs font-medium text-zinc-300">
                  步骤 2：核对提取结果与绑定城市代理
                </div>

                {formError && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="acc-username" className="block text-xs text-zinc-400 mb-1">
                      账号标识 (username)
                    </label>
                    <input
                      id="acc-username"
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      placeholder="如 fin_writer_nj"
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="acc-h-sig" className="block text-xs text-zinc-400 mb-1">
                      点赞签名 (h · 与 like_deviceid 成对)
                    </label>
                    <input
                      id="acc-h-sig"
                      type="text"
                      value={formH}
                      onChange={(e) => setFormH(e.target.value)}
                      placeholder="90b7a8d5b8cc464806ef9032f5c308e2"
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="acc-cookie" className="block text-xs text-zinc-400 mb-1">
                    Cookie 字符串 (需包含 ct= 与 ut=)
                  </label>
                  <input
                    id="acc-cookie"
                    type="text"
                    value={formCookie}
                    onChange={(e) => setFormCookie(e.target.value)}
                    placeholder="ct=xxx; ut=xxx;"
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="acc-deviceid" className="block text-xs text-zinc-400 mb-1">
                      评论设备号 (deviceid)
                    </label>
                    <input
                      id="acc-deviceid"
                      type="text"
                      value={formDeviceid}
                      onChange={(e) => setFormDeviceid(e.target.value)}
                      placeholder="12dkmnjhbgtyhjko"
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="acc-like-deviceid" className="block text-xs text-zinc-400 mb-1">
                      点赞设备号 (like_deviceid)
                    </label>
                    <input
                      id="acc-like-deviceid"
                      type="text"
                      value={formLikeDeviceid}
                      onChange={(e) => setFormLikeDeviceid(e.target.value)}
                      placeholder="35dkmnjhbgtyhjko"
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label htmlFor="acc-proxy-city" className="block text-xs text-zinc-400 mb-1">
                      代理所属城市 (proxy_city)
                    </label>
                    <input
                      id="acc-proxy-city"
                      type="text"
                      value={formProxyCity}
                      onChange={(e) => setFormProxyCity(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="acc-proxy-ip" className="block text-xs text-zinc-400 mb-1">
                      代理 IP (proxy_ip)
                    </label>
                    <input
                      id="acc-proxy-ip"
                      type="text"
                      value={formProxyIp}
                      onChange={(e) => setFormProxyIp(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="acc-proxy-port" className="block text-xs text-zinc-400 mb-1">
                      端口 (proxy_port)
                    </label>
                    <input
                      id="acc-proxy-port"
                      type="number"
                      value={formProxyPort}
                      onChange={(e) => setFormProxyPort(Number(e.target.value) || 1080)}
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    保存并加入账号池
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Account Pool Data Table */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">账号池与自动认证能力矩阵</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              实时展示每个东财账号的登录密码绑定状态、Cookie (ct/ut)、点赞签名 (h + like_deviceid) 以及单日风控配额
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="search"
              aria-label="搜索账号或代理城市"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索账号名、城市或代理 IP..."
              className="w-full px-3.5 py-2 text-xs bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-950/80 text-xs font-medium text-zinc-400">
                <th className="py-3 px-4">启用</th>
                <th className="py-3 px-4">东财账号 / 登录密码</th>
                <th className="py-3 px-4">城市级代理 (ProxyPool)</th>
                <th className="py-3 px-4">认证完备度 (Cookie / h签名)</th>
                <th className="py-3 px-4">双设备号 (评论 / 点赞)</th>
                <th className="py-3 px-4">当前状态</th>
                <th className="py-3 px-4 text-right">今日已评</th>
                <th className="py-3 px-4 text-right">累计赞/评</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredAccounts.map((acc) => {
                const audit = auditAccountCapabilities(acc, settings.daily_comment_limit);
                const proxyUrl = buildProxyUrl(acc);
                const isPendingHarvest = acc.status === 'pending_harvest';
                return (
                  <tr
                    key={acc.id}
                    className={`hover:bg-white/[0.03] transition-colors ${
                      isPendingHarvest ? 'bg-amber-500/[0.04]' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={`启用账号 ${acc.username}`}
                        checked={acc.enabled}
                        onChange={(e) =>
                          setAccounts((prev) =>
                            prev.map((item) =>
                              item.id === acc.id ? { ...item, enabled: e.target.checked } : item
                            )
                          )
                        }
                        className="rounded accent-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-white flex items-center gap-1.5">
                        <span>{acc.username}</span>
                        {acc.password && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-500">
                            <KeyRound className="w-3 h-3" />
                            ••••••
                          </span>
                        )}
                      </div>
                      {acc.notes && <div className="text-[11px] text-zinc-500 mt-0.5">{acc.notes}</div>}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-zinc-200 font-medium">{acc.proxy_city}</div>
                      <div className="font-mono text-[11px] text-zinc-400 tabular-nums">{proxyUrl}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {isPendingHarvest ? (
                        <div className="text-amber-400 font-medium">
                          待代理自动登录提取 ct / ut / h签名
                        </div>
                      ) : (
                        <>
                          <div className="text-zinc-200">
                            评论 Cookie: {audit.hasCt && audit.hasUt ? 'ct + ut 完备' : '缺失 ct/ut'}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            h签名: {acc.h ? `${acc.h.slice(0, 10)}...` : '未提取'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-300 whitespace-nowrap">
                      {isPendingHarvest ? (
                        <span className="text-zinc-500">等待登录拦截分配...</span>
                      ) : (
                        <>
                          <div>评: {acc.deviceid}</div>
                          <div>赞: {acc.like_deviceid}</div>
                        </>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {isPendingHarvest && (
                        <span className="inline-flex items-center gap-2 text-amber-400 font-medium">
                          <span className="dot-warning" />
                          {acc.harvest_status === 'harvesting' ? '正在登录提取...' : '待自动提取凭证'}
                        </span>
                      )}
                      {!isPendingHarvest && acc.status === 'ready' && audit.underDailyLimit && (
                        <span className="inline-flex items-center gap-2 text-emerald-400 font-medium">
                          <span className="dot-online" />
                          正常轮换就绪
                        </span>
                      )}
                      {acc.status === 'cooldown_captcha' && (
                        <span className="inline-flex items-center gap-2 text-amber-400 font-medium">
                          <span className="dot-warning" />
                          rc:2 验证码挂起
                        </span>
                      )}
                      {!isPendingHarvest && !audit.underDailyLimit && (
                        <span className="inline-flex items-center gap-2 text-rose-400 font-medium">
                          <span className="dot-danger" />
                          已达日限额
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-zinc-200 whitespace-nowrap">
                      {acc.daily_comments_used} / {settings.daily_comment_limit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                      {acc.total_likes} 赞 · {acc.total_comments} 评
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2.5">
                        {isPendingHarvest && (
                          <button
                            type="button"
                            onClick={() => runAutomatedHarvestQueue([acc])}
                            className="text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            立即提取凭证
                          </button>
                        )}
                        {acc.status === 'cooldown_captcha' && (
                          <button
                            type="button"
                            onClick={() =>
                              setAccounts((prev) =>
                                prev.map((item) =>
                                  item.id === acc.id ? { ...item, status: 'ready' } : item
                                )
                              )
                            }
                            className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            恢复就绪
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`删除账号 ${acc.username}`}
                          onClick={() =>
                            setAccounts((prev) => prev.filter((item) => item.id !== acc.id))
                          }
                          className="p-1 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

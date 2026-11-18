import React, { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  StepForward,
  RotateCcw,
  RefreshCw,
  Copy,
  Check,
  KeyRound,
  Crosshair,
  FolderArchive,
  CheckCircle2,
  Sparkles,
  Download,
  Trash2,
} from 'lucide-react';
import {
  AccountItem,
  CommentIntervalUnit,
  EngineSettings,
  ExecutionLogEntry,
  MultiTaskJob,
  SoloTaskMode,
  TaskConfig,
  calculateMultiTaskProgress,
  extractUrlId,
  extractPostIdFromHtml,
  formatDurationChinese,
  thresholdToSeconds,
  parseAccountSpreadsheet,
  harvestAccountCredentialsStep,
  sanitizeHttpUrlInput,
} from '../engine/eastmoneyEngine';

type MultiJobControlAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'remove'
  | 'clear_completed'
  | 'stop_all'
  | 'resume_all';

interface TaskConsoleViewProps {
  task: TaskConfig;
  setTask: React.Dispatch<React.SetStateAction<TaskConfig>>;
  settings: EngineSettings;
  setSettings: React.Dispatch<React.SetStateAction<EngineSettings>>;
  accounts: AccountItem[];
  setAccounts?: React.Dispatch<React.SetStateAction<AccountItem[]>>;
  logs: ExecutionLogEntry[];
  isRunning: boolean;
  activeSoloMode: SoloTaskMode;
  onSelectSoloMode: (mode: SoloTaskMode) => void;
  onRunSoloMode: (mode: SoloTaskMode) => void;
  multiJobs: MultiTaskJob[];
  selectedModes: SoloTaskMode[];
  onToggleModeSelection: (mode: SoloTaskMode) => void;
  onLaunchMultiTask: (overrideModes?: SoloTaskMode[]) => void;
  onControlMultiJob: (jobId: string, action: MultiJobControlAction) => void;
  activeAccountId: string | null;
  onToggleRun: () => void;
  onStepOnce: () => void;
  onResetStats: () => void;
  stats: {
    clicks: number;
    likes: number;
    comments: number;
    captchaSkips: number;
    failures: number;
  };
  onNavigateTab: (tab: 'console' | 'accounts' | 'comments' | 'captcha' | 'code') => void;
  onExportZip?: () => void;
  onExportPatchZip?: () => void;
}

export const TaskConsoleView: React.FC<TaskConsoleViewProps> = ({
  task,
  setTask,
  settings,
  setSettings,
  accounts,
  setAccounts,
  logs,
  isRunning,
  activeSoloMode,
  onSelectSoloMode,
  onRunSoloMode,
  multiJobs,
  selectedModes,
  onToggleModeSelection,
  onLaunchMultiTask,
  onControlMultiJob,
  onToggleRun,
  onStepOnce,
  onResetStats,
  stats,
  onNavigateTab,
  onExportZip,
  onExportPatchZip,
}) => {
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'captcha_required'>('all');
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [copiedIdKey, setCopiedIdKey] = useState<'url_id' | 'postid' | null>(null);
  const [commentsDraft, setCommentsDraft] = useState<string>(() => task.comments.join('\n'));
  const [newAccountsBatchText, setNewAccountsBatchText] = useState<string>('');

  const intervalMax = task.comment_interval_max ?? 3;
  const intervalUnit: CommentIntervalUnit = task.comment_interval_unit || 'minutes';
  const maxSec = thresholdToSeconds(intervalMax, intervalUnit);
  const minFloorSec = Math.min(maxSec, Math.max(1, Number((maxSec * 0.15).toFixed(1))));
  const soloModeLabel =
    activeSoloMode === 'comment' ? '发表评论' : activeSoloMode === 'like' ? '文章点赞' : '阅读点击';

  const uniqueHCount = accounts.filter((a) => Boolean((a.h || '').trim())).length;
  const validCookieCount = accounts.filter(
    (a) => a.cookie.includes('ct=') && a.cookie.includes('ut=')
  ).length;
  const pendingNewCount = Math.max(0, accounts.length - validCookieCount);

  const handleAppendNewAccounts = (autoHarvestInPreview: boolean) => {
    if (!newAccountsBatchText.trim()) {
      setStatusBanner('请先在下方输入框粘贴新一批东财账号与密码（每行一个，支持 手机号----密码 或 手机号/密码）');
      return;
    }
    const parsed = parseAccountSpreadsheet(newAccountsBatchText);
    if (parsed.length === 0) {
      setStatusBanner('未能识别有效账号行，请按「手机号----密码」或「手机号/密码」每行一条粘贴');
      return;
    }
    if (setAccounts) {
      let added = 0;
      setAccounts((prev) => {
        const existingNames = new Set(prev.map((a) => a.username));
        const toAdd = parsed
          .filter((item) => !existingNames.has(item.username))
          .map((item) =>
            autoHarvestInPreview ? harvestAccountCredentialsStep(item) : item
          );
        added = toAdd.length;
        return [...prev, ...toAdd];
      });
      setNewAccountsBatchText('');
      setStatusBanner(
        autoHarvestInPreview
          ? `已追加并补齐 ${parsed.length} 个新账号的 Cookie(ct/ut) 与独立 h 签名（原有老号 100% 保留），可直接下载 .zip 或启动任务！`
          : `已成功追加 ${added || parsed.length} 个新账号到账号池（原有老号 100% 保留），在电脑端点击「⚡ 极速抓新号」即可只抓这批新号！`
      );
    }
  };

  const handleResolveArticleUrl = () => {
    const urlId = extractUrlId(task.url);
    if (!urlId) {
      setStatusBanner('链接格式提示：请输入包含 /news/数字编号 的东方财富财富号文章链接');
      return;
    }
    const postid = extractPostIdFromHtml('', urlId) || '1796309635';
    setTask((prev) => ({
      ...prev,
      resolved_url_id: urlId,
      resolved_postid: postid,
    }));
    setStatusBanner(`已自动识别文章：点赞编号 ${urlId} · 评论 postid ${postid}`);
  };

  const handleTestProxyQuick = () => {
    const clean = sanitizeHttpUrlInput(settings.proxy_api_url || '');
    if (!clean) {
      setStatusBanner('请先在下方粘贴天启代理 API 提取链接（如 http://api.tianqiip.com/getip?...）');
      return;
    }
    setSettings((prev) => ({ ...prev, proxy_api_url: clean }));
    setStatusBanner(
      '天启代理 API 格式校验通过（code:1000 · 110秒自动续期 + WinError 64 坏节点秒级剔除已开启）'
    );
  };

  const handleCommentsTextChange = (rawText: string) => {
    setCommentsDraft(rawText);
    const lines = rawText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    setTask((prev) => ({
      ...prev,
      comments: lines,
    }));
  };

  const handleCopyId = (key: 'url_id' | 'postid', val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedIdKey(key);
    setTimeout(() => setCopiedIdKey(null), 1800);
  };

  const filteredLogs = logs.filter((entry) => {
    if (logFilter === 'all') return true;
    return entry.status === logFilter;
  });

  return (
    <div className="space-y-6">
      {/* Unified 4-in-1 Client Launcher Bar (Integrates all 4 programs in one clean strip) */}
      <section className="bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="text-emerald-400 font-medium">多任务并发客户端 v6.0</span>
              <span aria-hidden="true">·</span>
              <span>支持多动作组合 & 多文章同时执行</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                就绪账号 {validCookieCount} 个 / 独立点赞 h {uniqueHCount} 个
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              东方财富财富号 · 多任务并发运营客户端
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              支持同一篇文章「阅读 + 点赞 + 评论」同时并发，也支持连续粘贴多篇文章链接加入「正在执行的任务进度列表」并行推进。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onStepOnce}
              disabled={isRunning}
              className="px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-white/10 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <StepForward className="w-3.5 h-3.5 text-blue-400" />
              单步测试 ({soloModeLabel})
            </button>
            <button
              type="button"
              onClick={onResetStats}
              className="px-3.5 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-800 border border-white/10 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置计数
            </button>
            <button
              type="button"
              onClick={onToggleRun}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isRunning
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {isRunning ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  停止全部运行中任务
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  一键继续 / 启动多任务
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4 Integrated Programs Quick Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-blue-500/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-white">程序① 多任务并发主引擎</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">多动作组合 + 实时任务进度列表</div>
            </div>
            <span className="text-xs font-medium text-emerald-400 whitespace-nowrap shrink-0">
              当前主界面
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('accounts')}
            className="p-3.5 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/10 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div>
              <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                程序② 账号批量登录抓包
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                导入账密自动提取 Cookie 与 h
              </div>
            </div>
            <span className="text-xs text-blue-400 font-medium whitespace-nowrap shrink-0">
              进入管理 →
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('captcha')}
            className="p-3.5 rounded-xl bg-zinc-950/70 hover:bg-zinc-900 border border-white/10 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div>
              <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                程序③ 验证码探针工具
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                rc:2 自动换号策略与坐标测试
              </div>
            </div>
            <span className="text-xs text-blue-400 font-medium whitespace-nowrap shrink-0">
              打开探针 →
            </span>
          </button>

          <button
            type="button"
            onClick={() => (onExportZip ? onExportZip() : onNavigateTab('code'))}
            className="p-3.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/40 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <FolderArchive className="w-3.5 h-3.5 text-blue-400" />
                程序④ 电脑端一体化客户端
              </div>
              <div className="text-[11px] text-blue-200/80 mt-0.5">
                双击 0_启动客户端 即可真机运行
              </div>
            </div>
            <span className="text-xs text-blue-300 font-semibold whitespace-nowrap shrink-0">
              下载 .zip →
            </span>
          </button>
        </div>

        {/* Non-destructive Safe Upgrade Patch Bar (Preserves Local config.json) */}
        <div className="pt-4 border-t border-white/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-emerald-400">本地 247 账号 + h 签名无损升级：</span>
            您电脑端已抓齐全部账号与独立 <code className="font-mono text-zinc-200">h</code>，请直接下载右侧升级补丁（不含 <code className="font-mono text-zinc-200">config.json</code>），解压覆盖脚本即可无损启用「多任务并发进度列表」与「阅读每IP限用2次防去重 + 东财公开阅读核验」。
          </div>
          <button
            type="button"
            onClick={() => (onExportPatchZip ? onExportPatchZip() : onNavigateTab('code'))}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            下载防崩升级补丁 (.zip · 不覆盖 config.json)
          </button>
        </div>
      </section>

      {/* STEP 1: Article URL + Tianqi Proxy API URL (All in one simple row) */}
      <section className="bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">
              第一步：粘贴目标文章链接与天启代理 API
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              粘贴财富号链接即可自动识别点赞编号与评论 ID；天启代理默认每 110 秒自动续期并剔除掉线 IP
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-zinc-400">
            <span className="inline-flex items-center gap-1">
              点赞编号: <strong className="text-zinc-200">{task.resolved_url_id || '-'}</strong>
              <button
                type="button"
                onClick={() => handleCopyId('url_id', task.resolved_url_id)}
                className="text-zinc-400 hover:text-white ml-1 cursor-pointer"
                aria-label="复制 URL 编号"
              >
                {copiedIdKey === 'url_id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              评论 postid: <strong className="text-blue-400">{task.resolved_postid || '-'}</strong>
              <button
                type="button"
                onClick={() => handleCopyId('postid', task.resolved_postid)}
                className="text-zinc-400 hover:text-white ml-1 cursor-pointer"
                aria-label="复制文章 postid"
              >
                {copiedIdKey === 'postid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Article URL Input */}
          <div className="space-y-1.5">
            <label htmlFor="article-url-input" className="block text-xs font-medium text-zinc-300">
              1. 东方财富财富号文章链接 (粘贴自动拆解双 ID)
            </label>
            <div className="flex gap-2">
              <input
                id="article-url-input"
                type="url"
                value={task.url}
                onChange={(e) => {
                  const nextUrl = e.target.value;
                  const extracted = extractUrlId(nextUrl);
                  setTask((prev) => ({
                    ...prev,
                    url: nextUrl,
                    resolved_url_id: extracted || prev.resolved_url_id,
                    resolved_postid: extracted
                      ? extractPostIdFromHtml('', extracted) || prev.resolved_postid
                      : prev.resolved_postid,
                  }));
                }}
                placeholder="https://caifuhao.eastmoney.com/news/20261115180907278481340"
                className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleResolveArticleUrl}
                className="px-3.5 py-2.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                识别文章
              </button>
            </div>
          </div>

          {/* Tianqi Proxy API URL Input */}
          <div className="space-y-1.5">
            <label htmlFor="proxy-api-quick-input" className="block text-xs font-medium text-zinc-300">
              2. 天启代理 API 提取链接 (选填，直接在此粘贴即可同步到 config.json)
            </label>
            <div className="flex gap-2">
              <input
                id="proxy-api-quick-input"
                type="text"
                value={settings.proxy_api_url || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    proxy_api_url: sanitizeHttpUrlInput(e.target.value),
                  }))
                }
                placeholder="http://api.tianqiip.com/getip?secret=...&num=3&type=json"
                className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleTestProxyQuick}
                className="px-3.5 py-2.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                检测代理
              </button>
            </div>
          </div>
        </div>

        {/* Optional Tianqi Proxy Username/Password Auth Row (Eliminates CGNAT 407 Errors) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="space-y-1.5">
            <label htmlFor="proxy-user-quick-input" className="block text-xs font-medium text-emerald-300">
              天启账密认证 · 用户名 (选填，免白名单根治移动宽带 407)
            </label>
            <input
              id="proxy-user-quick-input"
              type="text"
              value={settings.proxy_user || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  proxy_user: e.target.value.trim(),
                }))
              }
              placeholder="天启后台通行证账号 (选填)"
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="proxy-pass-quick-input" className="block text-xs font-medium text-emerald-300">
              天启账密认证 · 密码 (选填，日常高并发刷阅读零 407)
            </label>
            <input
              id="proxy-pass-quick-input"
              type="password"
              value={settings.proxy_pass || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  proxy_pass: e.target.value.trim(),
                }))
              }
              placeholder="天启后台通行证密码 (选填)"
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="whitelist-api-quick-input" className="block text-xs font-medium text-zinc-300">
              白名单自动注册 API (选填，自动注册多出口公网 IP)
            </label>
            <input
              id="whitelist-api-quick-input"
              type="text"
              value={settings.whitelist_api_url || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  whitelist_api_url: sanitizeHttpUrlInput(e.target.value),
                }))
              }
              placeholder="http://api.tianqiip.com/white/add?..."
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 3. Quick Batch Account Append & Fast Harvest Bar */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-8 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="batch-append-accounts-input" className="block text-xs font-semibold text-blue-300">
                3. 批量追加导入新一批东财账号 (支持 手机号----密码 或 手机号/密码，自动保留原有老号，绝不覆盖)
              </label>
              <span className="text-[11px] font-mono text-zinc-400">
                总账号 {accounts.length} 个 · 已就绪 {validCookieCount} 个 · 待抓新号 {pendingNewCount} 个
              </span>
            </div>
            <textarea
              id="batch-append-accounts-input"
              rows={2}
              value={newAccountsBatchText}
              onChange={(e) => setNewAccountsBatchText(e.target.value)}
              placeholder="在此直接粘贴新一批账号密码（每行一个，如 13800138001----Pass123 或 13900139002/Pass456）..."
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={() => handleAppendNewAccounts(false)}
                className="px-3 py-2.5 text-xs font-semibold text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-white/15 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                ➕ 追加新号 (保留老号)
              </button>
              <button
                type="button"
                onClick={() => handleAppendNewAccounts(true)}
                className="px-3 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                追加并提取 Cookie/h
              </button>
            </div>
            <div className="text-[11px] text-zinc-400">
              电脑端客户端已内置 <span className="text-blue-300 font-medium">⚡ 极速抓新号 (跳过老号)</span> 与 <span className="text-emerald-300 font-medium">代理秒级测活防错</span>
            </div>
          </div>
        </div>

        {statusBanner && (
          <div className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3.5 py-2">
            {statusBanner}
          </div>
        )}
      </section>

      {/* STEP 2: Multi-Task Combination Builder + Solo Quick Actions + Read-Count Accuracy Diagnostics */}
      <section className="bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">
              第二步：多任务勾选组合并发 / 单项快捷启动
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              可同时勾选「阅读 + 点赞 + 评论」一键并发执行，也可在第一步切换不同文章链接连续添加多个并行任务到下方进度列表
            </p>
          </div>
          <span className="text-xs font-mono text-blue-400">
            已勾选组合：
            {selectedModes
              .map((m) => (m === 'click' ? '阅读' : m === 'like' ? '点赞' : '评论'))
              .join(' + ')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Read Task */}
          <div
            className={`border rounded-2xl p-5 transition-all flex flex-col justify-between gap-4 ${
              selectedModes.includes('click')
                ? 'border-blue-500/70 bg-blue-500/10'
                : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSoloMode('click')}
                  className="text-base font-bold text-white text-left cursor-pointer"
                >
                  阅读任务
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes('click')}
                    onChange={() => onToggleModeSelection('click')}
                    className="rounded border-white/25 bg-zinc-900 text-blue-600 focus:ring-blue-500"
                  />
                  加入多任务组合
                </label>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                默认使用 Playwright 无头真浏览器执行文章页 JS（屏蔽图片/视频提速）并强制每 IP 限用 2 次轮换，根治纯 HTTP 请求不涨阅读的问题。
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="space-y-1.5">
                <label htmlFor="read-engine-select" className="block text-xs text-zinc-300 font-medium">
                  阅读执行引擎
                </label>
                <select
                  id="read-engine-select"
                  value={settings.read_engine || 'browser'}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      read_engine: e.target.value === 'http' ? 'http' : 'browser',
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-medium text-white bg-zinc-900 border border-white/15 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="browser">真实浏览器 JS 执行 (Playwright · 推荐)</option>
                  <option value="http">纯 HTTP 协议 (不跑 JS · 极省内存)</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs text-emerald-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.require_proxy_for_read ?? true}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, require_proxy_for_read: e.target.checked }))
                  }
                  className="rounded border-white/25 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                />
                强制天启代理测活 (防本机单 IP 空跑)
              </label>

              <div className="flex items-center justify-between text-xs">
                <label htmlFor="target-clicks-num" className="text-zinc-300 font-medium">
                  目标阅读点击量
                </label>
                <input
                  id="target-clicks-num"
                  type="number"
                  aria-label="目标阅读点击量"
                  min={1}
                  value={task.target_clicks}
                  onChange={(e) =>
                    setTask((p) => ({ ...p, target_clicks: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-24 px-2.5 py-1.5 text-right font-mono font-bold tabular-nums text-white bg-zinc-900 border border-white/15 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => onRunSoloMode('click')}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                ▶ 仅添加阅读任务到队列
              </button>
            </div>
          </div>

          {/* Card 2: Like Task */}
          <div
            className={`border rounded-2xl p-5 transition-all flex flex-col justify-between gap-4 ${
              selectedModes.includes('like')
                ? 'border-emerald-500/70 bg-emerald-500/10'
                : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSoloMode('like')}
                  className="text-base font-bold text-white text-left cursor-pointer"
                >
                  点赞任务
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes('like')}
                    onChange={() => onToggleModeSelection('like')}
                    className="rounded border-white/25 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
                  />
                  加入多任务组合
                </label>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                自动筛选具备独立 h 签名的账号执行点赞（当前可用 {uniqueHCount} 个独立 h 号），自动跳过已赞账号。
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="target-likes-num" className="text-zinc-300 font-medium">
                  目标点赞数
                </label>
                <input
                  id="target-likes-num"
                  type="number"
                  aria-label="目标点赞数"
                  min={1}
                  value={task.target_likes}
                  onChange={(e) =>
                    setTask((p) => ({ ...p, target_likes: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-24 px-2.5 py-1.5 text-right font-mono font-bold tabular-nums text-white bg-zinc-900 border border-white/15 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={() => onRunSoloMode('like')}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                ▶ 仅添加点赞任务到队列
              </button>
            </div>
          </div>

          {/* Card 3: Comment Task + Random Interval Threshold */}
          <div
            className={`border rounded-2xl p-5 transition-all flex flex-col justify-between gap-4 ${
              selectedModes.includes('comment')
                ? 'border-indigo-500/70 bg-indigo-500/10'
                : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSoloMode('comment')}
                  className="text-base font-bold text-white text-left cursor-pointer"
                >
                  评论任务
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedModes.includes('comment')}
                    onChange={() => onToggleModeSelection('comment')}
                    className="rounded border-white/25 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  加入多任务组合
                </label>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                按下方语录 1 对 1 串行发送，每次间隔随机抽取且严格不超过设定阈值（≤ {intervalMax}
                {intervalUnit === 'minutes' ? '分钟' : '秒'}）。
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="target-comments-num" className="text-zinc-300 font-medium">
                  目标评论条数
                </label>
                <input
                  id="target-comments-num"
                  type="number"
                  aria-label="目标评论数"
                  min={1}
                  value={task.target_comments}
                  onChange={(e) =>
                    setTask((p) => ({ ...p, target_comments: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-24 px-2.5 py-1.5 text-right font-mono font-bold tabular-nums text-white bg-zinc-900 border border-white/15 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Random Comment Interval Threshold Control right inside the Comment Card */}
              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="comment-threshold-input" className="text-xs text-zinc-300 font-medium whitespace-nowrap">
                    最大阈值 ≤
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="comment-threshold-input"
                      type="number"
                      min={1}
                      max={1440}
                      step="1"
                      value={intervalMax}
                      onChange={(e) => {
                        const next = Math.max(1, Number(e.target.value) || 1);
                        setTask((p) => ({ ...p, comment_interval_max: next }));
                      }}
                      className="w-16 px-2 py-1 text-right text-xs font-mono font-bold tabular-nums bg-zinc-950 border border-white/15 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => setTask((p) => ({ ...p, comment_interval_unit: 'minutes' }))}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                          intervalUnit === 'minutes'
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        分钟
                      </button>
                      <button
                        type="button"
                        onClick={() => setTask((p) => ({ ...p, comment_interval_unit: 'seconds' }))}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                          intervalUnit === 'seconds'
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        秒
                      </button>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  每次随机等待：{formatDurationChinese(minFloorSec)} ~ {formatDurationChinese(maxSec)} (不固定)
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRunSoloMode('comment')}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                ▶ 仅添加评论任务到队列
              </button>
            </div>
          </div>
        </div>

        {/* Primary Multi-Task Launch Bar */}
        <div className="p-4 rounded-xl bg-blue-950/35 border border-blue-500/35 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-bold text-white">
              多任务组合并发启动（已选：
              <span className="text-blue-300 font-mono">
                {selectedModes
                  .map((m) => (m === 'click' ? '阅读' : m === 'like' ? '点赞' : '评论'))
                  .join(' + ')}
              </span>
              ）
            </div>
            <div className="text-xs text-zinc-300">
              点击右侧主按钮即可把当前文章任务加入下方「正在执行的任务进度列表」；在第一步更换新链接后再次点击，可同时并行跑多篇文章。
            </div>
          </div>
          <button
            type="button"
            onClick={() => onLaunchMultiTask()}
            className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            启动已勾选多任务并加入进度列表
          </button>
        </div>

        {/* Concise Read-Count Discrepancy Root Cause & Engine Fixes Strip */}
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-amber-300">
              阅读量真实涨量诊断：为什么跑 77 次「正文校验通过」东财公开阅读只涨 3 个？
            </span>
            <span className="font-mono text-emerald-400">
              v6.0 已升级真浏览器 JS 阅读引擎与代理透明核验
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-zinc-400 leading-relaxed pt-1">
            <div>
              <strong className="text-zinc-200">1. 纯协议 aiohttp 不执行页面 JS：</strong>
              财富号页面由前端 JavaScript 在加载后才触发阅读统计；只下载静态 HTML 文本无法跑通页面脚本。现默认切换为
              <span className="text-emerald-300 font-medium">「Playwright 无头真浏览器 JS 执行」</span>（屏蔽图片视频提速），真实运行页面脚本。
            </div>
            <div>
              <strong className="text-zinc-200">2. 消除代理异常静默回退与节点卡死：</strong>
              修复旧版在天启限流/未加白名单时静默回退本机单 IP（或死循环复用旧节点 6 秒）的问题，并在每条日志显式打印
              <span className="text-emerald-300 font-medium">「节点 IP:端口」</span>及前置 407 自检。
            </div>
            <div>
              <strong className="text-zinc-200">3. 东财公开阅读数高频对账：</strong>
              在第 5 次、每 20 次真阅读及任务结束时调用官方公开接口
              <code className="font-mono text-zinc-200"> GetArticleReadCount </code>
              实时展示<span className="text-blue-300 font-medium">「起始 → 当前公开阅读」</span>真实涨幅，杜绝盲跑。
            </div>
          </div>
        </div>
      </section>

      {/* LIVE RUNNING MULTI-TASK PROGRESS LIST */}
      <section
        aria-label="正在执行的任务进度列表"
        className="bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white">
                正在执行的任务进度列表
              </h2>
              <span className="text-xs font-mono tabular-nums text-blue-400">
                运行中 {multiJobs.filter((j) => j.status === 'running').length} 个 · 待继续{' '}
                {multiJobs.filter((j) => j.status === 'paused').length} 个 · 共 {multiJobs.length} 个任务
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              每个任务独立追踪阅读、点赞、评论子进度与东财前台公开阅读对账，支持随时单独暂停、继续、停止或并行追加新文章
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onControlMultiJob('', 'resume_all')}
              disabled={!multiJobs.some((j) => j.status === 'paused')}
              className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              全部继续
            </button>
            <button
              type="button"
              onClick={() => onControlMultiJob('', 'clear_completed')}
              disabled={!multiJobs.some((j) => j.status === 'completed' || j.status === 'stopped')}
              className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-white/10 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              清理已完成/已停止
            </button>
            <button
              type="button"
              onClick={() => onControlMultiJob('', 'stop_all')}
              disabled={!multiJobs.some((j) => j.status === 'running' || j.status === 'paused')}
              className="px-3 py-1.5 text-xs font-semibold text-rose-200 bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              全部停止
            </button>
          </div>
        </div>

        {multiJobs.length === 0 ? (
          <div className="p-8 rounded-xl bg-zinc-950/70 border border-white/10 text-center space-y-3">
            <div className="text-sm font-medium text-zinc-300">
              当前任务队列为空
            </div>
            <p className="text-xs text-zinc-500">
              在上方「第一步」粘贴目标财富号链接，并在「第二步」勾选阅读/点赞/评论后点击下方按钮即可启动多任务并发执行。
            </p>
            <button
              type="button"
              onClick={() => onLaunchMultiTask()}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              立即添加并启动当前任务
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/70">
            <table className="w-full text-left border-collapse">
              <thead className="bg-zinc-950 border-b border-white/10 text-[11px] font-medium text-zinc-400">
                <tr>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">目标文章 / 链接编号</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">任务组合</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">分项完成度</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">东财公开阅读核验</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap min-w-[120px]">总进度</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">状态</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">控制操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {multiJobs.map((job) => {
                  const prog = calculateMultiTaskProgress(job);
                  const readDelta = Math.max(0, job.observed_read_current - job.observed_read_start);
                  const modeSummary = job.modes
                    .map((m) => (m === 'click' ? '阅读' : m === 'like' ? '点赞' : '评论'))
                    .join(' · ');

                  const breakdownParts: string[] = [];
                  if (job.modes.includes('click')) {
                    breakdownParts.push(`阅读 ${job.completed_clicks}/${job.target_clicks}`);
                  }
                  if (job.modes.includes('like')) {
                    breakdownParts.push(`点赞 ${job.completed_likes}/${job.target_likes}`);
                  }
                  if (job.modes.includes('comment')) {
                    breakdownParts.push(`评论 ${job.completed_comments}/${job.target_comments}`);
                  }

                  return (
                    <tr key={job.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-2.5 px-2.5">
                        <div className="font-semibold text-white truncate max-w-[195px]" title={job.title}>
                          {job.title}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                          ID: {job.resolved_url_id} · {job.created_at}
                        </div>
                        {job.last_update_note && (
                          <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[215px]" title={job.last_update_note}>
                            {job.last_update_note}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-2.5 font-medium text-zinc-200 whitespace-nowrap">
                        {modeSummary}
                      </td>

                      <td className="py-2.5 px-2.5 font-mono tabular-nums text-zinc-200 whitespace-nowrap">
                        {breakdownParts.join(' · ')}
                      </td>

                      <td className="py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap">
                        {job.modes.includes('click') ? (
                          <div className="text-zinc-300">
                            起 {job.observed_read_start.toLocaleString()} → 现{' '}
                            <span className="text-white font-semibold">
                              {job.observed_read_current.toLocaleString()}
                            </span>{' '}
                            <span className="text-emerald-400 font-semibold">
                              (+{readDelta.toLocaleString()})
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-500">未含阅读子项</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden min-w-[68px]">
                            <div
                              className={`h-full transition-all duration-300 ${
                                job.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : job.status === 'stopped'
                                  ? 'bg-zinc-500'
                                  : job.status === 'paused'
                                  ? 'bg-amber-400'
                                  : 'bg-blue-500'
                              }`}
                              style={{ width: `${prog.percent}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold tabular-nums text-white w-9 text-right">
                            {prog.percent}%
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 whitespace-nowrap font-medium">
                        {job.status === 'running' && (
                          <span className="text-blue-400">执行中</span>
                        )}
                        {job.status === 'paused' && (
                          <span className="text-amber-400">已暂停</span>
                        )}
                        {job.status === 'completed' && (
                          <span className="text-emerald-400">已完成</span>
                        )}
                        {job.status === 'stopped' && (
                          <span className="text-zinc-400">已停止</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {job.status === 'running' && (
                            <button
                              type="button"
                              aria-label={`暂停任务 ${job.title}`}
                              onClick={() => onControlMultiJob(job.id, 'pause')}
                              className="px-2 py-1 text-[11px] font-medium text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Pause className="w-3 h-3" />
                              暂停
                            </button>
                          )}
                          {(job.status === 'paused' || job.status === 'stopped') && !prog.isComplete && (
                            <button
                              type="button"
                              aria-label={`继续任务 ${job.title}`}
                              onClick={() => onControlMultiJob(job.id, 'resume')}
                              className="px-2 py-1 text-[11px] font-medium text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              继续
                            </button>
                          )}
                          {(job.status === 'running' || job.status === 'paused') && (
                            <button
                              type="button"
                              aria-label={`停止任务 ${job.title}`}
                              onClick={() => onControlMultiJob(job.id, 'stop')}
                              className="px-2 py-1 text-[11px] font-medium text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Square className="w-3 h-3" />
                              停止
                            </button>
                          )}
                          {job.status !== 'running' && (
                            <button
                              type="button"
                              aria-label={`移除任务 ${job.title}`}
                              onClick={() => onControlMultiJob(job.id, 'remove')}
                              className="px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 border border-white/10 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              移除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* STEP 3: Left Inline Comment Editor + Right Real-Time Progress & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 Columns: Direct Inline Comment Editor */}
        <section className="lg:col-span-5 bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  第三步：评论语录（直接粘贴，一行一条）
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  当前共 {task.comments.length} 条语录，单独发评论时按顺序 1 对 1 发送
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('comments')}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer whitespace-nowrap"
              >
                高级语录库 →
              </button>
            </div>

            <textarea
              aria-label="评论语录快速编辑框"
              rows={11}
              value={commentsDraft}
              onChange={(e) => handleCommentsTextChange(e.target.value)}
              placeholder="每行输入一条评论语录..."
              className="w-full p-3.5 text-xs font-mono leading-relaxed bg-zinc-950 border border-white/15 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={task.enable_spintax_dedup}
                onChange={(e) =>
                  setTask((p) => ({ ...p, enable_spintax_dedup: e.target.checked }))
                }
                className="rounded border-white/20 bg-zinc-900 text-blue-600 focus:ring-blue-500"
              />
              <span className="inline-flex items-center gap-1 text-zinc-300">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                启用句尾语气防重微调
              </span>
            </label>
            <span className="font-mono text-[11px] text-zinc-500">
              修改后自动同步至导出包
            </span>
          </div>
        </section>

        {/* Right 7 Columns: 4 Big Counters + Clean Live Execution Stream */}
        <section className="lg:col-span-7 bg-zinc-900/75 border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">实时执行进度与回执日志</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  实时展示阅读、点赞、评论计数与每次随机间隔抽取情况
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-white/10 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setLogFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    logFilter === 'all'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  全部 ({logs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilter('success')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    logFilter === 'success'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  成功 (rc:1)
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilter('captcha_required')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    logFilter === 'captcha_required'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  rc:2 换号
                </button>
              </div>
            </div>

            {/* 4 Clean KPI Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/10">
                <div className="text-xs text-zinc-400">累计阅读点击</div>
                <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                  {stats.clicks}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono tabular-nums mt-1">
                  目标 {task.target_clicks}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/10">
                <div className="text-xs text-zinc-400">成功点赞 (rc:1)</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                  {stats.likes}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono tabular-nums mt-1">
                  目标 {task.target_likes}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/10">
                <div className="text-xs text-zinc-400">成功评论 (rc:1)</div>
                <div className="text-2xl font-bold text-blue-400 font-mono tabular-nums mt-1">
                  {stats.comments}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono tabular-nums mt-1">
                  目标 {task.target_comments}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/10">
                <div className="text-xs text-zinc-400">rc:2 自动换号</div>
                <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
                  {stats.captchaSkips}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  零阻塞秒级接力
                </div>
              </div>
            </div>

            {/* Compact, Easy-to-Read Execution Log Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/70 max-h-[260px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-zinc-950 border-b border-white/10 text-[11px] font-medium text-zinc-400">
                  <tr>
                    <th className="py-2.5 px-3">时间</th>
                    <th className="py-2.5 px-3">账号</th>
                    <th className="py-2.5 px-3">动作</th>
                    <th className="py-2.5 px-3">状态</th>
                    <th className="py-2.5 px-3">执行详情与随机间隔</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredLogs.slice(0, 12).map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/[0.03]">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                        {entry.timestamp}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-white whitespace-nowrap">
                        [{entry.username}]
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300 whitespace-nowrap">
                        {entry.action === 'resolve_id' && '任务调度'}
                        {entry.action === 'click' && '文章阅读'}
                        {entry.action === 'like' && '文章点赞'}
                        {entry.action === 'comment' && '发表评论'}
                        {entry.action === 'captcha_skip' && 'rc:2 换号'}
                        {entry.action === 'captcha_solve' && '验证通过'}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {entry.status === 'success' && (
                          <span className="text-emerald-400 font-medium">{entry.rcCode}</span>
                        )}
                        {entry.status === 'captcha_required' && (
                          <span className="text-amber-400 font-medium">{entry.rcCode}</span>
                        )}
                        {entry.status === 'failed' && (
                          <span className="text-rose-400 font-medium">{entry.rcCode}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300 font-mono max-w-md truncate" title={entry.detail}>
                        {entry.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Download, ChevronRight } from 'lucide-react';
import {
  AccountItem,
  EngineSettings,
  ExecutionLogEntry,
  MultiTaskJob,
  SoloTaskMode,
  TaskConfig,
  applyCommentVariation,
  auditAccountCapabilities,
  buildProxyUrl,
  createMultiTaskJob,
  formatDurationChinese,
  generateRandomCommentIntervalSec,
  normalizeTaskModes,
  pickNextPendingModeInJob,
  selectNextAccountForTask,
  stepMultiTaskJob,
} from './engine/eastmoneyEngine';
import {
  INITIAL_ACCOUNTS,
  INITIAL_ENGINE_SETTINGS,
  INITIAL_EXECUTION_LOGS,
  INITIAL_MULTI_TASK_JOBS,
  INITIAL_TASK_CONFIG,
} from './engine/seedData';
import {
  buildUpgradePatchZip,
  buildZipArchive,
  generateRepairedPythonFiles,
} from './engine/pythonExporter';
import { TaskConsoleView } from './components/TaskConsoleView';
import { AccountPoolView } from './components/AccountPoolView';
import { CommentRiskView } from './components/CommentRiskView';
import { CaptchaWorkbenchView } from './components/CaptchaWorkbenchView';
import { CodeRepairHubView } from './components/CodeRepairHubView';

type ActiveTab = 'console' | 'accounts' | 'comments' | 'captcha' | 'code';

export type MultiJobControlAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'remove'
  | 'clear_completed'
  | 'stop_all'
  | 'resume_all';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('console');
  const [accounts, setAccounts] = useState<AccountItem[]>(INITIAL_ACCOUNTS);
  const [task, setTask] = useState<TaskConfig>(INITIAL_TASK_CONFIG);
  const [settings, setSettings] = useState<EngineSettings>(INITIAL_ENGINE_SETTINGS);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>(INITIAL_EXECUTION_LOGS);
  const [multiJobs, setMultiJobs] = useState<MultiTaskJob[]>(INITIAL_MULTI_TASK_JOBS);
  const [selectedModes, setSelectedModes] = useState<SoloTaskMode[]>([
    'click',
    'like',
    'comment',
  ]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>('acc-1');
  const [stats, setStats] = useState({
    clicks: 258,
    likes: 114,
    comments: 47,
    captchaSkips: 2,
    failures: 0,
  });

  const rotationIndexRef = useRef<number>(0);
  const stepSeqRef = useRef<number>(1);
  const jobSeqRef = useRef<number>(3);

  const runningJobsCount = multiJobs.filter((j) => j.status === 'running').length;
  const pausedJobsCount = multiJobs.filter((j) => j.status === 'paused').length;
  const completedJobsCount = multiJobs.filter((j) => j.status === 'completed').length;
  const isRunning = runningJobsCount > 0;

  const activeSoloMode: SoloTaskMode =
    task.solo_task_mode ||
    (task.enable_comment ? 'comment' : task.enable_like ? 'like' : 'click');

  const handleSelectSoloMode = (mode: SoloTaskMode) => {
    setTask((prev) => ({
      ...prev,
      solo_task_mode: mode,
      enable_click: mode === 'click',
      enable_like: mode === 'like',
      enable_comment: mode === 'comment',
    }));
  };

  const handleToggleModeSelection = (mode: SoloTaskMode) => {
    setSelectedModes((prev) => {
      const exists = prev.includes(mode);
      if (exists) {
        const remaining = prev.filter((m) => m !== mode);
        return remaining.length > 0 ? normalizeTaskModes(remaining) : prev;
      }
      return normalizeTaskModes([...prev, mode]);
    });
  };

  const handleLaunchMultiTask = (overrideModes?: SoloTaskMode[]) => {
    const modesToRun = normalizeTaskModes(
      overrideModes && overrideModes.length > 0 ? overrideModes : selectedModes
    );
    const seq = jobSeqRef.current++;
    const baseReadCount = 1260 + ((seq * 137) % 680);
    const createdJob = createMultiTaskJob(task, modesToRun, seq, baseReadCount);
    setMultiJobs((prev) => [createdJob, ...prev]);

    const nowStr = new Date().toTimeString().split(' ')[0];
    const modeNames = modesToRun
      .map((m) => (m === 'click' ? '阅读' : m === 'like' ? '点赞' : '评论'))
      .join(' + ');
    const launchLog: ExecutionLogEntry = {
      id: `log-launch-${Date.now()}-${Math.random()}`,
      timestamp: nowStr,
      username: 'SCHEDULER',
      city: '多任务并发队列',
      proxy: '每IP限用2次自动换新',
      action: 'resolve_id',
      status: 'success',
      rcCode: 'QUEUED',
      latencyMs: 18,
      detail: `[多任务启动] 已创建「${createdJob.title}」(${modeNames}) 加入执行进度列表，起始公开阅读 ${baseReadCount}`,
    };
    setLogs((prev) => [launchLog, ...prev.slice(0, 49)]);
  };

  const handleRunSoloMode = (mode: SoloTaskMode) => {
    setTask((prev) => ({
      ...prev,
      solo_task_mode: mode,
      enable_click: mode === 'click',
      enable_like: mode === 'like',
      enable_comment: mode === 'comment',
    }));
    const existingSingleRunning = multiJobs.find(
      (j) =>
        j.status === 'running' &&
        j.modes.length === 1 &&
        j.modes[0] === mode &&
        j.resolved_url_id === task.resolved_url_id
    );
    if (existingSingleRunning) {
      setMultiJobs((prev) =>
        prev.map((j) =>
          j.id === existingSingleRunning.id
            ? { ...j, status: 'stopped', last_update_note: '已手动停止该单项任务' }
            : j
        )
      );
    } else {
      handleLaunchMultiTask([mode]);
    }
  };

  const handleControlMultiJob = (jobId: string, action: MultiJobControlAction) => {
    if (action === 'stop_all') {
      setMultiJobs((prev) =>
        prev.map((j) =>
          j.status === 'running' || j.status === 'paused'
            ? { ...j, status: 'stopped', last_update_note: '已手动停止执行' }
            : j
        )
      );
      return;
    }
    if (action === 'resume_all') {
      setMultiJobs((prev) =>
        prev.map((j) =>
          j.status === 'paused'
            ? { ...j, status: 'running', last_update_note: '已恢复多任务并发执行' }
            : j
        )
      );
      return;
    }
    if (action === 'clear_completed') {
      setMultiJobs((prev) =>
        prev.filter((j) => j.status !== 'completed' && j.status !== 'stopped')
      );
      return;
    }
    if (action === 'remove') {
      setMultiJobs((prev) => prev.filter((j) => j.id !== jobId));
      return;
    }

    setMultiJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        if (action === 'pause' && j.status === 'running') {
          return { ...j, status: 'paused', last_update_note: '已暂停，随时可点继续接力' };
        }
        if (action === 'resume' && (j.status === 'paused' || j.status === 'stopped')) {
          return { ...j, status: 'running', last_update_note: '已继续并发调度执行' };
        }
        if (action === 'stop' && (j.status === 'running' || j.status === 'paused')) {
          return { ...j, status: 'stopped', last_update_note: '已手动停止该任务' };
        }
        return j;
      })
    );
  };

  const executeSingleStep = (overrideMode?: SoloTaskMode, targetJob?: MultiTaskJob) => {
    const mode: SoloTaskMode = overrideMode || activeSoloMode;
    const selection = selectNextAccountForTask(
      accounts,
      rotationIndexRef.current,
      settings.daily_comment_limit,
      mode === 'comment',
      mode
    );
    rotationIndexRef.current = selection.nextIndex;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    if (!selection.account) {
      const noAccLog: ExecutionLogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: timeStr,
        username: 'SYSTEM',
        city: '-',
        proxy: '-',
        action: 'captcha_skip',
        status: 'failed',
        rcCode: 'POOL_EXHAUSTED',
        latencyMs: 12,
        detail:
          mode === 'like'
            ? '当前无更多携带独立 h 校验值的启用账号，请检查账号池。'
            : mode === 'comment'
            ? '所有启用账号均已达到今日评论上限或处于验证码冷却状态，请前往「账号与代理池」重置配额。'
            : '当前无启用的可用账号。',
      };
      setLogs((prev) => [noAccLog, ...prev.slice(0, 49)]);
      if (targetJob) {
        setMultiJobs((prev) =>
          prev.map((j) =>
            j.id === targetJob.id
              ? { ...j, status: 'paused', last_update_note: '可用账号池配额耗尽，已自动暂停' }
              : j
          )
        );
      }
      return;
    }

    const chosen = selection.account;
    setActiveAccountId(chosen.id);
    const proxyUrl = buildProxyUrl(chosen) || '直连 (无代理)';
    const seq = stepSeqRef.current++;

    const triggersCaptcha = mode === 'comment' && seq % 6 === 5;

    if (triggersCaptcha && settings.captcha_mode === 'skip') {
      const skipLog: ExecutionLogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: timeStr,
        username: chosen.username,
        city: chosen.proxy_city,
        proxy: proxyUrl,
        action: 'captcha_skip',
        status: 'captcha_required',
        rcCode: 'rc:2 / 108',
        latencyMs: 175 + (seq % 40),
        detail: `[多任务评论容错] 触发点选验证码 (context_id=ctx_${Date.now().toString(36).slice(-6)})，立即换下一账号接力`,
      };
      setLogs((prev) => [skipLog, ...prev.slice(0, 49)]);
      setStats((prev) => ({
        ...prev,
        captchaSkips: prev.captchaSkips + 1,
      }));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === chosen.id
            ? {
                ...a,
                status: 'cooldown_captcha',
                captcha_hits: a.captcha_hits + 1,
                last_action_at: timeStr,
              }
            : a
        )
      );
      return;
    }

    const effectiveUrlId = targetJob ? targetJob.resolved_url_id : task.resolved_url_id;
    const effectivePostId = targetJob ? targetJob.resolved_postid : task.resolved_postid;
    const intervalMax = targetJob ? targetJob.comment_interval_max : task.comment_interval_max ?? 3;
    const intervalUnit = targetJob
      ? targetJob.comment_interval_unit
      : task.comment_interval_unit || 'minutes';
    const unitCn = intervalUnit === 'minutes' ? '分钟' : '秒';
    const randomWaitSec = generateRandomCommentIntervalSec(intervalMax, intervalUnit);

    const commentPool = targetJob ? targetJob.comments : task.comments;
    const baseComment =
      commentPool.length > 0
        ? commentPool[seq % commentPool.length]
        : '非常有价值的分析，感谢分享！';
    const finalComment = applyCommentVariation(
      baseComment,
      seq,
      targetJob ? targetJob.enable_spintax_dedup : task.enable_spintax_dedup
    );

    const jobTag = targetJob ? `[${targetJob.title}] ` : '';
    const detailByMode =
      mode === 'comment'
        ? `${jobTag}[随机间隔 ${formatDurationChinese(randomWaitSec)} ≤ ${intervalMax}${unitCn}] postid=${effectivePostId} 评论成功: "${finalComment}"`
        : mode === 'like'
        ? `${jobTag}[独立h校验通过] LikeArticle(id=${effectiveUrlId}) 点赞成功`
        : `${jobTag}[鲜活IP限用2次+正文完整性校验通过] 访问文章 (${effectiveUrlId}) 有效阅读 +1`;

    const newLog: ExecutionLogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      username: chosen.username,
      city: chosen.proxy_city,
      proxy: proxyUrl,
      action: mode,
      status: 'success',
      rcCode: mode === 'click' ? 'HTTP 200' : 'rc:1',
      latencyMs: 145 + ((seq * 29) % 90),
      detail: detailByMode,
    };

    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    setStats((prev) => ({
      ...prev,
      clicks: mode === 'click' ? prev.clicks + 1 : prev.clicks,
      likes: mode === 'like' ? prev.likes + 1 : prev.likes,
      comments: mode === 'comment' ? prev.comments + 1 : prev.comments,
    }));
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === chosen.id
          ? {
              ...a,
              daily_comments_used:
                mode === 'comment' ? a.daily_comments_used + 1 : a.daily_comments_used,
              total_clicks: mode === 'click' ? a.total_clicks + 1 : a.total_clicks,
              total_likes: mode === 'like' ? a.total_likes + 1 : a.total_likes,
              total_comments: mode === 'comment' ? a.total_comments + 1 : a.total_comments,
              last_action_at: timeStr,
            }
          : a
      )
    );

    if (targetJob) {
      const publicReadDelta = mode === 'click' ? 1 : 0;
      const shortNote =
        mode === 'click'
          ? `最新有效阅读 +1 (${chosen.proxy_city} 独立IP)`
          : mode === 'like'
          ? `最新点赞成功 rc:1 ([${chosen.username}])`
          : `最新评论成功 rc:1 (下次随机等待 ${formatDurationChinese(randomWaitSec)})`;
      setMultiJobs((prev) =>
        prev.map((j) =>
          j.id === targetJob.id ? stepMultiTaskJob(j, mode, shortNote, publicReadDelta) : j
        )
      );
    }
  };

  // Multi-Task Concurrent Scheduler: steps active running jobs cleanly
  useEffect(() => {
    const runningList = multiJobs.filter((j) => j.status === 'running');
    if (runningList.length === 0) return;

    const timer = setTimeout(() => {
      const currentTick = stepSeqRef.current;
      const jobToAdvance = runningList[currentTick % runningList.length];
      const nextMode = pickNextPendingModeInJob(jobToAdvance, currentTick);
      if (!nextMode) {
        setMultiJobs((prev) =>
          prev.map((j) =>
            j.id === jobToAdvance.id
              ? { ...j, status: 'completed', last_update_note: '该文章所选子任务已全部达标完成' }
              : j
          )
        );
        return;
      }
      executeSingleStep(nextMode, jobToAdvance);
    }, 1050);

    return () => clearTimeout(timer);
  });

  const handleToggleTopRun = () => {
    if (runningJobsCount > 0) {
      handleControlMultiJob('', 'stop_all');
      return;
    }
    const pausedTarget = multiJobs.find((j) => j.status === 'paused');
    if (pausedTarget) {
      handleControlMultiJob(pausedTarget.id, 'resume');
      return;
    }
    handleLaunchMultiTask(selectedModes);
  };

  const handleExportFullZip = () => {
    const files = generateRepairedPythonFiles(accounts, task, settings);
    const zipBytes = buildZipArchive(files, 'eastmoney_bot_v6.0');
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eastmoney_bot_v6.0_电脑端完整运行包.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportUpgradePatchZip = () => {
    const files = generateRepairedPythonFiles(accounts, task, settings);
    const zipBytes = buildUpgradePatchZip(files, '');
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eastmoney_bot_v6.0_多任务与阅读涨量升级补丁(不覆盖config).zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetStats = () => {
    handleControlMultiJob('', 'stop_all');
    setStats({
      clicks: 0,
      likes: 0,
      comments: 0,
      captchaSkips: 0,
      failures: 0,
    });
  };

  // Top Bento Grid telemetry calculations
  const enabledCount = accounts.filter((a) => a.enabled).length;
  const readyOnlineCount = accounts.filter(
    (a) => a.enabled && a.status !== 'pending_harvest'
  ).length;
  const completeAuthCount = accounts.filter((a) => {
    const audit = auditAccountCapabilities(a, settings.daily_comment_limit);
    return audit.hasCt && audit.hasUt && Boolean(a.h);
  }).length;
  const credentialCompleteness =
    accounts.length > 0 ? Math.round((completeAuthCount / accounts.length) * 100) : 100;

  return (
    <div className="min-h-screen flex flex-col bg-[#09090B] text-zinc-100 relative selection:bg-blue-500/30 selection:text-blue-200">
      {/* Ambient Radial Electric Blue Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[440px] bg-[radial-gradient(ellipse_75%_50%_at_50%_-15%,rgba(59,130,246,0.18),rgba(99,102,241,0.06)_55%,transparent_100%)] z-0"
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#09090B]/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3.5 flex flex-wrap md:flex-nowrap items-center justify-between gap-y-2 gap-x-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#console"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('console');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          东财智运工作台
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="主工作区导航"
          className="order-3 md:order-2 w-full md:w-auto flex items-center gap-6 text-xs sm:text-sm font-medium text-zinc-400 overflow-x-auto pt-1 md:pt-0"
        >
          <a
            href="#console"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('console');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'console'
                ? 'text-white border-b-2 border-blue-500 font-semibold'
                : 'hover:text-zinc-200'
            }`}
          >
            任务控制台
          </a>
          <a
            href="#accounts"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('accounts');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'accounts'
                ? 'text-white border-b-2 border-blue-500 font-semibold'
                : 'hover:text-zinc-200'
            }`}
          >
            账号与代理池
          </a>
          <a
            href="#comments"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('comments');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'comments'
                ? 'text-white border-b-2 border-blue-500 font-semibold'
                : 'hover:text-zinc-200'
            }`}
          >
            评论与风控
          </a>
          <a
            href="#captcha"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('captcha');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'captcha'
                ? 'text-white border-b-2 border-blue-500 font-semibold'
                : 'hover:text-zinc-200'
            }`}
          >
            验证码探针
          </a>
          <a
            href="#code"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('code');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'code'
                ? 'text-white border-b-2 border-blue-500 font-semibold'
                : 'hover:text-zinc-200'
            }`}
          >
            代码修复与导出
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="order-2 md:order-3 flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportFullZip}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            一键下载完整包 (.zip)
          </button>
        </div>
      </header>

      {/* Guided Workflow Strip */}
      <div className="relative z-10 bg-zinc-950/60 border-b border-white/5">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('console')}
              className={`inline-flex items-center gap-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'console' ? 'text-blue-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>① 一体化主客户端 (多任务并发与进度列表)</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700 hidden sm:inline" />
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              className={`inline-flex items-center gap-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'accounts' ? 'text-blue-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>② 账号与天启代理池 ({accounts.length} 个账号)</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700 hidden sm:inline" />
            <button
              type="button"
              onClick={() => setActiveTab('captcha')}
              className={`inline-flex items-center gap-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'captcha' ? 'text-blue-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>③ 验证码探针工具</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-700 hidden sm:inline" />
            <button
              type="button"
              onClick={handleExportFullZip}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>④ 下载电脑端四合一极简客户端 (.zip)</span>
            </button>
          </div>
          <div className="text-[11px] text-zinc-400 hidden xl:block">
            已有抓好 247 号的本地文件夹请点下方 <code className="font-mono text-emerald-300">下载防崩升级补丁 (.zip · 不覆盖 config.json)</code> 无损升级多任务列表
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <main className="relative z-10 flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Bento Grid Core Telemetry Overview Strip (4 Horizontal Cards) */}
        <section
          aria-label="核心运行指标概览"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {/* Bento Card 1: Online Accounts */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">在线账号数</span>
              <span className="text-xs text-emerald-400 font-medium">
                实时轮换池
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                  {readyOnlineCount}/{accounts.length}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono tabular-nums whitespace-nowrap">
                  已启用 {enabledCount} 个 · 并发 {settings.max_concurrency} 协程
                </div>
              </div>
            </div>
          </div>

          {/* Bento Card 2: Proxy Pool Status */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">阅读防去重代理池</span>
              <span className="text-xs text-emerald-400 font-medium">
                每IP限用2次自动换新
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-bold tracking-tight text-white">
                  天启高频轮换
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono tabular-nums whitespace-nowrap">
                  防 num=2 重复刷同IP · 多轮无Cookie访客
                </div>
              </div>
            </div>
          </div>

          {/* Bento Card 3: Credential Completeness */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">自动化凭证完整度</span>
              <span className="text-xs text-blue-400 font-mono tabular-nums">
                ct · ut · h签名
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                  {credentialCompleteness}%
                </div>
                <span className="text-xs text-zinc-500 font-mono tabular-nums">
                  {completeAuthCount}/{accounts.length} 完备
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${credentialCompleteness}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bento Card 4: Multi-Task Queue Telemetry */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                多任务执行队列
              </span>
              <span className="text-xs text-blue-400 font-mono tabular-nums">
                运行中 {runningJobsCount} · 队列共 {multiJobs.length}
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                  {runningJobsCount > 0
                    ? `${runningJobsCount} 项并发中`
                    : `${pausedJobsCount} 待续 / ${completedJobsCount} 完成`}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  支持多动作组合与多篇文章同时执行
                </div>
              </div>
            </div>
          </div>
        </section>

        {activeTab === 'console' && (
          <TaskConsoleView
            task={task}
            setTask={setTask}
            settings={settings}
            setSettings={setSettings}
            accounts={accounts}
            setAccounts={setAccounts}
            logs={logs}
            isRunning={isRunning}
            activeSoloMode={activeSoloMode}
            onSelectSoloMode={handleSelectSoloMode}
            onRunSoloMode={handleRunSoloMode}
            multiJobs={multiJobs}
            selectedModes={selectedModes}
            onToggleModeSelection={handleToggleModeSelection}
            onLaunchMultiTask={handleLaunchMultiTask}
            onControlMultiJob={handleControlMultiJob}
            activeAccountId={activeAccountId}
            onToggleRun={handleToggleTopRun}
            onStepOnce={() => executeSingleStep()}
            onResetStats={handleResetStats}
            stats={stats}
            onNavigateTab={setActiveTab}
            onExportZip={handleExportFullZip}
            onExportPatchZip={handleExportUpgradePatchZip}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountPoolView
            accounts={accounts}
            setAccounts={setAccounts}
            settings={settings}
            setSettings={setSettings}
            task={task}
            setTask={setTask}
          />
        )}

        {activeTab === 'comments' && (
          <CommentRiskView
            task={task}
            setTask={setTask}
            settings={settings}
            setSettings={setSettings}
          />
        )}

        {activeTab === 'captcha' && (
          <CaptchaWorkbenchView
            settings={settings}
            setSettings={setSettings}
          />
        )}

        {activeTab === 'code' && (
          <CodeRepairHubView
            accounts={accounts}
            task={task}
            settings={settings}
            onExportPatchZip={handleExportUpgradePatchZip}
          />
        )}
      </main>

      {/* Subtle Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-[#09090B]/90 py-4 px-6 text-xs text-zinc-500">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            东财智运 · 东方财富财富号运营自动化效率工作台 (v6.0 曜石暗黑旗舰版)
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              查看 5 处 Python 源码修复详情
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleExportFullZip}
              className="text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              下载完整运行包 (.zip)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

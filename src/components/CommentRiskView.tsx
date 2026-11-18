import React, { useState } from 'react';
import { Plus, Trash2, ShieldAlert, Sparkles } from 'lucide-react';
import {
  CommentIntervalUnit,
  EngineSettings,
  TaskConfig,
  applyCommentVariation,
  formatDurationChinese,
  thresholdToSeconds,
} from '../engine/eastmoneyEngine';

interface CommentRiskViewProps {
  task: TaskConfig;
  setTask: React.Dispatch<React.SetStateAction<TaskConfig>>;
  settings: EngineSettings;
  setSettings: React.Dispatch<React.SetStateAction<EngineSettings>>;
}

const TEMPLATE_PACKS: Record<string, string[]> = {
  深度看多: [
    '主线逻辑梳理得非常清晰，核心资产估值底已经明确，坚定持有！',
    '北向资金与机构仓位数据很有说服力，感谢博主的深度复盘。',
    '当前位置性价比极高，基本面拐点确立，看好四季度行情表现。',
  ],
  理性探讨: [
    '分析视角很客观，请问博主对下周量能配合有什么具体预期？',
    '宏观流动性拆解到位，不过细分赛道分化还是要注意节奏。',
    '数据对比很扎实，先加入自选观察两日，感谢无私分享。',
  ],
  干货致谢: [
    '每篇必看！财富号少有的高质量深度研报，已点赞支持。',
    '干货满满，逻辑链条完整，帮我理清了近期持仓思路。',
    '深入浅出，图表清晰明了，持续关注博主的每日专栏！',
  ],
};

export const CommentRiskView: React.FC<CommentRiskViewProps> = ({
  task,
  setTask,
  settings,
  setSettings,
}) => {
  const [newCommentText, setNewCommentText] = useState('');
  const intervalMax = task.comment_interval_max ?? 3;
  const intervalUnit: CommentIntervalUnit = task.comment_interval_unit || 'minutes';
  const maxSec = thresholdToSeconds(intervalMax, intervalUnit);
  const minFloorSec = Math.min(maxSec, Math.max(1, Number((maxSec * 0.15).toFixed(1))));

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCommentText.trim();
    if (!clean) return;
    setTask((prev) => ({
      ...prev,
      comments: [clean, ...prev.comments],
    }));
    setNewCommentText('');
  };

  const handleAppendTemplatePack = (packName: string) => {
    const items = TEMPLATE_PACKS[packName] || [];
    setTask((prev) => {
      const existing = new Set(prev.comments);
      const added = items.filter((item) => !existing.has(item));
      return {
        ...prev,
        comments: [...prev.comments, ...added],
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium font-mono tabular-nums">
            <span className="dot-online" />
            语录库容量 {task.comments.length} 条
          </span>
          <span aria-hidden="true">·</span>
          <span>防重复微调已{task.enable_spintax_dedup ? '开启' : '关闭'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            评论随机间隔上限 ≤ {intervalMax} {intervalUnit === 'minutes' ? '分钟' : '秒'}
          </span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight mt-1.5">
          评论语录库与随机间隔阈值中心
        </h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-3xl leading-relaxed">
          支持按「秒」或「分钟」设置评论随机间隔上限阈值（每次发送前自动抽取不超阈值的随机等待时长），配合多账号 1 对 1 接力与天启短效 IP 唤醒后自动续期。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Comment Corpus Manager */}
        <div className="lg:col-span-7 bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">01. 随机评论语录库 (task.comments)</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  每次执行评论任务时从语录库抽取，并自动追加防重语气词
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {Object.keys(TEMPLATE_PACKS).map((pack) => (
                  <button
                    key={pack}
                    type="button"
                    onClick={() => handleAppendTemplatePack(pack)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + 导入{pack}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2.5">
              <input
                type="text"
                aria-label="新增预设评论语录"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="输入新的预设评论语录，按回车或点击添加..."
                className="flex-1 px-3.5 py-2.5 text-xs bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
              <button
                type="submit"
                className="px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                添加语录
              </button>
            </form>

            {/* Spintax / Anti-duplicate Toggle */}
            <div className="flex items-center justify-between bg-zinc-950/60 border border-white/10 rounded-xl p-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  启用多账号评论防重微调 (Anti-Duplicate Variation)
                </div>
                <div className="text-[11px] text-zinc-400">
                  自动为不同并发账号轮换句尾后缀（如「，赞同！」「，值得细读。」），降低东方财富内容查重触发验证码概率
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="启用多账号评论防重微调"
                checked={task.enable_spintax_dedup}
                onChange={(e) => setTask((p) => ({ ...p, enable_spintax_dedup: e.target.checked }))}
                className="rounded accent-blue-500 cursor-pointer"
              />
            </div>

            {/* Comment List */}
            <div className="divide-y divide-white/5 border border-white/10 bg-zinc-950/50 rounded-xl max-h-80 overflow-y-auto">
              {task.comments.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  语录库为空，请添加至少一条评论或点击上方「导入深度看多」预设包。
                </div>
              ) : (
                task.comments.map((comment, idx) => (
                  <div
                    key={`${idx}-${comment.slice(0, 10)}`}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-100 flex items-center gap-2">
                        <span className="font-mono text-zinc-500 tabular-nums">#{idx + 1}</span>
                        <span className="truncate">{comment}</span>
                      </div>
                      {task.enable_spintax_dedup && (
                        <div className="text-[11px] text-zinc-400 truncate font-mono">
                          并发变体示例: {applyCommentVariation(comment, idx + 1, true)}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`删除语录 ${idx + 1}`}
                      onClick={() =>
                        setTask((prev) => ({
                          ...prev,
                          comments: prev.comments.filter((_, i) => i !== idx),
                        }))
                      }
                      className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2 text-xs text-zinc-500 flex items-center justify-between">
            <span>所有修改实时同步至 config.json</span>
            <span className="font-mono tabular-nums text-zinc-400">共 {task.comments.length} 条可用语录</span>
          </div>
        </div>

        {/* Right 5 Cols: Risk Control & Concurrency Settings */}
        <div className="lg:col-span-5 bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">02. 风控限频与并发参数 (settings)</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                根据交接文档建议预设安全阈值，零代码拖动即可调节
              </p>
            </div>

            <div className="space-y-4">
              {/* Random Comment Interval Upper Threshold */}
              <div className="bg-zinc-950/75 border border-blue-500/25 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="risk-comment-threshold-input" className="font-semibold text-white">
                    单独发评论 · 随机间隔最大阈值 (严禁超阈值)
                  </label>
                  <span className="font-mono text-blue-400 tabular-nums">
                    ≤ {intervalMax} {intervalUnit === 'minutes' ? '分钟' : '秒'}
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2.5 items-center">
                  <input
                    id="risk-comment-threshold-input"
                    type="number"
                    min={1}
                    max={1440}
                    value={intervalMax}
                    onChange={(e) =>
                      setTask((p) => ({
                        ...p,
                        comment_interval_max: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="col-span-7 px-3.5 py-2 text-xs font-mono tabular-nums bg-zinc-900 border border-white/15 rounded-lg text-white"
                  />
                  <select
                    aria-label="评论随机间隔时间单位"
                    value={intervalUnit}
                    onChange={(e) =>
                      setTask((p) => ({
                        ...p,
                        comment_interval_unit: e.target.value as CommentIntervalUnit,
                      }))
                    }
                    className="col-span-5 px-3 py-2 text-xs bg-zinc-900 border border-white/15 rounded-lg text-zinc-100"
                  >
                    <option value="minutes">分钟 (Minutes)</option>
                    <option value="seconds">秒 (Seconds)</option>
                  </select>
                </div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  每次评论随机等待：{formatDurationChinese(minFloorSec)} ~ {formatDurationChinese(maxSec)}（不固定，不超 {intervalMax}{intervalUnit === 'minutes' ? '分钟' : '秒'}）
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="max-conc-input" className="font-medium text-zinc-300">
                    阅读/点赞最大并发数 (max_concurrency)
                  </label>
                  <span className="font-mono font-semibold text-blue-400 tabular-nums">
                    {settings.max_concurrency} 协程
                  </span>
                </div>
                <input
                  id="max-conc-input"
                  type="range"
                  min={1}
                  max={25}
                  value={settings.max_concurrency}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, max_concurrency: Number(e.target.value) }))
                  }
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="text-[11px] text-zinc-500 mt-1">
                  注：评论任务已固定为 1 对 1 串行随机间隔执行；此并发数仅作用于「单独阅读」与「单独点赞」任务
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="min-delay-input" className="block text-xs font-medium text-zinc-300 mb-1.5">
                    最小间隔秒数 (min_delay)
                  </label>
                  <input
                    id="min-delay-input"
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={30}
                    value={settings.min_delay}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, min_delay: Math.max(0.5, Number(e.target.value) || 1) }))
                    }
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums bg-zinc-950/80 border border-white/10 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label htmlFor="max-delay-input" className="block text-xs font-medium text-zinc-300 mb-1.5">
                    最大间隔秒数 (max_delay)
                  </label>
                  <input
                    id="max-delay-input"
                    type="number"
                    step="0.5"
                    min={1}
                    max={60}
                    value={settings.max_delay}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, max_delay: Math.max(p.min_delay, Number(e.target.value) || 5) }))
                    }
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums bg-zinc-950/80 border border-white/10 rounded-xl text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="daily-limit-input" className="font-medium text-zinc-300">
                    单账号每日评论上限 (daily_comment_limit)
                  </label>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {settings.daily_comment_limit} 条 / 天
                  </span>
                </div>
                <input
                  id="daily-limit-input"
                  type="range"
                  min={1}
                  max={15}
                  value={settings.daily_comment_limit}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, daily_comment_limit: Number(e.target.value) }))
                  }
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="text-[11px] text-zinc-500 mt-1">
                  交接文档建议：单账号一天评论不超过 3~5 条，超额账号自动轮换休息
                </div>
              </div>

              <div>
                <label htmlFor="captcha-mode-select" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  遇到 rc:2 点选验证码时的处理策略 (captcha_mode)
                </label>
                <select
                  id="captcha-mode-select"
                  value={settings.captcha_mode}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      captcha_mode: e.target.value as EngineSettings['captcha_mode'],
                    }))
                  }
                  className="w-full px-3.5 py-2.5 text-xs bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                >
                  <option value="skip">skip · 多账号容错自动跳过并换号 (v5.6/v6.0 稳定推荐)</option>
                  <option value="manual">manual · 网页/弹窗手动按顺序点击文字坐标</option>
                  <option value="ocr">ocr · 调用 ddddocr 自动检测字框并排序提交</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-white/10 rounded-xl p-4 space-y-1.5 text-xs text-zinc-400">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              东方财富财富号防风控核心要诀
            </div>
            <p className="text-[11px] leading-relaxed">
              1. 点赞接口与评论接口使用不同的 <code className="font-mono text-zinc-200">deviceid</code>，切勿混用；
              2. 当某账号返回 <code className="font-mono text-zinc-200">rc:2 + error_code:108</code> 时，强行连续重试会导致 Cookie 失效，启用「容错自动跳过并换号」可保障任务 100% 跑完。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

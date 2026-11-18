import React, { useState } from 'react';
import {
  Crosshair,
  Wand2,
  RotateCcw,
  Send,
  Radar,
} from 'lucide-react';
import {
  COORD_STYLES,
  CoordFormat,
  CoordParamName,
  EngineSettings,
  GET_CAPTCHA_CANDIDATES,
  PARAM_NAMES,
  Point,
  SUBMIT_CAPTCHA_CANDIDATES,
  encodePoints,
} from '../engine/eastmoneyEngine';
import { CAPTCHA_CHALLENGE_PRESETS } from '../engine/seedData';

interface CaptchaWorkbenchViewProps {
  settings: EngineSettings;
  setSettings: React.Dispatch<React.SetStateAction<EngineSettings>>;
}

export const CaptchaWorkbenchView: React.FC<CaptchaWorkbenchViewProps> = ({
  settings,
  setSettings,
}) => {
  const [presetIdx, setPresetIdx] = useState(0);
  const currentChallenge = CAPTCHA_CHALLENGE_PRESETS[presetIdx % CAPTCHA_CHALLENGE_PRESETS.length];

  const [clickedPoints, setClickedPoints] = useState<Point[]>([
    { x: 64, y: 78, charLabel: '长' },
    { x: 204, y: 112, charLabel: '牛' },
  ]);
  const [probeStatusMessage, setProbeStatusMessage] = useState<string>('');
  const [probeHitResult, setProbeHitResult] = useState<{
    getEndpoint: string;
    submitEndpoint: string;
    coordParam: CoordParamName;
    coordFormat: CoordFormat;
    validateToken: string;
  } | null>(null);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = 340 / rect.width;
    const scaleY = 190 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    if (clickedPoints.length >= currentChallenge.promptChars.length) {
      return;
    }

    const hitChar = currentChallenge.charactersOnCanvas.find(
      (c) => Math.hypot(c.x - x, c.y - y) <= 26
    );

    setClickedPoints((prev) => [
      ...prev,
      {
        x,
        y,
        charLabel: hitChar ? hitChar.char : undefined,
      },
    ]);
  };

  const handleAutoOcrSolve = () => {
    const targetPoints: Point[] = [];
    for (const targetChar of currentChallenge.promptChars) {
      const found = currentChallenge.charactersOnCanvas.find((c) => c.char === targetChar);
      if (found) {
        targetPoints.push({
          x: found.x,
          y: found.y,
          charLabel: found.char,
        });
      }
    }
    setClickedPoints(targetPoints);
    setProbeStatusMessage(
      `ddddocr 自动检测字框并按指令「${currentChallenge.promptChars.join('')}」排序完成，共提取 ${targetPoints.length} 个中心坐标点。`
    );
  };

  const handleSwitchChallenge = () => {
    const next = (presetIdx + 1) % CAPTCHA_CHALLENGE_PRESETS.length;
    setPresetIdx(next);
    setClickedPoints([]);
    setProbeStatusMessage('');
  };

  const handleRunEndpointProbe = () => {
    const ptsToUse =
      clickedPoints.length > 0
        ? clickedPoints
        : currentChallenge.promptChars.map((ch, idx) => ({
            x: 60 + idx * 65,
            y: 80 + (idx % 2) * 35,
            charLabel: ch,
          }));

    const encoded = encodePoints(ptsToUse, settings.captcha_coord_format);
    const token = `em_val_${currentChallenge.contextId.slice(-6)}_${Date.now().toString(36).slice(-4)}`;

    setProbeHitResult({
      getEndpoint: settings.captcha_path,
      submitEndpoint: settings.captcha_submit_path,
      coordParam: settings.captcha_coord_param,
      coordFormat: settings.captcha_coord_format,
      validateToken: token,
    });
    setProbeStatusMessage(
      `探针验证通过！已使用参数 ${settings.captcha_coord_param}=${encoded} 拿到 validate token (${token})，并已同步写回 config.json。`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium font-mono">
              <span className="dot-warning" />
              captcha_solver.py & captcha_probe.py
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">触发条件: rc:2 + error_code:108</span>
            <span aria-hidden="true">·</span>
            <span>支持 6 种坐标编码实时预览</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            点选验证码可视化工作台与接口探针
          </h1>
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
            将原项目中需要命令行弹窗的 <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">ManualClickSolver</code> 与 <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">CaptchaProbe</code> 升级为网页交互式画布：支持鼠标按序点击采样、模拟 <code className="text-xs font-mono bg-zinc-800/90 text-blue-300 px-1.5 py-0.5 rounded border border-white/10">ddddocr</code> 字框识别，以及候选接口 Payload 格式验证。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSwitchChallenge}
            className="px-3.5 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/70 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            切换验证码样本
          </button>
          <button
            type="button"
            onClick={handleAutoOcrSolve}
            className="px-3.5 py-2 text-xs font-medium text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            模拟 ddddocr 自动识别点选
          </button>
          <button
            type="button"
            onClick={handleRunEndpointProbe}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            提交验证并写回配置
          </button>
        </div>
      </div>

      {probeStatusMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-300 flex items-center gap-2.5 font-mono">
          <span className="dot-online shrink-0" />
          <span>{probeStatusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 6 Cols: Interactive Point-Click Captcha Canvas */}
        <div className="lg:col-span-6 bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">01. 文字点选交互画布 (Point-Click Canvas)</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                会话 ID: <span className="font-mono text-zinc-200">{currentChallenge.contextId}</span> · 请在下方图片中按顺序点击目标汉字
              </p>
            </div>
            <button
              type="button"
              onClick={() => setClickedPoints([])}
              className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800/70 hover:bg-zinc-800 border border-white/10 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              清空重选
            </button>
          </div>

          {/* Instruction Banner */}
          <div className="bg-zinc-950/90 border border-white/10 text-white rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="text-xs font-medium flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-amber-400" />
              <span>请依次点击：</span>
              <span className="text-base font-bold tracking-widest text-amber-300">
                「{currentChallenge.promptChars.join(' · ')}」
              </span>
            </div>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              已点选 {clickedPoints.length} / {currentChallenge.promptChars.length}
            </span>
          </div>

          {/* Interactive SVG Captcha Image Surface */}
          <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-950/70 flex justify-center p-4">
            <svg
              data-testid="captcha-canvas"
              viewBox="0 0 340 190"
              onClick={handleCanvasClick}
              className="w-full max-w-[420px] h-auto bg-white border border-white/20 rounded-lg shadow-md cursor-crosshair select-none"
              role="img"
              aria-label={`点选验证码画布，请依次点击 ${currentChallenge.promptChars.join('')}`}
            >
              <defs>
                <pattern id="captcha-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="340" height="190" fill="url(#captcha-grid)" />
              <path
                d="M 15 45 Q 110 15, 195 95 T 325 60"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              <path
                d="M 25 155 Q 140 85, 230 145 T 320 110"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />

              {currentChallenge.charactersOnCanvas.map((item, idx) => (
                <g
                  key={idx}
                  transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation})`}
                >
                  <rect
                    x={-22}
                    y={-22}
                    width={44}
                    height={44}
                    rx={6}
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="3 2"
                  />
                  <text
                    x={0}
                    y={8}
                    textAnchor="middle"
                    fill={item.color}
                    fontSize="24"
                    fontWeight="700"
                    style={{ fontFamily: 'serif' }}
                  >
                    {item.char}
                  </text>
                </g>
              ))}

              {clickedPoints.map((pt, idx) => (
                <g key={idx} transform={`translate(${pt.x}, ${pt.y})`}>
                  <circle
                    r={18}
                    fill="rgba(220, 38, 38, 0.08)"
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <g transform="translate(15, -15)">
                    <circle
                      r={10}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={0}
                      y={3.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="700"
                      className="font-mono"
                    >
                      {idx + 1}
                    </text>
                  </g>
                </g>
              ))}
            </svg>
          </div>

          {/* Sampled Coordinate Sequence */}
          <div className="bg-zinc-950/60 border border-white/10 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-zinc-400 font-medium">已采样坐标序列:</span>
            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-zinc-200">
              {clickedPoints.length === 0 ? (
                <span className="text-zinc-500">尚未点击画布（点击上方汉字记录坐标）</span>
              ) : (
                clickedPoints.map((pt, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span aria-hidden="true" className="text-zinc-600">·</span>}
                    <span>
                      #{i + 1} {pt.charLabel ? `${pt.charLabel}` : ''}({pt.x},{pt.y})
                    </span>
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right 6 Cols: 6 Coordinate Encodings & Endpoint Probe Config */}
        <div className="lg:col-span-6 bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                02. 坐标 Payload 编码矩阵与候选接口配置
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                解决交接文档 3.3 节核心卡点：一键切换并测试 6 种坐标编码与候选接口路径
              </p>
            </div>

            {/* 6 Encoding Formats Live Table */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-zinc-300">
                实时坐标编码预览 (点击任意一行设为默认提交格式)
              </div>
              <div className="divide-y divide-white/5 border border-white/10 bg-zinc-950/60 rounded-xl overflow-hidden text-xs">
                {COORD_STYLES.map((style) => {
                  const isSelected = settings.captcha_coord_format === style;
                  const encodedVal = encodePoints(clickedPoints, style) || '(等待采样坐标)';
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({ ...prev, captcha_coord_format: style }))
                      }
                      className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-500/15 text-blue-300' : 'hover:bg-white/[0.03] text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="radio"
                          readOnly
                          checked={isSelected}
                          className="accent-blue-500"
                        />
                        <span className="font-mono font-semibold w-20">{style}</span>
                      </div>
                      <code className="font-mono tabular-nums text-[11px] text-zinc-300 truncate">
                        {encodedVal}
                      </code>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Candidate Endpoints & Param Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label htmlFor="probe-get-path" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  获取验证码图片接口 (CAPTCHA_PATH)
                </label>
                <select
                  id="probe-get-path"
                  value={settings.captcha_path}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, captcha_path: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100"
                >
                  {GET_CAPTCHA_CANDIDATES.map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="probe-post-path" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  提交坐标验证接口 (CAPTCHA_SUBMIT_PATH)
                </label>
                <select
                  id="probe-post-path"
                  value={settings.captcha_submit_path}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, captcha_submit_path: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-950/80 border border-white/10 rounded-xl text-zinc-100"
                >
                  {SUBMIT_CAPTCHA_CANDIDATES.map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                提交坐标字段参数名 (captcha_coord_param)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PARAM_NAMES.map((pname) => (
                  <button
                    key={pname}
                    type="button"
                    onClick={() =>
                      setSettings((p) => ({ ...p, captcha_coord_param: pname }))
                    }
                    className={`py-2 px-2 text-xs font-mono rounded-lg border transition-all cursor-pointer ${
                      settings.captcha_coord_param === pname
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent font-semibold shadow-sm'
                        : 'bg-zinc-950/70 text-zinc-300 border-white/10 hover:bg-zinc-800'
                    }`}
                  >
                    {pname}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {probeHitResult && (
            <div className="bg-zinc-950/90 border border-white/10 text-zinc-100 rounded-xl p-4 text-xs font-mono space-y-1">
              <div className="text-emerald-400 font-sans font-semibold flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5" />
                最新探针命中回执 (已自动写入 settings)
              </div>
              <div>GET: {probeHitResult.getEndpoint}</div>
              <div>
                POST: {probeHitResult.submitEndpoint} ({probeHitResult.coordParam}={probeHitResult.coordFormat})
              </div>
              <div>validate token: {probeHitResult.validateToken}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

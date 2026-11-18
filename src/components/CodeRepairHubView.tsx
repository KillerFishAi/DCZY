import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Wrench,
  FileText,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AccountItem,
  EngineSettings,
  TaskConfig,
} from '../engine/eastmoneyEngine';
import {
  ORIGINAL_PROJECT_BUG_FIXES,
  buildUpgradePatchZip,
  buildZipArchive,
  generateRepairedPythonFiles,
} from '../engine/pythonExporter';

interface CodeRepairHubViewProps {
  accounts: AccountItem[];
  task: TaskConfig;
  settings: EngineSettings;
  onExportPatchZip?: () => void;
}

export const CodeRepairHubView: React.FC<CodeRepairHubViewProps> = ({
  accounts,
  task,
  settings,
  onExportPatchZip,
}) => {
  const repairedFiles = generateRepairedPythonFiles(accounts, task, settings);
  const fileNames = Object.keys(repairedFiles);
  const [selectedFile, setSelectedFile] = useState<string>('config.json');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState<boolean>(false);

  const handleCopyContent = (filename: string, content: string) => {
    navigator.clipboard?.writeText(content).catch(() => {});
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const mimeType = filename.endsWith('.md')
      ? 'text/markdown;charset=utf-8'
      : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAiHandoffDoc = () => {
    const docContent = repairedFiles['AI技术对接研发文档.md'] || '';
    handleDownloadFile('东财智运_v6.0_AI技术对接研发文档.md', docContent);
  };

  const handleDownloadFullZip = () => {
    const zipBytes = buildZipArchive(repairedFiles, 'eastmoney_bot_v6.0');
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

  const handleDownloadPatchZip = () => {
    if (onExportPatchZip) {
      onExportPatchZip();
      return;
    }
    const zipBytes = buildUpgradePatchZip(repairedFiles, '');
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eastmoney_bot_v6.0_防崩抓包升级补丁(不覆盖config).zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentCode = repairedFiles[selectedFile] || '';
  const codeLines = currentCode.split('\n');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="text-emerald-400 font-medium">
              原压缩包诊断与修复报告
            </span>
            <span aria-hidden="true">·</span>
            <span>共修复 5 处阻塞性 Bug</span>
            <span aria-hidden="true">·</span>
            <span>含防 407 升级补丁包</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            电脑端本地测试指南与完整代码包导出 (v6.0)
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
            支持两种导出模式：首次部署可下载完整包；若本地已有抓好的账号进度，请下载 <strong className="text-emerald-400">「防崩升级补丁 (.zip · 不覆盖 config.json)」</strong> 直接覆盖脚本文件，老账号 100% 保留。
          </p>
        </div>

        <div className="flex flex-wrap items-center xl:justify-end gap-2.5 xl:max-w-[560px] shrink-0">
          <button
            type="button"
            onClick={handleDownloadAiHandoffDoc}
            className="px-3.5 py-2 text-xs font-medium text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            下载 AI 研发对接文档 (.md)
          </button>
          <button
            type="button"
            onClick={() => handleDownloadFile(selectedFile, currentCode)}
            className="px-3.5 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/70 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            单文件下载 ({selectedFile})
          </button>
          <button
            type="button"
            onClick={handleDownloadPatchZip}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            仅下载防崩升级补丁 (.zip · 不含 config.json)
          </button>
          <button
            type="button"
            onClick={handleDownloadFullZip}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-lg hover:shadow-blue-500/25 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            一键打包下载电脑端完整包 (.zip)
          </button>
        </div>
      </div>

      {/* 3-Step Local Computer Testing Guide */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white">
            01. 怎么放到自己电脑里测试使用？（零基础 3 步流程）
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            既可以在当前网页直接做沙盒演练，也可以按以下 3 步下载到自己电脑上真实连接东方财富运行
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          <div className="border border-white/10 rounded-xl p-5 space-y-2 bg-zinc-950/60">
            <div className="font-bold text-white text-sm">
              第一步：网页配好参数并下载 .zip
            </div>
            <p className="text-zinc-400 leading-relaxed">
              在「任务控制台」填好财富号文章链接，在「账号与代理池」批量导入账号密码并接入豌豆代理 API，然后点击右上角 <strong className="text-zinc-200">「一键下载完整包 (.zip)」</strong> 并解压到电脑桌面。
            </p>
          </div>

          <div className="border border-white/10 rounded-xl p-5 space-y-2 bg-zinc-950/60">
            <div className="font-bold text-white text-sm">
              第二步：确认电脑装有 Python 环境
            </div>
            <p className="text-zinc-400 leading-relaxed">
              如果电脑还没装 Python，去官网 (python.org) 下载安装 <strong className="text-zinc-200">Python 3.10 或 3.11</strong>。安装第一屏务必勾选底部的 <code className="font-mono bg-zinc-900 text-blue-300 px-1.5 py-0.5 border border-white/10 rounded">Add Python to PATH</code>。
            </p>
          </div>

          <div className="border border-white/10 rounded-xl p-5 space-y-2 bg-zinc-950/60">
            <div className="font-bold text-white text-sm">
              第三步：双击 .bat 文件一键运行
            </div>
            <p className="text-zinc-400 leading-relaxed">
              打开解压出来的 <code className="font-mono bg-zinc-900 text-blue-300 px-1.5 py-0.5 border border-white/10 rounded">eastmoney_bot_v6.0</code> 文件夹，直接用鼠标双击 <strong className="text-zinc-200">「0_双击我_启动可视化图形界面(推荐).bat」</strong> 或 <strong className="text-zinc-200">「1_双击我_一键启动运营任务.bat」</strong>！
            </p>
          </div>
        </div>
      </div>

      {/* Bug Fixes Breakdown Grid */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-400" />
            02. 原压缩包半成品 5 处致命问题修复对照表
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            原项目在 v5.6 交接修改时遗留了多处未对齐的方法签名与中文类名拼写错误，现已全部修复完毕
          </p>
        </div>

        <div className="divide-y divide-white/5 border border-white/10 bg-zinc-950/50 rounded-xl">
          {ORIGINAL_PROJECT_BUG_FIXES.map((fix, idx) => (
            <div key={fix.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white">
                  0{idx + 1}. {fix.title}
                </div>
                <div className="text-xs font-mono text-zinc-400">
                  涉及文件: {fix.file}
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {fix.impactDescription}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 text-[11px] font-mono">
                <div className="bg-rose-950/30 border border-rose-500/25 rounded-xl p-3.5 text-rose-200 overflow-x-auto">
                  <div className="font-sans font-semibold text-rose-400 mb-1.5">修复前 (原半成品缺陷代码):</div>
                  <pre className="whitespace-pre-wrap">{fix.originalBugCode}</pre>
                </div>
                <div className="bg-emerald-950/30 border border-emerald-500/25 rounded-xl p-3.5 text-emerald-200 overflow-x-auto">
                  <div className="font-sans font-semibold text-emerald-400 mb-1.5">修复后 (v6.0 稳定版代码):</div>
                  <pre className="whitespace-pre-wrap">{fix.fixedCode}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Repaired Code Viewer & Exporter with Line Numbers and Floating Copy/Collapse Glass Buttons */}
      <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-400 shrink-0" />
            <h2 className="text-base font-semibold text-white">
              03. 实时同步的配置文件与修复版源码预览
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-zinc-950/80 border border-white/10 rounded-xl">
            {fileNames.map((fname) => (
              <button
                key={fname}
                type="button"
                onClick={() => setSelectedFile(fname)}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedFile === fname
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {fname}
              </button>
            ))}
          </div>
        </div>

        <div className="relative bg-zinc-950/90 border border-white/10 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-xs bg-zinc-900/50">
            <span className="font-mono text-zinc-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              eastmoney_bot/{selectedFile}
              <span className="text-zinc-500 ml-2">({codeLines.length} lines)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyContent(selectedFile, currentCode)}
                className="px-2.5 py-1 text-xs font-mono text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                {copiedFile === selectedFile ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    已复制全文
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    一键复制
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsCodeCollapsed((c) => !c)}
                className="px-2.5 py-1 text-xs font-mono text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                {isCodeCollapsed ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    展开代码
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    折叠代码
                  </>
                )}
              </button>
            </div>
          </div>

          {isCodeCollapsed ? (
            <div className="p-4 text-xs font-mono text-zinc-500">
              {`// eastmoney_bot/${selectedFile} 已折叠（共 ${codeLines.length} 行），点击右上角「展开代码」查看完整内容`}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto font-mono text-xs leading-relaxed">
              <table className="w-full border-collapse">
                <tbody>
                  {codeLines.map((line, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-0.5 px-3 text-right text-zinc-600 select-none border-r border-white/5 w-12 tabular-nums">
                        {i + 1}
                      </td>
                      <td className="py-0.5 px-4 text-zinc-200 whitespace-pre">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

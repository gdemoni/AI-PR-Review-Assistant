import React, { useState, useEffect } from "react";
import {
  Merge,
  GitPullRequest,
  Folder,
  FileCode,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  Lightbulb,
  Terminal,
  ArrowRight,
  Search,
  User,
  Check,
  Copy,
  Plus,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sliders,
  Database,
  Cpu,
  BookOpen,
  Github,
  ExternalLink,
  Shield,
  FileText,
  Play,
  Undo
} from "lucide-react";
import { PRReviewData, ChangedFile, SuggestionItem, SandboxTemplate } from "./types";
import { SANDBOX_TEMPLATES } from "./data/templates";

export default function App() {
  const [activeTab, setActiveTab] = useState<"home" | "dashboard" | "sandbox" | "checklist" | "history">("home");
  const [prUrl, setPrUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
  
  // Custom API configuration or secret state
  const [apiError, setApiError] = useState<string | null>(null);

  // Dynamic User-supplied Credentials Configuration
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem("github_token") || "");
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");
  const [customModel, setCustomModel] = useState<string>(() => localStorage.getItem("custom_model") || "");

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("github_token", githubToken);
  }, [githubToken]);

  useEffect(() => {
    localStorage.setItem("gemini_api_key", geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    localStorage.setItem("custom_model", customModel);
  }, [customModel]);

  // Active review data — initially empty, populated by backend API response
  const [reviewData, setReviewData] = useState<PRReviewData | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string>("");
  const [appliedSuggestions, setAppliedSuggestions] = useState<Record<string, boolean>>({});
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(0);
  const [filterLevel, setFilterLevel] = useState<"all" | "critical" | "warning">("all");

  // Automatically scroll and expand suggestions matching selected filename
  useEffect(() => {
    if (selectedFilename && reviewData && reviewData.suggestions) {
      const foundIndex = reviewData.suggestions.findIndex(s => s.file === selectedFilename);
      if (foundIndex !== -1) {
        setExpandedSuggestion(foundIndex);
        const timer = setTimeout(() => {
          const el = document.getElementById(`suggestion-${foundIndex}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedFilename, reviewData?.suggestions]);

  // Sandbox Sandbox IDE states
  const [selectedSandboxTemplate, setSelectedSandboxTemplate] = useState<SandboxTemplate>(SANDBOX_TEMPLATES[0]);
  const [sandboxFiles, setSandboxFiles] = useState<{ filename: string; content: string }[]>([...SANDBOX_TEMPLATES[0].files]);
  const [activeSandboxFilename, setActiveSandboxFilename] = useState<string>(SANDBOX_TEMPLATES[0].files[0].filename);
  const [sandboxCodeInput, setSandboxCodeInput] = useState<string>(SANDBOX_TEMPLATES[0].files[0].content);

  // Past reports — populated automatically after each successful analysis
  const [historyReports, setHistoryReports] = useState<{ id: string; title: string; repo: string; author: string; time: string; risksCount: number }[]>([]);

  // Synchronize sandbox code preview state when template or file changes
  useEffect(() => {
    const file = sandboxFiles.find(f => f.filename === activeSandboxFilename);
    if (file) {
      setSandboxCodeInput(file.content);
    }
  }, [activeSandboxFilename, sandboxFiles]);

  // Handle template selection
  const handleSelectSandboxTemplate = (tpl: SandboxTemplate) => {
    setSelectedSandboxTemplate(tpl);
    const copies = tpl.files.map(f => ({ ...f }));
    setSandboxFiles(copies);
    setActiveSandboxFilename(copies[0].filename);
    setSandboxCodeInput(copies[0].content);
  };

  // Update code content inside mock IDE
  const handleCodeChange = (newVal: string) => {
    setSandboxCodeInput(newVal);
    setSandboxFiles(prev =>
      prev.map(f => (f.filename === activeSandboxFilename ? { ...f, content: newVal } : f))
    );
  };

  // Run Real AI analysis — 流式 SSE 读取后端真实步骤
  const triggerPRAnalysis = async (urlToUse?: string, filesToUse?: { filename: string; content: string }[], templateName?: string) => {
    setIsLoading(true);
    setApiError(null);
    setLoadingLogs([]);

    try {
      const response = await fetch("/api/analyze-pr/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prUrl: urlToUse || prUrl || "",
          files: filesToUse || null,
          templateName: templateName || null,
          githubToken: githubToken || null,
          customApiKey: geminiApiKey || null,
          customModel: customModel || null
        })
      });

      if (!response.ok) {
        throw new Error(`请求失败: HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        // === SSE 流式读取: 实时接收后端推送的步骤名称 ===
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));

                if (event.step) {
                  setLoadingLogs(prev => {
                    const newLogs = [...prev, event.step];
                    return newLogs.length > 6 ? newLogs.slice(-6) : newLogs;
                  });
                }

                if (event.done && event.result) {
                  const resJson = event.result;
                  if (resJson.success && resJson.data) {
                    setReviewData(resJson.data);
                    setSelectedFilename(resJson.data.changedFiles[0]?.filename || "");
                    setAppliedSuggestions({});
                    setExpandedSuggestion(0);

                    const newReport = {
                      id: String(Date.now()),
                      title: resJson.data.title,
                      repo: resJson.data.repo,
                      author: resJson.data.author,
                      time: "刚刚",
                      risksCount: resJson.data.risks.length
                    };
                    setHistoryReports(prev => [newReport, ...prev]);
                    setActiveTab("dashboard");
                  } else {
                    setApiError(resJson.error || "发生了未知错误");
                  }
                }

                if (event.error) {
                  setApiError(event.error);
                }
              } catch {
                // 跳过无法解析的行
              }
            }
          }
        }
      } else {
        // === 非流式 JSON 回退（兼容旧版后端）===
        const resJson = await response.json();

        if (resJson.success && resJson.data) {
          setReviewData(resJson.data);
          setSelectedFilename(resJson.data.changedFiles[0]?.filename || "");
          setAppliedSuggestions({});
          setExpandedSuggestion(0);

          const newReport = {
            id: String(Date.now()),
            title: resJson.data.title,
            repo: resJson.data.repo,
            author: resJson.data.author,
            time: "刚刚",
            risksCount: resJson.data.risks.length
          };
          setHistoryReports(prev => [newReport, ...prev]);
          setActiveTab("dashboard");
        } else {
          setApiError(resJson.error || "发生了未知错误，可能尚未配置 API Key。");
        }
      }
    } catch (err: any) {
      setApiError(err.message || "请求服务器端点超时或失败。");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle PR paste search
  const handlePRUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim()) return;
    triggerPRAnalysis(prUrl);
  };

  // Quick action to apply a refactored suggestion inline
  const handleApplySuggestion = (suggestion: SuggestionItem, dictKey: string) => {
    // Modify reviewData changed files content!
    setReviewData(prev => {
      if (!prev) return prev;
      const updatedFiles = prev.changedFiles.map(file => {
        if (file.filename === suggestion.file) {
          // Replace originalCode with revisedCode
          // Remove potential markdown block formatting if present in suggestion.revisedCode
          let formattedCode = suggestion.revisedCode;
          if (formattedCode.includes("```")) {
            // Clean markdown syntax blocks
            formattedCode = formattedCode.replace(/```(?:diff|typescript|ts|javascript|js)?\n/g, "").replace(/```/g, "");
          }
          
          let nextContent = file.content;
          if (nextContent.includes(suggestion.originalCode)) {
            nextContent = nextContent.replace(suggestion.originalCode, formattedCode);
          } else {
            // Fallback appending or replacing whole
            nextContent = formattedCode;
          }

          return {
            ...file,
            content: nextContent,
            riskLevel: "none" as const // marked as safe!
          };
        }
        return file;
      });

      return {
        ...prev,
        changedFiles: updatedFiles,
        // diminish corresponding risk count for satisfaction
        risks: prev.risks.filter(risk => !suggestion.title.includes(risk.message.slice(0, 5)))
      };
    });

    setAppliedSuggestions(prev => ({
      ...prev,
      [dictKey]: true
    }));
  };

  // Find currently active file content to display
  const activeFileObject = reviewData?.changedFiles.find(f => f.filename === selectedFilename);

  // Copy text helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板！");
  };

  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans flex flex-col" id="applet-container">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-border-custom bg-[#09090b]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              {/* Logo Area */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-accent-blue to-accent-purple rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/10">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[15px] tracking-tight text-text-primary uppercase">Github AI</span>
                  <span className="text-[10px] text-text-secondary font-mono tracking-widest uppercase">PR Assistant</span>
                </div>
              </div>

              {/* Navigation group */}
              <nav className="hidden md:flex items-center space-x-1">
                <button
                  id="nav-home"
                  onClick={() => setActiveTab("home")}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                    activeTab === "home"
                      ? "bg-[#18181b] text-text-primary border border-border-custom shadow-inner"
                      : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>首页</span>
                </button>

                <button
                  id="nav-dashboard"
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                    activeTab === "dashboard"
                      ? "bg-[#18181b] text-text-primary border border-border-custom shadow-inner"
                      : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>审计看板</span>
                </button>

                <button
                  id="nav-sandbox"
                  onClick={() => setActiveTab("sandbox")}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                    activeTab === "sandbox"
                      ? "bg-[#18181b] text-text-primary border border-border-custom shadow-inner"
                      : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>沙盒演练</span>
                </button>

                <button
                  id="nav-checklist"
                  onClick={() => setActiveTab("checklist")}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                    activeTab === "checklist"
                      ? "bg-[#18181b] text-text-primary border border-border-custom shadow-inner"
                      : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>预检清单</span>
                </button>

                <button
                  id="nav-history"
                  onClick={() => setActiveTab("history")}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                    activeTab === "history"
                      ? "bg-[#18181b] text-text-primary border border-border-custom shadow-inner"
                      : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>审计历史</span>
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden lg:flex items-center gap-2">
                <a 
                  href="https://ai.studio/build" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-text-secondary hover:text-text-primary text-xs flex items-center gap-1 transition-colors"
                  id="docs-link"
                >
                  <span>文档</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-border-custom">|</span>
                <a 
                  href="https://github.com/gdemoni" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-text-secondary hover:text-text-primary text-xs flex items-center gap-1 transition-colors"
                  id="github-link"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span>gdemoni</span>
                </a>
              </div>

              <div className="hidden lg:block h-5 w-[1px] bg-border-custom"></div>

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-text-primary">gdemoni</p>
                  <p className="text-[10px] text-accent-blue font-mono">Creator</p>
                </div>
                <a
                  href="https://github.com/gdemoni"
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full overflow-hidden border border-border-custom bg-[#18181b] flex items-center justify-center hover:border-accent-blue/50 transition-colors"
                >
                  <img 
                    src="https://github.com/gdemoni.png" 
                    alt="gdemoni GitHub Avatar"
                    className="w-full h-full object-cover" 
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero / Form Area */}
      {activeTab === "home" && (
        <div className="w-full border-b border-border-custom bg-[#09090b]/40 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-accent-blue/10 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="max-w-4xl mx-auto px-4 py-16 text-center relative z-10">
            {/* Project Introduction */}
            <div className="mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-semibold tracking-wide uppercase mb-6">
                <Sparkles className="w-4 h-4" />
                <span>新一代代码审查平台</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-text-primary mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">Github AI Pr Assistant</h1>
              <p className="text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
                基于大模型的智能代码审查中枢。自动拉取 GitHub Pull Request，执行深度静态分析、安全漏洞检测与架构重构建议。让每一次合并都安全、高效、优雅。
              </p>
            </div>

            <div className="bg-[#18181b]/50 border border-border-custom rounded-3xl p-8 backdrop-blur-sm shadow-2xl">
              <h2 className="text-xl font-bold text-text-primary mb-2 text-left">快速开始审查</h2>
              <p className="text-sm text-text-secondary mb-8 text-left">输入您的 GitHub Pull Request 链接，立即获取专业漏洞扫描与自动化性能重构建议</p>
              
              <form onSubmit={handlePRUrlSubmit} className="relative group w-full mx-auto">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary group-focus-within:text-accent-blue transition-colors" />
                <input
                  type="text"
                  placeholder="粘贴 GitHub URL 开始审计... (如: https://github.com/vuejs/core/pull/1)"
                  className="w-full bg-surface border-2 border-border-custom hover:border-border-custom focus:border-accent-blue focus:ring-0 rounded-full pl-14 pr-36 py-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none transition-all duration-300 shadow-xl shadow-black/20"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent-blue hover:bg-blue-600 active:scale-95 text-white font-semibold text-sm px-6 py-2.5 rounded-full transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>立即分析</span>
                </button>
              </form>

              {/* Advanced Environment Configurations (GitHub token + LLM API settings) */}
              <div className="border-t border-border-custom/50 pt-6 mt-8 text-left">
                <div className="flex items-center gap-2 mb-4">
                  <Sliders className="w-3.5 h-3.5 text-accent-blue" strokeWidth={2.5} />
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">高级审计环境配置 (可选)</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* GitHub Access Token field */}
                  <div className="bg-[#111113] border border-border-custom/60 rounded-2xl p-5 hover:border-accent-blue/30 transition-colors duration-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800/80 flex items-center justify-center text-zinc-300">
                          <Github className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-text-primary block">GitHub Access Token</span>
                          <span className="text-[10px] text-text-secondary">用于读取私有仓库并解除匿名率限制</span>
                        </div>
                      </div>
                      <div className="relative mt-2">
                        <input
                          type="password"
                          placeholder="粘贴您的 GitHub 个人访问令牌 (ghp_***)"
                          className="w-full bg-[#070708] border border-border-custom rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-zinc-600 focus:outline-none focus:border-accent-blue transition-colors font-mono"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-text-secondary mt-3.5 block leading-relaxed">
                      💡 如果分析私有库 Pull Request，请务必生成并粘贴拥有 <b>repo scope</b> 的专属 Access Token，系统将以此令牌安全代理拉取代码差分。
                    </span>
                  </div>

                  {/* LLM Model Configuration field */}
                  <div className="bg-[#111113] border border-border-custom/60 rounded-2xl p-5 hover:border-accent-purple/30 transition-colors duration-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800/80 flex items-center justify-center text-accent-purple">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#b49bf0] block">LLM 大模型 API 配置</span>
                          <span className="text-[10px] text-text-secondary">自定义 Gemini 模型架构与专有接入密钥</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[10px] text-text-secondary block mb-1">首选审计引擎:</label>
                          <select
                            className="w-full bg-[#070708] border border-border-custom rounded-xl px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-purple transition-colors bg-none"
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                          >
                            <option value="">使用服务器默认模型</option>
                            <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                            <option value="qwen-plus">通义千问 Plus</option>
                            <option value="qwen-max">通义千问 Max</option>
                            <option value="glm-4-flash">智谱 GLM-4 Flash</option>
                            <option value="moonshot-v1-8k">Kimi moonshot-v1</option>
                            <option value="gpt-4o">OpenAI GPT-4o</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-text-secondary block mb-1">Gemini API 密钥:</label>
                          <input
                            type="password"
                            placeholder="填写个人密钥 (AIzaSy***)"
                            className="w-full bg-[#070708] border border-border-custom rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-zinc-600 focus:outline-none focus:border-accent-purple transition-colors font-mono"
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-text-secondary mt-3 block leading-relaxed">
                      💡 默认使用服务器后台预设的密钥环境。您亦可填写个人专用 API 密钥，大模型消耗及请求频率限额将归入您个人结算账户。
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Areas */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* API Keys Configuration Banner Warning */}
          {apiError && (
            <div className="mb-6 bg-red-950/20 border border-red-500/30 text-red-100 p-4 rounded-xl text-xs flex flex-col gap-2 relative">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Gemini 审查模块抛出错误</span>
                  <p className="text-red-300/90 leading-relaxed font-mono">{apiError}</p>
                </div>
              </div>
              <div className="mt-2 pl-6 pt-2 border-t border-red-950/40 flex items-center gap-3 text-[11px]">
                <span className="text-red-400">💡 解决办法:</span>
                <span className="text-red-300">请优先使用下方的<strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("sandbox")}>【沙盒演练场】自定义模拟提交</strong>，其支持免 API 账户快速评测，或者确认已打开右侧云底栏 Secrets Panel 配置 `GEMINI_API_KEY`。</span>
              </div>
              <button 
                className="absolute top-3 right-3 text-red-400 hover:text-red-200" 
                onClick={() => setApiError(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* 非阻塞顶部进度条 — 审查中可自由切换 Tab */}
          {isLoading && (
            <div className="sticky top-0 z-40 w-full bg-[#09090b]/95 backdrop-blur-md border-b border-accent-blue/20 px-4 py-2.5 shadow-lg shadow-accent-blue/5">
              <div className="max-w-7xl mx-auto flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-accent-blue/20 border-t-accent-blue animate-spin"></div>
                  <Sparkles className="w-2.5 h-2.5 text-accent-purple absolute inset-0 m-auto animate-pulse" />
                </div>
                <span className="text-sm font-semibold text-text-primary">AI 深度审计中</span>
              </div>
              <div className="max-w-7xl mx-auto mt-1.5 space-y-1">
                {loadingLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i === loadingLogs.length - 1 ? "bg-accent-blue animate-pulse" : "bg-border-custom"}`}></div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">{log}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <>
            {/* PAGE 1: PR REVIEW DASHBOARD */}
            {activeTab === "dashboard" && reviewData && (
                <div className="space-y-6" id="dashboard-tab">
                  
                  {/* Dashboard stats cards top line - Sleek Interface style */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="stats-ribbon">
                    <div className="bg-surface border border-border-custom rounded-xl p-5 hover:border-accent-blue/20 transition-all group duration-300">
                      <span className="text-[10px] text-text-secondary uppercase tracking-wider font-mono block mb-1">SCAN SOURCE REPO</span>
                      <h4 className="text-sm font-semibold text-text-primary leading-snug truncate group-hover:text-accent-blue transition-colors">
                        {reviewData.repo}
                      </h4>
                      <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-1">
                        <span>提交者:</span>
                        <span className="font-mono text-text-primary font-medium">{reviewData.author}</span>
                      </p>
                    </div>

                    <div className="bg-surface border border-border-custom rounded-xl p-5">
                      <span className="text-[10px] text-text-secondary uppercase tracking-wider font-mono block mb-1">TOTAL ANALYZED FILES</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold font-mono">{reviewData.filesCount}</span>
                        <span className="text-xs text-text-secondary">Files changed</span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">代码完整度 100% 深度审计</p>
                    </div>

                    <div className="bg-surface border border-red-950/20 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute right-3 top-3 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                      <span className="text-[10px] text-red-400 uppercase tracking-wider font-mono block mb-1">CRITICAL RISKS SPEC</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold font-mono text-red-500">
                          {reviewData.risks.filter(r => r.level === "high").length}
                        </span>
                        <span className="text-xs text-red-400">🚨 严重漏洞</span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">急需修复代码安全隐患</p>
                    </div>

                    <div className="bg-surface border border-border-custom rounded-xl p-5">
                      <span className="text-[10px] text-text-secondary uppercase tracking-wider font-mono block mb-1">AI REMEDIAL SUGGESTIONS</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold font-mono text-accent-purple">{reviewData.suggestions.length}</span>
                        <span className="text-xs text-text-secondary">优化建议</span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1 font-mono text-accent-purple/80">
                        {Object.keys(appliedSuggestions).length} 已一键采纳应用
                      </p>
                    </div>
                  </div>

                  {/* Overview Executive description */}
                  <div className="bg-[#101014] border border-border-custom rounded-2xl p-6 relative overflow-hidden card-shimmer" id="ai-exec-summary">
                    {/* Radial background pulse */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.06),transparent,transparent)] pointer-events-none"></div>
                    <div className="flex items-center gap-2.5 mb-3 relative z-10">
                      <div className="w-6 h-6 rounded-full bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                        <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
                      </div>
                      <span className="text-xs font-bold text-accent-blue font-mono uppercase tracking-widest">
                        AI EXECUTIVE SUMMARY / 架构师评述
                      </span>
                    </div>
                    <p className="text-sm text-text-primary leading-relaxed relative z-10-variant font-medium">
                      {reviewData.summary}
                    </p>
                  </div>

                  {/* Primary split layout: left column (diff explore) vs right column (suggestions) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Panel: Files and Code Sandbox View (span 5) */}
                    <div className="lg:col-span-5 flex flex-col gap-6" id="files-list-col">
                      <div className="bg-surface border border-border-custom rounded-2xl overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-border-custom flex items-center justify-between bg-zinc-900/30">
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4 text-accent-blue" />
                            <span className="text-[11px] font-bold uppercase text-text-secondary tracking-widest">
                              CHANGED FILE TREE / 变更目录
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-text-secondary">
                            {reviewData.changedFiles.length} 个受影响组件
                          </span>
                        </div>

                        {/* File tree navigation list */}
                        <div className="divide-y divide-border-custom/50">
                          {reviewData.changedFiles.map((file) => (
                            <button
                              key={file.filename}
                              onClick={() => setSelectedFilename(file.filename)}
                              className={`w-full text-left px-5 py-3.5 transition-all text-xs flex items-center justify-between cursor-pointer ${
                                selectedFilename === file.filename
                                  ? "bg-zinc-900/50 border-l-[3px] border-accent-blue pl-[17px]"
                                  : "hover:bg-white/[0.01]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <FileCode className={`w-4 h-4 shrink-0 ${
                                  selectedFilename === file.filename ? "text-accent-blue" : "text-text-secondary"
                                }`} />
                                <span className={`font-mono truncate ${
                                  selectedFilename === file.filename ? "text-text-primary font-semibold" : "text-text-secondary"
                                }`}>
                                  {file.filename}
                                </span>
                              </div>

                              {/* Badges for risks */}
                              {file.riskLevel === "high" ? (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded uppercase shrink-0">
                                  高风险
                                </span>
                              ) : file.riskLevel === "medium" ? (
                                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded uppercase shrink-0">
                                  中风险
                                </span>
                              ) : file.riskLevel === "low" ? (
                                <span className="bg-zinc-500/10 text-text-secondary border border-zinc-700 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase shrink-0">
                                  低风险
                                </span>
                              ) : (
                                <span className="text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" /> 优化好
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Code file live viewer container */}
                      {activeFileObject && (
                        <div className="bg-surface border border-border-custom rounded-2xl overflow-hidden flex flex-col">
                          <div className="px-5 py-3 border-b border-border-custom flex items-center justify-between bg-zinc-900/10 font-mono text-xs text-text-secondary">
                            <span className="truncate">{activeFileObject.filename} (源文件速览)</span>
                            <button 
                              className="text-accent-blue hover:underline text-[11px] shrink-0"
                              onClick={() => {
                                // Jump to sandbox with corresponding file loaded!
                                const matchingTpl = SANDBOX_TEMPLATES.find(t => t.files.some(f => f.filename === activeFileObject.filename)) || SANDBOX_TEMPLATES[0];
                                handleSelectSandboxTemplate(matchingTpl);
                                setActiveSandboxFilename(activeFileObject.filename);
                                setActiveTab("sandbox");
                              }}
                            >
                              跳转沙盒编辑
                            </button>
                          </div>
                          
                          <div className="p-4 overflow-x-auto bg-[#040406] max-h-80 overflow-y-auto">
                            <pre className="text-xs font-mono text-zinc-300 leading-relaxed">
                              <code>
                                {activeFileObject.content.split("\n").map((line, idx) => (
                                  <div key={idx} className={`table-row ${line.includes("💣") ? "bg-red-950/20 text-red-300" : ""}`}>
                                    <span className="table-cell select-none pr-4 text-[10px] text-zinc-600 text-right w-8">{idx + 1}</span>
                                    <span className="table-cell whitespace-pre-wrap">{line}</span>
                                  </div>
                                ))}
                              </code>
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Risk Counters & Deep Recommendations suggestions (span 7) */}
                    <div className="lg:col-span-7 flex flex-col gap-6" id="suggestions-col">
                      
                      {/* Risk blocks counters banner */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div 
                          onClick={() => setFilterLevel(filterLevel === "critical" ? "all" : "critical")}
                          className={`bg-surface border p-4 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:bg-[#141416] hover:-translate-y-0.5 ${filterLevel === "critical" ? "border-red-500 ring-1 ring-red-500/50 shadow-lg shadow-red-500/10" : "border-red-500/20 shadow-sm"}`}
                        >
                          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-secondary font-mono uppercase tracking-wider">高危阻断项目</p>
                            <p className="text-sm font-semibold text-text-primary">
                              {reviewData.risks.filter(r => r.level === "high").length} 个未解决
                            </p>
                          </div>
                        </div>

                        <div 
                          onClick={() => setFilterLevel(filterLevel === "warning" ? "all" : "warning")}
                          className={`bg-surface border p-4 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:bg-[#141416] hover:-translate-y-0.5 ${filterLevel === "warning" ? "border-yellow-500 ring-1 ring-yellow-500/50 shadow-lg shadow-yellow-500/10" : "border-yellow-500/20 shadow-sm"}`}
                        >
                          <Info className="w-5 h-5 text-yellow-500 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-secondary font-mono uppercase tracking-wider">中度安全性漏洞</p>
                            <p className="text-sm font-semibold text-text-primary">
                              {reviewData.risks.filter(r => r.level === "medium").length} 个预警
                            </p>
                          </div>
                        </div>

                        <div 
                          onClick={() => setFilterLevel("all")}
                          className={`bg-surface border p-4 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:bg-[#141416] hover:-translate-y-0.5 ${filterLevel === "all" ? "border-accent-blue ring-1 ring-accent-blue/50 shadow-lg shadow-accent-blue/10" : "border-border-custom shadow-sm"}`}
                        >
                          <CheckCircle2 className={`w-5 h-5 shrink-0 ${filterLevel === "all" ? "text-accent-blue" : "text-[#10b981]"}`} />
                          <div>
                            <p className="text-[10px] text-text-secondary font-mono uppercase tracking-wider font-semibold">代码审计评分</p>
                            <p className={`text-sm font-bold font-mono ${filterLevel === "all" ? "text-accent-blue" : "text-[#10b981]"}`}>
                              {reviewData.risks.filter(r => r.level === "high").length === 0 ? "A+ EXCELLENT" : "C- CAUTION"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Main action suggestions items box */}
                      <div className="bg-surface border border-border-custom rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-border-custom">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-accent-purple" />
                            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
                              ACTIONABLE DEEP ADVICE / 安全改良提议
                            </span>
                          </div>
                          <span className="bg-[#18181b] border border-border-custom text-text-secondary text-[10px] font-mono px-2 py-0.5 rounded">
                            {reviewData.suggestions.filter(s => filterLevel === "all" || s.severity === filterLevel).length} 深度项
                          </span>
                        </div>

                        {/* Suggestions Accordion */}
                        <div className="space-y-3.5">
                          {reviewData.suggestions.filter(s => filterLevel === "all" || s.severity === filterLevel).length === 0 ? (
                            <div className="text-center py-8 text-text-secondary text-sm font-mono bg-[#09090b] rounded-xl border border-border-custom/50">
                              未发现当前类别的改良提议
                            </div>
                          ) : (
                            reviewData.suggestions.map((suggestion, sIdx) => {
                              if (filterLevel !== "all" && suggestion.severity !== filterLevel) return null;
                            const dictKey = `${suggestion.file}-${sIdx}`;
                            const isApplied = appliedSuggestions[dictKey];
                            const isExpanded = expandedSuggestion === sIdx;

                            return (
                              <div
                                key={dictKey}
                                className={`border border-border-custom rounded-xl overflow-hidden transition-all duration-300 ${
                                  isExpanded ? "bg-[#141416]" : "bg-black/[0.15]"
                                }`}
                              >
                                {/* Header of suggestion bar */}
                                <div
                                  onClick={() => setExpandedSuggestion(isExpanded ? null : sIdx)}
                                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.01] select-none"
                                >
                                  <div className="flex items-start gap-3 pl-1">
                                    <div className="mt-1">
                                      {suggestion.severity === "critical" ? (
                                        <span className="bg-red-500/20 text-red-400 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-red-500/30 uppercase">
                                          严重
                                        </span>
                                      ) : suggestion.severity === "warning" ? (
                                        <span className="bg-yellow-500/10 text-yellow-500 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-yellow-500/20 uppercase">
                                          轻微
                                        </span>
                                      ) : (
                                        <span className="bg-zinc-800 text-text-secondary text-[9px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 uppercase">
                                          贴议
                                        </span>
                                      )}
                                    </div>

                                    <div>
                                      <h4 className="text-[13px] font-semibold text-text-primary flex items-center gap-1.5">
                                        <span>{suggestion.title}</span>
                                        {isApplied && (
                                          <span className="text-[#10b981] bg-[#10b981]/15 text-[9px] px-1 py-0.2 rounded font-mono flex items-center gap-0.5">
                                            <Check className="w-2.5 h-2.5" /> 已修复
                                          </span>
                                        )}
                                      </h4>
                                      <p className="text-xs text-text-secondary mt-1 font-mono">
                                        应用范围: <span className="text-accent-blue underline font-mono select-text">{suggestion.file}</span>
                                      </p>
                                    </div>
                                  </div>

                                  <div className="text-text-secondary hover:text-text-primary">
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </div>
                                </div>

                                {/* Expanded Description block */}
                                {isExpanded && (
                                  <div className="px-5 pb-5 pt-1 border-t border-border-custom/40 space-y-4">
                                    {/* Brief summary */}
                                    <p className="text-xs text-text-secondary leading-relaxed bg-zinc-900/30 p-3 rounded-lg border border-border-custom/50">
                                      {suggestion.description}
                                    </p>

                                    {/* Code Diffs viewer component */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-[11px] text-text-secondary font-mono">
                                        <span>DIFFERENCE MATRIX / 修复对比差异码:</span>
                                        <button 
                                          className="text-accent-blue hover:underline"
                                          onClick={() => copyToClipboard(suggestion.revisedCode)}
                                        >
                                          复制代码
                                        </button>
                                      </div>

                                      <div className="bg-[#050508] border border-border-custom rounded-xl overflow-hidden font-mono text-xs">
                                        {/* Buggy block */}
                                        <div className="p-3.5 border-b border-border-custom/30 bg-red-950/10">
                                          <div className="text-[10px] text-red-400 font-mono font-semibold uppercase mb-1 flex items-center gap-1">
                                            <span>OLD CODE BLOCK</span>
                                          </div>
                                          <pre className="text-red-300 whitespace-pre-wrap select-text pl-1 opacity-70">
                                            <code>- {suggestion.originalCode}</code>
                                          </pre>
                                        </div>

                                        {/* Revised dynamic patch */}
                                        <div className="p-3.5 bg-[#10b981]/05">
                                          <div className="text-[10px] text-[#10b981] font-mono font-semibold uppercase mb-1 flex items-center gap-1">
                                            <span>PROPOSED FIX</span>
                                          </div>
                                          <pre className="text-[#2ecc71] whitespace-pre-wrap select-text pl-1">
                                            <code>{suggestion.revisedCode.startsWith("+") ? "" : "+ "}{suggestion.revisedCode}</code>
                                          </pre>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Deep engineer explanation */}
                                    <div className="bg-zinc-900/40 p-4 rounded-xl border border-border-custom/30 space-y-1.5">
                                      <h5 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider font-mono">
                                        Architect Explanation / 代码危害机制原理:
                                      </h5>
                                      <p className="text-xs text-text-primary leading-relaxed select-text">
                                        {suggestion.explanation}
                                      </p>
                                    </div>

                                    {/* Action button */}
                                    <div className="pt-2 flex justify-end gap-3 font-mono">
                                      <button
                                        onClick={() => handleApplySuggestion(suggestion, dictKey)}
                                        disabled={isApplied}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                          isApplied
                                            ? "bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 cursor-not-allowed"
                                            : "bg-accent-blue hover:bg-blue-600 active:scale-95 text-white shadow-md shadow-blue-500/10"
                                        }`}
                                      >
                                        {isApplied ? "已一键重构该缺陷" : "✨ 一键重构修复本处隐患"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Dashboard 空状态 — 尚未执行任何审查 */}
              {activeTab === "dashboard" && !reviewData && (
                <div className="flex flex-col items-center justify-center py-24 text-center" id="dashboard-empty">
                  <div className="w-20 h-20 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mb-6">
                    <Sparkles className="w-8 h-8 text-accent-blue" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2">暂无审查数据</h3>
                  <p className="text-sm text-text-secondary max-w-md">
                    请在首页输入一个 GitHub Pull Request 链接开始深度代码审查，
                    或在沙盒演练场中提交代码进行模拟分析。
                  </p>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setActiveTab("home")}
                      className="px-5 py-2.5 bg-accent-blue hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
                    >
                      前往首页
                    </button>
                    <button
                      onClick={() => setActiveTab("sandbox")}
                      className="px-5 py-2.5 bg-surface border border-border-custom hover:border-accent-purple/40 text-text-primary rounded-xl text-sm font-semibold transition-all cursor-pointer"
                    >
                      沙盒演练
                    </button>
                  </div>
                </div>
              )}

              {/* PAGE 2: INTERACTIVE SANDBOX PLAYGROUND */}
              {activeTab === "sandbox" && (
                <div className="space-y-6" id="sandbox-tab">
                  {/* Banner instruction */}
                  <div className="bg-zinc-900 border border-border-custom rounded-2xl p-6 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                          <Terminal className="w-5 h-5 text-accent-blue" />
                          <span>AI 代码沙盒安全实战演练</span>
                        </h2>
                        <p className="text-xs text-text-secondary mt-1 max-w-2xl leading-relaxed">
                          这里是个无需提交 GitHub PR 的独立测试区。你可以选择不同维度的真实微系统应用缺陷漏洞（如 JWT 过期注入、SQL注入拼接、复杂事件内存泄漏），在下方的在线编码器中修改，最后点击“安全审查”，代码将被实时上传至 Gemini 进行全链路编译分析，在看板中反馈重构建议。
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-text-secondary font-mono mr-1">演练预载模板:</span>
                        {SANDBOX_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.name}
                            onClick={() => handleSelectSandboxTemplate(tpl)}
                            className={`px-3 py-1 rounded text-xs transition-colors font-semibold ${
                              selectedSandboxTemplate.name === tpl.name
                                ? "bg-accent-blue text-white"
                                : "bg-surface text-text-secondary border border-border-custom hover:bg-zinc-800"
                            }`}
                          >
                            {tpl.name.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Interactive IDE split layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[500px]">
                    
                    {/* Sandbox IDE files navigator (span 3) */}
                    <div className="lg:col-span-3 bg-surface border border-border-custom rounded-2xl p-4 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="pb-2 border-b border-border-custom flex items-center gap-2">
                          <Folder className="w-4 h-4 text-accent-blue" />
                          <span className="text-[11px] font-bold text-text-secondary tracking-widest uppercase">
                            SANDBOX FILES
                          </span>
                        </div>

                        <div className="space-y-1">
                          {sandboxFiles.map((file) => (
                            <button
                              key={file.filename}
                              onClick={() => {
                                setActiveSandboxFilename(file.filename);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between cursor-pointer ${
                                activeSandboxFilename === file.filename
                                  ? "bg-[#18181b] text-accent-blue border border-border-custom font-semibold"
                                  : "text-text-secondary hover:text-text-primary hover:bg-white/[0.01]"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileCode className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{file.filename}</span>
                              </div>
                              {/* Show vulnerability hint marker on specific simulated buggy files */}
                              {(file.filename.includes("auth.ts") || file.filename.includes("users.ts") || file.filename.includes("Dashboard")) && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0 animate-pulse"></span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Template details info block */}
                      <div className="bg-zinc-900/50 p-4 border border-zinc-900 rounded-xl space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-text-primary font-bold">
                          <Info className="w-3.5 h-3.5 text-accent-blue" />
                          <span>代码缺陷机制</span>
                        </div>
                        <p className="text-[11px] text-text-secondary leading-relaxed">
                          {selectedSandboxTemplate.description}
                        </p>
                      </div>
                    </div>

                    {/* Online Interactive Editor (span 9) */}
                    <div className="lg:col-span-9 flex flex-col bg-surface border border-border-custom rounded-2xl overflow-hidden">
                      
                      {/* Editor tab top bar */}
                      <div className="px-5 py-3 border-b border-border-custom bg-[#09090b] flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 mr-2">
                            <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                            <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
                            <span className="w-3 h-3 rounded-full bg-[#10b981]/80"></span>
                          </div>
                          <span className="text-accent-blue">{activeSandboxFilename}</span>
                        </div>
                        <span className="text-text-secondary text-[11px]">EDITABLE ACTIVE PLAYGROUND</span>
                      </div>

                      {/* Editor Canvas Area */}
                      <div className="flex-1 min-h-0 relative bg-[#040406]">
                        <textarea
                          className="w-full h-full p-5 font-mono text-xs leading-relaxed text-zinc-300 resize-none bg-transparent focus:outline-none focus:ring-0 select-text"
                          value={sandboxCodeInput}
                          onChange={(e) => handleCodeChange(e.target.value)}
                        />
                      </div>

                      {/* Editor Action buttons bottom tray */}
                      <div className="px-6 py-4 border-t border-border-custom bg-[#09090b] flex items-center justify-between font-mono text-xs">
                        <button
                          className="px-4 py-2 bg-surface hover:bg-zinc-800 active:scale-95 text-text-secondary hover:text-text-primary rounded-lg border border-border-custom transition-all flex items-center gap-1.5 cursor-pointer"
                          onClick={() => {
                            // reset to default code files
                            const defaultTpl = SANDBOX_TEMPLATES.find(t => t.name === selectedSandboxTemplate.name);
                            if (defaultTpl) {
                              handleSelectSandboxTemplate(defaultTpl);
                            }
                          }}
                        >
                          <Undo className="w-3.5 h-3.5" />
                          <span>一键还原初始漏洞文件</span>
                        </button>

                        <button
                          className="px-6 py-2 bg-accent-blue hover:bg-blue-600 active:scale-95 text-white rounded-lg transition-all font-semibold flex items-center gap-2 border border-accent-blue/20 shadow-md shadow-blue-500/10 cursor-pointer"
                          onClick={() => {
                            triggerPRAnalysis(undefined, sandboxFiles, selectedSandboxTemplate.name);
                          }}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>🚀 发送给 AI 实施智能审查</span>
                        </button>
                      </div>

                    </div>

                  </div>
                </div>
              )}

              {/* PAGE 3: PRE-FLIGHT CHECKLIST PREVIEW */}
              {activeTab === "checklist" && (
                <div className="space-y-6" id="checklist-tab">
                  {/* Banner */}
                  <div className="bg-zinc-900 border border-border-custom rounded-2xl p-6">
                    <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                      <Shield className="w-5 h-5 text-accent-purple" />
                      <span>企业级生产代码上架前置安全审查清单</span>
                    </h2>
                    <p className="text-xs text-text-secondary mt-1">
                      本清单概括了 Github AI PR Assistant 核心扫描漏洞维度，可在本地合入 Pull Request 前自助校验。
                    </p>
                  </div>

                  {/* Checklist lists Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Item 1 */}
                    <div className="bg-surface border border-border-custom p-6 rounded-2xl space-y-4">
                      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 border-b border-border-custom pb-2.5">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        <span>01 / 身份验证与中间件安全限制</span>
                      </h3>
                      <ul className="space-y-3 text-xs text-text-secondary leading-relaxed">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>所有路由中间件验证（如 `jwt.verify`）必须包裹在 `try/catch` 分区内，防止异常引起进程中断故障。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>JWT 签名算法必须显式指定（优先 `RS256` / `HS256`），杜绝头部注入 `alg: "none"` 绕过防御。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>必须设定合理的 Token 有效过期区间（e.g. `exp`），对不具备期效的 Token 进行系统报警惩处。</span>
                        </li>
                      </ul>
                    </div>

                    {/* Item 2 */}
                    <div className="bg-surface border border-border-custom p-6 rounded-2xl space-y-4">
                      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 border-b border-border-custom pb-2.5">
                        <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                        <span>02 / 数据库注入拼接防护</span>
                      </h3>
                      <ul className="space-y-3 text-xs text-text-secondary leading-relaxed">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>严禁使用 ES6 template literals 拼接原生 SQL 语句进行模糊查询，必须采用参数化绑定（Parameterized Queries）。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>使用 ORM 框架（如 Prisma, TypeORM）时，警惕原生级 execute 或者 query 直接传参注入漏洞。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>对客户端传入的用户过滤数据字段进行严密转义，杜绝包含任何逃脱单双引号。</span>
                        </li>
                      </ul>
                    </div>

                    {/* Item 3 */}
                    <div className="bg-surface border border-border-custom p-6 rounded-2xl space-y-4">
                      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 border-b border-border-custom pb-2.5">
                        <span className="w-2 h-2 rounded-full bg-accent-blue"></span>
                        <span>03 / 前端渲染与资源占用保障</span>
                      </h3>
                      <ul className="space-y-3 text-xs text-text-secondary leading-relaxed">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>在 React `useEffect` 中挂载定时监听器或 WebSockets 时，卸载时务必调用对应的撤消接口以防长期闭包导致泄露。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>组件挂载的第三方图表 D3/Echarts Canvas 节点卸载时必须调用其 destroy 工具回收显存内存通道。</span>
                        </li>
                      </ul>
                    </div>

                    {/* Item 4 */}
                    <div className="bg-surface border border-border-custom p-6 rounded-2xl space-y-4">
                      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 border-b border-border-custom pb-2.5">
                        <span className="w-2 h-2 rounded-full bg-accent-purple"></span>
                        <span>04 / 日志脱敏与密码学秘密审计</span>
                      </h3>
                      <ul className="space-y-3 text-xs text-text-secondary leading-relaxed">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>检查所有控制台及全局上报（e.g. `console.log`），不能泄漏包括明文口令、私钥、身份令牌在内的任何信息。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                          <span>严禁将敏感凭据直接以硬编码定义在源文件中；本地开发、服务器部署应该采用配置文件 `.env` 代替。</span>
                        </li>
                      </ul>
                    </div>

                  </div>
                </div>
              )}

              {/* PAGE 4: HISTORY SCAN LISTS */}
              {activeTab === "history" && (
                <div className="space-y-6" id="history-tab">
                  <div className="bg-surface border border-border-custom rounded-2xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-border-custom bg-zinc-900/30">
                      <h3 className="text-sm font-semibold text-text-primary">历史审计报告存根</h3>
                      <p className="text-xs text-text-secondary mt-1">
                        存储当前会话过程中触发过的所有 Pull Request 扫描结果。
                      </p>
                    </div>

                    <div className="divide-y divide-border-custom">
                      {historyReports.map((report) => (
                        <div key={report.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
                          <div className="space-y-1.5 font-sans">
                            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                              {report.title}
                            </h4>
                            <div className="text-xs text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
                              <span>仓库: {report.repo}</span>
                              <span>•</span>
                              <span>提交者: {report.author}</span>
                              <span>•</span>
                              <span>扫描于: {report.time}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {report.risksCount > 0 ? (
                              <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2.5 py-1 rounded font-mono font-semibold">
                                发现 {report.risksCount} 处安全隐患
                              </span>
                            ) : (
                              <span className="bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] text-[10px] px-2.5 py-1 rounded font-mono font-semibold">
                                未见异常 安全合规
                              </span>
                            )}
                            <button
                              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-text-primary border border-border-custom rounded-lg font-sans transition-all cursor-pointer"
                              onClick={() => {
                                setActiveTab("dashboard");
                              }}
                            >
                              查看报告
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </>

      </main>

      {/* Modern Web Footer */}
      <footer className="mt-auto border-t border-border-custom bg-[#09090b]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex flex-col md:flex-row items-center justify-between font-sans text-xs text-text-secondary gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-purple" />
            <span>© 2026 Github AI PR Assistant。版权所有。</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

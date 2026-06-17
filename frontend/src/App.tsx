import React, { useState, useEffect, useRef, useCallback } from "react";
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
  ChevronRight,
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
  Undo,
  X,
  GripVertical,
  Menu,
  PanelLeftClose,
  PanelRightClose,
  ListTree,
} from "lucide-react";
import { PRReviewData, ChangedFile, SuggestionItem, SandboxTemplate } from "./types";
import { SANDBOX_TEMPLATES } from "./data/templates";
import { DEMO_STEPS, DEMO_STEP_DELAYS, DEMO_DATA } from "./data/demo";

// ── Helper: Collapsible long text block ──
const SummaryBlock: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 150;
  return (
    <div>
      <p className={`text-xs text-text-primary/80 leading-relaxed ${!expanded && isLong ? "line-clamp-2" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-accent-blue/60 hover:text-accent-blue mt-1 transition-colors"
        >
          {expanded ? "收起 ▲" : "展开全部 ▼"}
        </button>
      )}
    </div>
  );
};

// ── Helper: Code block with scroll, copy & collapse ──
const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [collapsed, setCollapsed] = useState(true);
  const lines = code.split("\n");
  const isLong = lines.length > 20;
  const previewLines = lines.slice(0, 20).join("\n");
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板！");
  };
  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          onClick={() => copyToClipboard(code)}
          className="px-2 py-1 bg-[#1A1A1A] border border-border-custom rounded text-[10px] text-text-secondary/60 hover:text-text-secondary transition-colors"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
      <pre className={`text-zinc-300 text-xs font-mono leading-relaxed whitespace-pre-wrap p-4 overflow-x-auto ${collapsed && isLong ? "max-h-[400px]" : "max-h-[70vh]"} overflow-y-auto`}>
        <code>{collapsed && isLong ? previewLines : code}</code>
      </pre>
      {isLong && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full py-2 bg-[#1A1A1A]/80 border-t border-border-custom text-[10px] text-text-secondary/50 hover:text-text-secondary transition-colors flex items-center justify-center gap-1"
        >
          {collapsed ? <><ChevronDown className="w-3 h-3" /> 展开全部代码 ({lines.length} 行)</> : <><ChevronUp className="w-3 h-3" /> 收起代码</>}
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"home" | "dashboard" | "sandbox" | "checklist" | "history">("home");
  const [prUrl, setPrUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
  
  // Custom API configuration or secret state
  const [apiError, setApiError] = useState<string | null>(null);

  // ===== 🎭 Demo 路演模式 =====
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    try { return localStorage.getItem("demo_mode") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("demo_mode", isDemo ? "1" : "0"); } catch { /* 静默忽略 */ }
  }, [isDemo]);
  // 快捷键 Ctrl+Shift+D 切换 Demo 模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setIsDemo(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Dynamic User-supplied Credentials Configuration
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem("github_token") || "");
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");
  const [customModel, setCustomModel] = useState<string>(() => localStorage.getItem("custom_model") || "");

  // 自定义模型下拉菜单
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const MODEL_OPTIONS = [
    { value: "", label: "🖥️  使用服务器默认模型", desc: "由后台管理员预设的模型", helpUrl: "" },
    { value: "deepseek-v4-pro", label: "⚡  DeepSeek V4 Pro", desc: "国产高性价比推理模型", helpUrl: "https://platform.deepseek.com/api_keys" },
    { value: "qwen-plus", label: "🌀  通义千问 Plus", desc: "阿里云平衡型模型", helpUrl: "https://dashscope.console.aliyun.com/apiKey" },
    { value: "qwen-max", label: "🚀  通义千问 Max", desc: "阿里云旗舰级模型", helpUrl: "https://dashscope.console.aliyun.com/apiKey" },
    { value: "glm-4-flash", label: "✨  智谱 GLM-4 Flash", desc: "智谱轻量高速模型", helpUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
    { value: "moonshot-v1-8k", label: "🌙  Kimi moonshot-v1", desc: "月之暗面长上下文模型", helpUrl: "https://platform.moonshot.cn/console/api-keys" },
    { value: "gpt-4o", label: "🤖  OpenAI GPT-4o", desc: "OpenAI 多模态旗舰模型", helpUrl: "https://platform.openai.com/api-keys" },
  ];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    if (showModelDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelDropdown]);

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

  // Dashboard UI state
  const [dashTab, setDashTab] = useState<"summary" | "diff" | "suggestions">("summary");
  const [showFileList, setShowFileList] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Record<number, boolean>>({});
  const [expandAllSuggestions, setExpandAllSuggestions] = useState(false);

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

  // AbortController — 用于取消正在进行的审查
  const abortControllerRef = useRef<AbortController | null>(null);

  // 浮动进度面板拖拽相关
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });

  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const panel = (e.currentTarget as HTMLElement).closest(".progress-panel") as HTMLElement;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: panelPos ? rect.left : rect.left,
      panelY: panelPos ? rect.top : rect.top,
    };
  }, [panelPos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPanelPos({
        x: dragStartRef.current.panelX + dx,
        y: dragStartRef.current.panelY + dy,
      });
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
    // 如果已有进行中的请求，先取消
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setApiError(null);
    setLoadingLogs([]);

    // ===== 🎭 Demo 模式: 模拟完整审查流，10 步走完 ≈ 8~10s =====
    if (isDemo) {
      const startTime = Date.now();
      for (let i = 0; i < DEMO_STEPS.length; i++) {
        // 支持取消
        if (controller.signal.aborted) break;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, DEMO_STEP_DELAYS[i]);
          controller.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        setLoadingLogs(prev => { const next = [...prev, DEMO_STEPS[i]]; return next.length > 6 ? next.slice(-6) : next; });
      }
      // ⏱ 兜底 padding: 如果总耗时少于 4s，补到约 9~10s
      const elapsed = Date.now() - startTime;
      if (elapsed < 4000) {
        await new Promise(r => setTimeout(r, Math.max(0, 9000 - elapsed)));
      }
      if (!controller.signal.aborted) {
        setReviewData(DEMO_DATA);
        setSelectedFilename(DEMO_DATA.changedFiles[0]?.filename || "");
        setAppliedSuggestions({});
        setExpandedSuggestion(0);
        setHistoryReports(prev => [{ id: String(Date.now()), title: DEMO_DATA.title, repo: DEMO_DATA.repo, author: DEMO_DATA.author, time: "刚刚", risksCount: DEMO_DATA.risks.length }, ...prev]);
        setActiveTab("dashboard");
      }
      setIsLoading(false);
      abortControllerRef.current = null;
      return;
    }

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
        }),
        signal: controller.signal,
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
      // 忽略用户主动取消的错误
      if (err.name === "AbortError") {
        setLoadingLogs(prev => [...prev, "⏹️ 审查已取消"]);
      } else {
        setApiError(err.message || "请求服务器端点超时或失败。");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 取消正在进行的审查
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
      <header className="sticky top-0 z-50 border-b border-border-custom bg-[#121212]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
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

        {/* 🎭 Demo 切换 */}
        <button
          onClick={() => setIsDemo(!isDemo)}
          title="Ctrl+Shift+D 切换路演模式"
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 ml-3 rounded-full text-[10px] font-bold transition-all shrink-0 ${
            isDemo
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
              : "bg-transparent text-text-secondary/25 border border-transparent hover:border-border-custom hover:text-text-secondary/60"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isDemo ? "bg-amber-400 animate-pulse" : "bg-zinc-600"}`} />
          <span>{isDemo ? "DEMO 中" : "DEMO"}</span>
        </button>
      </header>

      {/* Hero / Form Area */}
      {activeTab === "home" && (
        <div className="w-full border-b border-border-custom bg-[#121212]/40 relative overflow-hidden">
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
                  <div className="relative bg-gradient-to-br from-[#111113] to-[#0d0d10] border border-border-custom/60 rounded-2xl p-5 hover:border-accent-blue/40 transition-all duration-300 flex flex-col justify-between group overflow-hidden">
                    {/* Subtle top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-700/60 to-zinc-800/80 flex items-center justify-center text-zinc-200 shadow-sm">
                            <Github className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-text-primary block">GitHub Access Token</span>
                            <span className="text-[10px] text-text-secondary">用于读取私有仓库并解除匿名率限制</span>
                          </div>
                        </div>
                        <a
                          href="https://github.com/settings/tokens/new?description=AI+PR+Review+Assistant&scopes=repo"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-blue hover:text-blue-400 bg-accent-blue/8 hover:bg-accent-blue/15 border border-accent-blue/20 hover:border-accent-blue/40 px-2.5 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3 h-3" />
                          前往获取 Token
                        </a>
                      </div>
                      <div className="relative mt-1">
                        <input
                          type="password"
                          placeholder="粘贴您的 GitHub 个人访问令牌 (ghp_***)"
                          className="w-full bg-[#070708] border border-border-custom rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-zinc-600 focus:outline-none focus:border-accent-blue/60 focus:ring-1 focus:ring-accent-blue/20 transition-all font-mono"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                        />
                        {githubToken && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3.5 bg-zinc-900/40 border border-zinc-800/50 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-text-secondary block leading-relaxed">
                        💡 点击上方按钮跳转 GitHub，生成拥有 <b className="text-zinc-300">repo scope</b> 的 Classic Token，粘贴后即可安全代理拉取私有仓库差分数据。
                      </span>
                    </div>
                  </div>

                  {/* LLM Model Configuration field */}
                  <div className="relative bg-gradient-to-br from-[#111113] to-[#0e0b13] border border-border-custom/60 rounded-2xl p-5 hover:border-accent-purple/40 transition-all duration-300 flex flex-col justify-between group">
                    {/* Subtle top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-purple/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-900/40 to-zinc-800/80 flex items-center justify-center text-accent-purple shadow-sm">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-[#c4b0f5] block">LLM 大模型 API 配置</span>
                            <span className="text-[10px] text-text-secondary">自定义审计引擎模型与 API 密钥</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">可选配置</span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* 模型选择 — 自定义下拉 */}
                        <div ref={modelDropdownRef} className="relative">
                          <label className="text-[10px] text-text-secondary block mb-1.5 font-medium flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-accent-purple/70" />首选审计引擎
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                            className="w-full bg-[#070708] border border-border-custom hover:border-accent-purple/40 rounded-xl px-3.5 py-2.5 text-xs text-left flex items-center justify-between transition-all duration-200 focus:outline-none focus:border-accent-purple/60 focus:ring-1 focus:ring-accent-purple/20"
                          >
                            <span className={customModel ? "text-text-primary" : "text-text-secondary"}>
                              {MODEL_OPTIONS.find(o => o.value === customModel)?.label || "🖥️  使用服务器默认模型"}
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 text-text-secondary transition-transform duration-200 ${showModelDropdown ? "rotate-180" : ""}`} />
                          </button>
                          {/* 下拉菜单 */}
                          {showModelDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#111113] border border-border-custom rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden py-1 max-h-[224px] overflow-y-auto">
                              {MODEL_OPTIONS.map((opt) => {
                                const isSelected = customModel === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { setCustomModel(opt.value); setShowModelDropdown(false); }}
                                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors duration-150 ${
                                      isSelected
                                        ? "bg-accent-purple/10 border-l-2 border-accent-purple"
                                        : "border-l-2 border-transparent hover:bg-zinc-800/50"
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-xs block truncate ${isSelected ? "text-[#c4b0f5] font-semibold" : "text-text-primary"}`}>{opt.label}</span>
                                      <span className="text-[10px] text-text-secondary mt-0.5 block">{opt.desc}</span>
                                    </div>
                                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent-purple mt-0.5 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* API 密钥 */}
                        <div>
                          <label className="text-[10px] text-text-secondary block mb-1.5 font-medium flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5 text-accent-purple/70" />LLM API 密钥
                          </label>
                          <div className="relative">
                            <input
                              type="password"
                              placeholder="填写与所选模型对应的 API 密钥"
                              className="w-full bg-[#070708] border border-border-custom hover:border-accent-purple/40 rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-zinc-600 focus:outline-none focus:border-accent-purple/60 focus:ring-1 focus:ring-accent-purple/20 transition-all font-mono"
                              value={geminiApiKey}
                              onChange={(e) => setGeminiApiKey(e.target.value)}
                            />
                            {geminiApiKey && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              </div>
                            )}
                          </div>
                          {/* 选中模型后的 API 获取指引 */}
                          {(() => {
                            const selectedModel = MODEL_OPTIONS.find(o => o.value === customModel);
                            if (!selectedModel?.helpUrl) return null;
                            return (
                              <a
                                href={selectedModel.helpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-accent-blue hover:text-blue-400 bg-accent-blue/5 hover:bg-accent-blue/10 border border-accent-blue/15 rounded-lg px-2.5 py-1.5 transition-all duration-200"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                前往 {selectedModel.label.replace(/[🖥️⚡🌀🚀✨🌙🤖]/g, "").trim().split(" ")[0]} 官网获取 API Key
                              </a>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3.5 bg-zinc-900/40 border border-zinc-800/50 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-text-secondary block leading-relaxed">
                        💡 默认使用服务器后台预设密钥。您亦可填写个人 API 密钥，消耗归入个人账户，<b className="text-zinc-300">数据不经第三方中转</b>。
                      </span>
                    </div>
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
          {apiError && (() => {
            const err = (apiError || "").toLowerCase();
            const isGithubToken = err.includes("token") || err.includes("401") || err.includes("403") || err.includes("私有仓库") || err.includes("repo scope");
            const isGithubRateLimit = err.includes("速率限制") || err.includes("rate limit") || err.includes("60 次/小时");
            const isGithubNotFound = err.includes("404") || err.includes("不存在") || err.includes("链接是否正确");
            const isLlm = err.includes("api key") || err.includes("llm") || err.includes("模型") || err.includes("密钥") || err.includes("供应商") || err.includes("provider") || err.includes("api_key");
            const title = isGithubRateLimit ? "⚠️ GitHub API 速率限制" : isGithubToken || isGithubNotFound ? "GitHub API 错误" : isLlm ? "LLM 调用错误" : "PR 审查执行出错";
            return (
            <div className="mb-6 bg-red-950/20 border border-red-500/30 text-red-100 p-4 rounded-xl text-xs flex flex-col gap-2 relative">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">{title}</span>
                  <p className="text-red-300/90 leading-relaxed font-mono">{apiError}</p>
                </div>
              </div>
              <div className="mt-2 pl-6 pt-2 border-t border-red-950/40 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="text-red-400 shrink-0">💡 解决办法:</span>
                <span className="text-red-300">
                  {isGithubRateLimit ? (
                    <>GitHub 未认证请求限额仅 <strong>60 次/小时</strong>，请<a href="https://github.com/settings/tokens/new?description=AI+PR+Review+Assistant&scopes=repo" target="_blank" rel="noopener noreferrer" className="underline mx-1 font-medium">点击获取 Token</a>并在上方填写，可提升至 <strong>5000 次/小时</strong>，或稍后再试</>
                  ) : isGithubToken ? (
                    <>请在上方填写有效的 <strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("home")}>GitHub Access Token</strong>（需 Classic Token 且勾选 repo scope）</>
                  ) : isGithubNotFound ? (
                    <>请检查 PR 链接是否正确，如为私有仓库请填写 <strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("home")}>GitHub Access Token</strong></>
                  ) : isLlm ? (
                    <>请检查 <strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("home")}>LLM API 密钥</strong>与 <strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("home")}>模型选择</strong>是否正确</>
                  ) : (
                    <>请检查上方配置或使用 <strong className="underline mx-1 cursor-pointer" onClick={() => setActiveTab("sandbox")}>【沙盒演练场】</strong>免配置体验</>
                  )}
                </span>
              </div>
              <button 
                className="absolute top-3 right-3 text-red-400 hover:text-red-200" 
                onClick={() => setApiError(null)}
              >
                ✕
              </button>
            </div>
            );
          })()}

          {/* 浮动左侧进度面板 — 审查中显示，不阻塞页面交互 */}
          {isLoading && (
            <div
              className={`progress-panel fixed z-50 w-[340px] sm:w-[380px] progress-panel-enter select-none ${
                panelPos ? "" : "left-4 sm:left-6 top-1/2 -translate-y-1/2"
              }`}
              style={panelPos ? { left: panelPos.x, top: panelPos.y, transform: "none" } : undefined}
            >
                <div className="bg-gradient-to-b from-[#131316] to-[#0e0e12] border border-border-custom rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                  {/* 顶部渐变装饰线 */}
                  <div className="h-[2px] bg-gradient-to-r from-accent-blue via-accent-purple to-accent-blue" />
                  
                  {/* 拖动把手 + 标题栏 */}
                  <div
                    className="px-4 pt-4 pb-2 flex items-center gap-2 cursor-grab active:cursor-grabbing border-b border-border-custom/30"
                    onMouseDown={handlePanelDragStart}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-text-secondary/50" />
                    <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider font-mono">拖拽移动</span>
                  </div>
                  <div className="px-5 pt-3 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-blue/20 to-accent-purple/20 border border-accent-blue/30 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-accent-blue animate-pulse" />
                          </div>
                          {/* 外圈旋转 */}
                          <div className="absolute -inset-1 rounded-xl border-2 border-accent-blue/20 border-t-accent-blue animate-spin" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-text-primary">AI 深度审计中</h3>
                          <p className="text-[10px] text-text-secondary mt-0.5">正在分析代码差异与安全风险</p>
                        </div>
                      </div>
                      <button
                        onClick={handleCancelAnalysis}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                        title="取消审查"
                      >
                        <X className="w-3 h-3" />
                        <span>取消</span>
                      </button>
                    </div>
                  </div>

                  {/* 分隔线 */}
                  <div className="mx-5 border-t border-border-custom/60" />

                  {/* 步骤日志 */}
                  <div className="px-5 py-4 max-h-[280px] overflow-y-auto space-y-0.5">
                    {loadingLogs.map((log, i) => {
                      const isLast = i === loadingLogs.length - 1;
                      const isDone = !isLast;
                      return (
                        <div key={i} className="flex items-start gap-3 py-1.5">
                          {/* 时间线指示器 */}
                          <div className="flex flex-col items-center pt-0.5">
                            {isDone ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-accent-blue/15 border border-accent-blue/40 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
                              </div>
                            )}
                            {/* 连接线 */}
                            {!isLast && <div className="w-[1px] h-3 bg-border-custom/60 mt-1" />}
                          </div>
                          {/* 日志文本 */}
                          <p className={`text-[11px] leading-relaxed pt-0.5 ${
                            isDone ? "text-text-secondary" : "text-text-primary font-medium"
                          }`}>{log}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* 底部状态条 */}
                  <div className="px-5 pb-4">
                    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                      <span className="text-[10px] text-text-secondary">审查完成后将自动跳转结果面板</span>
                    </div>
                  </div>
                </div>
              </div>
          )}

          <>
            {/* PAGE 1: PR REVIEW DASHBOARD */}
            {activeTab === "dashboard" && reviewData && (
                <div className="space-y-4" id="dashboard-tab">
                  
                  {/* Compact metrics bar — horizontal tags */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1A1A1A] border border-border-custom rounded-xl text-[11px] font-mono" id="stats-ribbon">
                    <span className="text-text-secondary/50">📋</span>
                    <span className="text-text-primary font-semibold truncate max-w-[200px]">{reviewData.repo}</span>
                    <span className="text-border-custom/40">|</span>
                    <span className="text-text-secondary">提交者 <span className="text-text-primary">{reviewData.author}</span></span>
                    <span className="text-border-custom/40">|</span>
                    <span className="text-text-secondary">文件 <span className="text-text-primary font-bold">{reviewData.filesCount}</span></span>
                    <span className="text-border-custom/40">|</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 font-bold">{reviewData.risks.filter(r => r.level === "high").length}</span>
                      <span className="text-text-secondary/60">高危</span>
                    </span>
                    <span className="text-border-custom/40">|</span>
                    <span className="text-text-secondary">建议 <span className="text-accent-purple font-bold">{reviewData.suggestions.length}</span></span>
                    <span className="text-border-custom/40">|</span>
                    <span className={`font-bold ${reviewData.risks.filter(r => r.level === "high").length === 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {reviewData.risks.filter(r => r.level === "high").length === 0 ? "A+" : "C-"}
                    </span>
                    <div className="flex-1" />
                    <button onClick={() => setShowFileList(!showFileList)} className="text-[10px] text-text-secondary/50 hover:text-text-secondary transition-colors">
                      {showFileList ? "隐藏" : "显示"}文件列表
                    </button>
                    <button onClick={() => setShowToc(!showToc)} className="text-[10px] text-text-secondary/50 hover:text-text-secondary transition-colors">
                      目录
                    </button>
                  </div>

                  {/* Overview Executive description */}
                  <div className="bg-[#1A1A1A] border border-border-custom rounded-xl p-4" id="ai-exec-summary">
                    <p className="text-xs text-text-primary leading-relaxed line-clamp-2">
                      {reviewData.summary}
                    </p>
                  </div>

                  {/* Three-column layout */}
                  <div className="flex gap-4" id="three-col-layout">
                    
                    {/* ── LEFT: File list sidebar (collapsible) ── */}
                    {showFileList && (
                      <div className="w-[220px] shrink-0" id="files-list-col">
                        <div className="bg-[#1A1A1A] border border-border-custom rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-260px)] sticky top-[72px]">
                          <div className="px-3 py-2.5 border-b border-border-custom flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-text-secondary/60 tracking-wider">变更文件</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono text-text-secondary/40">{reviewData.filesCount}</span>
                              <button onClick={() => setShowFileList(false)} className="text-text-secondary/30 hover:text-text-secondary/60 transition-colors" title="隐藏文件列表">
                                <PanelLeftClose className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div className="overflow-y-auto flex-1 py-1">
                            {reviewData.changedFiles.map((file) => {
                              const isActive = selectedFilename === file.filename;
                              return (
                                <button
                                  key={file.filename}
                                  onClick={() => { setSelectedFilename(file.filename); setDashTab("diff"); }}
                                  title={file.filename}
                                  className={`w-full text-left px-3 py-2 text-[11px] font-mono flex items-center gap-2 cursor-pointer transition-all group relative ${
                                    isActive
                                      ? "bg-accent-blue/10 border-l-[3px] border-accent-blue pl-[9px] text-text-primary"
                                      : "border-l-[3px] border-transparent pl-[9px] text-text-secondary/60 hover:bg-white/[0.03] hover:text-text-secondary"
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    file.riskLevel === "high" ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" 
                                    : file.riskLevel === "medium" ? "bg-yellow-500" 
                                    : file.riskLevel === "low" ? "bg-zinc-500" 
                                    : "bg-emerald-500"
                                  }`} />
                                  <span className="truncate">{file.filename.split("/").pop()}</span>
                                  {/* Tooltip on hover */}
                                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#2A2A2A] border border-border-custom rounded-lg text-[10px] text-text-secondary whitespace-nowrap z-50 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    {file.filename}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show file list toggle when hidden */}
                    {!showFileList && (
                      <button
                        onClick={() => setShowFileList(true)}
                        className="shrink-0 mt-2 text-text-secondary/30 hover:text-text-secondary/60 transition-colors"
                        title="显示文件列表"
                      >
                        <PanelLeftClose className="w-4 h-4 rotate-180" />
                      </button>
                    )}

                    {/* ── CENTER: Tabbed main content ── */}
                    <div className="flex-1 min-w-0" id="main-content-col">
                      
                      {/* Tab Navigation Bar */}
                      <div className="flex items-center gap-0.5 mb-3 bg-[#1A1A1A] border border-border-custom rounded-xl p-1">
                        {[
                          { key: "summary", label: "概览", icon: <Info className="w-3.5 h-3.5" /> },
                          { key: "diff", label: "代码对比", icon: <FileCode className="w-3.5 h-3.5" /> },
                          { key: "suggestions", label: "改良建议", icon: <Lightbulb className="w-3.5 h-3.5" />, badge: reviewData.suggestions.length },
                        ].map((tab: any) => (
                          <button
                            key={tab.key}
                            onClick={() => setDashTab(tab.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                              dashTab === tab.key
                                ? "bg-surface text-text-primary shadow-sm"
                                : "text-text-secondary/50 hover:text-text-secondary hover:bg-white/[0.02]"
                            }`}
                          >
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                            {tab.badge !== undefined && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                dashTab === tab.key ? "bg-accent-blue/15 text-accent-blue" : "bg-transparent text-text-secondary/40"
                              }`}>
                                {tab.badge}
                              </span>
                            )}
                          </button>
                        ))}
                        <div className="flex-1" />
                        {/* Collapse/Expand All */}
                        {dashTab === "suggestions" && (
                          <button
                            onClick={() => { setExpandAllSuggestions(!expandAllSuggestions); setExpandedCodeBlocks({}); }}
                            className="px-3 py-1.5 text-[10px] text-text-secondary/50 hover:text-text-secondary border-l border-border-custom/60 flex items-center gap-1 transition-colors"
                          >
                            {expandAllSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            <span>{expandAllSuggestions ? "折叠所有" : "展开所有"}</span>
                          </button>
                        )}
                      </div>

                      {/* ── Tab: 概览 ── */}
                      {dashTab === "summary" && (
                        <div className="space-y-3">
                          {/* Risk Filter Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div 
                              onClick={() => { setFilterLevel(filterLevel === "critical" ? "all" : "critical"); setDashTab("suggestions"); }}
                              className={`bg-surface border p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                                filterLevel === "critical" 
                                  ? "border-red-500/60 ring-1 ring-red-500/40 shadow-lg shadow-red-500/10" 
                                  : "border-red-500/15 hover:border-red-500/30"
                              }`}
                            >
                              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-red-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-text-secondary/60 font-mono uppercase tracking-wider">高危阻断</p>
                                <p className="text-sm font-bold text-red-400">{reviewData.risks.filter(r => r.level === "high").length} 项</p>
                              </div>
                            </div>

                            <div 
                              onClick={() => { setFilterLevel(filterLevel === "warning" ? "all" : "warning"); setDashTab("suggestions"); }}
                              className={`bg-surface border p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                                filterLevel === "warning" 
                                  ? "border-yellow-500/60 ring-1 ring-yellow-500/40 shadow-lg shadow-yellow-500/10" 
                                  : "border-yellow-500/15 hover:border-yellow-500/30"
                              }`}
                            >
                              <div className="w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
                                <Info className="w-4 h-4 text-yellow-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-text-secondary/60 font-mono uppercase tracking-wider">中度预警</p>
                                <p className="text-sm font-bold text-yellow-400">{reviewData.risks.filter(r => r.level === "medium").length} 项</p>
                              </div>
                            </div>

                            <div 
                              onClick={() => { setFilterLevel("all"); setDashTab("suggestions"); }}
                              className={`bg-surface border p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                                filterLevel === "all" 
                                  ? "border-accent-blue/60 ring-1 ring-accent-blue/40 shadow-lg shadow-accent-blue/10" 
                                  : "border-border-custom hover:border-accent-blue/30"
                              }`}
                            >
                              <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
                                <Shield className="w-4 h-4 text-accent-blue" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-text-secondary/60 font-mono uppercase tracking-wider">安全评分</p>
                                <p className={`text-sm font-bold font-mono ${reviewData.risks.filter(r => r.level === "high").length === 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {reviewData.risks.filter(r => r.level === "high").length === 0 ? "A+" : "C-"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Full Summary with expand */}
                          <div className="bg-surface border border-border-custom rounded-xl p-4">
                            <SummaryBlock text={reviewData.summary} />
                          </div>

                          {/* Quick Stats */}
                          <div className="bg-[#1A1A1A] border border-border-custom rounded-xl p-4">
                            <h4 className="text-[11px] font-bold text-text-secondary/50 uppercase tracking-wider mb-3">审查统计</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-text-secondary/50">变更文件</span>
                                <p className="text-text-primary font-bold font-mono mt-0.5">{reviewData.filesCount}</p>
                              </div>
                              <div>
                                <span className="text-text-secondary/50">高危风险</span>
                                <p className="text-red-400 font-bold font-mono mt-0.5">{reviewData.risks.filter(r => r.level === "high").length}</p>
                              </div>
                              <div>
                                <span className="text-text-secondary/50">中危风险</span>
                                <p className="text-yellow-400 font-bold font-mono mt-0.5">{reviewData.risks.filter(r => r.level === "medium").length}</p>
                              </div>
                              <div>
                                <span className="text-text-secondary/50">改良建议</span>
                                <p className="text-accent-purple font-bold font-mono mt-0.5">{reviewData.suggestions.length}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Tab: 代码对比 ── */}
                      {dashTab === "diff" && (
                        <div>
                          {activeFileObject ? (
                            <div className="bg-surface border border-border-custom rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-border-custom flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-mono">
                                  <FileCode className="w-3.5 h-3.5 text-text-secondary/50" />
                                  <span className="text-text-primary font-semibold">{activeFileObject.filename.split("/").pop()}</span>
                                  <span className="text-text-secondary/30">—</span>
                                  <span className="text-text-secondary/40 text-[10px]">{activeFileObject.filename}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
                                    activeFileObject.riskLevel === "high" ? "bg-red-500/15 text-red-400 border border-red-500/20" :
                                    activeFileObject.riskLevel === "medium" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                                    activeFileObject.riskLevel === "low" ? "bg-zinc-800 text-text-secondary border border-zinc-700" :
                                    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}>
                                    {activeFileObject.riskLevel === "high" ? "高危" : activeFileObject.riskLevel === "medium" ? "中危" : activeFileObject.riskLevel === "low" ? "低危" : "安全"}
                                  </span>
                                  <button onClick={() => copyToClipboard(activeFileObject.content)} className="text-text-secondary/30 hover:text-text-secondary/60 transition-colors">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <CodeBlock code={activeFileObject.content} />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center bg-surface border border-border-custom rounded-xl">
                              <FileCode className="w-10 h-10 text-text-secondary/15 mb-4" />
                              <p className="text-sm text-text-secondary/40">请从左侧文件列表选择一个文件查看差异</p>
                              {!showFileList && (
                                <button onClick={() => setShowFileList(true)} className="mt-3 text-xs text-accent-blue/60 hover:text-accent-blue">
                                  显示文件列表 →
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Tab: 改良建议 ── */}
                      {dashTab === "suggestions" && (
                        <div className="space-y-3" id="suggestions-list">
                          {reviewData.suggestions.filter(s => filterLevel === "all" || s.severity === filterLevel).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center bg-surface border border-border-custom rounded-xl">
                              <CheckCircle2 className="w-8 h-8 text-text-secondary/15 mb-3" />
                              <p className="text-sm text-text-secondary/40">未发现当前类别的改良提议</p>
                            </div>
                          ) : (
                            reviewData.suggestions.map((suggestion, sIdx) => {
                              if (filterLevel !== "all" && suggestion.severity !== filterLevel) return null;
                              const dictKey = `${suggestion.file}-${sIdx}`;
                              const isApplied = appliedSuggestions[dictKey];
                              const isExpanded = expandAllSuggestions || expandedSuggestion === sIdx;
                              const codeExpanded = expandedCodeBlocks[sIdx] ?? false;

                              return (
                                <div
                                  key={dictKey}
                                  id={`suggestion-${sIdx}`}
                                  className={`border rounded-xl overflow-hidden transition-all duration-300 ${
                                    isExpanded 
                                      ? "bg-surface border-border-custom" 
                                      : "bg-[#1A1A1A] border-border-custom/60"
                                  }`}
                                >
                                  {/* Suggestion Header */}
                                  <div
                                    onClick={() => setExpandedSuggestion(isExpanded ? null : sIdx)}
                                    className="p-3.5 flex items-start justify-between cursor-pointer hover:bg-white/[0.02] select-none gap-3"
                                  >
                                    <div className="flex items-start gap-3 min-w-0">
                                      <div className="mt-0.5 shrink-0">
                                        {suggestion.severity === "critical" ? (
                                          <span className="inline-flex items-center gap-1 bg-red-500/15 text-red-400 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-red-500/25 uppercase">
                                            <AlertTriangle className="w-2.5 h-2.5" />严重
                                          </span>
                                        ) : suggestion.severity === "warning" ? (
                                          <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-yellow-500/20 uppercase">
                                            <Info className="w-2.5 h-2.5" />警告
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 bg-zinc-800 text-text-secondary/60 text-[9px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 uppercase">
                                            建议
                                          </span>
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="text-[13px] font-semibold text-text-primary flex items-center gap-1.5">
                                          <span className="truncate">{suggestion.title}</span>
                                          {isApplied && (
                                            <span className="text-emerald-400 bg-emerald-500/10 text-[9px] px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5 shrink-0">
                                              <Check className="w-2.5 h-2.5" /> 已修复
                                            </span>
                                          )}
                                        </h4>
                                        <p className="text-[10px] text-text-secondary/50 mt-1 font-mono truncate">
                                          {suggestion.file}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-text-secondary/40 shrink-0 mt-0.5">
                                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                  </div>

                                  {/* Expanded Content */}
                                  {isExpanded && (
                                    <div className="px-4 pb-4 pt-1 border-t border-border-custom/40 space-y-3">
                                      {/* Description */}
                                      <p className="text-xs text-text-secondary/80 leading-relaxed bg-black/20 p-3 rounded-lg">
                                        {suggestion.description}
                                      </p>

                                      {/* Code Diff — collapsed by default */}
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] text-text-secondary/50 font-mono uppercase">代码修复对比</span>
                                          <div className="flex items-center gap-2">
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); copyToClipboard(suggestion.revisedCode); }}
                                              className="text-[10px] text-accent-blue/60 hover:text-accent-blue transition-colors"
                                            >
                                              复制修复代码
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setExpandedCodeBlocks(prev => ({ ...prev, [sIdx]: !codeExpanded })); }}
                                              className="text-[10px] text-text-secondary/40 hover:text-text-secondary/70 flex items-center gap-1 transition-colors"
                                            >
                                              {codeExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                              {codeExpanded ? "收起代码" : "展开代码"}
                                            </button>
                                          </div>
                                        </div>

                                        {codeExpanded ? (
                                          <div className="bg-[#050508] border border-border-custom rounded-xl overflow-hidden font-mono text-xs">
                                            <div className="p-3.5 border-b border-border-custom/30 bg-red-950/10">
                                              <div className="text-[10px] text-red-400/70 font-semibold uppercase mb-1.5">❌ 原始代码</div>
                                              <pre className="text-red-300/80 whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                                                <code>{suggestion.originalCode}</code>
                                              </pre>
                                            </div>
                                            <div className="p-3.5 bg-emerald-950/10">
                                              <div className="text-[10px] text-emerald-400/70 font-semibold uppercase mb-1.5">✅ 修复方案</div>
                                              <pre className="text-emerald-300/80 whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                                                <code>{suggestion.revisedCode.startsWith("+") ? "" : "+ "}{suggestion.revisedCode}</code>
                                              </pre>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="bg-[#050508] border border-border-custom/50 rounded-xl p-3.5 flex items-center gap-3">
                                            <FileCode className="w-4 h-4 text-text-secondary/30 shrink-0" />
                                            <span className="text-[11px] text-text-secondary/40 font-mono truncate">
                                              {suggestion.originalCode.slice(0, 80).replace(/\n/g, " ")}...
                                            </span>
                                            <span className="text-[10px] text-text-secondary/30 shrink-0">点击上方展开</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Architect Explanation */}
                                      <div className="bg-black/20 p-3.5 rounded-xl border border-border-custom/30">
                                        <h5 className="text-[10px] font-bold text-text-secondary/50 uppercase tracking-wider mb-1.5 font-mono">
                                          危害机制原理
                                        </h5>
                                        <SummaryBlock text={suggestion.explanation} />
                                      </div>

                                      {/* Action Button */}
                                      <div className="pt-1 flex justify-end">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleApplySuggestion(suggestion, dictKey); }}
                                          disabled={isApplied}
                                          className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                            isApplied
                                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed"
                                              : "bg-accent-blue hover:bg-blue-600 active:scale-95 text-white shadow-md shadow-blue-500/10"
                                          }`}
                                        >
                                          {isApplied ? "✓ 已一键重构" : "✨ 一键重构修复"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                    </div>

                    {/* ── RIGHT: TOC sidebar ── */}
                    {showToc && (
                      <div className="w-[200px] shrink-0 hidden xl:block" id="toc-sidebar">
                        <div className="bg-[#1A1A1A] border border-border-custom rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-260px)] sticky top-[72px]">
                          <div className="px-3 py-2.5 border-b border-border-custom flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <ListTree className="w-3 h-3 text-text-secondary/40" />
                              <span className="text-[10px] font-bold uppercase text-text-secondary/60 tracking-wider">问题目录</span>
                            </div>
                            <button onClick={() => setShowToc(false)} className="text-text-secondary/30 hover:text-text-secondary/60 transition-colors" title="隐藏目录">
                              <PanelRightClose className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="overflow-y-auto flex-1 py-1">
                            {reviewData.suggestions.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setDashTab("suggestions");
                                  setExpandedSuggestion(i);
                                  setExpandedCodeBlocks(prev => ({ ...prev, [i]: true }));
                                  setTimeout(() => {
                                    const el = document.getElementById(`suggestion-${i}`);
                                    if (el) {
                                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    }
                                  }, 150);
                                }}
                                className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-white/[0.03] transition-colors group ${
                                  expandedSuggestion === i ? "bg-accent-blue/5" : ""
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                  s.severity === "critical" ? "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" 
                                  : s.severity === "warning" ? "bg-yellow-500" 
                                  : "bg-zinc-500"
                                }`} />
                                <span className={`text-[10px] leading-snug line-clamp-2 transition-colors ${
                                  expandedSuggestion === i ? "text-text-primary" : "text-text-secondary/50 group-hover:text-text-secondary/80"
                                }`}>
                                  {s.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TOC toggle when hidden */}
                    {!showToc && (
                      <button
                        onClick={() => setShowToc(true)}
                        className="shrink-0 mt-2 text-text-secondary/30 hover:text-text-secondary/60 transition-colors hidden xl:block"
                        title="显示目录"
                      >
                        <ListTree className="w-4 h-4" />
                      </button>
                    )}

                  </div>

                  {/* Mobile TOC — floating button + drawer */}
                  <div className="xl:hidden fixed bottom-6 right-6 z-40">
                    <button
                      onClick={() => setShowToc(!showToc)}
                      className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${
                        showToc ? "bg-accent-blue text-white" : "bg-surface border border-border-custom text-text-secondary"
                      }`}
                    >
                      <ListTree className="w-5 h-5" />
                    </button>
                  </div>
                  {showToc && (
                    <div className="xl:hidden fixed inset-0 z-30 flex justify-end" onClick={() => setShowToc(false)}>
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                      <div 
                        className="relative w-[280px] h-full bg-[#131313] border-l border-border-custom overflow-y-auto drawer-slide-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="px-4 py-4 border-b border-border-custom flex items-center justify-between sticky top-0 bg-[#131313] z-10">
                          <div className="flex items-center gap-2">
                            <ListTree className="w-4 h-4 text-accent-blue" />
                            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">问题目录</span>
                          </div>
                          <button onClick={() => setShowToc(false)} className="text-text-secondary/50 hover:text-text-secondary">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="py-2">
                          {reviewData.suggestions.map((s, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setDashTab("suggestions");
                                setExpandedSuggestion(i);
                                setExpandedCodeBlocks(prev => ({ ...prev, [i]: true }));
                                setShowToc(false);
                                setTimeout(() => {
                                  const el = document.getElementById(`suggestion-${i}`);
                                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                }, 300);
                              }}
                              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.03] transition-colors border-b border-border-custom/30"
                            >
                              <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                                s.severity === "critical" ? "bg-red-500" : s.severity === "warning" ? "bg-yellow-500" : "bg-zinc-500"
                              }`} />
                              <div className="min-w-0">
                                <p className="text-xs text-text-primary font-medium leading-snug">{s.title}</p>
                                <p className="text-[10px] text-text-secondary/40 mt-0.5 font-mono truncate">{s.file}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
                          这里是个无需提交 GitHub PR 的独立测试区。你可以选择不同维度的真实微系统应用缺陷漏洞（如 JWT 过期注入、SQL注入拼接、复杂事件内存泄漏），在下方的在线编码器中修改，最后点击"安全审查"，代码将被实时上传至 AI 进行全链路审查分析，在看板中反馈重构建议。
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
                            沙盒文件
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
                      <div className="px-5 py-3 border-b border-border-custom bg-[#121212] flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 mr-2">
                            <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                            <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
                            <span className="w-3 h-3 rounded-full bg-[#10b981]/80"></span>
                          </div>
                          <span className="text-accent-blue">{activeSandboxFilename}</span>
                        </div>
                        <span className="text-text-secondary text-[11px]">沙盒在线演练场</span>
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
                      <div className="px-6 py-4 border-t border-border-custom bg-[#121212] flex items-center justify-between font-mono text-xs">
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
      <footer className="mt-auto border-t border-border-custom bg-[#121212]">
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

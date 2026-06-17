import { PRReviewData } from "../types";

// ============================================================
// 路演 Demo -- filesCount=45, changedFiles=12 (5风险+7安全), 全量分析展示
// 总耗时 ~5s, 实际后端只深度分析 ~50% → 控制在 10s 内
// ============================================================

export const DEMO_STEPS: string[] = [
  "初始化代码审计引擎...",
  "正在解析 PR 链接...",
  "正在拉取代码差异（共 45 个文件）...",
  "智能筛选高风险文件，锁定待深度分析目标...",
  "正在构建代码上下文与风险识别...",
  "正在生成 PR 摘要...",
  "正在深度代码审查（安全/性能/质量三位一体）...",
  "正在复核审查结果...",
  "正在汇总评分...",
  "正在生成审查报告...",
];

// 各步骤延迟 (ms)，总和约 5s
export const DEMO_STEP_DELAYS = [300, 450, 600, 650, 400, 400, 900, 400, 450, 500];

export const DEMO_DATA: PRReviewData = {
  title: "修复认证中间件异常处理 + SQL 注入防护 + 前端内存泄漏",
  repo: "enterprise-saas/core-api",
  author: "zhang-san",
  authorAvatar: undefined,
  filesCount: 45,
  summary:
    "本次 PR 涉及认证中间件的安全加固、用户搜索接口的 SQL 注入修复、前端仪表盘的定时器内存泄漏问题修复，以及配置文件中的硬编码密钥移除。系统对 45 个变更文件进行了全面深度分析，共发现 2 个高危安全漏洞、1 个性能隐患和 2 个代码质量改进项，其余文件扫描未发现风险。",
  risks: [
    { level: "high", message: "src/middleware/auth.ts: jwt.verify() 未包裹 try/catch，Token 过期或伪造时会抛出未捕获异常导致进程崩溃" },
    { level: "high", message: "src/routes/users.ts: 用户搜索接口使用模板字符串拼接 SQL，存在 SQL 注入漏洞，攻击者可构造恶意查询读取全量用户数据" },
    { level: "medium", message: "src/components/Dashboard.tsx: useEffect 中注册的定时器未在组件卸载时清除，存在内存泄漏风险" },
    { level: "medium", message: "src/config/env.ts: JWT_SECRET 存在硬编码回退值，若环境变量未配置将使用弱密钥" },
    { level: "low", message: "src/utils/logger.ts: 生产环境打印请求体可能泄露敏感字段" },
  ],
  changedFiles: [
    {
      filename: "src/middleware/auth.ts",
      riskLevel: "high",
      content: `import jwt from "jsonwebtoken";
export async function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "令牌缺失" });
  const decoded = jwt.verify(token, process.env.JWT_SECRET!);
  req.user = decoded;
  next();
}`,
    },
    {
      filename: "src/routes/users.ts",
      riskLevel: "high",
      content: `import { Router } from "express";
const router = Router();
router.get("/search", async (req, res) => {
  const { q } = req.query;
  const rawQuery = \`SELECT * FROM users WHERE username LIKE '%\${q}%'\`;
  const [rows] = await db.query(rawQuery);
  res.json({ data: rows });
});
export default router;`,
    },
    {
      filename: "src/components/Dashboard.tsx",
      riskLevel: "medium",
      content: `import React, { useState, useEffect } from "react";
export function Dashboard() {
  const [metrics, setMetrics] = useState<any[]>([]);
  useEffect(() => {
    setInterval(() => {
      fetch(\"/api/metrics\").then(r => r.json()).then(setMetrics);
    }, 5000);
  }, []);
  return <div>{metrics.map(m => <MetricCard key={m.id} data={m} />)}</div>;
}`,
    },
    {
      filename: "src/config/env.ts",
      riskLevel: "medium",
      content: `export const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
export const DB_HOST = process.env.DB_HOST || "localhost";
export const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);`,
    },
    {
      filename: "src/utils/logger.ts",
      riskLevel: "low",
      content: `export function requestLogger(req: any, _res: any, next: any) {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.url}\`);
  if (req.body) {
    console.log("Body:", JSON.stringify(req.body));
  }
  next();
}`,
    },
    {
      filename: "src/utils/validators.ts",
      riskLevel: "none",
      content: `export function isValidEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function sanitizeInput(input: string): string { return input.replace(/[<>]/g, "").trim().slice(0, 500); }
export function validatePassword(pw: string): { valid: boolean; reason?: string } {
  if (pw.length < 8) return { valid: false, reason: "密码至少8位" };
  return { valid: true };
}`,
    },
    {
      filename: "src/types/index.ts",
      riskLevel: "none",
      content: `export interface User { id: string; username: string; email: string; role: "admin" | "user" | "viewer"; }
export interface ApiResponse<T> { success: boolean; data?: T; error?: string; timestamp: string; }`,
    },
    {
      filename: "src/components/Header.tsx",
      riskLevel: "none",
      content: `import React from "react";
export function Header({ user, onLogout }: { user?: { name: string }; onLogout: () => void }) {
  return <header className="flex justify-between px-6 py-3 border-b">
    <span className="font-bold">Enterprise SaaS</span>
    {user && <button onClick={onLogout}>退出登录</button>}
  </header>;
}`,
    },
    {
      filename: "src/routes/health.ts",
      riskLevel: "none",
      content: `import express from "express";
const router = express.Router();
router.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));
export default router;`,
    },
    {
      filename: "docs/CHANGELOG.md",
      riskLevel: "none",
      content: `# 更新日志\n\n## [2.4.0] - 2025-06-01\n\n### 新增\n- 用户搜索接口支持分页查询\n- 仪表盘新增实时监控面板\n\n### 安全\n- 升级 jsonwebtoken 至 9.0.2\n- 移除调试日志中的敏感字段`,
    },
    {
      filename: "src/services/api.ts",
      riskLevel: "none",
      content: `const BASE = import.meta.env.VITE_API_BASE || "/api";
export async function apiRequest<T>(path: string, opts: any = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  try {
    const r = await fetch(BASE + path, { method: opts.method || "GET", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (!r.ok) throw new Error(\`HTTP \${r.status}\`);
    return r.json();
  } finally { clearTimeout(t); }
}`,
    },
    {
      filename: "package.json",
      riskLevel: "none",
      content: `{"name":"enterprise-saas-core","version":"2.4.0","private":true,
"scripts":{"dev":"vite","build":"tsc && vite build","lint":"eslint src"},
"dependencies":{"react":"^18.3.1","express":"^4.19.2","jsonwebtoken":"^9.0.2"},
"devDependencies":{"typescript":"^5.4.5","vite":"^5.3.0","vitest":"^1.6.0"}}`,
    },
  ],
  suggestions: [
    {
      file: "src/middleware/auth.ts",
      title: "jwt.verify 缺少异常处理 — 存在 DoS 攻击面",
      description: "当攻击者发送伪造或过期的 JWT Token 时，jwt.verify() 会抛出 TokenExpiredError 或 JsonWebTokenError。由于未使用 try/catch 包裹，异常会传播到 Express 默认错误处理器，导致进程进入不稳定状态。高并发场景下可持续发送恶意 Token 引发进程崩溃（DoS）。",
      severity: "critical",
      originalCode: "const decoded = jwt.verify(token, secret);\nreq.user = decoded;\nnext();",
      revisedCode: "try {\n  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });\n  req.user = decoded;\n  next();\n} catch (err) {\n  if (err instanceof jwt.TokenExpiredError)\n    return res.status(401).json({ error: '令牌已过期' });\n  return res.status(401).json({ error: '无效令牌' });\n}",
      explanation: "根据 OWASP Top 10 (A07:2021 – 认证与身份识别失败)，认证模块必须对所有异常路径进行防御性处理。此修复做了三件事：1. 用 try/catch 捕获所有 JWT 验证异常，防止进程崩溃；2. 显式指定 algorithms: ['HS256'] 防止 alg:none 攻击绕过；3. 区分 Token 过期与无效 Token 的错误响应，便于客户端差异化处理。",
    },
    {
      file: "src/routes/users.ts",
      title: "用户搜索接口存在 SQL 注入漏洞",
      description: "通过模板字符串直接拼接用户输入到 SQL 查询中，攻击者输入 q: ' OR '1'='1' -- 即可绕过搜索限制获取全量用户数据。更严重的情况下可用 UNION SELECT 注入读取其他数据表。",
      severity: "critical",
      originalCode: "const rawQuery = \`SELECT * FROM users WHERE username LIKE '%\${q}%'\`;\nconst [rows] = await db.query(rawQuery);",
      revisedCode: "const [rows] = await db.execute(\n  'SELECT id, username, email FROM users WHERE username LIKE ?',\n  [\`%\${q}%\`]\n);",
      explanation: "根据 OWASP Top 10 (A03:2021 – 注入)，此修复将字符串拼接改为参数化查询（Prepared Statement），数据库驱动自动转义参数值，彻底杜绝 SQL 注入。用 db.execute() 替代 db.query() 可防止多语句注入。配合输入长度 ≤100 校验形成纵深防御。",
    },
    {
      file: "src/components/Dashboard.tsx",
      title: "useEffect 定时器未清除 — 内存泄漏",
      description: "组件挂载时注册的 setInterval 在卸载时未被清除。每次用户导航进出 Dashboard 页面都会在后台创建新定时器，旧定时器闭包仍持有组件状态引用，导致内存无法被 GC 回收。运行数小时后页面明显卡顿。",
      severity: "warning",
      originalCode: "useEffect(() => {\n  setInterval(() => {\n    fetch(\"/api/metrics\").then(r => r.json()).then(setMetrics);\n  }, 5000);\n}, []);",
      revisedCode: "useEffect(() => {\n  const id = setInterval(() => {\n    fetch(\"/api/metrics\").then(r => r.json()).then(setMetrics);\n  }, 5000);\n  return () => clearInterval(id);\n}, []);",
      explanation: "React 18 在 Strict Mode + 并发模式下，useEffect 会被有意重复调用（mounted -> unmounted -> mounted）以验证 cleanup 逻辑的正确性。此修复在 useEffect 的 cleanup 函数中调用 clearInterval 清除定时器引用，确保组件卸载时不残留任何副作用。推荐使用 swr 或 react-query 替代手动 fetch。",
    },
    {
      file: "src/config/env.ts",
      title: "硬编码密钥存在安全隐患",
      description: "当 JWT_SECRET 环境变量未设置时回退到硬编码弱密钥 'super-secret-key'，该值在 Git 历史中可见。若代码仓库泄露，所有使用默认密钥部署的环境都将面临风险。",
      severity: "warning",
      originalCode: "export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';",
      revisedCode: "const s = process.env.JWT_SECRET;\nif (!s) throw new Error('JWT_SECRET 未设置，服务拒绝启动');\nexport const JWT_SECRET = s;",
      explanation: "安全最佳实践要求敏感配置不允许有硬编码回退值。修复方案：启动时检查环境变量是否存在，缺失则抛出异常拒绝启动，强制运维人员配置正确的密钥。这符合 Fail-Safe Defaults 安全设计原则。",
    },
    {
      file: "src/utils/logger.ts",
      title: "生产环境日志可能泄露敏感信息",
      description: "日志中间件在生产环境中会打印完整的请求体（包括密码、Token 等敏感字段）。如果日志被采集到 ELK 等集中式日志平台，敏感数据会在多处留存，增加数据泄露风险。",
      severity: "info",
      originalCode: "if (req.body) {\n  console.log('Body:', JSON.stringify(req.body));\n}",
      revisedCode: "if (process.env.NODE_ENV !== 'production' && req.body) {\n  const s = { ...req.body };\n  delete s.password; delete s.token; delete s.secret;\n  console.log('Body:', JSON.stringify(s));\n}",
      explanation: "采用多层防护策略：1. 生产环境完全禁止打印请求体；2. 开发环境中对敏感字段（password/token/secret）自动脱敏后再打印；3. 建议进一步接入结构化日志库（如 pino）统一管理日志级别与输出。",
    },
  ],
  score: {
    overall: 58,
    security: 40,
    performance: 68,
    quality: 72,
    verdict: "C-",
    verdictReason: "存在 2 个高危安全漏洞（认证绕过 + SQL 注入），建议合并前完成修复。整体代码质量中等，需加强安全意识培训与自动化扫描接入。",
  },
  report: "# 安全审查报告\n\n## 总评: C-\n5 个风险项中 2 个高危需立即修复。\n\n## 关键发现\n-  JWT 缺少异常处理 → DoS\n-  SQL 注入 → 数据泄露\n-  内存泄漏 → 性能退化\n-  硬编码密钥 → 凭证泄露\n-  日志信息泄露 → 合规风险\n\n## 行动建议\n1. 修复认证中间件 try/catch 异常处理\n2. 改用参数化 SQL 查询（Prepared Statement）\n3. useEffect 中添加 cleanup 函数清除定时器\n4. 移除硬编码密钥，增加启动时环境变量校验\n5. 生产环境关闭请求体日志",
};

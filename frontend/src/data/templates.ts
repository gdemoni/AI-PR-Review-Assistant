import { SandboxTemplate } from "../types";

export const SANDBOX_TEMPLATES: SandboxTemplate[] = [
  {
    name: "更新身份验证流程与中间件 (安全漏洞)",
    description: "JWT 认证重构意图，但在异常分支中未能捕获 Promise reject，导致应用在受到异常 Token 攻击时可能 Crash。",
    files: [
      {
        filename: "src/middleware/auth.ts",
        content: `import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const secret = process.env.JWT_SECRET || 'super-secret-key';

export function verifyToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  
  // 💣 漏洞: jwt.verify 可能会跑出异常，例如 TokenExpiredError 
  // 这会导致 Promise 一直在 pending 中或直接引起 Node 崩溃 (Unhandled Promise Rejection)
  const decoded = jwt.verify(token, secret);
  req.user = decoded;
  
  next();
}`,
      },
      {
        filename: "src/utils/token.ts",
        content: `import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'super-secret-key';

export function generateToken(payload: any): string {
  // 警告：未设置过期时间可能导致长期会话被盗用
  return jwt.sign(payload, secret);
}`,
      },
      {
        filename: "src/components/Login.tsx",
        content: `import React, { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("提交登录凭据", username, password); // 💣 调试日志泄露敏感字段
    const res = await fetch('/api/login', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    localStorage.setItem('token', data.token);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <input value={username} onChange={e => setUsername(e.target.value)} placeholder="用户名" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="密码" />
      <button type="submit">登录</button>
    </form>
  );
}`,
      },
      {
        filename: "package.json",
        content: `{
  "name": "enterprise-auth-module",
  "version": "1.2.0",
  "dependencies": {
    "express": "^4.19.0",
    "jsonwebtoken": "^9.0.2"
  }
}`,
      },
    ],
  },
  {
    name: "用户路由注入风险 (SQL注入)",
    description: "通过未经清洗或参数化的 SQL 拼接拼接查询，允许恶意调用者直接读写或删除基础数据库结构。",
    files: [
      {
        filename: "src/routes/users.ts",
        content: `import express from 'express';
import { db } from '../db';

const router = express.Router();

router.get('/api/users/search', async (req, res) => {
  const { q } = req.query;
  
  // 💣 严重安全隐患: 存在原生 SQL 语句拼接
  // 攻击者输入 q: "admin' OR '1'='1" 便能查看所有受保护用户信息
  const rawQuery = \`SELECT id, username, email, role FROM users WHERE username LIKE '%\${q}%'\`;
  console.log("执行 SQL 搜索：", rawQuery);
  
  try {
    const [rows] = await db.query(rawQuery);
    res.json({ success: true, users: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: "数据库搜索失败" });
  }
});

export default router;`,
      },
      {
        filename: "src/db.ts",
        content: `import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'prod_db',
  connectionLimit: 10
});`,
      },
    ],
  },
  {
    name: "React 效率与资源泄漏 (内存泄露)",
    description: "在组件挂载时注册定时器，但在卸载时未清除该句柄，造成不必要的闭包持有以及严重的浏览器宿主内存攀升。",
    files: [
      {
        filename: "src/components/ActiveDashboard.tsx",
        content: `import React, { useState, useEffect } from 'react';

export function ActiveDashboard() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    // 💣 性能缺陷: 定时更新，但从未返回 cleanup 卸载函数！
    // 每次用户由于导航进出该页面时，都会重新累加一个 Interval 背景循环。
    setInterval(() => {
      fetch('/api/metrics')
        .then(res => res.json())
        .then(data => {
          // 这里隐式捕获了 metrics 触发重新分配且引用外层
          setMetrics(prev => [...prev, data.data]);
        });
    }, 2000);
    
    // ❌ 缺少: return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl">系统实时性能监控</h2>
      <div className="mt-4">
        已加载记录点数: {metrics.length}
      </div>
    </div>
  );
}`,
      },
    ],
  },
];

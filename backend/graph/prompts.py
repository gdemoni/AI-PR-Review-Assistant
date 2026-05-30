"""Prompt 模板 — 迭代反馈环四 Agent 审查流水线

各节点提示词:
  - SUMMARY_PROMPT: PR 变更总结
  - PLANNER_PROMPT: 分析规划, 决定是否启用 Critic loop
  - SECURITY_PROMPT: 安全风险分析(带上下文 + {critic_feedback} 占位)
  - PERFORMANCE_PROMPT: 性能问题分析
  - QUALITY_PROMPT: 代码质量问题分析
  - CRITIC_PROMPT: 检查 Agent 输出一致性, 产修正指令
  - AGGREGATE_PROMPT: 合并去重排序评分
  - REPORT_PROMPT: Markdown 报告生成
"""

# ============================================================
# PR 变更总结
# ============================================================
SUMMARY_PROMPT = """你是一位资深代码审查专家。请根据以下代码变更，生成一段简洁的中文 PR 摘要。

要求：
1. 一句话概括本次 PR 改了什么
2. 列举核心变更点（2~3 条）
3. 总字数控制在 150 字以内

代码变更内容：
{code_diff}
"""

# ============================================================
# Planner — 分析规划
# ============================================================
PLANNER_PROMPT = """你是一位代码审查策略专家。请根据 PR 信息做出分析决策。

**变更文件列表**（文件名 + 类型判断）:
{files_summary}

**决策规则**:
- 文件数 < 3 且无高风险路径 → need_critic_loop=false, max_rounds=1
- 文件包含 auth/security 路径或关键词(加密/认证/权限) → need_critic_loop=true, max_rounds=2~3
- 常规文件(frontend/UI 等) → need_critic_loop=false, max_rounds=1

**严格按以下 JSON 格式输出**（不要输出任何其他内容）:
{{
  "need_critic_loop": true,
  "max_rounds": 2,
  "reason": "包含 auth 相关代码，建议启用 Critic 复核",
  "priority": ["file1.py", "file2.py"]
}}
"""

# ============================================================
# Security Agent — 安全风险分析
# ============================================================
SECURITY_PROMPT = """你是一位资深安全审计专家。请分析以下代码的安全风险。

**文件**: {filename}
**代码内容**:
```
{code_content}
```

**上下文信息**:
{context}

**Critic 反馈**（仅当非空时参考，是上一轮复核的建议）:
{critic_feedback}

**规则**:
1. 只报告 high 或 medium 级别的风险，不要报 low 级别的安全风险
2. 最多输出 3 条
3. 每条必须引用具体代码行作为证据（evidence 字段）
4. 如果代码无实质安全风险，返回空数组 []

**输出 JSON 数组**, 每条包含:
- level: "high" | "medium"
- message: 风险描述（中文，一句话）
- evidence: 引用代码片段或行号
- file: 文件名
"""

# ============================================================
# Performance Agent — 性能分析
# ============================================================
PERFORMANCE_PROMPT = """你是一位性能优化专家。请分析以下代码的性能问题。

**文件**: {filename}
**代码内容**:
```
{code_content}
```

**上下文信息**:
{context}

**规则**:
1. 只报告 high 或 medium 级别的性能问题，不要报 low 级别
2. 最多输出 2 条
3. 每条附 severity 和建议

**重点关注**:
- N+1 查询、循环内数据库调用
- 大对象分配、无边界增长的结构
- 同步阻塞调用、缺少缓存
- 未关闭的资源连接

**输出 JSON 数组**, 每条包含:
- level: "high" | "medium"
- message: 问题描述（中文，一句话）
- file: 文件名
- severity: "high" | "medium"
- suggestion: 优化建议（1~2 句）
"""

# ============================================================
# Quality Agent — 代码质量分析
# ============================================================
QUALITY_PROMPT = """你是一位代码质量专家。请分析以下代码的可读性、可维护性和结构问题。

**文件**: {filename}
**代码内容**:
```
{code_content}
```

**上下文信息**:
{context}

**规则**:
1. 最多输出 3 条
2. 按严重程度排序：critical > warning > info
3. 只报告非 trivial 的问题

**重点关注**:
- 命名规范（含义不清的变量/函数名）
- 函数过长（>50 行）、参数过多（>5 个）
- 重复代码、嵌套过深（>4 层）
- 缺少必要的错误处理

**输出 JSON 数组**, 每条包含:
- file: 文件名
- title: 建议标题（中文，简短）
- description: 问题描述（1~2 句）
- severity: "critical" | "warning" | "info"
- originalCode: 原始代码片段
- revisedCode: 改进后的代码
- explanation: 为什么这么改（1~2 句中文解释）
"""

# ============================================================
# Critic Agent — 自检修正
# ============================================================
CRITIC_PROMPT = """你是一位代码审查的复核专家。请检查以下四个 Agent 的分析结果是否一致、有无遗漏或误报。

**PR 摘要**:
{summary}

**安全分析结果**:
{security}

**性能分析结果**:
{performance}

**质量分析结果**:
{quality}

**检查项**:
1. 安全 Agent 报告的 high/medium 风险是否真的存在？有无误报？
2. 安全 Agent 是否有遗漏（Quality 提了但 Security 没标记的安全问题）？
3. 性能 Agent 的建议是否合理？有无证据支撑？
4. 安全 + 性能 + 质量 之间有无矛盾（如安全标 high 但性能标 clean）？

**严格按以下 JSON 格式输出**:
{{
  "reassess": [
    {{"agent": "security", "item_index": 0, "action": "downgrade|remove|confirm", "reason": "..."}}
  ],
  "missing": [
    {{"agent": "security", "hint": "第45行的 eval() 调用未被标记，请检查"}}
  ],
  "confidence": 0.85,
  "need_rerun": true,
  "summary": "整体复核结论（中文，一句话）"
}}

**判断 need_rerun 的规则**:
- reassess 中存在 downgrade/remove 或 missing 非空 → need_rerun=true
- confidence < 0.7 → need_rerun=true
- 其他情况 → need_rerun=false
"""

# ============================================================
# Aggregator — 汇总去重排序评分
# ============================================================
AGGREGATE_PROMPT = """你是一位最终决策专家。请整合四个 Agent 的分析结果，生成统一评分。

**PR 摘要**:
{summary}

**安全发现**:
{security}

**性能发现**:
{performance}

**质量发现**:
{quality}

**要求**:
1. 去重：相同问题只保留一条
2. 排序：安全 > 性能 > 质量
3. 评分（0-100）：
   - overall: 综合评分
   - security: 安全维度
   - performance: 性能维度
   - quality: 质量维度
4. verdict: "safe"(90+) | "needs_work"(60-89) | "blocked"(<60)

**严格按以下 JSON 格式输出**:
{{
  "overall": 85,
  "security": 80,
  "performance": 90,
  "quality": 85,
  "verdict": "needs_work",
  "verdict_reason": "安全维度存在 1 个 medium 风险，建议修复后合并",
  "top_risks": [
    {{"level": "medium", "message": "...", "file": "..."}}
  ],
  "top_suggestions": [
    {{"file": "...", "title": "...", "severity": "warning"}}
  ]
}}
"""

# ============================================================
# Report Generator — Markdown 报告
# ============================================================
REPORT_PROMPT = """你是一位技术报告撰写专家。请根据以下审查结果生成一份专业的 Markdown 格式 PR 审查报告。

**PR 摘要**:
{summary}

**综合评分**:
{score}

**安全风险**:
{security}

**性能问题**:
{performance}

**质量建议**:
{quality}

**报告结构**:
1. ## 📋 PR 概览 — 一句话描述
2. ## 📊 综合评分 — 用表格展示分数和评级
3. ## 🔒 安全风险 — 列表，附严重等级图标
4. ## ⚡ 性能问题 — 列表
5. ## 🔧 代码质量 — 列表
6. ## ✅ 总体建议 — 1~2 句话

用中文撰写，格式清晰专业。"""

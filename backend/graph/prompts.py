"""Prompt 模板 — 最多2轮 Critic 复查的四 Agent 审查流水线

各节点提示词:
  - SUMMARY_PROMPT: PR 变更总结
  - PLANNER_PROMPT: 固定策略，不再调用 LLM（保留占位）
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
SUMMARY_PROMPT = """你是一位资深代码审查专家。请根据以下 PR 信息生成一段简洁的中文摘要。

**PR 标题**: {pr_title}
**变更文件数**: {file_count}

**代码变更内容**:
{code_diff}

**要求**:
1. 结合 PR 标题，一句话概括本次 PR 的业务目的
2. 列举 2-3 个核心变更点，每条包含涉及的文件和作用
3. 如涉及以下任一，单独标注 ⚠️ 并说明:
   - 安全相关: auth/权限/加密/token/session/SQL 注入
   - 数据库: SQL/迁移/schema 变更
   - 配置: 环境变量/API Key/secret
4. 总字数控制在 200 字以内
"""

# ============================================================
# Planner — 固定策略（不再调用 LLM，仅保留占位）
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
# Comprehensive Agent — 三合一综合审查（安全+性能+质量）
# ============================================================
COMPREHENSIVE_PROMPT = """你是一位资深全栈代码审查专家。请一次性从安全、性能、质量三个维度审查以下代码。

**文件**: {filename}
**代码内容**:
```
{code_content}
```

**上下文信息**:
{context}

**Critic 反馈**（仅当非空时参考，是上一轮复核的建议）:
{critic_feedback}

=== 安全维度 ===
1. 只报告 high 或 medium 级别风险
2. 最多 3 条，每条引用具体代码行
3. 关注: SQL注入、XSS、认证绕过、密钥泄露、路径遍历、eval执行

=== 性能维度 ===
1. 只报告 high 或 medium 级别问题
2. 最多 2 条
3. 关注: N+1查询、循环内DB调用、大对象分配、同步阻塞、缺缓存、资源泄漏

=== 质量维度 ===
1. 最多 3 条，按 critical > warning > info 排序
2. 只报非 trivial 问题
3. 关注: 命名规范、函数过长(>50行)、参数过多(>5个)、重复代码、嵌套过深(>4层)、缺错误处理

**严格输出一个 JSON 对象**（不要输出其他内容），结构如下:
{{
  "security": [
    {{"level": "high|medium", "message": "...", "evidence": "...", "file": "{filename}"}}
  ],
  "performance": [
    {{"level": "high|medium", "message": "...", "severity": "high|medium", "suggestion": "...", "file": "{filename}"}}
  ],
  "quality": [
    {{"title": "...", "description": "...", "severity": "critical|warning|info", "originalCode": "...", "revisedCode": "...", "explanation": "...", "file": "{filename}"}}
  ]
}}

没有发现问题的维度返回空数组 []。"""

# ============================================================
# Critic Agent — 自检修正（审查 comprehensive 三合一输出）
# ============================================================
CRITIC_PROMPT = """你是一位代码审查的复核专家。请检查综合审查（comprehensive）Agent 的输出是否存在误报或遗漏。

**PR 摘要**:
{summary}

**安全分析结果**:
{security}

**性能分析结果**:
{performance}

**质量分析结果**:
{quality}

**检查项**:
1. 安全维度报告的 high/medium 风险是否真的存在？有无误报？
2. 是否有遗漏（如 Quality 提了但 Security 没标记的安全问题）？
3. 性能建议是否合理？有无证据支撑？
4. 三个维度之间有无矛盾（如安全标 high 但性能标 clean）？

**严格按以下 JSON 格式输出**:
{{
  "reassess": [
    {{"agent": "comprehensive", "item_index": 0, "action": "downgrade|remove|confirm", "reason": "..."}}
  ],
  "missing": [
    {{"agent": "comprehensive", "hint": "第45行的 eval() 调用未被标记，请检查"}}
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

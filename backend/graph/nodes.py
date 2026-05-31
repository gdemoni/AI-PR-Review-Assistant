"""LangGraph 节点 — Summarize + Comprehensive 双 Agent + Critic 最多2轮迭代的 10 个处理节点

流程图:
  parse_pr → fetch_diff → context_builder → planner
                                                ↓
                              ┌─── 2 Agents fan-out ──┐
                              ↓                        ↓
                          summarize              comprehensive
                         (仅首轮)          (安全+性能+质量三合一)
                              ↓                        ↓
                              └──────────┬─────────────┘
                                         ↓
                                      critic
                                         ↓
                              need_rerun? AND round<2 → loop_gate
                                         ↓(NO/已达2轮)
                                   aggregate → report → END

重要: 每个节点只返回自己修改的字段，不返回完整 state，
否则并发 fan-out 时 LangGraph 因多分支写同一 key 报 INVALID_CONCURRENT_GRAPH_UPDATE。
"""

import asyncio
import json

from graph.state import PRAnalysisState
from graph.tool.github import parse_pr_url, fetch_pr_info, fetch_pr_files, is_risky_file, fetch_file_context
from graph.tool.llm import (
    generate_summary,
    analyze_comprehensive,
    run_critic,
    aggregate_results,
    generate_report,
)


# ============================================================
# 节点 1: PR解析节点
# ============================================================
async def parse_pr_node(state: PRAnalysisState) -> dict:
    pr_url = state.get("pr_url", "") or ""

    if pr_url:
        parsed = parse_pr_url(pr_url)
        if not parsed:
            return {"error": f"无法解析 PR 链接: {pr_url}，请确认格式为 https://github.com/owner/repo/pull/123"}

        try:
            info = await fetch_pr_info(parsed["owner"], parsed["repo"], parsed["pr_number"], token=state.get("github_token"))
            return {
                "repo": info["repo"],
                "pr_title": info["title"],
                "author": info["author"],
                "author_avatar": info["author_avatar"],
            }
        except Exception as e:
            return {"error": f"GitHub API 获取 PR 信息失败: {str(e)}"}
    else:
        return {
            "repo": "sandbox/playground",
            "pr_title": state.get("template_name") or "沙盒代码审查",
            "author": "沙盒用户",
            "author_avatar": None,
        }


# ============================================================
# 节点 2: Diff获取节点
# ============================================================
async def fetch_diff_node(state: PRAnalysisState) -> dict:
    if state.get("error"):
        return {}

    pr_url = state.get("pr_url", "") or ""
    sandbox_files = state.get("sandbox_files") or []

    if pr_url:
        parsed = parse_pr_url(pr_url)
        if not parsed:
            return {"error": "Diff获取失败: PR 链接格式无效"}

        try:
            files = await fetch_pr_files(parsed["owner"], parsed["repo"], parsed["pr_number"], token=state.get("github_token"))
            return {"changed_files": files, "files_count": len(files)}
        except Exception as e:
            return {"error": f"GitHub API 获取 diff 失败: {str(e)}"}
    elif sandbox_files:
        mapped = [
            {"filename": f.get("filename", ""), "content": f.get("content", ""), "patch": ""}
            for f in sandbox_files
        ]
        return {"changed_files": mapped, "files_count": len(mapped)}
    else:
        return {"error": "没有可分析的代码: 请提供 PR 链接或沙盒代码", "changed_files": [], "files_count": 0}


# ============================================================
# 节点 3: Context Builder — 风险筛选 + 文件上下文
# ============================================================
async def context_builder_node(state: PRAnalysisState) -> dict:
    """零 LLM 成本: is_risky_file 筛选 + fetch_file_context 拉完整文件"""
    if state.get("error"):
        return {}

    changed_files = state.get("changed_files", [])
    if not changed_files:
        return {"risky_files": [], "context_data": {}}

    # 筛选风险文件
    risky_files = [
        f for f in changed_files
        if is_risky_file(f.get("filename", ""), f.get("patch", ""))
    ]
    # 如果无风险文件则全部标记（保守策略）
    if not risky_files:
        risky_files = changed_files[:5]

    # 对风险文件拉完整上下文
    pr_url = state.get("pr_url", "") or ""
    context_data = {}

    if pr_url:
        parsed = parse_pr_url(pr_url)
        if parsed:
            tasks = [
                fetch_file_context(parsed["owner"], parsed["repo"], f["filename"], token=state.get("github_token"))
                for f in risky_files
            ]
            results = await asyncio.gather(*tasks)
            for f, ctx in zip(risky_files, results):
                context_data[f["filename"]] = ctx

    return {"risky_files": risky_files, "context_data": context_data}


# ============================================================
# 节点 4: Planner — 首轮固定策略 + 复查轮基于 Critic 反馈重新规划
# ============================================================
async def planner_node(state: PRAnalysisState) -> dict:
    """首轮返回固定策略；复查轮基于 Critic 反馈生成针对性的重跑计划"""
    if state.get("error"):
        return {}

    current_round = state.get("round", 1)

    if current_round > 1:
        # 复查轮: 基于 Critic 反馈重新规划（不返回 round，loop_gate 已递增）
        critic = state.get("critic_feedback", {})
        reassess = critic.get("reassess", [])
        missing = critic.get("missing", [])
        confidence = critic.get("confidence", 0)

        agents_targeted = set()
        for item in reassess:
            agents_targeted.add(item.get("agent", ""))
        for item in missing:
            agents_targeted.add(item.get("agent", ""))

        profile = {
            "need_critic_loop": False,
            "max_rounds": 2,
            "reason": (
                f"复查轮: Critic 发现 {len(reassess)} 需重评 + {len(missing)} 遗漏"
                f"(置信度 {confidence:.0%}), 涉及 Agent: {', '.join(sorted(agents_targeted))}"
            ),
            "priority": [],
        }
        return {"risk_profile": profile}

    # 首轮: 固定策略（不触发复查，速度优先）
    profile = {
        "need_critic_loop": False,
        "max_rounds": 1,
        "reason": "固定策略: 单轮审查，Critic 仅评分不重跑",
        "priority": [],
    }
    return {"risk_profile": profile, "round": current_round}


# ============================================================
# 节点 5: PR总结节点
# ============================================================
async def summarize_node(state: PRAnalysisState) -> dict:
    if state.get("error"):
        return {}

    # 重跑时跳过总结
    if state.get("round", 1) > 1:
        return {}

    # 优先用风险文件做摘要，兜底取前 8 个变更文件
    changed_files = state.get("risky_files") or state.get("changed_files", [])[:8]
    if not changed_files:
        return {"summary": "没有变更文件可供总结"}

    code_parts = []
    for f in changed_files:
        filename = f.get("filename", "未知文件")
        content = f.get("patch") or f.get("content", "")
        # 每文件只取 500 字符，足够识别改动意图
        code_parts.append(f"### {filename}\n```\n{content[:500]}\n```")
    code_diff = "\n\n".join(code_parts)

    try:
        return {"summary": await generate_summary(
            code_diff,
            pr_title=state.get("pr_title", ""),
            file_count=len(changed_files),
            model=state.get("custom_model"),
            api_key=state.get("custom_api_key"),
        )}
    except Exception as e:
        return {"summary": f"LLM 摘要生成失败: {str(e)}"}


# ============================================================
# 通用: 单文件分析 helper + Agent 节点工厂
# ============================================================

def _build_critic_text(feedback: dict, agent_name: str) -> str:
    """从 Critic 反馈中提取针对指定 Agent 的修正提示"""
    if not feedback:
        return ""
    parts = []
    # reassess 条目
    items = [i for i in feedback.get("reassess", []) if i.get("agent") == agent_name]
    if items:
        parts.append("上一轮复核发现以下问题需要重新评估:\n" + "\n".join(
            f"  - 条目#{i['item_index']}: {i.get('action', '')} — {i.get('reason', '')}"
            for i in items
        ))
    # missing 条目
    missing = [i for i in feedback.get("missing", []) if i.get("agent") == agent_name]
    if missing:
        parts.append("可能遗漏:\n" + "\n".join(f"  - {i.get('hint', '')}" for i in missing))
    return "\n".join(parts)


# ============================================================
# 节点 6: Comprehensive Agent — 三合一审查（安全+性能+质量）
# ============================================================

async def comprehensive_node(state: PRAnalysisState) -> dict:
    """每个风险文件 1 次 LLM 调用，同时输出安全/性能/质量结果"""
    if state.get("error"):
        return {}

    changed_files = state.get("risky_files") or state.get("changed_files", [])[:5]
    if not changed_files:
        return {"security_risks": [], "performance_issues": [], "quality_issues": []}

    context_data = state.get("context_data", {})
    feedback = state.get("critic_feedback", {})
    critic_text = _build_critic_text(feedback, "comprehensive")

    async def _analyze_file(f: dict) -> dict:
        filename = f.get("filename", "")
        code = f.get("patch") or f.get("content", "")
        ctx = context_data.get(filename, {})
        context_str = json.dumps(ctx, ensure_ascii=False, indent=2) if ctx else "无额外上下文"
        try:
            return await analyze_comprehensive(
                filename, code, context_str,
                critic_feedback=critic_text,
                model=state.get("custom_model"),
                api_key=state.get("custom_api_key"),
            )
        except Exception:
            return {"security": [], "performance": [], "quality": []}

    results = await asyncio.gather(*[_analyze_file(f) for f in changed_files])

    # 分拆聚合
    all_security = []
    all_performance = []
    all_quality = []
    for r in results:
        all_security.extend(r.get("security", []))
        all_performance.extend(r.get("performance", []))
        all_quality.extend(r.get("quality", []))

    return {
        "security_risks": all_security,
        "performance_issues": all_performance,
        "quality_issues": all_quality,
    }


# ============================================================
# 节点 9: Critic — 自检修正
# ============================================================
async def critic_node(state: PRAnalysisState) -> dict:
    """检查四 Agent 输出一致性，决定是否重跑"""
    if state.get("error"):
        return {}

    summary = state.get("summary", "")
    security = state.get("security_risks", [])
    performance = state.get("performance_issues", [])
    quality = state.get("quality_issues", [])

    try:
        feedback = await run_critic(summary, security, performance, quality, model=state.get("custom_model"), api_key=state.get("custom_api_key"))
    except Exception:
        feedback = {
            "reassess": [],
            "missing": [],
            "confidence": 0.8,
            "need_rerun": False,
            "summary": "Critic 调用失败，默认不重跑",
        }

    return {"critic_feedback": feedback}


# ============================================================
# 节点 10: Aggregator — 汇总去重评分
# ============================================================
async def aggregate_node(state: PRAnalysisState) -> dict:
    """合并四个 Agent 输出 + 去重排序 + 计算评分"""
    if state.get("error"):
        return {}

    summary = state.get("summary", "")
    security = state.get("security_risks", [])
    performance = state.get("performance_issues", [])
    quality = state.get("quality_issues", [])

    try:
        score = await aggregate_results(summary, security, performance, quality, model=state.get("custom_model"), api_key=state.get("custom_api_key"))
    except Exception:
        score = {
            "overall": 0,
            "security": 0,
            "performance": 0,
            "quality": 0,
            "verdict": "safe",
            "verdict_reason": "聚合评分失败",
        }

    # 合并风险列表(向后兼容前端)
    merged_risks = []
    for r in security:
        merged_risks.append({"level": r.get("level", "medium"), "message": r.get("message", "")})
    for r in performance:
        merged_risks.append({"level": r.get("level", "medium"), "message": r.get("message", "")})

    # 合并建议列表(向后兼容前端)
    merged_suggestions = []
    for q in quality:
        merged_suggestions.append({
            "file": q.get("file", ""),
            "title": q.get("title", ""),
            "description": q.get("description", ""),
            "severity": q.get("severity", "info"),
            "originalCode": q.get("originalCode", ""),
            "revisedCode": q.get("revisedCode", ""),
            "explanation": q.get("explanation", ""),
        })

    return {
        "aggregate_score": score,
        "risks": merged_risks,
        "suggestions": merged_suggestions,
    }


# ============================================================
# 节点 11: Report — Markdown 报告生成
# ============================================================
async def report_node(state: PRAnalysisState) -> dict:
    """生成最终 Markdown 审查报告"""
    if state.get("error"):
        return {}

    summary = state.get("summary", "")
    score = state.get("aggregate_score", {})
    security = state.get("security_risks", [])
    performance = state.get("performance_issues", [])
    quality = state.get("quality_issues", [])

    try:
        report = await generate_report(summary, score, security, performance, quality, model=state.get("custom_model"), api_key=state.get("custom_api_key"))
    except Exception as e:
        report = f"报告生成失败: {str(e)}"

    return {"final_report": report}


# ============================================================
# 节点 12: Loop Gate — 重跑入口（仅更新 round）
# ============================================================
async def loop_gate_node(state: PRAnalysisState) -> dict:
    """Critic 判定需要重跑时，从本节点重新 fan-out 到四个 Agent"""
    current_round = state.get("round", 1)
    return {"round": current_round + 1}

"""LangGraph 节点 — 工作流中的 5 个处理节点

analyze_risks_node / generate_suggestions_node 内部用 asyncio.gather
对多文件并发调用 LLM，避免逐文件串行等待。

重要: 每个节点只返回自己修改的字段，不返回完整 state，
否则并发 fan-out 时 LangGraph 因多分支写同一 key 报 INVALID_CONCURRENT_GRAPH_UPDATE。
"""

import asyncio

from graph.state import PRAnalysisState
from graph.tool.github import parse_pr_url, fetch_pr_info, fetch_pr_files
from graph.tool.llm import generate_summary, analyze_risks, generate_suggestions


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
            info = await fetch_pr_info(parsed["owner"], parsed["repo"], parsed["pr_number"])
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
            files = await fetch_pr_files(parsed["owner"], parsed["repo"], parsed["pr_number"])
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
# 节点 3: PR总结节点
# ============================================================
async def summarize_node(state: PRAnalysisState) -> dict:
    if state.get("error"):
        return {}

    changed_files = state.get("changed_files", [])
    if not changed_files:
        return {"summary": "没有变更文件可供总结"}

    code_parts = []
    for f in changed_files:
        filename = f.get("filename", "未知文件")
        content = f.get("patch") or f.get("content", "")
        code_parts.append(f"### {filename}\n```\n{content[:3000]}\n```")
    code_diff = "\n\n".join(code_parts)

    try:
        return {"summary": await generate_summary(code_diff)}
    except Exception as e:
        return {"summary": f"LLM 摘要生成失败: {str(e)}"}


# ============================================================
# 节点 4: 风险分析节点
# ============================================================
async def _analyze_one_file(f: dict) -> list[dict]:
    """并发单元：分析单个文件的风险"""
    filename = f.get("filename", "")
    content = (f.get("content") or f.get("patch", "")).strip()
    if not content:
        return []
    try:
        return await analyze_risks(f"{filename}\n{content[:4000]}")
    except Exception as e:
        return [{"level": "medium", "message": f"{filename}: LLM 分析异常 - {str(e)[:80]}"}]


async def analyze_risks_node(state: PRAnalysisState) -> dict:
    if state.get("error"):
        return {}

    changed_files = state.get("changed_files", [])
    if not changed_files:
        return {"risks": []}

    results = await asyncio.gather(*[_analyze_one_file(f) for f in changed_files])
    all_risks = [r for batch in results for r in batch]
    return {"risks": all_risks}


# ============================================================
# 节点 5: 建议生成节点
# ============================================================
async def _suggest_one_file(f: dict) -> list[dict]:
    """并发单元：为单个文件生成改进建议"""
    filename = f.get("filename", "")
    content = (f.get("content") or f.get("patch", "")).strip()
    if not content:
        return []
    try:
        return await generate_suggestions(filename, content[:4000])
    except Exception as e:
        return [{
            "file": filename,
            "title": "LLM 调用异常",
            "description": f"{str(e)[:100]}",
            "severity": "info",
            "originalCode": "",
            "revisedCode": "",
            "explanation": "请检查 LLM API Key 是否有效"
        }]


async def generate_suggestions_node(state: PRAnalysisState) -> dict:
    if state.get("error"):
        return {}

    changed_files = state.get("changed_files", [])
    if not changed_files:
        return {"suggestions": []}

    results = await asyncio.gather(*[_suggest_one_file(f) for f in changed_files])
    all_suggestions = [s for batch in results for s in batch]
    return {"suggestions": all_suggestions}

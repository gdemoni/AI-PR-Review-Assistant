"""LangGraph 节点 — 工作流中的 5 个处理节点"""

from graph.state import PRAnalysisState
from graph.tool.github import parse_pr_url, fetch_pr_info, fetch_pr_files
from graph.tool.llm import generate_summary, analyze_risks, generate_suggestions


# ============================================================
# 节点 1: PR解析节点
# ============================================================
async def parse_pr_node(state: PRAnalysisState) -> dict:
    """
    解析输入的 PR 信息，提取仓库名、标题、作者等元数据。

    输入来源:
      - pr_url: GitHub PR 链接 → 正则提取 owner/repo/pr_number + 调用 GitHub API
      - sandbox_files / template_name: 使用模板或沙盒名称作为默认标题
    """
    state["current_step"] = "PR解析节点: 解析输入元数据..."

    pr_url = state.get("pr_url", "") or ""

    if pr_url:
        # 场景 1: 用户粘贴了 GitHub PR 链接
        parsed = parse_pr_url(pr_url)
        if not parsed:
            state["error"] = f"无法解析 PR 链接: {pr_url}，请确认格式为 https://github.com/owner/repo/pull/123"
            return state

        try:
            info = await fetch_pr_info(parsed["owner"], parsed["repo"], parsed["pr_number"])
            state["repo"] = info["repo"]
            state["pr_title"] = info["title"]
            state["author"] = info["author"]
            state["author_avatar"] = info["author_avatar"]
        except Exception as e:
            state["error"] = f"GitHub API 获取 PR 信息失败: {str(e)}"
            return state
    else:
        # 场景 2: 沙盒 / 模板模式
        state["repo"] = "sandbox/playground"
        state["pr_title"] = state.get("template_name") or "沙盒代码审查"
        state["author"] = "沙盒用户"
        state["author_avatar"] = None

    return state


# ============================================================
# 节点 2: Diff获取节点
# ============================================================
async def fetch_diff_node(state: PRAnalysisState) -> dict:
    """
    获取代码变更内容。

    输入来源:
      - pr_url: 调用 GitHub API 获取 PR diff
      - sandbox_files: 直接使用沙盒中的代码文件
    """
    state["current_step"] = "Diff获取节点: 获取代码变更..."

    # 如果前面已经有错误，跳过
    if state.get("error"):
        return state

    pr_url = state.get("pr_url", "") or ""
    sandbox_files = state.get("sandbox_files") or []

    if pr_url:
        # 场景 1: 从 GitHub API 拉取 diff
        parsed = parse_pr_url(pr_url)
        if not parsed:
            state["error"] = "Diff获取失败: PR 链接格式无效"
            return state

        try:
            files = await fetch_pr_files(parsed["owner"], parsed["repo"], parsed["pr_number"])
            state["changed_files"] = files
        except Exception as e:
            state["error"] = f"GitHub API 获取 diff 失败: {str(e)}"
            return state
    elif sandbox_files:
        # 场景 2: 沙盒模式 — 直接使用前端传来的文件
        state["changed_files"] = [
            {
                "filename": f.get("filename", ""),
                "content": f.get("content", ""),
                "patch": "",
            }
            for f in sandbox_files
        ]
    else:
        state["changed_files"] = []
        state["error"] = "没有可分析的代码: 请提供 PR 链接或沙盒代码"
        return state

    state["files_count"] = len(state["changed_files"])
    return state


# ============================================================
# 节点 3: PR总结节点
# ============================================================
async def summarize_node(state: PRAnalysisState) -> dict:
    """
    基于变更代码，调用 Gemini AI 生成 PR 中文摘要。
    """
    state["current_step"] = "PR总结节点: 生成 AI 摘要..."

    if state.get("error"):
        return state

    changed_files = state.get("changed_files", [])
    if not changed_files:
        state["summary"] = "没有变更文件可供总结"
        return state

    # 拼接所有文件的文件名 + patch 内容
    code_parts = []
    for f in changed_files:
        filename = f.get("filename", "未知文件")
        content = f.get("patch") or f.get("content", "")
        code_parts.append(f"### {filename}\n```\n{content[:3000]}\n```")

    code_diff = "\n\n".join(code_parts)

    try:
        state["summary"] = await generate_summary(code_diff)
    except Exception as e:
        state["error"] = f"LLM 摘要生成失败: {str(e)}"

    return state


# ============================================================
# 节点 4: 风险分析节点
# ============================================================
async def analyze_risks_node(state: PRAnalysisState) -> dict:
    """
    对每个变更文件进行风险扫描，识别高危代码。

    产出 risks: [{level: "high|medium|low", message: "..."}]
    """
    state["current_step"] = "风险分析节点: 扫描代码风险..."

    if state.get("error"):
        return state

    changed_files = state.get("changed_files", [])
    if not changed_files:
        state["risks"] = []
        return state

    all_risks = []

    for f in changed_files:
        filename = f.get("filename", "")
        content = f.get("content") or f.get("patch", "")
        if not content.strip():
            continue

        try:
            file_risks = await analyze_risks(f"{filename}\n{content[:4000]}")
            all_risks.extend(file_risks)
        except Exception as e:
            all_risks.append({"level": "medium", "message": f"{filename}: LLM 分析异常 - {str(e)[:80]}"})

    state["risks"] = all_risks
    return state


# ============================================================
# 节点 5: 建议生成节点
# ============================================================
async def generate_suggestions_node(state: PRAnalysisState) -> dict:
    """
    对每个变更文件生成具体的代码改进建议。

    产出 suggestions: [{file, title, description, severity,
                         originalCode, revisedCode, explanation}]
    """
    state["current_step"] = "建议生成节点: 生成改进建议..."

    if state.get("error"):
        return state

    changed_files = state.get("changed_files", [])
    if not changed_files:
        state["suggestions"] = []
        return state

    all_suggestions = []

    for f in changed_files:
        filename = f.get("filename", "")
        content = f.get("content") or f.get("patch", "")
        if not content.strip():
            continue

        try:
            file_suggestions = await generate_suggestions(filename, content[:4000])
            all_suggestions.extend(file_suggestions)
        except Exception as e:
            all_suggestions.append({
                "file": filename,
                "title": "LLM 调用异常",
                "description": f"{str(e)[:100]}",
                "severity": "info",
                "originalCode": "",
                "revisedCode": "",
                "explanation": "请检查 LLM API Key 是否有效"
            })

    state["suggestions"] = all_suggestions
    return state

"""LangGraph 节点 — 工作流中的 5 个处理节点"""

from graph.state import PRAnalysisState


# ============================================================
# 节点 1: PR解析节点
# ============================================================
async def parse_pr_node(state: PRAnalysisState) -> dict:
    """
    解析输入的 PR 信息，提取仓库名、标题、作者等元数据。

    输入来源:
      - pr_url: GitHub PR 链接 → 从 URL 中解析 owner/repo/pr_number
      - sandbox_files: 沙盒本地文件 → 按模板生成默认元数据
    """
    state["current_step"] = "PR解析节点: 解析输入元数据..."

    # TODO: 1. 如果 pr_url 不为空 → 正则提取 owner/repo/pr_number
    # TODO: 2. 如果 sandbox_files 不为空 → 使用模板名作为默认标题
    # TODO: 3. 如果 template_name 不为空 → 加载对应模板

    # 占位：设置默认值
    state["repo"] = "unknown/repo"
    state["pr_title"] = state.get("template_name") or "沙盒代码审查"
    state["author"] = "未知作者"
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

    # TODO: 如果 pr_url → 调用 GitHub API (GET /repos/{owner}/{repo}/pulls/{number}/files)
    # TODO: 如果 sandbox_files → 直接作为 changed_files 使用

    sandbox_files = state.get("sandbox_files") or []
    if sandbox_files:
        state["changed_files"] = [
            {"filename": f.get("filename", ""), "content": f.get("content", ""), "patch": ""}
            for f in sandbox_files
        ]
    else:
        state["changed_files"] = []

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

    # TODO: 1. 拼接 changed_files 中所有代码内容
    # TODO: 2. 调用 Gemini (google-genai) 生成摘要
    # TODO: 3. 使用 prompts.py 中的 SUMMARY_PROMPT

    state["summary"] = "（AI 摘要待生成）"
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

    # TODO: 1. 遍历 changed_files
    # TODO: 2. 对每个文件调用 Gemini 进行安全/性能/逻辑风险分析
    # TODO: 3. 使用 prompts.py 中的 RISK_ANALYSIS_PROMPT

    state["risks"] = []  # [{level: "high", message: "..."}]
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

    # TODO: 1. 遍历 changed_files
    # TODO: 2. 对每个文件调用 Gemini 生成改进建议（含修改前后代码）
    # TODO: 3. 使用 prompts.py 中的 SUGGESTION_PROMPT

    state["suggestions"] = []  # [{file, title, ...}]
    return state

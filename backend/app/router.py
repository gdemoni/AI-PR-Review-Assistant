"""API 路由 — 对接前端 POST /api/analyze-pr"""

from fastapi import APIRouter
from app.schemas import AnalyzePRRequest, AnalyzePRResponse, PRReviewData
from graph import review_graph, PRAnalysisState

router = APIRouter()


@router.post("/analyze-pr", response_model=AnalyzePRResponse)
async def analyze_pr(request: AnalyzePRRequest):
    """
    接收前端发来的 PR 审查请求，运行 LangGraph 工作流，返回审查报告。

    输入（三选一）:
      - prUrl: GitHub PR 链接
      - files: 沙盒代码文件列表
      - templateName: 模板名称

    输出: AnalyzePRResponse { success, data, error, ... }
    """
    # 构建初始状态
    initial_state: PRAnalysisState = {
        "pr_url": request.prUrl or "",
        "sandbox_files": request.files,
        "template_name": request.templateName,
        # 以下字段由各节点逐步填充
        "repo": "",
        "pr_title": "",
        "author": "",
        "author_avatar": None,
        "changed_files": [],
        "files_count": 0,
        "summary": "",
        "risks": [],
        "suggestions": [],
        "error": None,
        "current_step": "",
    }

    # 运行 LangGraph 工作流
    try:
        final_state = await review_graph.ainvoke(initial_state)

        # 检查工作流是否报错
        if final_state.get("error"):
            return AnalyzePRResponse(
                success=False,
                error=final_state["error"],
            )

        # 组装成功响应
        return AnalyzePRResponse(
            success=True,
            data=PRReviewData(
                title=final_state["pr_title"],
                repo=final_state["repo"],
                author=final_state["author"],
                authorAvatar=final_state.get("author_avatar"),
                filesCount=final_state["files_count"],
                summary=final_state["summary"],
                risks=final_state["risks"],
                changedFiles=final_state["changed_files"],
                suggestions=final_state["suggestions"],
            ),
        )

    except Exception as e:
        return AnalyzePRResponse(
            success=False,
            error=f"工作流执行失败: {str(e)}",
        )

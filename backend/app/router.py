"""API 路由 — 对接前端 POST /api/analyze-pr，迭代反馈环四 Agent 审查"""

from fastapi import APIRouter
from app.schemas import (
    AnalyzePRRequest, AnalyzePRResponse, PRReviewData,
    ChangedFile, ScoreBreakdown,
)
from graph import review_graph, PRAnalysisState

router = APIRouter()


def _compute_file_risk_level(filename: str, risks: list[dict]) -> str:
    """根据风险列表计算单个文件的风险等级"""
    file_risks = [r for r in risks if filename in r.get("message", "")]
    if not file_risks:
        return "none"
    levels = [r.get("level", "low") for r in file_risks]
    if "high" in levels:
        return "high"
    if "medium" in levels:
        return "medium"
    return "low"


def _map_changed_files(
    changed_files: list[dict],
    risks: list[dict],
) -> list[ChangedFile]:
    """将工作流产出的 changed_files 映射为前端 ChangedFile 结构"""
    result = []
    for f in changed_files:
        filename = f.get("filename", "")
        result.append(ChangedFile(
            filename=filename,
            riskLevel=_compute_file_risk_level(filename, risks),
            content=f.get("content") or f.get("patch", ""),
        ))
    return result


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
        "risky_files": [],
        "context_data": {},
        "risk_profile": {},
        "summary": "",
        "security_risks": [],
        "performance_issues": [],
        "quality_issues": [],
        "critic_feedback": {},
        "round": 1,
        "aggregate_score": {},
        "risks": [],
        "suggestions": [],
        "final_report": "",
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

        # 将工作流产出的 changed_files 映射为前端 ChangedFile
        risks = final_state.get("risks", [])
        changed_files_raw = final_state.get("changed_files", [])
        mapped_files = _map_changed_files(changed_files_raw, risks)

        # 构建评分对象
        score_raw = final_state.get("aggregate_score", {})
        score = ScoreBreakdown(
            overall=score_raw.get("overall", 0),
            security=score_raw.get("security", 0),
            performance=score_raw.get("performance", 0),
            quality=score_raw.get("quality", 0),
            verdict=score_raw.get("verdict", ""),
            verdictReason=score_raw.get("verdict_reason", ""),
        ) if score_raw else None

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
                changedFiles=mapped_files,
                suggestions=final_state["suggestions"],
                score=score,
                report=final_state.get("final_report", "") or None,
            ),
        )

    except Exception as e:
        return AnalyzePRResponse(
            success=False,
            error=f"工作流执行失败: {str(e)}",
        )

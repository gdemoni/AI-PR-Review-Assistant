"""API 路由 — POST /api/analyze-pr（JSON） + /api/analyze-pr/stream（SSE 流式）"""

import json
import asyncio
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.schemas import (
    AnalyzePRRequest, AnalyzePRResponse, PRReviewData,
    ChangedFile, ScoreBreakdown,
)
from graph import review_graph, PRAnalysisState

router = APIRouter()

# ============================================================
# 节点 → 前端展示步骤名称映射
# ============================================================
NODE_STEP_MAP = {
    "parse_pr":       "🔍 正在解析 PR 链接...",
    "fetch_diff":     "📡 正在拉取代码差异...",
    "context_builder":"🧠 正在构建代码上下文与风险识别...",
    "planner":        "📋 正在规划审查策略...",
    "summarize":      "📝 正在生成 PR 摘要...",
    "comprehensive":  "🔎 正在深度代码审查（安全/性能/质量）...",
    "critic":         "🔄 正在复核审查结果...",
    "loop_gate":      "🔄 正在准备重新审查...",
    "aggregate":      "📊 正在汇总评分...",
    "report":         "📄 正在生成审查报告...",
}

# ============================================================
# 辅助函数
# ============================================================

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


def _build_initial_state(request: AnalyzePRRequest) -> PRAnalysisState:
    """构建工作流初始状态（供两个端点复用）"""
    return {
        "pr_url": request.prUrl or "",
        "sandbox_files": request.files,
        "template_name": request.templateName,
        "github_token": request.githubToken,
        "custom_model": request.customModel,
        "custom_api_key": request.customApiKey,
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


def _build_response(final_state: dict) -> AnalyzePRResponse:
    """将工作流最终状态映射为前端 AnalyzePRResponse（供两个端点复用）"""
    if final_state.get("error"):
        return AnalyzePRResponse(success=False, error=final_state["error"])

    risks = final_state.get("risks", [])
    changed_files_raw = final_state.get("changed_files", [])
    mapped_files = _map_changed_files(changed_files_raw, risks)

    score_raw = final_state.get("aggregate_score", {})
    score = ScoreBreakdown(
        overall=score_raw.get("overall", 0),
        security=score_raw.get("security", 0),
        performance=score_raw.get("performance", 0),
        quality=score_raw.get("quality", 0),
        verdict=score_raw.get("verdict", ""),
        verdictReason=score_raw.get("verdict_reason", ""),
    ) if score_raw else None

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


# ============================================================
# 端点 1: 普通 JSON 响应（向后兼容）
# ============================================================

@router.post("/analyze-pr", response_model=AnalyzePRResponse)
async def analyze_pr(request: AnalyzePRRequest):
    initial_state = _build_initial_state(request)
    try:
        final_state = await review_graph.ainvoke(initial_state)
        return _build_response(final_state)
    except Exception as e:
        return AnalyzePRResponse(success=False, error=f"工作流执行失败: {str(e)}")


# ============================================================
# 端点 2: SSE 流式响应 — 实时推送每个节点的执行步骤
# ============================================================

@router.post("/analyze-pr/stream")
async def analyze_pr_stream(request: AnalyzePRRequest):
    """
    流式 PR 审查端点。

    前端通过 ReadableStream 读取 SSE 事件:  
      data: {"step": "🔍 正在解析 PR 链接..."}
      data: {"step": "📡 正在拉取代码差异..."}
      ...
      data: {"done": true, "result": {...}}
    """
    async def event_stream():
        initial_state = _build_initial_state(request)

        # 首条消息: 引擎启动
        yield f"data: {json.dumps({'step': '🚀 初始化代码审计引擎...'})}\n\n"
        await asyncio.sleep(0)

        # 累积最终状态（initial_state 作为 base，各节点输出增量覆盖）
        final_state = dict(initial_state)

        try:
            async for chunk in review_graph.astream(initial_state, stream_mode="updates"):
                # chunk = {node_name: output_dict}, fan-out 时多个 key 同时出现
                for node_name, node_output in chunk.items():
                    step_text = NODE_STEP_MAP.get(node_name)
                    if step_text:
                        yield f"data: {json.dumps({'step': step_text})}\n\n"
                        await asyncio.sleep(0)

                    # 合并节点输出到累积状态
                    if isinstance(node_output, dict):
                        final_state.update(node_output)

            # 工作流执行完毕，发送最终结果
            response = _build_response(final_state)
            yield f"data: {json.dumps({'done': True, 'result': response.model_dump()})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': f'工作流执行失败: {str(e)}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲
        },
    )

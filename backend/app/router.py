"""API 路由 — 对接前端 POST /api/analyze-pr"""

from fastapi import APIRouter
from app.schemas import AnalyzePRRequest, AnalyzePRResponse

router = APIRouter()


@router.post("/analyze-pr", response_model=AnalyzePRResponse)
async def analyze_pr(request: AnalyzePRRequest):
    """
    接收前端发来的 PR 审查请求，返回审查报告。

    输入（三选一）:
      - prUrl: GitHub PR 链接
      - files: 沙盒代码文件列表
      - templateName: 模板名称

    输出: AnalyzePRResponse { success, data, error, ... }
    """
    # TODO: 根据 request 判断来源类型，调用对应服务
    # TODO: 调用 Gemini AI 分析代码
    # TODO: 组装 AnalyzePRResponse 返回

    return AnalyzePRResponse(
        success=False,
        error="后端接口已联通，但尚未实现具体审查逻辑。"
    )

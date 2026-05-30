"""Pydantic schemas — 与前端 types.ts 一一对应"""

from pydantic import BaseModel
from typing import Optional


# ========== 请求体 ==========

class AnalyzePRRequest(BaseModel):
    """POST /api/analyze-pr 的请求体"""
    prUrl: Optional[str] = ""
    files: Optional[list] = None  # [{filename: str, content: str}]
    templateName: Optional[str] = None


# ========== 响应体 ==========

class RiskItem(BaseModel):
    level: str   # "high" | "medium" | "low"
    message: str


class ChangedFile(BaseModel):
    filename: str
    riskLevel: str   # "high" | "medium" | "low" | "none"
    content: str


class SuggestionItem(BaseModel):
    file: str
    title: str
    description: str
    severity: str        # "critical" | "warning" | "info"
    originalCode: str
    revisedCode: str
    explanation: str


class PRReviewData(BaseModel):
    title: str
    repo: str
    author: str
    authorAvatar: Optional[str] = None
    filesCount: int
    summary: str
    risks: list[RiskItem]
    changedFiles: list[ChangedFile]
    suggestions: list[SuggestionItem]


class AnalyzePRResponse(BaseModel):
    success: bool
    data: Optional[PRReviewData] = None
    error: Optional[str] = None
    isSimulated: Optional[bool] = False
    gitHubError: Optional[str] = None

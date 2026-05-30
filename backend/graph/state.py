"""LangGraph State — 工作流中所有节点共享的状态"""

from typing import TypedDict, Optional


class PRAnalysisState(TypedDict):
    """PR 分析工作流的全局状态"""

    # ===== 输入（由 router 注入）=====
    pr_url: str                        # GitHub PR 链接（可为空）
    sandbox_files: Optional[list]      # 沙盒代码文件 [{filename, content}]
    template_name: Optional[str]       # 模板名称

    # ===== PR解析节点 产出 =====
    repo: str                          # 仓库名，如 "gdemoni/myapp"
    pr_title: str                      # PR 标题
    author: str                        # 作者
    author_avatar: Optional[str]       # 作者头像 URL

    # ===== Diff获取节点 产出 =====
    changed_files: list                # [{filename, content, patch}]
    files_count: int                   # 变更文件数

    # ===== PR总结节点 产出 =====
    summary: str                       # AI 生成的中文摘要

    # ===== 风险分析节点 产出 =====
    risks: list                        # [{level, message}]

    # ===== 建议生成节点 产出 =====
    suggestions: list                  # [{file, title, description, severity, originalCode, revisedCode, explanation}]

    # ===== 流程控制 =====
    error: Optional[str]               # 错误信息
    current_step: str                  # 当前步骤描述

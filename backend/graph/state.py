"""LangGraph State — 最多2轮 Critic 复查的四 Agent 审查流水线共享状态

流程图:
  parse_pr → fetch_diff → context_builder → planner
                                                ↓
                                ┌─── 4 Agents fan-out ───┐
                                ↓       ↓      ↓      ↓
                            summarize security performance quality
                           (仅首轮) (每次)  (每次)  (每次)
                                ↓       ↓      ↓      ↓
                                └──────────────────────────┘
                                                ↓
                                            critic
                                                ↓
                                    need_rerun? AND round<2 → loop_gate
                                            ↓(NO/已达2轮)
                                        aggregate → report → END
"""

from typing import TypedDict, Optional


class PRAnalysisState(TypedDict):
    """PR 分析工作流的全局状态"""

    # ===== 输入（由 router 注入）=====
    pr_url: str                        # GitHub PR 链接（可为空）
    sandbox_files: Optional[list]      # 沙盒代码文件 [{filename, content}]
    template_name: Optional[str]       # 模板名称
    github_token: Optional[str]        # 用户自定义 GitHub Token（覆盖 .env）
    custom_model: Optional[str]        # 用户自定义模型名（覆盖 .env）
    custom_api_key: Optional[str]      # 用户自定义 API Key（覆盖 .env）

    # ===== PR解析节点 产出 =====
    repo: str                          # 仓库名，如 "gdemoni/myapp"
    pr_title: str                      # PR 标题
    author: str                        # 作者
    author_avatar: Optional[str]       # 作者头像 URL

    # ===== Diff获取节点 产出 =====
    changed_files: list                # [{filename, content, patch}]
    files_count: int                   # 变更文件数

    # ===== Context Builder 节点 产出 =====
    risky_files: list                  # 筛选出的风险文件 [{filename, content, patch}]
    context_data: dict                 # {filename: {funcs, imports, full_file}}

    # ===== Planner 节点 产出 =====
    risk_profile: dict                 # {need_critic_loop: bool, max_rounds: int, priority: list}

    # ===== 四 Agent 节点产出（fan-out 并发）=====
    summary: str                       # PR 变更总结
    security_risks: list               # 安全 Agent → [{level, message, file}]
    performance_issues: list           # 性能 Agent → [{level, message, file}]
    quality_issues: list               # 质量 Agent → [{file, title, severity, ...}]

    # ===== Critic 节点 产出 =====
    critic_feedback: dict              # {reassess: [...], missing: [...], confidence: float, need_rerun: bool}

    # ===== 循环控制 =====
    round: int                         # 当前 Critic 迭代轮次（从 1 开始）

    # ===== 聚合评分节点 产出 =====
    aggregate_score: dict              # {overall, security, performance, quality, verdict, verdict_reason}
    risks: list                        # 合并后的风险列表(向后兼容前端)
    suggestions: list                  # 合并后的建议列表(向后兼容前端)

    # ===== 报告生成节点 产出 =====
    final_report: str                  # Markdown 格式最终审查报告

    # ===== 流程控制 =====
    error: Optional[str]               # 错误信息
    current_step: str                  # 当前步骤描述

"""LangGraph 工作流 — 将 5 个节点串联为完整审查流水线"""

from langgraph.graph import StateGraph, END
from graph.state import PRAnalysisState
from graph.nodes import (
    parse_pr_node,
    fetch_diff_node,
    summarize_node,
    analyze_risks_node,
    generate_suggestions_node,
)


def build_pr_review_graph() -> StateGraph:
    """
    构建并编译 PR 审查工作流。

    流程图:
      parse_pr → fetch_diff → summarize → analyze_risks → generate_suggestions → END
    """

    # 1. 创建状态图
    workflow = StateGraph(PRAnalysisState)

    # 2. 注册 5 个节点
    workflow.add_node("parse_pr", parse_pr_node)
    workflow.add_node("fetch_diff", fetch_diff_node)
    workflow.add_node("summarize", summarize_node)
    workflow.add_node("analyze_risks", analyze_risks_node)
    workflow.add_node("generate_suggestions", generate_suggestions_node)

    # 3. 设置边 — 线性流水线
    workflow.set_entry_point("parse_pr")
    workflow.add_edge("parse_pr", "fetch_diff")
    workflow.add_edge("fetch_diff", "summarize")
    workflow.add_edge("summarize", "analyze_risks")
    workflow.add_edge("analyze_risks", "generate_suggestions")
    workflow.add_edge("generate_suggestions", END)

    # 4. 编译
    return workflow.compile()


# 全局单例，避免每次请求都重新编译
review_graph = build_pr_review_graph()

"""LangGraph 工作流 — 并发审查流水线

流程图:
  parse_pr → fetch_diff → summarize ──────────┐
                                      ├→ END
                        analyze_risks ──┤
                        generate_suggestions ┘

summarize / analyze_risks / generate_suggestions 三者无依赖，fan-out 并发。
"""

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
    workflow = StateGraph(PRAnalysisState)

    workflow.add_node("parse_pr", parse_pr_node)
    workflow.add_node("fetch_diff", fetch_diff_node)
    workflow.add_node("summarize", summarize_node)
    workflow.add_node("analyze_risks", analyze_risks_node)
    workflow.add_node("generate_suggestions", generate_suggestions_node)

    # 串行阶段：parse → fetch 有依赖
    workflow.set_entry_point("parse_pr")
    workflow.add_edge("parse_pr", "fetch_diff")

    # 并发阶段：fetch_diff 后三个 AI 节点同时启动
    workflow.add_edge("fetch_diff", "summarize")
    workflow.add_edge("fetch_diff", "analyze_risks")
    workflow.add_edge("fetch_diff", "generate_suggestions")

    # 三条分支各自汇入 END
    workflow.add_edge("summarize", END)
    workflow.add_edge("analyze_risks", END)
    workflow.add_edge("generate_suggestions", END)

    return workflow.compile()


review_graph = build_pr_review_graph()

"""LangGraph 工作流 — 迭代反馈环四 Agent 审查流水线

流程图:
  parse_pr → fetch_diff → context_builder → planner
                                                ↓
                                ┌─── 4 Agents fan-out ───┐
                                ↓       ↓      ↓      ↓
                            summarize security performance quality
                                ↓       ↓      ↓      ↓
                                └──────────────────────────┘
                                                ↓
                                            critic
                                                ↓
                                    need_rerun? → loop_gate
                                            ↓(NO)        ↓
                                        aggregate    (fan-out to 4 Agents)
                                            ↓
                                          report
                                            ↓
                                           END

- parse / fetch / context / planner 串行
- 四个 Agent fan-out 并发
- Critic 条件边: need_rerun AND round < max_rounds → loop_gate → 重跑 Agents
- aggregate + report 串行收尾
"""

from langgraph.graph import StateGraph, END
from graph.state import PRAnalysisState
from graph.nodes import (
    parse_pr_node,
    fetch_diff_node,
    context_builder_node,
    planner_node,
    summarize_node,
    security_node,
    performance_node,
    quality_node,
    critic_node,
    aggregate_node,
    report_node,
    loop_gate_node,
)


def _should_rerun(state: PRAnalysisState) -> str:
    """Critic 后的条件路由: 判断是否需要重跑"""
    feedback = state.get("critic_feedback", {})
    round_num = state.get("round", 1)
    max_rounds = state.get("risk_profile", {}).get("max_rounds", 1)

    if feedback.get("need_rerun") and round_num < max_rounds:
        return "loop_gate"
    return "aggregate"


def build_pr_review_graph() -> StateGraph:
    workflow = StateGraph(PRAnalysisState)

    # 注册所有节点
    workflow.add_node("parse_pr", parse_pr_node)
    workflow.add_node("fetch_diff", fetch_diff_node)
    workflow.add_node("context_builder", context_builder_node)
    workflow.add_node("planner", planner_node)
    workflow.add_node("summarize", summarize_node)
    workflow.add_node("security", security_node)
    workflow.add_node("performance", performance_node)
    workflow.add_node("quality", quality_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("aggregate", aggregate_node)
    workflow.add_node("report", report_node)
    workflow.add_node("loop_gate", loop_gate_node)

    # === 串行阶段 ===
    workflow.set_entry_point("parse_pr")
    workflow.add_edge("parse_pr", "fetch_diff")
    workflow.add_edge("fetch_diff", "context_builder")
    workflow.add_edge("context_builder", "planner")

    # === 并发阶段: planner → 4 Agents fan-out ===
    workflow.add_edge("planner", "summarize")
    workflow.add_edge("planner", "security")
    workflow.add_edge("planner", "performance")
    workflow.add_edge("planner", "quality")

    # === 收敛: 4 Agents → critic ===
    workflow.add_edge("summarize", "critic")
    workflow.add_edge("security", "critic")
    workflow.add_edge("performance", "critic")
    workflow.add_edge("quality", "critic")

    # === Critic 条件边: 重跑 or 聚合 ===
    workflow.add_conditional_edges(
        "critic",
        _should_rerun,
        {
            "loop_gate": "loop_gate",
            "aggregate": "aggregate",
        },
    )

    # === 重跑: loop_gate → 4 Agents fan-out (summarize 检测 round>1 会跳过) ===
    workflow.add_edge("loop_gate", "summarize")
    workflow.add_edge("loop_gate", "security")
    workflow.add_edge("loop_gate", "performance")
    workflow.add_edge("loop_gate", "quality")

    # === 收尾 ===
    workflow.add_edge("aggregate", "report")
    workflow.add_edge("report", END)

    return workflow.compile()


review_graph = build_pr_review_graph()

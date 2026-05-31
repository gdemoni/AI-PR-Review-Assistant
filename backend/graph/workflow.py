"""LangGraph 工作流 — Summarize + Comprehensive 双 Agent + Critic 最多2轮迭代

流程图:
  parse_pr → fetch_diff → context_builder → planner
                                                ↓
                              ┌─── 2 Agents fan-out ──┐
                              ↓                        ↓
                          summarize              comprehensive
                         (仅首轮)          (安全+性能+质量三合一)
                              ↓                        ↓
                              └──────────┬─────────────┘
                                         ↓
                                      critic
                                         ↓
                              need_rerun? AND round<2
                                    ↓(YES且round=1)
                                loop_gate → planner(重新规划) → comprehensive(带修正)
                                    ↓(NO/已达2轮)
                              aggregate → report → END

- parse / fetch / context / planner 串行
- summarize + comprehensive 并发
- comprehensive 每个文件 1 次 LLM 调用输出三维度（原 3 次 → 1 次）
- Critic: need_rerun AND round < 2 → loop_gate → planner → comprehensive
- summarize 检查 round>1 自动跳过
"""

from langgraph.graph import StateGraph, END
from graph.state import PRAnalysisState
from graph.nodes import (
    parse_pr_node,
    fetch_diff_node,
    context_builder_node,
    planner_node,
    summarize_node,
    comprehensive_node,
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
    workflow.add_node("comprehensive", comprehensive_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("aggregate", aggregate_node)
    workflow.add_node("report", report_node)
    workflow.add_node("loop_gate", loop_gate_node)

    # === 串行阶段 ===
    workflow.set_entry_point("parse_pr")
    workflow.add_edge("parse_pr", "fetch_diff")
    workflow.add_edge("fetch_diff", "context_builder")
    workflow.add_edge("context_builder", "planner")

    # === 并发阶段: planner → summarize + comprehensive fan-out ===
    workflow.add_edge("planner", "summarize")
    workflow.add_edge("planner", "comprehensive")

    # === 收敛: summarize + comprehensive → critic ===
    workflow.add_edge("summarize", "critic")
    workflow.add_edge("comprehensive", "critic")

    # === Critic 条件边: 重跑 or 聚合 ===
    workflow.add_conditional_edges(
        "critic",
        _should_rerun,
        {
            "loop_gate": "loop_gate",
            "aggregate": "aggregate",
        },
    )

    # === 重跑: loop_gate → planner(基于 Critic 反馈重新规划) → summarize(跳过) + comprehensive(带修正反馈重跑) ===
    workflow.add_edge("loop_gate", "planner")

    # === 收尾 ===
    workflow.add_edge("aggregate", "report")
    workflow.add_edge("report", END)

    return workflow.compile()


review_graph = build_pr_review_graph()

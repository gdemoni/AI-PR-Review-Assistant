"""通用 LLM 调用模块 — 支持 5 家主流模型供应商 + 迭代反馈环四 Agent

通过环境变量 LLM_PROVIDER 切换供应商:
  - deepseek  → DeepSeek（DeepSeek-V3 / R1，默认）
  - qwen      → 阿里通义千问（Qwen-Plus / Qwen-Max）
  - zhipu     → 智谱 GLM（GLM-4-Flash / GLM-4-Plus）
  - moonshot  → 月之暗面 Kimi（moonshot-v1）
  - openai    → OpenAI / ChatGPT（GPT-4o）

用法: 在 .env 中设 LLM_PROVIDER=xxx 和对应的 *_API_KEY 即可, 其余无需改动。
"""

import os
import json
from typing import Optional
from graph.prompts import (
    SUMMARY_PROMPT,
    PLANNER_PROMPT,
    SECURITY_PROMPT,
    PERFORMANCE_PROMPT,
    QUALITY_PROMPT,
    CRITIC_PROMPT,
    AGGREGATE_PROMPT,
    REPORT_PROMPT,
)

# ============================================================
# 供应商配置
# ============================================================
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "deepseek").lower()

PROVIDER_CONFIG = {
    "deepseek": {
        "api_key_env": "DEEPSEEK_API_KEY",
        "default_model": "deepseek-chat",  # deepseek-chat | deepseek-reasoner
        "base_url": "https://api.deepseek.com",
    },
    "qwen": {
        "api_key_env": "QWEN_API_KEY",
        "default_model": "qwen-plus",  # qwen-turbo | qwen-plus | qwen-max
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    "zhipu": {
        "api_key_env": "ZHIPU_API_KEY",
        "default_model": "glm-4-flash",  # glm-4-flash | glm-4-plus | glm-4-air
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
    },
    "moonshot": {
        "api_key_env": "MOONSHOT_API_KEY",
        "default_model": "moonshot-v1-8k",  # moonshot-v1-8k | moonshot-v1-32k | moonshot-v1-128k
        "base_url": "https://api.moonshot.cn/v1",
    },
    "openai": {
        "api_key_env": "OPENAI_API_KEY",
        "default_model": "gpt-4o",
        "base_url": "https://api.openai.com/v1",
    },
}

if LLM_PROVIDER not in PROVIDER_CONFIG:
    raise ValueError(
        f"不支持的 LLM_PROVIDER: {LLM_PROVIDER}，"
        f"可选值: {', '.join(PROVIDER_CONFIG.keys())}"
    )


def _get_model(override: Optional[str] = None) -> str:
    """获取当前供应商的模型名称，优先使用 override"""
    return override or os.getenv("LLM_MODEL", PROVIDER_CONFIG[LLM_PROVIDER]["default_model"])


def _get_api_key(override: Optional[str] = None) -> str:
    """获取当前供应商的 API Key，优先使用 override"""
    if override:
        return override
    key_env = PROVIDER_CONFIG[LLM_PROVIDER]["api_key_env"]
    key = os.getenv(key_env)
    if not key:
        raise ValueError(
            f"未配置 {key_env} 环境变量，当前 LLM 供应商为 {LLM_PROVIDER}，"
            f"请在 .env 文件中设置 {key_env} 或通过前端传入 customApiKey"
        )
    return key


# ============================================================
# 核心：统一对话接口
# ============================================================
async def _chat(prompt: str, model: Optional[str] = None, api_key: Optional[str] = None) -> str:
    """向当前 LLM 发送提示词并返回文本响应，model/api_key 可选覆盖"""
    from openai import AsyncOpenAI

    config = PROVIDER_CONFIG[LLM_PROVIDER]
    client = AsyncOpenAI(
        api_key=_get_api_key(api_key),
        base_url=config["base_url"],
    )
    response = await client.chat.completions.create(
        model=_get_model(model),
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


# ============================================================
# 公开函数 — 迭代反馈环四 Agent + 旧版兼容
# ============================================================

async def generate_summary(code_diff: str, model: Optional[str] = None, api_key: Optional[str] = None) -> str:
    """PR 总结: 调用 LLM 生成 PR 中文摘要"""
    prompt = SUMMARY_PROMPT.format(code_diff=code_diff)
    return await _chat(prompt, model, api_key)


# --- 新版四 Agent ---

async def analyze_security(
    filename: str,
    code_content: str,
    context: str = "",
    critic_feedback: str = "",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> list[dict]:
    """安全 Agent: 带上下文和 Critic 反馈的深度风险分析 → [{level, message, evidence, file}]"""
    if not context:
        context = "无额外上下文"
    if not critic_feedback:
        critic_feedback = "无（首轮分析）"
    prompt = SECURITY_PROMPT.format(
        filename=filename,
        code_content=code_content[:4000],
        context=context,
        critic_feedback=critic_feedback,
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(text)
        if not isinstance(result, list):
            result = []
        for r in result:
            r.setdefault("file", filename)
        return result
    except json.JSONDecodeError:
        return [{"level": "low", "message": f"安全分析解析失败: {text[:100]}", "file": filename}]


async def analyze_performance(
    filename: str,
    code_content: str,
    context: str = "",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> list[dict]:
    """性能 Agent: 检测 N+1、大对象分配等问题 → [{level, message, file, severity, suggestion}]"""
    if not context:
        context = "无额外上下文"
    prompt = PERFORMANCE_PROMPT.format(
        filename=filename,
        code_content=code_content[:4000],
        context=context,
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(text)
        if not isinstance(result, list):
            result = []
        for r in result:
            r.setdefault("file", filename)
        return result
    except json.JSONDecodeError:
        return [{"level": "low", "message": f"性能分析解析失败: {text[:100]}", "file": filename}]


async def analyze_quality(
    filename: str,
    code_content: str,
    context: str = "",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> list[dict]:
    """质量 Agent: 检测命名/重复/复杂度 → [{file, title, description, severity, originalCode, revisedCode, explanation}]"""
    if not context:
        context = "无额外上下文"
    prompt = QUALITY_PROMPT.format(
        filename=filename,
        code_content=code_content[:4000],
        context=context,
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(text)
        if not isinstance(result, list):
            result = []
        for r in result:
            r.setdefault("file", filename)
        return result
    except json.JSONDecodeError:
        return [{
            "file": filename,
            "title": "质量分析失败",
            "description": f"LLM 返回格式异常: {text[:100]}",
            "severity": "info",
            "originalCode": "",
            "revisedCode": "",
            "explanation": "请检查 API Key 或重试",
        }]


# --- Critic / 聚合 / 报告 ---

async def run_critic(
    summary: str,
    security: list[dict],
    performance: list[dict],
    quality: list[dict],
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    """Critic Agent: 检查四个 Agent 输出的一致性 → {reassess, missing, confidence, need_rerun}"""
    prompt = CRITIC_PROMPT.format(
        summary=summary,
        security=json.dumps(security, ensure_ascii=False, indent=2),
        performance=json.dumps(performance, ensure_ascii=False, indent=2),
        quality=json.dumps(quality, ensure_ascii=False, indent=2),
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "reassess": [],
            "missing": [],
            "confidence": 0.5,
            "need_rerun": False,
            "summary": f"Critic 解析失败: {text[:100]}",
        }


async def aggregate_results(
    summary: str,
    security: list[dict],
    performance: list[dict],
    quality: list[dict],
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    """聚合评分: 合并去重排序, 产统一评分 → {overall, security, performance, quality, verdict, verdict_reason}"""
    prompt = AGGREGATE_PROMPT.format(
        summary=summary,
        security=json.dumps(security, ensure_ascii=False, indent=2),
        performance=json.dumps(performance, ensure_ascii=False, indent=2),
        quality=json.dumps(quality, ensure_ascii=False, indent=2),
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "overall": 0,
            "security": 0,
            "performance": 0,
            "quality": 0,
            "verdict": "safe",
            "verdict_reason": f"评分解析失败: {text[:100]}",
        }


async def generate_report(
    summary: str,
    score: dict,
    security: list[dict],
    performance: list[dict],
    quality: list[dict],
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    """报告生成: 整合所有产物输出 Markdown 审查报告"""
    prompt = REPORT_PROMPT.format(
        summary=summary,
        score=json.dumps(score, ensure_ascii=False, indent=2),
        security=json.dumps(security, ensure_ascii=False, indent=2),
        performance=json.dumps(performance, ensure_ascii=False, indent=2),
        quality=json.dumps(quality, ensure_ascii=False, indent=2),
    )
    return await _chat(prompt, model, api_key)


# --- Planner ---

async def run_planner(files_summary: str, model: Optional[str] = None, api_key: Optional[str] = None) -> dict:
    """Planner: 决定是否启用 Critic loop → {need_critic_loop, max_rounds, reason, priority}"""
    prompt = PLANNER_PROMPT.format(files_summary=files_summary)
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "need_critic_loop": False,
            "max_rounds": 1,
            "reason": "Planner 解析失败, 默认跳过 Critic",
            "priority": [],
        }

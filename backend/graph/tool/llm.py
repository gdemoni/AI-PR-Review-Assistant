"""通用 LLM 调用模块 — 支持 5 家主流模型供应商 + 三合一 Comprehensive Agent

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
    COMPREHENSIVE_PROMPT,
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
        "default_model": "deepseek-v4-pro",
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

# 模型名关键词 → 供应商映射（前端选模型时自动推断供应商）
MODEL_TO_PROVIDER = {
    "deepseek": "deepseek",
    "qwen": "qwen",
    "glm": "zhipu",
    "zhipu": "zhipu",
    "moonshot": "moonshot",
    "gpt": "openai",
    "o1": "openai",
}

if LLM_PROVIDER not in PROVIDER_CONFIG:
    raise ValueError(
        f"不支持的 LLM_PROVIDER: {LLM_PROVIDER}，"
        f"可选值: {', '.join(PROVIDER_CONFIG.keys())}"
    )


def _resolve_provider(model_override: Optional[str] = None) -> tuple:
    """根据模型名自动推断供应商，返回 (provider_key, model_name)

    前端选了 qwen-max → 推断 provider=qwen → 用通义千问 API
    前端选了 gpt-4o  → 推断 provider=openai → 用 OpenAI API
    前端未选模型    → 回退到 LLM_PROVIDER 环境变量
    """
    if model_override:
        model_lower = model_override.lower()
        for keyword, provider in MODEL_TO_PROVIDER.items():
            if keyword in model_lower:
                if provider in PROVIDER_CONFIG:
                    return provider, model_override
                break
    return LLM_PROVIDER, _get_model(model_override)


def _get_model(override: Optional[str] = None) -> str:
    """获取当前供应商的模型名称，优先使用 override"""
    return override or os.getenv("LLM_MODEL", PROVIDER_CONFIG[LLM_PROVIDER]["default_model"])


def _get_api_key(provider_key: str, api_key_override: Optional[str] = None) -> str:
    """获取指定供应商的 API Key，优先使用 api_key_override"""
    if api_key_override:
        return api_key_override
    config = PROVIDER_CONFIG.get(provider_key, PROVIDER_CONFIG[LLM_PROVIDER])
    key_env = config["api_key_env"]
    key = os.getenv(key_env)
    if not key:
        # 回退: 尝试用默认供应商的 key（兼容只配了一个 key 的场景）
        default_key = os.getenv(PROVIDER_CONFIG[LLM_PROVIDER]["api_key_env"])
        if default_key:
            return default_key
        raise ValueError(
            f"未配置 {key_env} 环境变量，当前模型供应商为 {provider_key}，"
            f"请在 .env 文件中设置 {key_env} 或通过前端传入 customApiKey"
        )
    return key


# ============================================================
# 核心：统一对话接口
# ============================================================
async def _chat(prompt: str, model: Optional[str] = None, api_key: Optional[str] = None) -> str:
    """向当前 LLM 发送提示词并返回文本响应，model/api_key 可选覆盖

    根据 model 名自动推断供应商（如 qwen-max → 通义千问 API），
    确保模型名和 API 端点匹配，不会出现用 DeepSeek API 调通义千问的错误。
    """
    from openai import AsyncOpenAI

    # 根据模型名推断供应商
    provider_key, resolved_model = _resolve_provider(model)
    config = PROVIDER_CONFIG.get(provider_key, PROVIDER_CONFIG[LLM_PROVIDER])

    client = AsyncOpenAI(
        api_key=_get_api_key(provider_key, api_key),
        base_url=config["base_url"],
    )
    response = await client.chat.completions.create(
        model=resolved_model,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


# ============================================================
# 公开函数 — 三合一 Comprehensive + 旧版兼容
# ============================================================

async def generate_summary(code_diff: str, pr_title: str = "", file_count: int = 0, model: Optional[str] = None, api_key: Optional[str] = None) -> str:
    """PR 总结: 调用 LLM 生成 PR 中文摘要（含 PR 标题 + 文件数上下文）"""
    prompt = SUMMARY_PROMPT.format(code_diff=code_diff, pr_title=pr_title, file_count=file_count)
    return await _chat(prompt, model, api_key)


# --- Comprehensive Agent（三合一） ---

async def analyze_comprehensive(
    filename: str,
    code_content: str,
    context: str = "",
    critic_feedback: str = "",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    """三合一审查: 一次 LLM 调用输出 security + performance + quality → {security: [...], performance: [...], quality: [...]}"""
    if not context:
        context = "无额外上下文"
    if not critic_feedback:
        critic_feedback = "无（首轮分析）"
    prompt = COMPREHENSIVE_PROMPT.format(
        filename=filename,
        code_content=code_content[:2000],
        context=context,
        critic_feedback=critic_feedback,
    )
    text = await _chat(prompt, model, api_key)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        result = json.loads(text)
        if not isinstance(result, dict):
            result = {"security": [], "performance": [], "quality": []}
        # 确保每个字段都是列表
        for key in ("security", "performance", "quality"):
            if not isinstance(result.get(key), list):
                result[key] = []
            for r in result[key]:
                r.setdefault("file", filename)
        return result
    except json.JSONDecodeError:
        return {
            "security": [{"level": "medium", "message": f"综合解析失败: {text[:100]}", "file": filename}],
            "performance": [],
            "quality": [],
        }


# --- Critic / 聚合 / 报告 ---

def _slim(items: list[dict]) -> list[dict]:
    """去除大字段，Critic / Aggregate 不需要原始代码"""
    return [
        {k: v for k, v in item.items()
         if k not in ("evidence", "originalCode", "revisedCode", "explanation", "description", "suggestion")}
        for item in items
    ]


async def run_critic(
    summary: str,
    security: list[dict],
    performance: list[dict],
    quality: list[dict],
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    """Critic Agent: 检查综合审查输出的一致性 → {reassess, missing, confidence, need_rerun}"""
    prompt = CRITIC_PROMPT.format(
        summary=summary,
        security=json.dumps(_slim(security), ensure_ascii=False, indent=2),
        performance=json.dumps(_slim(performance), ensure_ascii=False, indent=2),
        quality=json.dumps(_slim(quality), ensure_ascii=False, indent=2),
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
        security=json.dumps(_slim(security), ensure_ascii=False, indent=2),
        performance=json.dumps(_slim(performance), ensure_ascii=False, indent=2),
        quality=json.dumps(_slim(quality), ensure_ascii=False, indent=2),
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


# --- 旧版兼容 ---

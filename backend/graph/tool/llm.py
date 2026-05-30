"""通用 LLM 调用模块 — 支持 5 家主流模型供应商

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
from graph.prompts import SUMMARY_PROMPT, RISK_ANALYSIS_PROMPT, SUGGESTION_PROMPT

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


def _get_model() -> str:
    """获取当前供应商的模型名称"""
    return os.getenv("LLM_MODEL", PROVIDER_CONFIG[LLM_PROVIDER]["default_model"])


def _get_api_key() -> str:
    """获取当前供应商的 API Key"""
    key_env = PROVIDER_CONFIG[LLM_PROVIDER]["api_key_env"]
    key = os.getenv(key_env)
    if not key:
        raise ValueError(
            f"未配置 {key_env} 环境变量，当前 LLM 供应商为 {LLM_PROVIDER}，"
            f"请在 .env 文件中设置 {key_env}"
        )
    return key


# ============================================================
# 核心：统一对话接口
# ============================================================
async def _chat(prompt: str) -> str:
    """向当前 LLM 发送提示词并返回文本响应"""
    from openai import AsyncOpenAI

    config = PROVIDER_CONFIG[LLM_PROVIDER]
    client = AsyncOpenAI(
        api_key=_get_api_key(),
        base_url=config["base_url"],
    )
    response = await client.chat.completions.create(
        model=_get_model(),
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


# ============================================================
# 公开函数 — 与旧 LLM 接口完全兼容
# ============================================================

async def generate_summary(code_diff: str) -> str:
    """节点 3: 调用 LLM 生成 PR 中文摘要"""
    prompt = SUMMARY_PROMPT.format(code_diff=code_diff)
    return await _chat(prompt)


async def analyze_risks(code_content: str) -> list[dict]:
    """节点 4: 调用 LLM 扫描代码风险 → [{level, message}]"""
    prompt = RISK_ANALYSIS_PROMPT.format(code_content=code_content)
    text = await _chat(prompt)
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return [{"level": "low", "message": f"风险分析解析失败: {text[:100]}"}]


async def generate_suggestions(filename: str, code_content: str) -> list[dict]:
    """节点 5: 调用 LLM 生成代码改进建议 → [{file, title, description, ...}]"""
    prompt = SUGGESTION_PROMPT.format(filename=filename, code_content=code_content)
    text = await _chat(prompt)
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return [{
            "file": filename,
            "title": "建议生成失败",
            "description": f"LLM 返回格式异常: {text[:100]}",
            "severity": "info",
            "originalCode": "",
            "revisedCode": "",
            "explanation": "请检查 API Key 或重试"
        }]

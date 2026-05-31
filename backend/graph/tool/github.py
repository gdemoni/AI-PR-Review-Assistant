"""GitHub API — 拉取 PR 信息、diff、风险筛选和文件上下文，供工作流节点调用"""

import os
import re
import base64
import httpx
from typing import Optional

GITHUB_API_BASE = "https://api.github.com"


# ============================================================
# 自定义异常：区分 GitHub 错误类型，前端据此精准提示
# ============================================================
class GitHubAPIError(Exception):
    """GitHub API 错误，携带错误码与是否需要 Token 的标记"""
    def __init__(self, message: str, status_code: int = 0, needs_token: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.needs_token = needs_token


def _build_github_error(status_code: int, has_token: bool, repo: str = "") -> GitHubAPIError:
    """根据 HTTP 状态码和 Token 状态生成精准错误"""
    repo_hint = f"（仓库 {repo}）" if repo else ""
    if status_code == 404:
        if has_token:
            return GitHubAPIError(
                f"PR 或仓库不存在{repo_hint}，请检查链接是否正确",
                status_code=404, needs_token=False)
        else:
            return GitHubAPIError(
                f"仓库不可访问{repo_hint}，可能是私有仓库，请填写 GitHub Access Token",
                status_code=404, needs_token=True)
    elif status_code == 401:
        return GitHubAPIError(
            f"GitHub Token 无效或已过期{repo_hint}",
            status_code=401, needs_token=True)
    elif status_code == 403:
        return GitHubAPIError(
            f"GitHub Token 权限不足{repo_hint}，需要 repo scope",
            status_code=403, needs_token=True)
    else:
        return GitHubAPIError(
            f"GitHub API 返回 {status_code} 错误{repo_hint}",
            status_code=status_code, needs_token=False)

# ============================================================
# 风险文件筛选 — 关键词/路径匹配，零 LLM 成本
# ============================================================

RISKY_KEYWORDS = [
    # 安全
    "auth", "login", "password", "token", "secret", "key", "credential",
    "session", "jwt", "oauth", "csrf", "xss", "cors", "sanitize", "validate",
    # 数据
    "sql", "query", "database", "db", "mongo", "redis", "cache",
    # IO
    "input", "request", "response", "upload", "download", "file",
    # 配置/权限
    "config", "permission", "role", "admin", "settings",
    # 敏感
    "payment", "billing", "transaction", "encrypt", "decrypt",
]

RISKY_PATHS = [
    r"(^|/)auth/", r"(^|/)security/", r"(^|/)api/", r"(^|/)admin/",
    r"(^|/)config/", r"(^|/)database/", r"(^|/)middleware/",
    r"\.sql$", r"\.env",
]


def _auth_headers(token: Optional[str] = None) -> dict:
    """构建带 Token 的请求头，优先使用传入 token，其次 .env"""
    headers = {"Accept": "application/vnd.github+json"}
    effective = token or os.getenv("GITHUB_TOKEN")
    if effective:
        headers["Authorization"] = f"Bearer {effective}"
    return headers


def parse_pr_url(pr_url: str) -> dict | None:
    """
    从 GitHub PR URL 中提取 owner、repo、pr_number。

    示例: https://github.com/facebook/react/pull/12345
    返回: {"owner": "facebook", "repo": "react", "pr_number": "12345"}
    """
    pattern = r"github\.com/([^/]+)/([^/]+)/pull/(\d+)"
    match = re.search(pattern, pr_url)
    if not match:
        return None
    return {
        "owner": match.group(1),
        "repo": match.group(2),
        "pr_number": match.group(3)
    }


async def fetch_pr_info(owner: str, repo: str, pr_number: str, token: Optional[str] = None) -> dict:
    """
    获取 PR 基本信息（标题、作者等）。
    GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}

    public 仓库无需 Token 直接可查，private 仓库需 Token，
    401/403/404 会抛 GitHubAPIError 携带精准错误信息。
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}"
    has_token = bool(token or os.getenv("GITHUB_TOKEN"))
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_auth_headers(token))
        if resp.status_code != 200:
            raise _build_github_error(resp.status_code, has_token, f"{owner}/{repo}")
        pr_data = resp.json()
        return {
            "title": pr_data.get("title", ""),
            "repo": f"{owner}/{repo}",
            "author": pr_data.get("user", {}).get("login", "未知"),
            "author_avatar": pr_data.get("user", {}).get("avatar_url", None),
        }


async def fetch_pr_files(owner: str, repo: str, pr_number: str, token: Optional[str] = None) -> list[dict]:
    """
    获取 PR 变更文件列表及内容。
    GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}/files
    返回: [{filename, content, patch}]

    public 仓库无需 Token，private 仓库 401/403/404 抛 GitHubAPIError。
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}/files"
    has_token = bool(token or os.getenv("GITHUB_TOKEN"))
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_auth_headers(token))
        if resp.status_code != 200:
            raise _build_github_error(resp.status_code, has_token, f"{owner}/{repo}")
        files_data = resp.json()

        changed_files = []
        for f in files_data:
            filename = f.get("filename", "")
            patch = f.get("patch", "")

            raw_url = f.get("raw_url", "")
            content = ""
            if raw_url:
                try:
                    raw_resp = await client.get(raw_url, headers=_auth_headers(token))
                    if raw_resp.status_code == 200:
                        content = raw_resp.text
                except Exception:
                    content = patch

            changed_files.append({
                "filename": filename,
                "content": content or patch,
                "patch": patch,
            })

        return changed_files


# ============================================================
# 风险文件筛选
# ============================================================

def is_risky_file(filename: str, patch: str = "") -> bool:
    """
    零 LLM 成本判断文件是否可能包含安全/性能风险。
    先匹配文件名，再匹配路径，再匹配 diff 内容。
    任一命中即返回 True。
    """
    filename_lower = filename.lower()

    # 检查文件名是否包含风险关键词
    for kw in RISKY_KEYWORDS:
        if kw in filename_lower:
            return True

    # 检查路径模式
    for pattern in RISKY_PATHS:
        if re.search(pattern, filename_lower):
            return True

    # 检查 diff 内容是否包含风险关键词（patch 不为空时）
    if patch:
        patch_lower = patch.lower()
        for kw in RISKY_KEYWORDS:
            if kw in patch_lower:
                return True

    return False


# ============================================================
# 文件上下文获取
# ============================================================

async def fetch_file_context(
    owner: str,
    repo: str,
    path: str,
    ref: str = "",
    token: Optional[str] = None,
) -> dict:
    """
    使用 GitHub Contents API 获取文件的完整内容，
    并提取 import 语句和函数定义，构建轻量上下文。

    GitHub API: GET /repos/{owner}/{repo}/contents/{path}?ref={ref}

    返回: {
        "full_file": str（截断至 6000 字符）,
        "imports": ["import os", "from typing import ..."],
        "funcs": ["def login():", "async def validate_token():"],
    }
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    if ref:
        url += f"?ref={ref}"

    result = {"full_file": "", "imports": [], "funcs": []}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=_auth_headers(token))
            if resp.status_code != 200:
                return result

            data = resp.json()
            content_b64 = data.get("content", "")
            if not content_b64:
                return result

            # base64 解码
            decoded = base64.b64decode(content_b64).decode("utf-8", errors="replace")
            result["full_file"] = decoded[:6000]

            # 多语言正则提取 import/include
            import_patterns = [
                r"^(?:from\s+\S+\s+)?import\s+.+",           # Python
                r"^(?:const\s+)?require\(.+\)",              # JS/TS
                r"^use\s+.+",                                 # PHP
                r"^package\s+.+",                             # Go
            ]
            for pat in import_patterns:
                result["imports"].extend(
                    re.findall(pat, decoded, re.MULTILINE)
                )
            result["imports"] = result["imports"][:30]

            # 多语言正则提取函数/方法定义
            func_patterns = [
                r"^(?:async\s+)?def\s+(\w+)\(",                # Python
                r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)\(", # JS/TS
                r"^(?:public|private|protected|static)?\s+(?:async\s+)?\w+\s+(\w+)\(", # Java/C#
                r"^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\(", # Go
            ]
            for pat in func_patterns:
                result["funcs"].extend(
                    re.findall(pat, decoded, re.MULTILINE)
                )
            result["funcs"] = list(dict.fromkeys(result["funcs"]))[:50]

            return result

    except Exception:
        return result

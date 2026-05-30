"""GitHub API — 拉取 PR 信息和 diff，供工作流节点调用"""

import os
import re
import httpx

GITHUB_API_BASE = "https://api.github.com"


def _auth_headers() -> dict:
    """构建带 Token 的请求头，Token 可选（未配置时仅传 Accept）"""
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
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


async def fetch_pr_info(owner: str, repo: str, pr_number: str) -> dict:
    """
    获取 PR 基本信息（标题、作者等）。
    GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_auth_headers())
        resp.raise_for_status()
        pr_data = resp.json()
        return {
            "title": pr_data.get("title", ""),
            "repo": f"{owner}/{repo}",
            "author": pr_data.get("user", {}).get("login", "未知"),
            "author_avatar": pr_data.get("user", {}).get("avatar_url", None),
        }


async def fetch_pr_files(owner: str, repo: str, pr_number: str) -> list[dict]:
    """
    获取 PR 变更文件列表及内容。
    GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}/files
    返回: [{filename, content, patch}]
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{pr_number}/files"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_auth_headers())
        resp.raise_for_status()
        files_data = resp.json()

        changed_files = []
        for f in files_data:
            filename = f.get("filename", "")
            patch = f.get("patch", "")

            raw_url = f.get("raw_url", "")
            content = ""
            if raw_url:
                try:
                    raw_resp = await client.get(raw_url, headers=_auth_headers())
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

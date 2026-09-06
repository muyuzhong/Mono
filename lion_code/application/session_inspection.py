"""无需构造 Agent 或读取凭证的 Session 诊断用例。"""

from __future__ import annotations

from pathlib import Path

from lion_code.session_runtime.inspection import SessionInspection
from lion_code.session_runtime.repository import SessionRepository


async def inspect_session(
    session_id: str,
    *,
    cwd: Path,
    repository: SessionRepository | None = None,
) -> SessionInspection:
    """检查显式指定的当前工作区会话，返回不含正文的只读投影。"""
    return await (repository or SessionRepository()).inspect(session_id, cwd=cwd)

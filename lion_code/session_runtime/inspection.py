"""从有界文件快照诊断 Session，不重放、修复或写入历史。"""

from __future__ import annotations

import hashlib
import io
import os
import stat
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from lion_code.core.messages import AssistantMessage, StopReason, ToolResultMessage
from lion_code.core.session.entries import MessageEntry, SessionInfoEntry
from lion_code.core.session.jsonl import SessionJsonlError, entry_from_json_line

MAX_INSPECTION_BYTES = 8 * 1024 * 1024
MAX_INSPECTION_LINE_BYTES = 1024 * 1024
MAX_INSPECTION_LINES = 10_000
MAX_DIAGNOSTICS = 100

type ReadState = Literal[
    "missing", "empty", "readable", "invalid", "unreadable", "changed", "limit_exceeded"
]


@dataclass(frozen=True, slots=True)
class SessionDiagnostic:
    """只包含位置、稳定原因和哈希引用，避免泄漏历史内容。"""

    code: str
    line: int | None = None
    tool_ref: str | None = None


@dataclass(frozen=True, slots=True)
class SessionInspection:
    """一次只读检查的覆盖范围；消息终态不代表 operation 终态。"""

    session_id: str
    read_state: ReadState
    version: int = 1
    coverage: Literal["complete", "partial", "unavailable"] = "unavailable"
    snapshot_id: str | None = None
    record_count: int = 0
    ignored_tail_bytes: int = 0
    tool_call_count: int = 0
    tool_result_count: int = 0
    paired_tool_count: int = 0
    unmatched_tool_calls: int = 0
    orphan_tool_results: int = 0
    duplicate_tool_ids: int = 0
    last_assistant_stop_reason: StopReason | None = None
    run_status: Literal["unknown"] = "unknown"
    run_coverage: Literal["unavailable"] = "unavailable"
    diagnostics: tuple[SessionDiagnostic, ...] = ()
    diagnostics_omitted: int = 0


def _fingerprint(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)


def _read_snapshot(path: Path) -> tuple[ReadState, bytes]:
    before = None
    try:
        before = path.lstat()
        if not stat.S_ISREG(before.st_mode):
            return "unreadable", b""
        if before.st_size > MAX_INSPECTION_BYTES:
            return "limit_exceeded", b""
        with path.open("rb") as stream:
            opened = os.fstat(stream.fileno())
            if _fingerprint(opened) != _fingerprint(before):
                return "changed", b""
            data = stream.read(MAX_INSPECTION_BYTES + 1)
            after = os.fstat(stream.fileno())
            current = path.lstat()
            # Windows 的 lstat/fstat 可能给出不同 ctime 语义；只在同一 API 内比较。
            if (
                _fingerprint(after) != _fingerprint(opened)
                or after.st_ctime_ns != opened.st_ctime_ns
                or _fingerprint(current) != _fingerprint(before)
                or current.st_ctime_ns != before.st_ctime_ns
            ):
                return "changed", b""
        if len(data) > MAX_INSPECTION_BYTES:
            return "limit_exceeded", b""
        return ("readable" if data else "empty"), data
    except FileNotFoundError:
        return ("changed" if before is not None else "missing"), b""
    except OSError:
        return "unreadable", b""


def inspect_history(path: Path, *, session_id: str, cwd: Path) -> SessionInspection:
    """检查仓库定位的文件；其他工作区的有效历史返回 missing，不暴露来源。"""
    state, data = _read_snapshot(path)
    if state not in ("readable", "empty"):
        return SessionInspection(session_id, state)

    diagnostics: list[SessionDiagnostic] = []
    diagnostic_count = 0

    def report(code: str, line: int | None = None, tool_id: str | None = None) -> None:
        nonlocal diagnostic_count
        diagnostic_count += 1
        if len(diagnostics) < MAX_DIAGNOSTICS:
            # 文件中的 ID 也可能含任意文本，只输出哈希关联同一工具。
            ref = (
                hashlib.sha256(
                    tool_id.encode("utf-8", errors="surrogatepass")
                ).hexdigest()
                if tool_id is not None
                else None
            )
            diagnostics.append(SessionDiagnostic(code, line, ref))

    pending: dict[str, deque[int]] = defaultdict(deque)
    seen_calls: set[str] = set()
    seen_results: set[str] = set()
    records = calls = results = pairs = orphans = duplicates = 0
    last_stop: StopReason | None = None
    tail = 0
    stream = io.BytesIO(data)
    line_number = 0
    while raw := stream.readline(MAX_INSPECTION_LINE_BYTES + 1):
        line_number += 1
        if len(raw) > MAX_INSPECTION_LINE_BYTES or line_number > MAX_INSPECTION_LINES:
            state = "limit_exceeded"
            report("read_limit_exceeded", line_number)
            break
        if not raw.endswith(b"\n"):
            tail = len(raw)
            report("incomplete_tail", line_number)
            break
        if not raw.strip():
            continue
        try:
            entry = entry_from_json_line(raw.decode("utf-8"), line_number=line_number)
        except (SessionJsonlError, UnicodeError, RecursionError):
            state = "invalid"
            report("invalid_record", line_number)
            break
        if records == 0:
            if not isinstance(entry, SessionInfoEntry) or not entry.cwd:
                state = "invalid"
                report("workspace_unavailable", line_number)
                break
            try:
                same_workspace = (
                    Path(entry.cwd).is_absolute()
                    and Path(entry.cwd).resolve() == cwd.resolve()
                )
            except (OSError, ValueError, RuntimeError):
                same_workspace = False
            if not same_workspace:
                return SessionInspection(session_id, "missing")
        elif isinstance(entry, SessionInfoEntry):
            state = "invalid"
            report("invalid_record", line_number)
            break
        records += 1
        if not isinstance(entry, MessageEntry):
            continue
        message = entry.message
        if isinstance(message, AssistantMessage):
            last_stop = message.stop_reason
            for call in message.tool_calls:
                calls += 1
                if call.id in seen_calls:
                    duplicates += 1
                    report("duplicate_tool_id", line_number, call.id)
                seen_calls.add(call.id)
                pending[call.id].append(line_number)
        elif isinstance(message, ToolResultMessage):
            results += 1
            tool_id = message.tool_call_id
            if tool_id in seen_results:
                duplicates += 1
                report("duplicate_tool_id", line_number, tool_id)
            seen_results.add(tool_id)
            if pending.get(tool_id):
                pending[tool_id].popleft()
                pairs += 1
            else:
                orphans += 1
                report("orphan_tool_result", line_number, tool_id)

    unmatched = sum(len(lines) for lines in pending.values())
    for tool_id, lines in pending.items():
        for line in lines:
            report("unmatched_tool_call", line, tool_id)
    report("status_incomplete")
    coverage: Literal["complete", "partial", "unavailable"] = (
        "complete" if state in ("readable", "empty") and not tail else "partial"
    )
    return SessionInspection(
        session_id=session_id,
        read_state=state,
        coverage=coverage,
        snapshot_id=hashlib.sha256(data).hexdigest(),
        record_count=records,
        ignored_tail_bytes=tail,
        tool_call_count=calls,
        tool_result_count=results,
        paired_tool_count=pairs,
        unmatched_tool_calls=unmatched,
        orphan_tool_results=orphans,
        duplicate_tool_ids=duplicates,
        last_assistant_stop_reason=last_stop,
        diagnostics=tuple(diagnostics),
        diagnostics_omitted=max(0, diagnostic_count - MAX_DIAGNOSTICS),
    )

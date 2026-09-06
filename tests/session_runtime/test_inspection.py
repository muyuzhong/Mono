"""只读诊断的文件、覆盖范围与配对回归。"""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace

import pytest

from lion_code.application.session_inspection import inspect_session
from lion_code.core.messages import (
    AssistantMessage,
    ToolCall,
    ToolResultMessage,
    UserMessage,
)
from lion_code.core.session.entries import (
    CompactionEntry,
    MessageEntry,
    SessionInfoEntry,
)
from lion_code.core.session.jsonl import entry_to_json_line
from lion_code.session_runtime import inspection
from lion_code.session_runtime.repository import SessionRepository


def history(tmp_path, *entries):
    repository = SessionRepository(tmp_path / "sessions")
    path = repository.storage_for("s1").path
    path.parent.mkdir()
    info = SessionInfoEntry(cwd=str(tmp_path))
    path.write_text(
        "".join(entry_to_json_line(entry) for entry in (info, *entries)),
        encoding="utf-8",
    )
    return repository, path


def call(tool_id):
    return MessageEntry(
        message=AssistantMessage(
            content=[
                ToolCall(
                    id=tool_id,
                    name="private-tool",
                    arguments={"secret": "private-args"},
                )
            ],
            stop_reason="toolUse",
        )
    )


def result(tool_id):
    return MessageEntry(
        message=ToolResultMessage(
            tool_call_id=tool_id, tool_name="private-tool", content="private-result"
        )
    )


async def test_complete_snapshot_preserves_original_pairs_across_compaction(tmp_path):
    first = call("private-id")
    second = result("private-id")
    repository, path = history(
        tmp_path,
        first,
        second,
        CompactionEntry(
            summary="private-summary", replaces_entry_ids=[first.id, second.id]
        ),
        MessageEntry(
            message=AssistantMessage(content="private-answer", stop_reason="stop")
        ),
    )
    before = path.read_bytes(), path.stat().st_mtime_ns
    report = await inspect_session("s1", cwd=tmp_path, repository=repository)
    assert report.read_state == "readable" and report.coverage == "complete"
    assert report.record_count == 5
    assert (
        report.tool_call_count,
        report.tool_result_count,
        report.paired_tool_count,
    ) == (1, 1, 1)
    assert report.last_assistant_stop_reason == "stop"
    assert report.run_status == "unknown" and report.run_coverage == "unavailable"
    assert (path.read_bytes(), path.stat().st_mtime_ns) == before
    assert "private" not in json.dumps(asdict(report))
    again = await repository.inspect("s1", cwd=tmp_path)
    assert again == report


async def test_pairing_preserves_order_and_duplicate_occurrences(tmp_path):
    repository, _ = history(
        tmp_path,
        result("late"),
        call("late"),
        call("twice"),
        call("twice"),
        result("twice"),
        result("twice"),
        result("twice"),
        call("missing"),
    )
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.tool_call_count == 4
    assert report.tool_result_count == 4
    assert report.paired_tool_count == 2
    assert report.unmatched_tool_calls == 2
    assert report.orphan_tool_results == 2
    assert report.duplicate_tool_ids == 3
    codes = [item.code for item in report.diagnostics]
    assert codes.count("unmatched_tool_call") == 2
    assert codes.count("orphan_tool_result") == 2
    assert codes.count("duplicate_tool_id") == 3
    assert all(item.tool_ref != "missing" for item in report.diagnostics)


async def test_incomplete_utf8_tail_is_reported_without_repair(tmp_path):
    repository, path = history(tmp_path, call("unfinished"))
    tail = b'{"content":"\xe4\xb8'
    with path.open("ab") as stream:
        stream.write(tail)
    before = path.read_bytes(), path.stat().st_mtime_ns
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "readable" and report.coverage == "partial"
    assert report.record_count == 2 and report.ignored_tail_bytes == len(tail)
    assert report.unmatched_tool_calls == 1
    assert (path.read_bytes(), path.stat().st_mtime_ns) == before


@pytest.mark.parametrize("bad", [b"not-json\n", b'{"type":"unknown"}\n', b"\xff\n"])
async def test_corrupt_middle_stops_at_valid_prefix_without_echoing_data(tmp_path, bad):
    repository, path = history(tmp_path, call("pending"))
    with path.open("ab") as stream:
        stream.write(bad + entry_to_json_line(result("pending")).encode())
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "invalid" and report.coverage == "partial"
    assert report.record_count == 2 and report.tool_result_count == 0
    assert any(
        item.code == "invalid_record" and item.line == 3 for item in report.diagnostics
    )


async def test_missing_empty_unreadable_and_foreign_workspace_are_distinct(
    tmp_path, monkeypatch
):
    repository, path = history(tmp_path, call("secret"))
    foreign = await repository.inspect("s1", cwd=tmp_path / "other")
    missing = await repository.inspect("absent", cwd=tmp_path)
    assert foreign.read_state == missing.read_state == "missing"
    assert foreign.snapshot_id is None and foreign.record_count == 0
    path.write_bytes(b"")
    empty = await repository.inspect("s1", cwd=tmp_path)
    assert empty.read_state == "empty" and empty.record_count == 0
    with monkeypatch.context() as scoped:

        def denied(*args, **kwargs):
            raise PermissionError("private path and error")

        scoped.setattr(Path, "open", denied)
        unavailable = await repository.inspect("s1", cwd=tmp_path)
    assert unavailable.read_state == "unreadable"
    assert "private" not in json.dumps(asdict(unavailable))


async def test_byte_limit_prevents_open_and_line_limit_prevents_decode(
    tmp_path, monkeypatch
):
    repository, path = history(
        tmp_path, MessageEntry(message=UserMessage(content="x" * 2048))
    )
    with monkeypatch.context() as scoped:
        scoped.setattr(inspection, "MAX_INSPECTION_BYTES", path.stat().st_size - 1)

        def forbidden(*args, **kwargs):
            pytest.fail("Oversized file must not be opened")

        scoped.setattr(Path, "open", forbidden)
        report = await repository.inspect("s1", cwd=tmp_path)
        assert (
            report.read_state == "limit_exceeded" and report.coverage == "unavailable"
        )
    monkeypatch.setattr(inspection, "MAX_INSPECTION_LINE_BYTES", 1024)
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "limit_exceeded" and report.record_count == 1
    assert report.coverage == "partial"


async def test_diagnostic_count_is_bounded_without_losing_aggregate_counts(tmp_path):
    repository, _ = history(
        tmp_path, *(call(f"pending-{index}") for index in range(120))
    )
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.unmatched_tool_calls == 120
    assert len(report.diagnostics) == inspection.MAX_DIAGNOSTICS
    assert report.diagnostics_omitted == 21


async def test_file_change_during_read_discards_snapshot(tmp_path, monkeypatch):
    repository, path = history(tmp_path, call("private"))
    original_open = Path.open

    @contextmanager
    def changing_open(target, *args, **kwargs):
        with original_open(target, *args, **kwargs) as stream:

            def read(size):
                data = stream.read(size)
                with original_open(path, "ab") as writer:
                    writer.write(b"\n")
                return data

            yield SimpleNamespace(read=read, fileno=stream.fileno)

    monkeypatch.setattr(Path, "open", changing_open)
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "changed" and report.coverage == "unavailable"
    assert report.record_count == 0 and report.snapshot_id is None


async def test_line_count_limit_and_missing_workspace_metadata(tmp_path, monkeypatch):
    repository, path = history(tmp_path, call("unparsed"))
    monkeypatch.setattr(inspection, "MAX_INSPECTION_LINES", 1)
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "limit_exceeded" and report.record_count == 1
    assert report.tool_call_count == 0
    path.write_text(entry_to_json_line(call("private-id")), encoding="utf-8")
    report = await repository.inspect("s1", cwd=tmp_path)
    assert report.read_state == "invalid" and report.record_count == 0
    assert report.diagnostics[0].code == "workspace_unavailable"


async def test_nonregular_file_is_not_opened(tmp_path):
    repository = SessionRepository(tmp_path)
    repository.storage_for("folder").path.mkdir()
    report = await repository.inspect("folder", cwd=tmp_path)
    assert report.read_state == "unreadable" and report.snapshot_id is None


async def test_external_symlink_does_not_expose_history(tmp_path):
    repository, path = history(tmp_path, call("private"))
    alias = repository.storage_for("alias").path
    outside = tmp_path / "outside.jsonl"
    outside.write_bytes(path.read_bytes())
    try:
        alias.symlink_to(outside)
    except OSError:
        pytest.skip("Symlink creation is not permitted on this host")
    report = await repository.inspect("alias", cwd=tmp_path)
    assert report.read_state == "missing"
    assert report.record_count == 0 and report.snapshot_id is None


@pytest.mark.parametrize(
    "session_id", ["../secret", "..\\secret", "C:secret", "s1:stream", "", "a/b"]
)
async def test_inspection_rejects_paths_and_windows_streams(tmp_path, session_id):
    with pytest.raises(ValueError, match="Invalid session id"):
        await SessionRepository(tmp_path).inspect(session_id, cwd=tmp_path)

"""REPL 终端渲染的最小 stdout 契约。"""

import io

import pytest
from rich.console import Console

from lion_code import ui


def test_print_helpers_write_directly_to_stdout(capsys) -> None:
    ui.print_assistant_text("hello")
    ui.print_info("plain")
    ui.print_error("bad")

    output = capsys.readouterr().out
    assert "hello" in output
    assert "plain" in output
    assert "bad" in output


@pytest.mark.parametrize("encoding", ["utf-8", "gbk"])
def test_spinner_can_restart_without_swallowing_output(monkeypatch, encoding) -> None:
    monkeypatch.setenv("TERM", "xterm")
    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding=encoding)
    monkeypatch.setattr(ui.sys, "stdout", stream)
    monkeypatch.setattr(ui, "console", Console(file=stream, force_terminal=True))
    try:
        ui.stop_spinner()
        ui.start_spinner("Thinking")
        ui.start_spinner("Ignored")
        ui.stop_spinner()
        ui.stop_spinner()
        ui.print_assistant_text("回答")
        ui.start_spinner("Running tool")
        ui.stop_spinner()
        ui.print_assistant_text("完成")
        stream.flush()
        output = buffer.getvalue().decode(encoding)
        assert "Thinking" in output
        assert "Ignored" not in output
        assert "Running tool" in output
        assert "回答" in output
        assert output.endswith("完成")
    finally:
        ui.stop_spinner()

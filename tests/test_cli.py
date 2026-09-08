"""CLI 入口的通用参数与帮助文本契约。"""

import json
import sys
from argparse import Namespace
from unittest.mock import patch

import pytest

from lion_code.__main__ import (
    _dispatch_repl_command,
    _resolve_permission_mode,
    main,
    parse_args,
    run_repl,
)
from lion_code.application.commands import CommandResult
from lion_code.composition.full_product import build_full_coding_backend


@pytest.mark.parametrize("as_json", [False, True])
def test_inspect_session_is_read_only_and_skips_agent_setup(
    tmp_path, monkeypatch, capsys, as_json
):
    from lion_code.core.messages import AssistantMessage
    from lion_code.core.session.entries import MessageEntry, SessionInfoEntry
    from lion_code.core.session.jsonl import entry_to_json_line

    path = tmp_path / "local.jsonl"
    path.write_text(
        entry_to_json_line(SessionInfoEntry(cwd=str(tmp_path)))
        + entry_to_json_line(
            MessageEntry(message=AssistantMessage(content="private-answer"))
        ),
        encoding="utf-8",
    )
    original = path.read_bytes(), path.stat().st_mtime_ns
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("lion_code.session_runtime.repository.SESSION_DIR", tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        ["lion-code", "--inspect-session", "local"] + (["--json"] if as_json else []),
    )
    with (
        patch("lion_code.__main__.resolve_api_credentials") as credentials,
        patch("lion_code.__main__.build_full_coding_backend") as build,
    ):
        with pytest.raises(SystemExit) as exited:
            main()
        credentials.assert_not_called()
        build.assert_not_called()
    assert exited.value.code == 0
    output = capsys.readouterr().out
    assert "private-answer" not in output
    if as_json:
        document = json.loads(output)
        assert document["read_state"] == "readable"
        assert document["run_status"] == "unknown"
        assert document["last_assistant_stop_reason"] == "stop"
    else:
        assert "Run status: unknown" in output
    assert (path.read_bytes(), path.stat().st_mtime_ns) == original


@pytest.mark.parametrize(
    "options",
    [
        ["--json"],
        ["--inspect-session", "s1", "prompt"],
        ["--inspect-session", "s1", "--resume"],
    ],
)
def test_inspection_rejects_ambiguous_cli_modes(monkeypatch, options):
    monkeypatch.setattr(sys, "argv", ["lion-code", *options])
    with pytest.raises(SystemExit) as exited:
        parse_args()
    assert exited.value.code == 2


def test_inspection_missing_has_nonzero_exit_without_creating_state(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.setattr(
        "lion_code.session_runtime.repository.SESSION_DIR", tmp_path / "absent"
    )
    monkeypatch.setattr(
        sys, "argv", ["lion-code", "--inspect-session", "missing", "--json"]
    )
    with pytest.raises(SystemExit) as exited:
        main()
    assert exited.value.code == 1
    assert json.loads(capsys.readouterr().out)["read_state"] == "missing"
    assert not (tmp_path / "absent").exists()


@pytest.mark.parametrize("option", ["--legacy-tui", "--repl"])
def test_removed_tui_options_are_rejected(monkeypatch, option) -> None:
    monkeypatch.setattr(sys, "argv", ["lion-code", option])

    with pytest.raises(SystemExit):
        parse_args()


@pytest.mark.parametrize("option", ["--web", "--port", "--no-browser"])
def test_removed_web_options_are_rejected(monkeypatch, option) -> None:
    monkeypatch.setattr(sys, "argv", ["lion-code", option])

    with pytest.raises(SystemExit):
        parse_args()


def test_help_describes_default_repl_without_tui_option(monkeypatch, capsys) -> None:
    monkeypatch.setattr(sys, "argv", ["lion-code", "--help"])

    with pytest.raises(SystemExit) as exit_info:
        main()

    assert exit_info.value.code == 0
    output = capsys.readouterr().out
    assert "启动交互式 REPL" in output
    assert "Enable extended thinking for supported models" in output
    assert "--web" not in output
    assert "--port" not in output
    assert "--no-browser" not in output
    assert "--legacy-tui" not in output
    assert "--repl" not in output


def test_permission_mode_precedence_is_explicit() -> None:
    assert (
        _resolve_permission_mode(Namespace(yolo=True, accept_edits=True, dont_ask=True))
        == "bypassPermissions"
    )
    assert (
        _resolve_permission_mode(
            Namespace(yolo=False, accept_edits=True, dont_ask=True)
        )
        == "acceptEdits"
    )
    assert (
        _resolve_permission_mode(
            Namespace(yolo=False, accept_edits=False, dont_ask=True)
        )
        == "dontAsk"
    )
    assert (
        _resolve_permission_mode(
            Namespace(yolo=False, accept_edits=False, dont_ask=False)
        )
        == "default"
    )


@pytest.mark.asyncio
async def test_repl_routes_generic_command_through_application_session(
    monkeypatch,
) -> None:
    from core.fakes import FakeProvider

    with patch(
        "lion_code.composition.full_product.create_provider",
        return_value=FakeProvider([]),
    ):
        agent = build_full_coding_backend(
            api_base="https://example.test/v1",
            api_key="test-key",
            custom_system_prompt="test",
            terminal_output=False,
        )

    inputs = iter(("/clear", "exit"))
    monkeypatch.setattr("builtins.input", lambda: next(inputs))
    monkeypatch.setattr("lion_code.__main__.signal.signal", lambda *_args: None)

    await run_repl(agent)


@pytest.mark.asyncio
async def test_repl_unknown_command_prints_hint(monkeypatch, capsys) -> None:
    from core.fakes import FakeProvider

    with patch(
        "lion_code.composition.full_product.create_provider",
        return_value=FakeProvider([]),
    ):
        agent = build_full_coding_backend(
            api_base="https://example.test/v1",
            api_key="test-key",
            custom_system_prompt="test",
            terminal_output=False,
        )

    inputs = iter(("/definitely-not-a-command", "exit"))
    monkeypatch.setattr("builtins.input", lambda: next(inputs))
    monkeypatch.setattr("lion_code.__main__.signal.signal", lambda *_args: None)

    await run_repl(agent)

    output = capsys.readouterr().out
    assert "未知命令" in output


class _StubReplAgent:
    """最小 REPL 后端替身：只记录 _dispatch_repl_command 会调用的方法。"""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail_compact = False

    async def clear_history(self) -> None:
        self.calls.append("clear_history")

    async def compact(self) -> None:
        self.calls.append("compact")
        if self.fail_compact:
            raise RuntimeError("compact failed")

    async def chat(self, content: str) -> None:
        self.calls.append(f"chat:{content}")

    def toggle_plan_mode(self) -> str:
        self.calls.append("toggle_plan_mode")
        return "full"

    def show_cost(self) -> None:
        self.calls.append("show_cost")


def _result(**kwargs) -> CommandResult:
    return CommandResult(handled=True, **kwargs)


@pytest.mark.asyncio
async def test_repl_dispatch_unknown_command_prints_hint(capsys) -> None:
    agent = _StubReplAgent()
    result = CommandResult(handled=False)

    exited = await _dispatch_repl_command(agent, result)

    assert exited is False
    assert "未知命令" in capsys.readouterr().out
    assert agent.calls == []


@pytest.mark.asyncio
async def test_repl_dispatch_exit_returns_true() -> None:
    agent = _StubReplAgent()

    exited = await _dispatch_repl_command(agent, _result(exit_requested=True))

    assert exited is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("result", "expected_calls", "expected_out"),
    [
        (_result(new_session_requested=True), ["clear_history"], ""),
        (_result(plan_toggle_requested=True), ["toggle_plan_mode"], "Plan mode: full"),
        (_result(cost_requested=True), ["show_cost"], ""),
        (_result(compact_summary=""), ["compact"], ""),
        (_result(skill_prompt="use the skill"), ["chat:use the skill"], ""),
        (_result(message="Usage: /model <name>"), [], "Usage: /model"),
        (_result(resume_session_id="abc"), [], "不支持 /resume"),
        (_result(message="REPL 不支持 /resume；请用 --resume 启动"), [], "不支持 /resume"),
        (_result(message="hello notice"), [], "hello notice"),
    ],
)
async def test_repl_dispatch_routes_intent(
    result, expected_calls, expected_out, capsys
) -> None:
    agent = _StubReplAgent()

    exited = await _dispatch_repl_command(agent, result)

    assert exited is False
    assert agent.calls == expected_calls
    assert expected_out in capsys.readouterr().out


@pytest.mark.asyncio
async def test_repl_dispatch_compact_error_is_printed(capsys) -> None:
    agent = _StubReplAgent()
    agent.fail_compact = True

    exited = await _dispatch_repl_command(agent, _result(compact_summary=""))

    assert exited is False
    assert "compact failed" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_repl_dispatch_skills_lists_discovered_skills(
    monkeypatch, capsys
) -> None:
    from lion_code.capabilities.skill.discovery import SkillDefinition

    monkeypatch.setattr(
        "lion_code.__main__.discover_skills",
        lambda: [
            SkillDefinition(name="demo", description="demo skill", source="user"),
            SkillDefinition(
                name="hidden", description="internal", user_invocable=False
            ),
        ],
    )
    agent = _StubReplAgent()

    exited = await _dispatch_repl_command(agent, _result(skills_list_requested=True))

    assert exited is False
    out = capsys.readouterr().out
    assert "/demo (user) — demo skill" in out
    assert "hidden (project) — internal" in out

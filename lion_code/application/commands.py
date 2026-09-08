"""Application slash-command parsing and dispatch."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol


class CommandSession(Protocol):
    """Slash handlers only need the session mutations they can issue."""

    def set_model(self, model: str) -> None: ...

    def set_thinking_level(self, level: str) -> str: ...

    def cycle_thinking_level(self) -> str: ...


@dataclass(frozen=True, slots=True)
class CommandResult:
    """Result of handling a coding-session slash command."""

    handled: bool
    exit_requested: bool = False
    new_session_requested: bool = False
    compact_summary: str | None = None
    resume_session_id: str | None = None
    message: str | None = None
    plan_toggle_requested: bool = False
    cost_requested: bool = False
    skills_list_requested: bool = False
    skill_prompt: str | None = None


CommandHandler = Callable[[CommandSession, str], CommandResult]


def _model_command(session: CommandSession, args: str) -> CommandResult:
    """带参数直接切模型；无参数返回命令用法。"""
    if args:
        session.set_model(args)
        return CommandResult(handled=True, message=f"Model set: {args}")
    return CommandResult(handled=True, message="Usage: /model <name>")


def _thinking_command(session: CommandSession, args: str) -> CommandResult:
    """带参数设定 thinking 档位；无参数循环到下一档。"""
    level = session.set_thinking_level(args) if args else session.cycle_thinking_level()
    return CommandResult(handled=True, message=f"Thinking: {level}")


def _compact_command(_session: CommandSession, args: str) -> CommandResult:
    return CommandResult(handled=True, compact_summary=args)


def _resume_command(_session: CommandSession, args: str) -> CommandResult:
    if args:
        return CommandResult(handled=True, resume_session_id=args)
    return CommandResult(
        handled=True,
        message="REPL 不支持 /resume；请用 --resume 启动",
    )


def _skills_command(_session: CommandSession, _args: str) -> CommandResult:
    """返回 /skills 的展示意图。"""
    return CommandResult(handled=True, skills_list_requested=True)


def _try_skill_fallback(name: str, args: str) -> CommandResult:
    """未命中内置命令时，按 ``/<skill-name> [args]`` 解析用户 Skill。"""

    from lion_code.capabilities.skill.discovery import (
        execute_skill,
        get_skill_by_name,
        resolve_skill_prompt,
    )

    skill = get_skill_by_name(name)
    if skill is None or not skill.user_invocable:
        return CommandResult(handled=False)
    if skill.context == "fork":
        result = execute_skill(skill.name, args)
        if result is None:
            return CommandResult(handled=False)
        prompt = (
            f'Use the skill tool to invoke "{skill.name}" with args: {args or "(none)"}'
        )
    else:
        prompt = resolve_skill_prompt(skill, args)
    return CommandResult(handled=True, skill_prompt=prompt)


_STATIC_COMMANDS: dict[str, CommandResult | CommandHandler] = {
    "quit": CommandResult(handled=True, exit_requested=True),
    "exit": CommandResult(handled=True, exit_requested=True),
    "clear": CommandResult(handled=True, new_session_requested=True),
    "new": CommandResult(handled=True, new_session_requested=True),
    "plan": CommandResult(handled=True, plan_toggle_requested=True),
    "cost": CommandResult(handled=True, cost_requested=True),
    "skills": _skills_command,
}

_COMMAND_HANDLERS: dict[str, CommandHandler] = {
    "compact": _compact_command,
    "model": _model_command,
    "thinking": _thinking_command,
    "resume": _resume_command,
}


def handle_command(session: CommandSession, text: str) -> CommandResult:
    """Execute a fixed slash command or fall back to a user-invocable Skill."""
    stripped = text.strip()
    if not stripped.startswith("/"):
        return CommandResult(handled=False)

    name, args = _parse_command(stripped)
    if not name:
        return CommandResult(handled=False)

    command = _STATIC_COMMANDS.get(name)
    if isinstance(command, CommandResult):
        return command
    if command is not None:
        return command(session, args)
    handler = _COMMAND_HANDLERS.get(name)
    if handler is not None:
        return handler(session, args)
    return _try_skill_fallback(name, args)


def _parse_command(text: str) -> tuple[str, str]:
    command, separator, args = text[1:].partition(" ")
    return _normalize_name(command), args.strip() if separator else ""


def _normalize_name(name: str) -> str:
    return name.strip().removeprefix("/").lower()

"""``/<skill-name>`` fallback 与 ``/skills`` 命令测试。"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from lion_code.application.commands import handle_command
from lion_code.capabilities.skill.discovery import SkillDefinition


def _fake_skill(
    name: str = "test-skill",
    *,
    user_invocable: bool = True,
    context: str = "inline",
    prompt_template: str = "Execute: $ARGUMENTS",
) -> SkillDefinition:
    return SkillDefinition(
        name=name,
        description="A test skill",
        user_invocable=user_invocable,
        context=context,
        prompt_template=prompt_template,
        source="project",
        skill_dir="/fake/skills/test-skill",
    )


class _FakeSession:
    """Minimal session stub for command execution."""

    cwd = __import__("pathlib").Path.cwd()
    model = "fake"
    provider_name = "fake"
    available_models: tuple = ()
    tools: tuple = ()
    skills: tuple = ()
    context_token_estimate = 0
    context_window_tokens = 128_000
    thinking_level = "off"
    available_thinking_levels: tuple = ()
    resource_diagnostics: tuple = ()
    system_prompt = ""
    session_id: str | None = None

    def set_model(self, model: str) -> None:
        self.model = model

    def set_thinking_level(self, level: str) -> str:
        return level

    def cycle_thinking_level(self) -> str:
        return "off"


class TestSkillFallback(unittest.TestCase):
    def test_unknown_command_without_matching_skill_returns_unhandled(self) -> None:
        with patch(
            "lion_code.capabilities.skill.discovery.get_skill_by_name",
            return_value=None,
        ):
            result = handle_command(_FakeSession(), "/nonexistent")
        self.assertFalse(result.handled)

    def test_removed_command_is_not_registered(self) -> None:
        """未命中 Skill 的命令保留通用 unknown-command 结果。"""
        with patch(
            "lion_code.capabilities.skill.discovery.get_skill_by_name",
            return_value=None,
        ):
            result = handle_command(_FakeSession(), "/removed-command")
        self.assertFalse(result.handled)

    def test_inline_skill_fallback_returns_resolved_prompt(self) -> None:
        skill = _fake_skill()
        with patch(
            "lion_code.capabilities.skill.discovery.get_skill_by_name",
            return_value=skill,
        ):
            result = handle_command(_FakeSession(), "/test-skill hello world")
        self.assertTrue(result.handled)
        self.assertIsNotNone(result.skill_prompt)
        self.assertIn("Execute: hello world", result.skill_prompt)

    def test_non_user_invocable_skill_returns_unhandled(self) -> None:
        skill = _fake_skill(user_invocable=False)
        with patch(
            "lion_code.capabilities.skill.discovery.get_skill_by_name",
            return_value=skill,
        ):
            result = handle_command(_FakeSession(), "/test-skill")
        self.assertFalse(result.handled)

    def test_fork_skill_fallback_returns_tool_invoke_prompt(self) -> None:
        skill = _fake_skill(context="fork")
        with (
            patch(
                "lion_code.capabilities.skill.discovery.get_skill_by_name",
                return_value=skill,
            ),
            patch("lion_code.capabilities.skill.discovery.execute_skill") as mock_exec,
        ):
            mock_exec.return_value = {
                "prompt": "fork prompt",
                "allowed_tools": None,
                "context": "fork",
            }
            result = handle_command(_FakeSession(), "/test-skill do thing")
        self.assertTrue(result.handled)
        self.assertIn("skill tool", result.skill_prompt)
        self.assertIn("test-skill", result.skill_prompt)

    def test_skills_command_returns_skills_list_requested(self) -> None:
        result = handle_command(_FakeSession(), "/skills")
        self.assertTrue(result.handled)
        self.assertTrue(result.skills_list_requested)

    def test_fixed_commands_dispatch_without_registry(self) -> None:
        session = _FakeSession()

        result = handle_command(session, "/model test-model")
        self.assertEqual(result.message, "Model set: test-model")
        self.assertEqual(session.model, "test-model")

        result = handle_command(session, "/model")
        self.assertEqual(result.message, "Usage: /model <name>")

        result = handle_command(session, "/thinking high")
        self.assertEqual(result.message, "Thinking: high")

        result = handle_command(session, "/thinking")
        self.assertEqual(result.message, "Thinking: off")

        result = handle_command(session, "/compact keep this")
        self.assertEqual(result.compact_summary, "keep this")

        result = handle_command(session, "/resume session-1")
        self.assertEqual(result.resume_session_id, "session-1")

        result = handle_command(session, "/resume")
        self.assertIn("不支持 /resume", result.message)

    def test_non_command_input_remains_unhandled(self) -> None:
        for text in ("ordinary prompt", "/"):
            with self.subTest(text=text):
                self.assertFalse(handle_command(_FakeSession(), text).handled)


if __name__ == "__main__":
    unittest.main(verbosity=2)

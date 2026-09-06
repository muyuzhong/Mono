from __future__ import annotations

import json
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from lion_code.core.cancellation import CancellationToken
from lion_code.permission_state import PermissionController, PermissionState
from lion_code.runtime.session_identity import SessionIdentityState
from lion_code.tooling.context import ToolContext
from lion_code.tooling.internal import (
    create_enter_plan_tool,
    create_exit_plan_tool,
    create_tool_search_tool,
)
from lion_code.tooling.registry import ToolRegistry
from lion_code.tooling.runtime import ToolRuntime
from lion_code.tooling.types import ToolResult


async def _plan_command(_arguments):
    return ToolResult(content="ok")


class TestToolSearch(unittest.IsolatedAsyncioTestCase):
    def _runtime(self):
        registry = ToolRegistry()
        for tool in (
            create_enter_plan_tool(_plan_command),
            create_exit_plan_tool(_plan_command),
            create_tool_search_tool(),
        ):
            registry.register(tool)
        context = ToolContext(
            session=SessionIdentityState("session", "2026-08-09T00:00:00Z"),
            cancellation=CancellationToken(),
            cwd=Path.cwd(),
            registry=registry,
            permission=PermissionController(PermissionState("default")),
            read_file_state={},
        )
        return registry, ToolRuntime(registry, context)

    async def test_tool_search_activates_matching_deferred_tool(self):
        registry, runtime = self._runtime()

        result = await runtime.execute(
            tool_call_id="call-1",
            name="tool_search",
            arguments={"query": "enter plan"},
        )

        self.assertEqual(result.activated_tools, ["enter_plan_mode"])
        self.assertTrue(registry.is_active("enter_plan_mode"))
        self.assertFalse(registry.is_active("exit_plan_mode"))
        schemas = json.loads(result.content)["tools"]
        self.assertEqual([schema["name"] for schema in schemas], ["enter_plan_mode"])

    async def test_activation_is_local_to_registry(self):
        first, first_runtime = self._runtime()
        second, _ = self._runtime()

        await first_runtime.execute(
            tool_call_id="call-1",
            name="tool_search",
            arguments={"query": "plan mode"},
        )

        self.assertTrue(first.is_active("enter_plan_mode"))
        self.assertEqual(
            second.deferred_tool_names(),
            [
                "enter_plan_mode",
                "exit_plan_mode",
            ],
        )

    async def test_broad_search_is_ranked_and_bounded_independent_of_registration(self):
        registry, runtime = self._runtime()
        template = registry.resolve("enter_plan_mode")
        names = ["zebra", "x_catalog", "catalog_extra", "catalog"]
        names += [f"description_{index}" for index in range(10)]
        for name in names:
            registry.register(replace(template, name=name, description="catalog"))
        result = await runtime.execute(
            tool_call_id="search", name="tool_search", arguments={"query": " CATALOG "}
        )
        payload = json.loads(result.content)
        expected = ["catalog", "catalog_extra", "x_catalog"] + [
            f"description_{index}" for index in range(5)
        ]
        self.assertEqual(result.activated_tools, expected)
        self.assertEqual([tool["name"] for tool in payload["tools"]], expected)
        self.assertEqual(payload["omitted_count"], len(names) - len(expected))
        self.assertFalse(registry.is_active("zebra"))
        self.assertFalse(registry.is_active("description_5"))
        narrower = await runtime.execute(
            tool_call_id="narrow", name="tool_search", arguments={"query": "zebra"}
        )
        self.assertEqual(narrower.activated_tools, ["zebra"])
        self.assertTrue(registry.is_active("catalog"))

    async def test_schema_budget_reports_blocked_and_still_accepts_smaller_match(self):
        registry, runtime = self._runtime()
        template = registry.resolve("enter_plan_mode")
        for name, size in (
            ("budget_a", 300),
            ("budget_b", 300),
            ("budget_c", 1000),
            ("budget_d", 0),
        ):
            registry.register(replace(template, name=name, description="中" * size))
        with patch("lion_code.tooling.internal.TOOL_SEARCH_SCHEMA_CHAR_BUDGET", 700):
            result = await runtime.execute(
                tool_call_id="search", name="tool_search", arguments={"query": "budget"}
            )
        payload = json.loads(result.content)
        self.assertEqual(result.activated_tools, ["budget_a", "budget_d"])
        self.assertLessEqual(len(json.dumps(payload["tools"], ensure_ascii=False)), 700)
        self.assertEqual(
            payload["blocked"],
            [
                {
                    "name": "budget_b",
                    "reason": "schema_budget_exhausted",
                    "active": False,
                },
                {"name": "budget_c", "reason": "schema_too_large", "active": False},
            ],
        )
        self.assertFalse(registry.is_active("budget_b"))
        self.assertFalse(registry.is_active("budget_c"))

    async def test_exact_budget_is_accepted_and_repeated_search_preserves_activation(
        self,
    ):
        registry, runtime = self._runtime()
        tool = registry.resolve("enter_plan_mode")
        size = len(json.dumps([tool.to_anthropic_schema()], ensure_ascii=False))
        for budget in (size, size - 1):
            with patch(
                "lion_code.tooling.internal.TOOL_SEARCH_SCHEMA_CHAR_BUDGET", budget
            ):
                result = await runtime.execute(
                    tool_call_id="search",
                    name="tool_search",
                    arguments={"query": tool.name},
                )
            payload = json.loads(result.content)
            if budget == size:
                self.assertEqual(result.activated_tools, [tool.name])
            else:
                self.assertEqual(result.activated_tools, [])
                self.assertEqual(payload["blocked"][0]["reason"], "schema_too_large")
                self.assertTrue(payload["blocked"][0]["active"])
            self.assertTrue(registry.is_active(tool.name))

    async def test_empty_or_non_string_query_does_not_activate_tools(self):
        registry, runtime = self._runtime()
        for arguments in ({}, {"query": "  "}, {"query": None}, {"query": 42}):
            result = await runtime.execute(
                tool_call_id="search", name="tool_search", arguments=arguments
            )
            self.assertTrue(result.is_error)
        self.assertFalse(registry.is_active("enter_plan_mode"))
        self.assertFalse(registry.is_active("exit_plan_mode"))


if __name__ == "__main__":
    unittest.main()

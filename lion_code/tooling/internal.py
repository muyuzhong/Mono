"""Agent、Skill、Plan、工具搜索与动态循环等内部工具定义。"""

from __future__ import annotations

import json

from .types import LionTool, ToolCapabilities, ToolCommand, ToolResult

TOOL_SEARCH_MAX_RESULTS = 8
TOOL_SEARCH_SCHEMA_CHAR_BUDGET = 24_000


def create_agent_tool(command: ToolCommand) -> LionTool:
    async def execute(context, tool_call_id, arguments, on_update):
        del context, tool_call_id, on_update
        return await command(arguments)

    return LionTool(
        name="agent",
        description="Launch a sub-agent to handle a task autonomously. Sub-agents have isolated context and return their result. Types: 'explore' (read-only), 'plan' (read-only, structured planning), 'general' (full tools).",
        parameters={
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Short (3-5 word) description of the sub-agent's task",
                },
                "prompt": {
                    "type": "string",
                    "description": "Detailed task instructions for the sub-agent",
                },
                "type": {
                    "type": "string",
                    "enum": ["explore", "plan", "general"],
                    "description": "Agent type. Default: general",
                },
            },
            "required": ["description", "prompt"],
        },
        execute_fn=execute,
        capabilities=ToolCapabilities(
            result_policy="persist_large",
        ),
    )


def create_skill_tool(command: ToolCommand) -> LionTool:
    async def execute(context, tool_call_id, arguments, on_update):
        del context, tool_call_id, on_update
        return await command(arguments)

    return LionTool(
        name="skill",
        description="Invoke a registered skill by name. Skills are prompt templates loaded from .claude/skills/. Returns the skill's resolved prompt to follow.",
        parameters={
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "The name of the skill to invoke",
                },
                "args": {
                    "type": "string",
                    "description": "Optional arguments to pass to the skill",
                },
            },
            "required": ["skill_name"],
        },
        execute_fn=execute,
        capabilities=ToolCapabilities(
            result_policy="persist_large",
        ),
    )


def create_enter_plan_tool(command: ToolCommand) -> LionTool:
    async def execute(context, tool_call_id, arguments, on_update):
        del context, tool_call_id, arguments, on_update
        return await command({})

    return LionTool(
        name="enter_plan_mode",
        description="Enter plan mode to switch to a read-only planning phase. In plan mode, you can only read files and write to the plan file.",
        parameters={"type": "object", "properties": {}},
        execute_fn=execute,
        capabilities=ToolCapabilities(
            read_only=True,
            deferred=True,
        ),
    )


def create_exit_plan_tool(command: ToolCommand) -> LionTool:
    async def execute(context, tool_call_id, arguments, on_update):
        del context, tool_call_id, arguments, on_update
        return await command({})

    return LionTool(
        name="exit_plan_mode",
        description="Exit plan mode after you have finished writing your plan to the plan file.",
        parameters={"type": "object", "properties": {}},
        execute_fn=execute,
        capabilities=ToolCapabilities(
            read_only=True,
            deferred=True,
        ),
    )


def create_tool_search_tool() -> LionTool:
    async def execute(context, tool_call_id, arguments, on_update):
        del tool_call_id, on_update
        query = arguments.get("query")
        if not isinstance(query, str) or not query.strip():
            return ToolResult(
                content="query must be a non-empty string.", is_error=True
            )
        query = query.strip().casefold()
        matches = [
            tool
            for tool in context.registry.search(query)
            if tool.capabilities.deferred
        ]
        if not matches:
            return ToolResult(content="No matching deferred tools found.")

        matches.sort(
            key=lambda tool: (
                tool.name.casefold() != query,
                not tool.name.casefold().startswith(query),
                query not in tool.name.casefold(),
                tool.name.casefold(),
                tool.name,
            )
        )
        activated: list[str] = []
        schemas: list[dict] = []
        blocked: list[dict[str, str | bool]] = []
        schema_chars = 2  # JSON 数组括号与分隔符也计入预算，不截断 schema。
        for tool in matches[:TOOL_SEARCH_MAX_RESULTS]:
            schema = tool.to_anthropic_schema()
            size = len(json.dumps(schema, ensure_ascii=False))
            added_chars = size + (2 if schemas else 0)
            reason = None
            if size + 2 > TOOL_SEARCH_SCHEMA_CHAR_BUDGET:
                reason = "schema_too_large"
            elif schema_chars + added_chars > TOOL_SEARCH_SCHEMA_CHAR_BUDGET:
                reason = "schema_budget_exhausted"
            if reason is not None:
                blocked.append(
                    {
                        "name": tool.name,
                        "reason": reason,
                        "active": context.registry.is_active(tool.name),
                    }
                )
                continue
            schemas.append(schema)
            schema_chars += added_chars
            activated.append(tool.name)

        # 全部候选序列化成功后才激活，避免失败结果留下半次激活。
        content = json.dumps(
            {
                "tools": schemas,
                "blocked": blocked,
                "omitted_count": max(0, len(matches) - TOOL_SEARCH_MAX_RESULTS),
            },
            ensure_ascii=False,
        )
        for name in activated:
            context.registry.activate(name)
        return ToolResult(
            content=content,
            activated_tools=activated,
        )

    return LionTool(
        name="tool_search",
        description="Search deferred tools by name or keyword. Examines at most 8 matches, ranked by exact name, prefix, name substring, then description. Returns and activates full schemas within a 24000-character schema budget; blocked entries explain omissions. Narrow the query when omitted_count is nonzero. Existing active tools remain active.",
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Tool name or search keywords",
                },
            },
            "required": ["query"],
        },
        execute_fn=execute,
        capabilities=ToolCapabilities(
            read_only=True,
            concurrency_safe=True,
        ),
        execution_mode="parallel",
    )


def create_internal_tools() -> list[LionTool]:
    """创建常驻内部工具。

    ``skill`` 和 ``agent`` 工具已由 Capability SPI (SkillCapability /
    SubagentCapability) 通过 ToolSource 接入，不再由此函数提供。
    """
    return [
        create_tool_search_tool(),
    ]

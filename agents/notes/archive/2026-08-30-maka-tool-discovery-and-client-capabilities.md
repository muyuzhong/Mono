# 工作区已实现：tool_search 发现预算

2026-09-05 实现，2026-09-06 移出待办；尚未提交或发布。

## 已实现契约

[create_tool_search_tool](../../../lion_code/tooling/internal.py) 要求非空 query，
按精确名称、名称前缀、名称子串、描述命中稳定排序，最多处理前 8 个候选。
成功返回 schema 数组的 JSON 字符预算为 24,000；schema 不截断。

结果正文包含 tools、blocked、omitted_count。单项过大与剩余预算不足分别报告
schema_too_large 和 schema_budget_exhausted。未返回工具不新增激活；
较小的后续候选仍可装入，已有激活保持不变。执行仍经原有 ToolRuntime 权限与中间件路径。

## 验证与边界

[搜索测试](../../../tests/tooling/test_tool_search.py) 覆盖数量、排序、缩小查询、字符预算、
拒绝原因和激活状态；上一轮相关检查通过，本轮没有重跑代码测试。

预算属于每次搜索的 schema 数组，不包括诊断包装，也不是累计 Provider schema 总预算。
被预算拒绝的工具不一定处于未激活状态，blocked.active 明确表示当前 registry 状态。
子串搜索不是自然语言语义搜索，描述不应承诺按任意意图检索。

## 不继续保留的扩张方向

旧提案将 Skill metadata 搜索、MCP、客户端能力、图片/structured result 混入同一方向，
缺少真实消费者，本次从待办内容中移除。先用实际查询发现漏召回或累计 schema 成本问题，
再提出针对性改进；不预先增加 Registry、ToolResult 多内容块或新执行通路。

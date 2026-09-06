# 工作区已实现：WebSocket 大小边界

2026-09-05 实现，2026-09-06 移出待办；尚未提交或发布。

## 已实现范围

[Server wire](../../../lion_code/server/wire.py) 与 [Desktop wire](../../../desktop/src/shared/wire.ts)
双向限制整帧 1,048,576 UTF-8 bytes、单个字符串 262,144 UTF-8 bytes、
每个容器 4,096 项、值深度 32（根为 0）。先限制帧体积再解析，之后检查解码字符串与结构。

超限拒绝整条消息，不截断正文或工具参数。Server 发送有界 protocol_error 并以 1009 关闭，
非文本输入以 1003 关闭；待审批请求拒绝，活动运行走现有取消/清理路径。
Desktop 超限发送返回 false，非法入站消息不交给 reducer。

## 验证记录

上一轮通过共 75 项相关 Python 测试和 50 项 Desktop 测试，以及局部 mypy、Desktop typecheck、
Ruff 和 diff 检查。这是上一轮验证记录，本轮仅修改提案资料，没有重跑代码测试。
边界向量位于 [共享 fixtures](../../../tests/fixtures/websocket-bounds.json)。

## 限制与改进触发点

- 单帧上限不限制累计帧数、Core 队列积压、REST 历史或持久化体积。
- ASGI 在应用检查之前可能已经分配帧；不能把应用上限称为整个进程峰值内存上限。
- 连续小帧导致积压的改进归入 [工具队列预算](../02-conditional/2026-08-30-maka-resource-budget-and-backpressure.md)。
- 若大历史实际导致重连卡顿，单独设计有界历史读取，不把聊天正文直接裁短。
- 没有 durable event resume 消费者时不引入 revision/cursor；Renderer generation 仅保护请求生命周期。

本项从主动待办移出，不以这些边界说明自动创建下一阶段工程。

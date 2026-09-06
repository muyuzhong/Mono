# 会话历史完整性与只读诊断

状态：2026-09-06 工作区已实现，尚未提交。按用户要求优先完成工作量最小的任务。

入口：在原工作区执行 `lion-code --inspect-session <ID> [--json]`。
实现位于 [inspection.py](../../../lion_code/session_runtime/inspection.py)，经 Repository 和 Application 查询暴露。
只读检查原始 JSONL 配对、损坏、尾行与来源变化，不加载凭证、启动 Agent 或修改历史。
文件/行/物理行数/诊断上限分别为 8 MiB、1 MiB、10,000、100；工具引用只输出哈希。
原仓库不是工作区隔离仓库；本查询额外校验会话首条元数据 cwd。运行终态保持 unknown。

验证：相关 Session/CLI 测试 49 通过、1 跳过；相关架构测试 7 通过；局部 Ruff 和 mypy 通过。
符号链接用例因 Windows 创建权限跳过。完整契约见[检查点与诊断](../../../docs/architecture/checkpoint-recovery.md#只读会话诊断)。

以下保留实施前提案作为决策背景；实现范围和边界以上述记录及当前使用说明为准。

## 为什么保留

重启后用户需要知道历史能否可信读取、哪些工具调用缺结果。这个读视图有明确排障价值，
但不能把“有一条 assistant stop 消息”解释成“某次 operation 已完整成功”。

## 当前证据与推断边界

| 来源 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| [SessionRecorder.handle](../../../lion_code/session_runtime/recorder.py) | MessageEndEvent 的完成态消息被记录；配置和 compaction 有各自 Entry | 没有持久化全部 Core 流事件，不能靠 JSONL 重建完整事件计数或每次 run 的唯一终态 |
| [JsonlSessionStorage.read_all](../../../lion_code/core/session/storage.py) | 可读取完整行前缀；半行读取时忽略且不修改源文件 | 返回值不带尾部忽略字节数；不存在文件返回空列表，不能据此区分不存在与空文件 |
| [SessionState](../../../lion_code/core/session/memory.py) | 按 Entry 重建有效消息和压缩上下文 | 只看压缩后的消息不足以检查原始历史中的工具配对 |
| [AgentRuntime.run](../../../lion_code/runtime/agent.py) | 当前调用返回 timeout/aborted 等结构化结果 | 返回值不是可从 JSONL 原样重建的 durable run record |
| [checkpoint 说明](../../../docs/architecture/checkpoint-recovery.md) | Supervisor 有 goal/attempt 自己的控制面状态 | 未有可靠关联时不能把它或 audit 按时间邻近拼到一次普通聊天 |

需要纠正：读取半行与修复半行不是一回事。`read_all` 只在内存中忽略尾部，
`append` 才调用 `_discard_incomplete_tail` 修改文件。只读诊断不得调用 append、restore 或运行恢复流程。

## 最小用户入口和结果

先提供单个 session id 的应用查询及 CLI 人类摘要，不同时建设桌面诊断中心。
路径由现有 SessionRepository 的工作区范围解析，不能接受任意绝对路径。

建议结果包含：schema version、session id、来源快照标识、读取状态、完整记录数、
忽略尾字节数、工具 call/result 配对计数、有限 diagnostics 与 `coverage`。
快照标识只用于说明本次读取边界，不变成 durable event cursor。

- 读取状态区分 missing、empty、readable、invalid、unreadable、changed、limit_exceeded。
- diagnostics 至少区分 incomplete_tail、unmatched_tool_call、orphan_tool_result、
  duplicate_tool_id、invalid_record 和 status_incomplete。
- 诊断只返回 ID、位置、计数和稳定原因；不包含 prompt、工具 args/result 或原始异常。
- 首版 run status 默认 unknown；可以展示来源中实际存在的 assistant stop reason，
  但字段名与文案必须指明它是“消息终态”，不是“运行终态”。
- 若来源不能证明 run 身份/timeout 原因/唯一终态，coverage 明确 unavailable，不能补造。

## 实施边界

1. 在现有存储/仓库读侧增加最小诊断读取能力，共用 canonical Entry decoder；不维护第二份历史。
2. 读取单个文件的有界字节快照，先确定文件与单行上限；超过限制明确 limit_exceeded，不全量读入后才截断。
3. 若读取期间检测到源文件变化，返回 changed；不静默拼接多个快照，也不锁住运行写者。
4. 配对检查基于原始 MessageEntry，按工具 id 及出现顺序检查；不要基于只保留部分历史的 compaction 投影。
5. 对文件中段损坏不跳过继续假装完整；末尾半行可报告完整前缀，但 coverage 必须为 partial。
6. 明确字段 unknown 的返回规则；不根据没有 error 字符串推断 completed。
7. CLI/UI 通过应用查询取得投影，不能反向拥有 AgentRuntime、读取私有状态或触发 Provider 请求。

不要引入 run header、RuntimeEventStore、全量 audit 聚合、通用 InspectionManager 或自动恢复。

## 验收

| 用例 | 必须观察到 |
| --- | --- |
| 正常完整消息/工具记录 | 配对计数正确，消息 stop reason 原样展示；不虚构 operation 终态 |
| 缺工具结果、孤立结果、重复 id | 各自诊断明确，不能仅以集合去重掩盖重复 |
| UTF-8 半行尾部 | 返回前缀计数和忽略字节数，源文件字节及 mtime 不变 |
| 中段坏 JSON/非法 schema | invalid，并标明可读覆盖范围，不报告历史完整 |
| 文件不存在、空文件、拒绝访问 | 三者可区分；诊断不泄漏底层完整异常 |
| 读取期间变化、超限文件或行 | changed/limit_exceeded，内存与读取量有界 |
| 重启后只有最后一条 assistant 消息 | operation status 仍 unknown，不能猜 timeout 或唯一终态 |

优先复用 Session fixture 和 decoder 测试，在真实观测边界补测试，不为诊断新增 durable 写入。

## 历史借鉴来源

2026-08-30 Maka 的 `execution-inspect.ts` 与 `runtime-event-read-model.ts`
提供 coverage 和缺失事实显式化的启发；Maka 的独立运行存储不能直接假定存在于 Lion。
本轮未重新核实 Maka。

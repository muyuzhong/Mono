# Maka 对 Lion 的工程优化契约深挖

> Historical research snapshot (2026-08-30). Superseded by [the current proposal index](../README.md) on 2026-09-06. Old priorities and implementation claims below are not the active plan.

## 结论

本笔记是本轮“优化角度”的总图，基于当前工作树：Maka `3eee0bd18af4263ec30e9ccc75b8a6f7b8a9680e`，Lion `41ba83372ecce78c696cbc803626b0ed54df5fd9`。本轮先在两个仓库运行 `codegraph explore`，再回读被定位的源码、测试和架构文档；本文只产出研究结论，不授权实现。

Lion 已经拥有比较完整的运行基础：`AgentRuntime` 编排 Session/Context/Core，`SessionRecorder` 串行追加 JSONL，`ToolRuntime` 是唯一工具窄腰，Workspace Snapshot 支持恢复，`ExecutionAuditLog` 做结构化审计，`ResultStore` 限制大结果，Core 对并行工具做统一收口，质量脚本用 fingerprint 区分基线与新增问题。因此 Maka 的可借鉴点不是增加新的 Manager、Registry 或日志平台，而是把现有能力从“实现上存在”提升为“状态、边界和失败原因可证明”。

优先级建议如下：

1. **先把资源与消费边界说清楚**：对并发工具更新、流式事件和大结果分别定义数量/字符/时间上限，以及消费者退出后的生产者行为。
2. **再把多写者语义说清楚**：原子替换只证明不会读到半文件，不证明不会丢更新；只有存在真实多写者时才补 per-key 串行化或版本检查。
3. **补一个只读的运行诊断视图**：从 Session JSONL、Core 终态、审计和工具结果构造“已知事实/缺失事实/可信度”，不另造第二个历史真值。
4. **将验证边界做成可复现契约**：每个 workspace/临时资源/进程都明确 owner，失败批次不短路，验证输出能区分失败、取消、超时和环境阻塞。

## 1. 资源边界：从“有超时”到“每条流都能结束”

### Maka 证据

- `D:\harness agent\maka\scripts\run-workspace-tests-parallel.mjs:44-52,71-105` 将 serial workspace、全局 workspace timeout、并发上限和临时目录 owner 写成显式参数；每个 workspace 的 `TMPDIR/TMP/TEMP` 都指向自己的目录。
- 同文件 `:107-175` 用 `settled` latch 收敛 spawn error/close，取消和超时先请求停止，再终止进程；`finally` 无论同步 spawn 失败、子进程失败或终止失败都尝试清理临时目录。
- `D:\harness agent\maka\packages\runtime\src\async-queue.ts:20-43,61-128` 把“已入队”“消费者已完整处理”“消费者脱离”分成不同状态，并让 `pushAndWaitUntilConsumed()` 在队列关闭、出错或消费者脱离时 fail closed。
- `D:\harness agent\maka\packages\runtime\src\context-budget.ts:81-113,286-306` 将上下文裁剪定义为预算投影，并返回 before/after token 估计、保留/丢弃的 turn/event 计数，而不是静默截断。

### Lion 当前状态

- `D:\harness agent\Lion\lion_code\runtime\agent.py:383-447` 已有 operation 级 timeout，并将 `timeout`、`aborted`、`model_error` 投影为 `AgentRunResult`。
- `D:\harness agent\Lion\lion_code\tooling\builtin.py:63-72` 给 `run_shell` 提供显式命令 timeout；`D:\harness agent\Lion\lion_code\tooling\result_store.py:13-25,43-70` 对持久化大结果和模型预览有字符/字节边界。
- 但 `D:\harness agent\Lion\lion_code\core\loop.py:286-329` 的并行工具事件队列是默认无界 `asyncio.Queue`，`D:\harness agent\Lion\lion_code\core\loop.py:454-491` 的工具 update 队列也是无界，生产者只 `put_nowait`，没有消费确认或消费者脱离信号。
- Lion 已有工具 `concurrency_safe` 能力（`D:\harness agent\Lion\lion_code\tooling\types.py:17-28`），但它表达的是是否允许并行，不等于对更新速率、结果字节数或队列 residency 的预算。

### 可借鉴点与边界

可借鉴的是契约分层：命令执行的 timeout、Agent operation 的 timeout、流式更新的容量、模型上下文的预算各自归属不同 owner。不要把 Maka 的 `AsyncEventQueue` 直接复制到所有 Lion 队列，也不要因为测试脚本有并发上限就给所有工具强制串行；应先找出真实会产生无限增长或消费者提前退出的路径。

### 收益与风险

收益是高负载下内存占用和停机行为可预测，取消时不会留下持续生产者，诊断能解释“内容被裁掉多少”。风险是过早设置过小上限会截断合法的编译输出或工具进度；超时只取消 Python task 而不回收外部进程，还会造成“结果已返回、资源仍运行”的假完成。

### 建议

先以测试/观测证明增长点，再在现有 `ToolRuntime`/Core 队列边界补最小契约：至少记录 dropped/coalesced update、consumer detached、queue depth 和结果截断原因。外部进程继续复用现有 `CommandExecutionBackend` 的 timeout 与回收语义；不要新建通用 `ResourceManager`。

## 2. 写入边界：原子性不等于并发正确性

### Maka 证据

- `D:\harness agent\maka\packages\runtime\src\plugin-composition-loader.ts:70-72,149-207,784-790` 用一个 mutation tail 串行化所有组合树变更；`baseGeneration` 不匹配会拒绝过期写入。
- 同文件 `:317-389` 先 stage 新树、commit 新贡献，再发布索引，失败时清理 staged 资源并用 `AggregateError` 保留原失败与清理失败。
- `D:\harness agent\maka\packages\runtime\src\plugin-composition-loader.ts:825-845` 对 package、entry、children 做冻结和序列化，避免快照被调用方后续 mutation 偷改。

### Lion 当前状态

- `D:\harness agent\Lion\lion_code\session_runtime\recorder.py:23-45,65-77,123-146` 用实例级 `asyncio.Lock` 串行追加消息、配置和 compaction，并维护 context entry ids。
- `D:\harness agent\Lion\lion_code\core\session\storage.py:29-71` 通过换行、fsync 和追加前断尾清理保证单进程 JSONL 的可恢复性。
- `D:\harness agent\Lion\lion_code\supervisor.py:360-405` 的 `JsonCheckpointStore.save()` 使用临时文件、flush、fsync、`os.replace()`；但 `D:\harness agent\Lion\docs\architecture\checkpoint-recovery.md:59-62` 已明确记录同一 `goal_id` 多进程写入仍可能 lost update。

### 可借鉴点与边界

Maka 的重点不是“所有状态都要事务化”，而是为每类 mutable state 选择一个并发模型：同一内存对象用 tail/lock，同一快照用 generation/CAS，替换带资源副作用的树要先 stage 后 publish。Lion 的 SessionRecorder 已有正确的单实例锁，不应重复包一层；Checkpoint 是否补版本检查，必须以实际多进程 writer 证据为前提。

### 收益与风险

收益是避免并发配置变更、恢复或能力重载时的 silent lost update，并能在清理失败时保留原始根因。风险是无条件加文件锁会引入跨平台锁语义、死锁和清理复杂度；generation 检查若没有调用方处理策略，只会把静默覆盖变成频繁失败。

### 建议

保留现有 atomic write 与 Recorder lock；若 Supervisor 确实有多个 writer，再以 `goal_id` 为粒度增加期望版本检查，并在 `CheckpointError` 中暴露冲突类型。组合式资源的 stage/publish/cleanup 思路可用于未来 capability 热替换，但当前不应抽象新事务框架。

## 3. 终态与诊断：从返回值到可复核事实

### Maka 证据

- `D:\harness agent\maka\packages\core\src\execution-inspect.ts:39-55,125-159` 将 session/run/turn、parent/resume/retry lineage、status、failureClass、abortSource 固定在可校验的 inspection document 中，并要求 diagnostics 与同一 run identity 对齐。
- `D:\harness agent\maka\packages\runtime\src\runtime-event-read-model.ts:52-92` 为 read-model diagnostic 建立 code 与 hard/soft severity 映射；`incomplete_event`、`tool_use_id_mismatch` 等问题不会被当成正常历史。
- `D:\harness agent\maka\packages\runtime\src\runtime-read-model.ts:62-80` 的 session view 同时携带 source、messages、turns、events、runs、diagnostics、terminalFacts 和 replayPlan。

### Lion 当前状态

- `D:\harness agent\Lion\lion_code\runtime\session.py:27-35,95-114` 已将恢复结果做成不可变 `SessionRestoreState`；`D:\harness agent\Lion\lion_code\runtime\session.py:128-149` 在恢复前收敛待写任务并初始化 Recorder。
- `D:\harness agent\Lion\lion_code\runtime\agent.py:365-447` 返回一次 operation 的文本、tokens、wall time、stop reason 和 error，但该结果偏运行时返回，不是重启后的只读审计视图。
- `D:\harness agent\Lion\lion_code\tooling\audit.py:18-52,55-136` 已有固定执行事件 schema、sanitizer/fingerprint/authorization/snapshot 字段和脱敏序列化；Core/Session JSONL 与审计仍是分开的来源。

### 可借鉴点与边界

适合 Lion 的最小方向是“投影”，不是新增 durable ledger：读取已有 Session entries、Core 终态消息、审计行和工具详情，输出 source health、未配对 tool call、截断/脱敏计数与可信度。投影必须宁可返回 `incomplete`，不能从 UI 通知或最后一个字符串猜终态。

### 收益与风险

收益是用户能分辨“模型失败”“工具失败”“持久化不完整”“仅诊断缺失”，也便于重启后排查。风险是把诊断直接写回 Session 会污染 canonical history；把 secret、完整参数或大结果塞进诊断又会破坏 Lion 已有安全边界。

### 建议

优先设计一个只读、版本化的诊断返回结构，复用现有 `AgentRunResult`、`ExecutionEvent` 和 Session state；先覆盖 terminal status、tool call/response 配对、checkpoint/JSONL 读取错误和 sanitizer 命中。诊断字段默认只放稳定 code、counts、identity 和安全摘要。

## 4. 验证与开发体验：失败不能短路成假绿

### Maka 证据

- `D:\harness agent\maka\scripts\run-workspace-tests-parallel.mjs:183-210` 并行 worker 收集每个 workspace 的失败；`D:\harness agent\maka\scripts\run-workspace-tests-parallel.mjs:213-265` 即使 parallel batch 失败仍运行 serial batch，并合并两边错误。
- 同脚本 `:44-47` 记录 serial 列表必须有 measured、precisely stated reason；说明性能优化要以真实等待/并发证据为依据，不能永久保留“保险串行”。
- Maka 测试集中覆盖 `packages/runtime/src/__tests__/async-queue.test.ts`、`agent-run-inspect.test.ts`、`plugin-composition-loader.test.ts`、`context-budget.test.ts` 等边界，而非只测 happy path。

### Lion 当前状态

- `D:\harness agent\Lion\scripts\check_quality_baseline.py:70-89,182-211,232-240` 用 fingerprint、changed-line coverage 和基线计数区分已有问题与新增问题；`D:\harness agent\Lion\tests\test_quality_baseline.py:18-45` 已验证 Windows 路径与输出解析。
- Lion 工具测试普遍使用 `TemporaryDirectory`；例如 `D:\harness agent\Lion\tests\tooling\test_snapshot_runtime.py:59-160` 覆盖写工具、快照、回滚和审计联动，`D:\harness agent\Lion\tests\tooling\test_execution_audit.py:28-92` 覆盖稳定行结构与失败结果。
- 这些测试证明已有边界，但尚未证明并行 update 队列在消费者退出、多个 checkpoint writer 或诊断视图不完整时的行为。

### 建议

下一轮若要实现，只增加直接对应的 deterministic tests：消费者提前关闭、两个 writer 使用同一 version、JSONL 有半行、checkpoint 有合法但不完整字段、并行批次一边失败仍执行另一批次。验证报告必须把 scoped pass、baseline noise 和环境阻塞分开，避免把“失败更少”误当成“覆盖更多”。

## 总体适用边界

这些建议仅适合继续加固 Lion 已有 Runtime/Session/Tool 边界。它们不支持当前就引入完整 Scheduler、hosted execution、MCP、通用资源管理器或新的历史数据库；那些属于功能/架构扩张，需另行定义身份、权限、取消和恢复契约。本轮结论是研究输入，不是实现授权。

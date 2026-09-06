# Maka 对 Lion 的工程优化取证总图

> Historical research snapshot (2026-08-30). Superseded by [the current proposal index](../README.md) on 2026-09-06. Old priorities and implementation claims below are not the active plan.

## 结论摘要

本笔记基于 2026-08-30 两个当前工作树的源码、测试和文档。用户指定的 `D:\\harness agent\\maka coding agent` 在本机实际目录为 `D:\\harness agent\\maka`；该目录与 Lion 根目录都存在 `.codegraph`，因此先用 `codegraph explore` 定位，再回读必要的文档与源码。

Lion 当前并不是缺少基础架构：它已经有 `AgentRuntime` 的运行编排、`SessionRuntime` 的 append-only JSONL、`ToolRuntime` 的中间件窄腰、Workspace Snapshot/rollback、ExecutionAuditLog、严格的 Runtime 所有权边界、结构化 Core 事件以及 CI 质量基线。Maka 最值得借鉴的不是再造一套 Agent、Manager 或日志系统，而是把几个已经存在于 Lion 的边界继续做成可恢复、可诊断、可验证的工程契约。

按收益与侵入性排序，建议关注：

1. 给每次 Agent operation 建立明确的“运行身份—终态—来源健康”诊断视图，保持 Session JSONL 作为历史真值，不让 UI 或回调顺序成为真值。
2. 对有外部资源的工具执行采用“请求停止”和“终止已提交”两个阶段，并用幂等 latch 收敛 timeout、cancel、自然退出和清理失败之间的竞态。
3. 将原子写入、同文件串行化、临时空间生命周期和失败聚合，作为持久化与测试工具的局部契约，而不是泛化为全局事务系统。
4. 延续 Lion 已有的质量基线，补齐“哪些失败属于本次变化、哪些是基线噪声、哪些是环境阻塞”的可读报告；借鉴 Maka 的工作区级并行测试编排，但不盲目追求全量并行。

## 1. 证据范围与对照方法

### Maka 当前事实

- `ARCHITECTURE.md:22-48,65-84` 把 Runtime Host 定义为唯一执行权威，并明确区分 `AgentRun + RuntimeKernel`、Tool Runtime、Runtime Event Log、Session/Context/UI/Recovery projections 与 Eval 边界。
- `packages/runtime/src/agent-run.ts:263-324` 在构造时冻结输入快照，要求配置了 `AgentRunStore` 时必须同时有 `RuntimeEventStore`，`durability="required"` 时两者都不能缺失；同一处还保留父、恢复、重试和分支 lineage。
- `packages/runtime/src/runtime-event-read-model.ts:496-614` 把 terminal RuntimeEvent 折叠为 completed/failed/cancelled 的运行事实，并在无终态、重复终态、缺少 failure class 或 abort source 时返回诊断，而不是猜测状态。
- `packages/core/src/execution-inspect.ts:24-99` 定义带 `schemaVersion` 的 `AgentRunInspectDocument`，包含运行身份、事件计数/coverage、source health、工具调用配对、压缩检查点和诊断；`packages/runtime/src/execution-inspect.ts:59-98,220-278,314-380` 负责从有限读端口构造它。
- `packages/runtime/src/shell-run-manager.ts:141-168,245-249,1386-1453` 用 `CompletionLatch`、`PendingStop`、`TerminationLifecycle` 和 `pendingStops` 收敛多次 stop、abort、自然退出、终止提交和最终完成通知。
- `apps/desktop/src/main/project-root-controller.ts:52-63,120-165` 对同一偏好文件串行排队写入，先读取现状再用随机临时文件和 `rename` 原子替换，并让持久化失败不阻塞活动窗口。
- `scripts/run-workspace-tests-parallel.mjs:44-175,190-264` 为每个 workspace 建立临时目录命名空间，在 `finally` 清理；支持并行批次、显式串行批次、超时、取消、进程树终止，并在并行失败时仍执行串行批次，最后聚合错误。
- `package.json:33-44,52-72` 和 `CONTRIBUTING.md:44-75` 将构建、workspace 测试、lint、format、typecheck、knip 与 release 检查做成明确入口。

### Lion 当前事实

- `docs/architecture/boundaries.md:1-44` 和 `tests/architecture/_boundaries.py` 将 Core、Supervisor、Runtime、Provider、Composition、Application、TUI/Server 等依赖方向固化为架构测试；`AgentRuntime` 与 `ProviderController` 不互相持有，Composition Root 是唯一组装点。
- `lion_code/runtime/agent.py:93-120,148-184,220-319` 已把 Conversation、Session、Context、Identity、Execution、Usage 和 Budget 分开，并固定 observer 重建顺序；restore/new-session/compaction 通过 `SessionRuntime` 与 `ConversationRuntime` 协同完成。
- `lion_code/runtime/agent.py:383-447` 的 `AgentRuntime.run()` 返回 `AgentRunResult`，包含 `session_id`、`stop_reason`、轮次、耗时、token、成本和错误；但这是本次调用的公开结果，不是独立的可重建运行事实读模型。
- `lion_code/runtime/session.py:38-63,79-149,202-243` 负责 Session 身份、JSONL repository、Recorder 生命周期、flush 和后台配置写入；`new_session()` 明确保留旧 append-only 历史，`ensure_ready()` 会收敛后台 Entry 并恢复 Recorder 写入位置。
- `lion_code/core/session/storage.py:17-71` 的 `JsonlSessionStorage` 已使用追加、flush、`fsync`，并在读取/追加前丢弃崩溃留下的半行；这是可靠性基础，但它主要解决单文件尾部损坏，不提供跨进程写者协调。
- `lion_code/tooling/runtime.py:59-122,124-178` 让所有工具经过同一执行/中间件路径，异常转成 `ToolResult(is_error=True)` 后仍进入 post middleware；rollback 返回结构化详情并追加 `ExecutionAuditLog`。
- `docs/architecture/agent-loop.md:19-87` 已描述工具批次、预算闸门、取消传播、未完成 ToolCall 的合成结果，以及终态事件；`docs/architecture/checkpoint-recovery.md:3-14,50-62` 已区分 Supervisor checkpoint 与 Session transcript，并明确指出 Supervisor checkpoint 没有多进程写互斥。
- `.trellis/spec/backend/logging-guidelines.md:1-66` 明确 Lion 当前没有通用 Python logging pipeline，观测由 typed events、TerminalRenderer、notice callback 和 SessionRecorder 承担；`.trellis/spec/backend/tool-runtime-recovery.md:1-145` 明确禁止新增第二条工具执行路径、权限系统或 recovery manager。
- `pyproject.toml:27-34,51-120`、`.github/workflows/ci.yml:54-167` 和 `scripts/check_quality_baseline.py:13-377` 已有 Ruff、mypy、coverage、import-linter、复杂度/无用代码与机器可比基线；因此 Maka 的开发体验借鉴应落在报告/编排与局部门禁，而不是重新安装工具链。

## 2. 借鉴原则：复制契约，不复制体量

### 应借鉴

- 将“哪个对象是权威”写成可测试的边界：Maka 的 Runtime Event Log 是事实，read model 只是投影；Lion 已有 Core event 与 Session JSONL，适合沿用。
- 将竞态写成状态机：停止、取消、超时、自然结束、清理失败必须有明确的最终赢家，并且重复信号幂等。
- 将恢复能力拆成小的、可注入的读写端口：运行头信息、事件、诊断、coverage 可以按需读取，避免 UI 读取整个 transcript 或直接依赖运行对象。
- 将环境清理、失败聚合和可取消性放进测试/发布工具本身，调用方只获得稳定的结果与错误。

### 不应直接借鉴

- 不把 Maka 的 TypeScript `AgentRun`、`RuntimeEventStore`、`Runtime Host` 整体搬进 Lion；这会与 Lion 的 `AgentRuntime`、`SessionRuntime`、Supervisor 和四层 ownership 重叠。
- 不把 `ExecutionInspectDocument` 当新的 canonical history，也不把所有流式片段写进 Session JSONL；Lion 的 logging guideline 已明确 canonical session 与诊断通道不同。
- 不因为 Maka 有更大的 monorepo 测试调度器，就把 Lion 默认验证改成全量并行或全量门禁；Lion 当前任务约定是 targeted tests，CI 已有基线差分。
- 不用“有锁/有事务”这种泛化名词覆盖实际问题。每个提案都需要说明锁住什么、哪个写者共享它、崩溃后读者看到什么，以及失败是否会掩盖原始错误。

## 3. 建议路线图

| 优先级 | 方向 | Lion 最小切入点 | 成功标准 | 主要风险 |
|---|---|---|---|---|
| P1 | 运行事实与诊断 | 在现有 `AgentRuntime.run()`/Recorder 边界补充运行身份、终态和缺失配对的只读诊断；先不改历史格式 | 进程重启或异常后能区分 completed/failed/aborted/incomplete，且诊断不依赖 UI 回调顺序 | 引入第二真值、扩大 JSONL schema、把 prompt/tool payload 泄露到诊断 |
| P1 | 停止与资源生命周期 | 只对真实拥有子进程/外部句柄的工具引入每调用一次的幂等完成状态；保留 `ToolRuntime` 唯一路径 | cancel/timeout/自然退出只产生一次终态；清理失败不会覆盖主要错误 | 为没有第二个真实场景的辅助类过度抽象；Windows 进程树语义差异 |
| P1 | Supervisor checkpoint 写者 | 先做同一 `goal_id` 的 revision/写者策略和回归测试，再考虑文件锁 | 并发写不静默丢更新；损坏/旧版本有明确错误 | 伪造分布式一致性；把单进程问题扩大成数据库迁移 |
| P2 | 测试与开发体验 | 将 `scripts/` 中与交付链直接相关的检查按领域聚合，并为失败/取消/清理输出结构化摘要 | 一次运行能知道哪些套件执行、跳过、失败和环境阻塞 | 与当前质量基线重复；把 benchmark 环境失败误判成代码失败 |
| P2 | 文档契约同步 | 修正只在证据充分时更新；尤其核对 `.trellis/spec/backend/quality-guidelines.md` 与当前 `pyproject.toml`/CI 的差异 | 文档不再声称“没有 Ruff/mypy”等已过时事实 | 把研究笔记误当实现授权；顺带改动无关文档 |

## 4. 统一验收边界

任何后续实现都应先回答以下问题：

1. 真值是什么：Core message、Session JSONL、Supervisor checkpoint、工具 audit，还是一个纯展示 projection？
2. 运行是否可被重试/恢复：如果可以，怎样避免同一个外部副作用被执行两次？
3. 终态是否只有一个：多个回调、断线、取消、超时、进程退出同时到达时，哪个状态先被提交，后续信号如何变成 no-op？
4. 读模型是否有边界：是否有 schema version、item/byte 上限、诊断 code、来源 coverage 和敏感数据过滤？
5. 失败是否可区分：实现错误、Provider 错误、工具错误、持久化拒绝、清理失败、环境不可用不能被同一个 `Exception` 文本吞掉。
6. 测试是否证明可观察行为：优先测试恢复后的状态、Core event、ToolResult、checkpoint 文件和清理结果，不测试私有调用次数或实现细节。

## 5. 最终建议

最值得先做的是“运行事实诊断 + 终态竞态测试”的小闭环：它同时提升可靠性、可观测性和用户排障体验，且可以复用 Lion 已有 `AgentRunResult`、typed events、SessionRecorder 与 ExecutionAuditLog。只有这个闭环暴露出跨进程写者或真实子进程的具体缺口，才继续引入对应的 revision/锁或 termination latch。

Maka 的经验表明，架构成熟度不在于对象数量，而在于能否在重启、取消、并发、脏数据和部分失败后仍回答“发生了什么、哪些事实可信、下一步能否安全继续”。Lion 已有大部分边界，优化重点应是把这些边界变成可恢复的读模型和可重复执行的验证契约。

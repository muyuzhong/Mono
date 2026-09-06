# Maka → Lion 功能决策包（第二轮重新取证）

> Historical research snapshot (2026-08-30). Superseded by [the current proposal index](../README.md) on 2026-09-06. Old priorities and implementation claims below are not the active plan.

## 结论

本轮没有重复上一轮已经讨论过的 Browser、Computer Use、定时任务、`tool_search` 或客户端工具投影，而是从“用户如何接住 Agent 已经产生的工作”出发，筛出四个新的产品决策：

1. **P0，改造采用：Git 审查工作台。** Lion 已经有 Git 状态上下文、diff 文本渲染和空的 `WorkPanel`，最短路径是把只读工作区变更快照放进现有面板，而不是新增 Git Agent 或 Review Runtime。
2. **P0，改造采用：可打开产物工作台。** 先把 `ResultStore` 已持久化的大结果和明确文件路径变成可打开资源，不复制 Maka 的完整 Artifact 数据库、上传协议和多客户端协调层。
3. **P1，改造采用：Memory 审查收件箱。** Lion 已经有 `needs_review`、归档、校验和任务状态的领域能力，缺的是用户可见的审查入口；应直接投影现有 Memory 事实，不先做每日 LLM 总结。
4. **P2，有条件采用：外部会话单向导入。** 这是迁移与回流能力，但必须先定义“哪些历史能无损进入 Lion canonical JSONL”；首版应限定为一个已验证来源和一次性复制，不做双向同步或通用插件注册表。

这四项的共同原则是：**先把 Lion 已有的事实源变成可见、可操作的产品闭环，再考虑复制 Maka 为多客户端、大规模运行设计的基础设施。**

## 1. 取证范围与去重基线

- Maka checkout：`3eee0bd18af4263ec30e9ccc75b8a6f7b8a9680e`。
- Lion checkout：`41ba83372ecce78c696cbc803626b0ed54df5fd9`。
- 两边均先使用 `.codegraph` 的 `codegraph explore` 定位符号与调用路径，再回读命中的源码、测试和文档。
- 已检查 `agents/notes/` 全部既有标题与章节。上一轮功能笔记已经覆盖：可见 Browser、语义化 Computer Use、一次性定时续跑、能力发现与客户端工具；本轮第一阶段笔记则覆盖 Provider readiness、wire size/revision、Session admission、process owner、资源预算、原子持久化和终态诊断。下列结论不以换名方式重复这些主题。

## 2. 候选功能证据清单

先建立候选，再筛选。表中的“Lion 对应”是当前可复用能力或明确缺口，不是凭空推断的未来架构。

| # | 候选 | Maka 当前证据 | Lion 当前证据 | 初筛 |
|---|---|---|---|---|
| 1 | Git 审查工作台 | `apps/desktop/src/renderer/features/workbar/tools/review/session-review-panel.tsx::SessionReviewPanel` 在工具完成、窗口聚焦时刷新；`apps/desktop/src/main/git-review-main.ts::readGitReview` 读取 branch/tracked/untracked 快照；`apps/desktop/src/main/__tests__/git-review-main.test.ts` 覆盖读取边界 | `lion_code/capabilities/git_status/capability.py::GitStatusLayer` 只把分支与最多 3 个 dirty path 注入上下文；`desktop/src/renderer/src/toolPresentation.ts::pickResultFormat` 已能识别 diff；`WorkPanel` 仍为空壳 | **进入决策** |
| 2 | 可打开产物工作台 | `packages/core/src/artifacts.ts::ArtifactRecord` 定义 kind/source/status；`HostArtifactCoordinator` 提供 ingest/query/delete；Workbar artifacts UI 按类型预览；测试覆盖分块、重放和失败关闭 | `ResultStore.process` 已把大结果落为本地文件并返回 `persisted_path`；`ToolResult.details` 可携带结构化元数据；`ToolActivity` 仍把结果压成文本；`WorkPanel` 的“文件”页为空 | **进入决策** |
| 3 | Memory 审查收件箱 | `DailyReviewPanel` 展示会话、请求、token、成本与归档报告；`HostDailyReviewCoordinator` 聚合并生成日报；`InteractiveDailyReviewAuthorityWriter` 持久化配置和档案 | `MemoryStore.needs_review`、`archived_semantic`、`archived_tasks`、`validate_semantic` 已存在；`review_memory`/`manage_memory` 已暴露工具；`.trellis/spec/backend/memory-capability.md` 明确 90 天或路径失效后的 review 规则，但 Desktop 无入口 | **进入决策，但改造成审查而非日报** |
| 4 | 外部会话导入 | `ExternalSessionAdapter`、`ExternalSessionAdapterRegistry` 和 `HostExternalSessionCoordinator` 支持来源发现、分页、导入状态与一次性复制；Codex、Claude Code、OpenCode adapter 测试覆盖工具调用配对、截断、损坏记录和路径差异 | `SessionRepository` 只枚举 `~/.lion-code/sessions/*.jsonl`，`SessionRuntime.load/restore` 只恢复 Lion 自身状态；Desktop Sidebar 只有搜索、切换、重命名与新建 | **进入决策，优先级低于前三项** |
| 5 | Edit-and-resend 会话版本 | `createAppShellRevisionActions` 以 session copy 承载编辑后重发；`collapseSessionRevisions` 把物理版本折叠为逻辑会话；测试覆盖 preparing/committed 和前后版本导航 | Lion 的 `SessionState`/`JsonlSessionStorage` 是单 parent append-only 链；`SessionRepository` 没有 copy/revision API；subagent 不落盘会话 | 延后：价值明确，但先要 canonical fork/copy 契约 |
| 6 | Work Board | `packages/core/src/work-board.ts` 定义 inbox/project scope、状态、creator、provenance；`WorkBoardPanel` 支持创建、改名、移动、归档；协调会话还能建议条目 | Lion Memory 已有 project-scoped task、open/completed、next_action、refs、archive/reopen；再建 Work Board 会产生第二个任务真值源 | **拒绝复制**；若做 UI，应直接投影 Memory task |
| 7 | Plan 提案面板 | Maka `packages/core/src/plan.ts` 与 `HostPlanCoordinator` 有 pending/stale/approved 状态和多客户端协议；Desktop 有 plan panel | Lion 已有 `PlanRuntime`、计划工具以及 `PlanApprovalSurface` 的继续规划/执行/手动执行/清空上下文后执行四种选择 | 不作为新增功能；先补现有 UI 测试和状态可见性 |
| 8 | 权限中心与追加授权 | Maka `InteractionPermissionPrompt` 区分工具、追加路径/网络、sandbox escalation，并投影 risk；`additional-permissions.ts` 有 exact/subtree、read/write、数量与大小上限 | Lion `PermissionPolicy`、`PermissionMiddleware`、四种 PermissionMode 与 `ConfirmationSurface` 已存在；确认值只在会话内缓存，规则来自 `.claude/settings.json` | 延后：先改善当前确认文案，不引入持久授权中心 |
| 9 | 附件摄取与预览 | Maka 有 connection-bound ingest、审批 token、本地缩略图和持久 `AttachmentRef`；Story 覆盖图片、PDF、doc、code、other | Lion TUI `normalize_dropped_paths` 只是把拖入路径规范化为 prompt 文本；没有 durable attachment ref，Desktop composer 也没有附件状态 | 合并进“产物工作台”后续阶段，不单独立项 |
| 10 | 会话 bundle 导出/导入 | Maka `session-bundle-*` 覆盖 manifest、canonical tree、ustar、hydration 与安全策略 | Lion JSONL 会话可读但没有 bundle manifest、附件闭包或导出产品面 | 拒绝首版：在没有 typed artifact/attachment closure 前会导出不完整包 |

候选满足“至少 8 条”的取证要求；其中 1—4 是真正新增的决策点，5—10 用于说明边界和拒绝理由。

## 3. Maka/Lion 对照后的决策

### 3.1 P0：Git 审查工作台——改造采用

**用户价值**

Agent 完成修改后，用户最常见的问题不是“工具调用了什么”，而是“当前到底改了哪些文件、增加/删除多少行、具体差异是什么”。Lion 现在把 Git dirty 摘要提供给模型，却没有把相同事实稳定呈现给用户。把审查面板放进既有 `WorkPanel`，能直接缩短“完成工作 → 人工复核”的路径。

**Maka 与 Lion 的关键差异**

- Maka 已有独立只读读模型：快照包含 revision、文件统计、分页和截断状态，UI 将“无法读取”与“无变更”分开。
- Lion 的 `GitStatusLayer` 是上下文层，受 2 秒超时、忽略 untracked、最多展示 3 条路径的约束；它不是 UI 数据源，也不应被 UI 反向调用。
- Lion 已经有 diff 高亮代码和工作面板位置，因此不需要先造 Review Manager、事件总线或 Git 写操作层。

**最小边界**

只读、工作区本地、显式刷新或受控触发刷新；首版显示工作树相对 `HEAD` 的文件列表、增删统计与有界 diff。禁止 stage、commit、discard、checkout、apply patch。Git 读取失败必须呈现为错误，不能伪装成 clean。

**成本与风险**

- 成本：一个应用层只读端口、一个后端快照实现、WorkPanel 投影和 targeted tests。
- 风险：大 diff、二进制文件、untracked 文件、非 Git 工作区、Windows 子进程阻塞。应复用 `_git_output` 的 workspace-local 与 `DEVNULL` 约束，但 UI 快照不能受 `GitStatusLayer` 的 3 文件限制。

**可验证后续路径**

用小仓库 fixture 验证 modified/added/deleted/untracked/binary/rename；验证非 Git 和 Git 命令失败是错误态；验证 500+ 文件或大 diff 有明确截断标记；验证面板刷新不阻塞 Provider 发送。

### 3.2 P0：可打开产物工作台——改造采用

**用户价值**

Lion 已经会把大工具结果保存为文件，但用户仍需从文本提示中复制路径，再用另一个工具读取。把这些现有结果投影为“可打开资源”，可以让长报告、代码片段、日志和生成文件在 WorkPanel 中持续可见，同时避免对话被大文本淹没。

**Maka 与 Lion 的关键差异**

- Maka 的 Artifact 是 session-scoped durable entity，解决上传、跨连接、删除、分页、附件引用和多种预览。
- Lion 目前只有 `ToolResult(content, details)` 与全局 `ResultStore`；没有 session artifact identity、metadata repository 或资源删除权限。
- Lion 的产品缺口首先是“打开已有路径”，不是“建立完整 Artifact 平台”。

**最小边界**

第一阶段只认两类显式资源：`ResultStore` 产生且仍存在的 `persisted_path`，以及工具结果中经过 workspace 路径校验的文件。只读展示 text/markdown/diff；二进制只显示元数据和“在系统中打开”，不做上传、复制、删除、跨会话持久引用。

**成本与风险**

- 成本：标准化一个窄的 resource projection、IPC 读取上限、WorkPanel 文件视图和测试。
- 风险：任意路径读取、敏感文件泄漏、超大文件占用、结果文件被外部删除。必须让主进程/sidecar 重新校验路径和大小，Renderer 不接收任意文件系统能力。

**可验证后续路径**

验证大结果从 ToolActivity 一键打开；文件不存在时显示 stale 而非空白；超限文件只显示元数据；workspace 外路径默认不可读；断开重连后不伪造资源可用性。

### 3.3 P1：Memory 审查收件箱——改造采用

**用户价值**

Lion 的 Memory 已能识别过期或引用路径失效的条目，并把它们排除在 recall 之外，但用户只能让 Agent 调用 `review_memory` 才能看到。可见的审查收件箱能回答“哪些长期事实已过期、为什么被隔离、我应该验证还是归档”，使 Memory 从隐式内部机制变成可治理产品。

**Maka 与 Lion 的关键差异**

- Maka Daily Review 聚合会话活动、用量和模型输出，生成日报并存档。
- Lion 的真实差异化资产是 evidence-bearing semantic memory 和 task ledger；直接复制日报会增加一次新的 LLM 总结链，并可能与 Memory/Dream 的职责重叠。
- Lion 已有全部首版写操作：validate/archive/restore/complete/reopen；缺的是可见投影和明确原因文案。

**最小边界**

Desktop 首版只展示 `needs_review`、active tasks 和 archived 两类实体；每次操作调用既有 Memory Store 语义。验证必须要求新的 `evidence_type/evidence_ref`；危险的 purge 不放入首版。没有定时生成、每日模型调用、自动改写或统计仪表盘。

**成本与风险**

- 成本：应用层只读/命令端口、Desktop 列表与表单、现有 Memory tests 之上的 UI 契约测试。
- 风险：UI 绕过 ToolRuntime 确认边界、把 derived `needs_review` 写成持久状态、同时存在 Agent 和用户的并发更新。命令端口应直接调用现有 Store 语义或其窄应用门面，不能复制 SQL。

**可验证后续路径**

验证 90 天过期、路径缺失、无过期项、归档/恢复冲突、校验后重新进入 recall；验证 UI 与 `review_memory` 返回同一组 id；验证 pinned/purge 的确认边界未被绕过。

### 3.4 P2：外部会话单向导入——有条件采用

**用户价值**

允许用户把 Codex、Claude Code 或其他 Agent 的既有对话迁入 Lion，可以降低切换成本，也能让 Lion 的 Memory、计划和工具继续承接旧任务。它的价值主要在新用户迁移和多工具并用，而不是日常核心闭环，因此排在前三项之后。

**Maka 与 Lion 的关键差异**

- Maka 已经为多来源实现 adapter registry、来源目录、分页检索、导入状态、错误归因和 canonical message conversion。
- Lion 的 canonical JSONL entry 类型、tool call/result 表达、thinking 与 usage 记录并不等同于 Maka 的 `StoredMessage`；直接搬 adapter 会产生“看起来导入成功、实际丢失工具配对或终态”的假历史。
- Lion 的 `SessionRepository` 当前假定文件名就是安全 session id，且本地恢复还要重建 Provider/Capability 状态。

**最小边界**

首版只做一次性复制：列出一个来源的 root sessions，读取选中会话，转换为 Lion 可表达的 user/assistant/tool call/tool result/terminal state 子集，写入一个新 session。来源文件永不修改；重复导入产生独立副本；不做增量同步、双向链接或自动继续运行。

**成本与风险**

- 成本：来源读取器、明确的转换矩阵、导入事务/临时文件、Sidebar 入口和大量 fixture tests。
- 风险：外部格式漂移、秘密或绝对路径泄漏、半成品 session、悬空 tool call、错误终态。无法无损表达的记录必须被标为 snapshot cutoff 或阻止导入，不能静默删除。

**可验证后续路径**

先以固定版本 fixture 完成 one-source spike；验证所有输出均通过 Lion `SessionState.from_entries`；验证损坏中段失败、撕裂尾部规则明确、工具配对不丢、来源只读、失败不留下可见半会话。只有第二个真实来源出现后才提取共享 adapter 协议。

## 4. 明确拒绝或延后的方向

### 4.1 不复制独立 Work Board

Lion Memory task 已经拥有 title/objective/summary/next_action/refs、open/completed 和 archive/reopen。再复制 Maka Work Board 会形成第二套 task id、状态和归档规则。产品上若需要看板，应先做 Memory task 的 UI 投影；只有出现不能由当前 task schema 表达的两个以上真实流程，才讨论扩展领域模型。

### 4.2 不先做完整 Artifact 平台

Maka 的 Artifact 设施解决连接绑定上传、跨客户端一致性和附件闭包。Lion 当前没有这些需求证据；直接复制会一次引入 metadata store、writer lease、chunk protocol、delete authority 与 preview registry。首版只解决“已有结果打不开”这一已证实问题。

### 4.3 不先做每日 LLM 总结

日报很容易生成看似有价值、实际上不可验证的摘要，也会与 Memory/Dream 重叠。应先让用户治理已有 evidence-backed Memory；若之后有稳定的 review 行为与明确问题，再决定是否生成只读活动摘要。

### 4.4 不先做持久追加权限

Lion 已有四种 PermissionMode、显式 allow/deny/confirm 规则和会话内确认缓存。追加路径/网络权限会扩大安全真值面，且与现有 `.claude/settings.json` 规则可能冲突。当前更小的改进是让确认界面展示工具名、路径/命令、能力分类和确认有效期。

## 5. 优先级与建议路线

| 阶段 | 决策 | 依赖 | 退出条件 |
|---|---|---|---|
| A | Git 审查工作台 | 现有 Git 读取约束、WorkPanel、diff renderer | 用户能在不执行写操作的情况下复核完整有界变更快照 |
| B | 可打开产物工作台 | `ResultStore`、`ToolResult.details`、安全 IPC | 大结果和明确文件可一键打开，越界/超限/失效均有可解释状态 |
| C | Memory 审查收件箱 | 现有 Memory Store 与应用边界 | UI 与工具返回同一事实，validate/archive 不绕过已有契约 |
| D | 外部会话 one-source spike | canonical conversion matrix、导入事务 | 固定 fixture 无静默丢消息、无半会话、来源只读 |

顺序不是按 Maka 功能体量排列，而是按 Lion 当前已有事实源与最短用户闭环排列。A、B 几乎都在既有产品壳中；C 主要是把已实现能力变得可治理；D 才需要新的转换逻辑。

## 6. 反向审查

完成候选筛选后逐条反查：

- 删除了仅凭 Maka 文件名推断的“语音、分享、远程执行”等结论，因为本轮没有建立充分的 Lion 对应关系。
- 没有把 Browser、Computer Use、定时任务、工具发现重新包装为新建议；它们只作为既有去重基线。
- 没有把 Maka 的大规模 Runtime Host、多客户端协议或 writer authority 当作 Lion 必须复制的架构。
- “Work Board”因与 Lion Memory task 真值冲突而拒绝；“日报”被改造成已有 Memory 的审查入口；“Artifact”被压缩为可打开资源；“外部导入”被限制为一次性复制。
- 每个进入决策的命题都有 Maka 的具体符号/测试、Lion 的当前代码对应、最小边界和可观察成功信号；没有只写“增强体验”“提高可靠性”之类无法验证的结论。

## 7. 总体风险与验证原则

共同风险不是 UI 样式，而是新增第二真值源。四项建议都必须维持：Git 事实来自当前工作区、资源事实来自现有结果/文件、Memory 事实来自现有 Store、会话事实来自 canonical JSONL。任何 UI 本地缓存都只是投影，不得成为新的 durable authority。

验证应优先覆盖 observable contract：错误不伪装为空、截断有标记、路径越界失败、重复动作幂等或有明确副本语义、失败不留下半状态。只有这些边界成立后，才值得讨论更丰富的预览、日报生成、会话版本树或多来源注册表。

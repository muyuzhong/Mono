# Maka → Lion 工程优化决策包（重新取证版）

> Historical research snapshot (2026-08-30). Superseded by [the current proposal index](../README.md) on 2026-09-06. Old priorities and implementation claims below are not the active plan.

## 结论

本轮基于 Maka `3eee0bd18af4263ec30e9ccc75b8a6f7b8a9680e` 与 Lion `41ba83372ecce78c696cbc803626b0ed54df5fd9` 的当前工作树重新取证。既有笔记已经覆盖取消/进程生命周期、原子持久化、运行账本、背压、可观测性门禁、终态诊断、测试隔离，以及 Browser/Computer Use/定时任务/Tool discovery；本包不重复这些结论。

本轮真正新增且值得 Lion 决策的命题是：

1. **P1，改造：把 Provider 可运行性从一个布尔值提升为稳定的 readiness 原因投影。** 复用现有 `ProviderController`、`ServerStatusResponse` 与 `AgentRuntime`，不新增 Provider Manager 或模型目录。
2. **P1，改造：在现有严格 WebSocket 解码之上补消息大小上限；若将来支持跨重连流续接，再补 revision/cursor，而不是只依赖 Renderer generation。**
3. **P2，有条件采用：当 Lion 出现第二个客户端或长生命周期 Runtime Resource 时，引入 session admission + resource-key 串行化 + 幂等序号；当前单连接 WebSocket 不应提前增加通用队列层。**
4. **P3，拒绝/延后：不直接复制 Maka 的跨进程 process-lifetime owner。只有同一持久文件确实存在多个 Lion 进程写者、孤儿租约或崩溃恢复需求时，才重新立项。**

## 1. 候选证据清单（先取证，再筛选）

| 编号 | Maka 当前证据 | Lion 对应证据 | 初筛判断 |
| --- | --- | --- | --- |
| C1 | `D:\harness agent\maka\packages\runtime-host\src\server\session-admission-gate.ts:44-75,113-185`：按 Session 串行、按排序后的多 Session 组合 admission，lease 内子任务全部 settle 后才释放。 | `D:\harness agent\Lion\lion_code\server\bridge.py:175-209,246-285`：当前 bridge 只以 `_run_in_progress` 拒绝重入，未形成跨连接/资源的统一 admission。 | 值得决策，但只在并发面扩大时采用。 |
| C2 | `D:\harness agent\maka\packages\runtime-host\src\server\runtime-resource-coordinator.ts:226-249,418-490`：同一 `sessionId + ref` 的 stop/write/acquire 进入资源队列，控制器身份与资源绑定一起校验。 | `D:\harness agent\Lion\lion_code\server\bridge.py:309-332`：Lion 只有一个进程内 `WebsocketConnectionLease`，保护 Session 连接 owner，不保护未来的独立资源操作。 | 与 C1 合并为“资源并发边界”，不复制实现。 |
| C3 | `D:\harness agent\maka\packages\runtime-host\src\server\runtime-resource-coordinator.ts:505-563,703-710`：控制命令按 sequence 严格递进；相同 sequence + 相同 digest 返回 replay，不同输入返回 conflict；replay 有界。 | `D:\harness agent\Lion\desktop\src\renderer\src\lionRuntime.ts:306-321`：重连按 generation 丢弃过期加载结果并重新加载 canonical history，但没有请求级 idempotency/replay。 | 值得新增为协议契约，优先级低于当前安全/可用性修复。 |
| C4 | `D:\harness agent\maka\packages\runtime-host\src\protocol\runtime-resource.ts:70-100` 与 `...\runtime-resource-coordinator.ts:288-352`：分页带 sha256 revision，变化时返回 `revision_changed`，禁止用旧 cursor 继续读。 | `D:\harness agent\Lion\desktop\src\shared\chat.ts:80-99,162-187`：事件类型严格解码；`D:\harness agent\Lion\desktop\src\renderer\src\lionRuntime.ts:273-303`：断线后重连，但事件本身没有 revision/cursor。 | 形成“严格解码 + 大小上限”P1；revision 只在续接需求出现时加入。 |
| C5 | `D:\harness agent\maka\packages\runtime-host\src\server\runtime-resource-coordinator.ts:726-744` 与 `...\__tests__\runtime-resource-coordinator.test.ts:43-102,104-130`：wire snapshot 有字节上限，超限主动截断；测试同时验证稳定分页、旧 revision 与恶意大输出。 | `D:\harness agent\Lion\desktop\src\renderer\src\backend.ts:215-224`：收到文本后直接 `JSON.parse` 再解码；`...\shared\chat.ts:110-128,131-143` 只检查类型，不限制文本、数组或嵌套对象大小。 | Lion 有明确边界缺口，值得先补最小 cap。 |
| C6 | `D:\harness agent\maka\packages\core\src\connection-readiness.ts:20-42,56-79,101-157`：纯同步 readiness helper 固定失败顺序与原因；`...\task-submission-readiness.ts:27-75,109-133`：按 runtime/model/workspace/capability 维度聚合，并区分 repair/unavailable/unknown。 | `D:\harness agent\Lion\lion_code\runtime\provider.py:249-257` 只有 `api_configured: bool`；`D:\harness agent\Lion\lion_code\runtime\agent.py:337-355` 在运行入口才生成统一“API 未配置”文本。 | 当前最有收益的 P1；应投影原因，不复制 Maka 的多 Provider catalog。 |
| C7 | `D:\harness agent\maka\packages\storage\src\process-lifetime-owner.ts:36-65,81-115,118-143`：owner lease、恢复 claim、孤儿 owner 清理与 unlink-before-release。测试 `...\__tests__\process-lifetime-owner.test.ts:28-109` 覆盖 kill、竞争 claim、优雅关闭和 namespace 拒绝。 | `D:\harness agent\Lion\lion_code\server\bridge.py:309-332` 与 `D:\harness agent\Lion\tests\server\test_server_api.py:957-989` 只证明单进程连接 lease；未发现同一持久文件多进程 owner 的现行 Lion 需求。 | 明确记录为延后/拒绝，防止为假设并发引入锁系统。 |
| C8 | `D:\harness agent\maka\packages\runtime-host\src\__tests__\session-admission-gate.test.ts:24-90,92-148`：测试同一 Session 串行、不同 Session 并行、多 Session 无死锁、lease 子任务等待、错误重入拒绝。 | `D:\harness agent\Lion\tests\server\test_server_api.py:668-696,899-917`：测试第二连接被拒、prompt 重入被拒、关闭时 cancel/deny/unbind；覆盖的是单连接生命周期，不是多资源调度。 | 可转化为 Lion 的未来回归矩阵，不立即改代码。 |
| C9 | `D:\harness agent\maka\packages\core\src\__tests__\connection-readiness.test.ts:40-108,214-223` 与 `...\task-submission-readiness.test.ts:28-94`：模型能力、凭证未知、workspace unavailable 与 requested capability 均有纯判定测试。 | `D:\harness agent\Lion\tests\test_provider_controller.py:123-192`：Provider 替换先构建、成功后提交，失败保持旧状态；`D:\harness agent\Lion\desktop\tests\renderer\chatProtocol.test.ts:54-66`：未配置错误可见。 | Lion 已有事务更新基础，但缺少可操作 blocker taxonomy。 |
| C10 | `D:\harness agent\maka\packages\storage\src\process-lifetime-file-update-lock.ts:32-67,70-99,110-147` 与 `...\__tests__\file-update-lock.test.ts:28-74`：同一目标的进程内 gate、文件 lease、监督 marker 和被 kill 后恢复。 | `D:\harness agent\Lion\lion_code\config.py:19-40`：单次配置写入已用临时文件 + `os.replace`；`...\application\provider_settings.py:49-64` 直接读改写 known models。 | 不足以证明 Lion 需要跨进程 lease；先保持现有原子写。 |

## 2. Maka/Lion 对照后的决策

### 2.1 P1：Provider readiness 原因投影——改造

Maka 把“能否发送”定义为 Core 中唯一、纯、可复用的判定，并让 UI 得到稳定 reason；未知凭证不能误报为可修复失败。Lion 当前 `api_configured` 只回答是否有 key/base URL，模型字符串是否为空、Provider 是否可构造、工作区是否可用仍在更深的运行路径才暴露。Lion 已经有最合适的落点：`ProviderConfigurationProjection` 是只读投影，`ProviderController.configure` 已经保持先构建后提交，`AgentRuntime.chat` 负责 canonical error。

决策：**采用契约，改造现有 owner，不引入新 Registry/Manager。** 最小版本只定义 `ready / repair_required / unavailable / unknown` 与少量 blocker code，并由现有 `/status` 或发送前应用边界投影；不建立 Maka 那种 provider catalog，也不把一次旧探测结果当作当前真值。

- 收益：设置页、CLI、TUI 和 WebSocket 能给出同一修复方向；失败在发起 Provider 请求前可解释；测试不必依赖真实网络。
- 成本：需要约定原因枚举、状态响应字段和已有 `AgentRunResult`/事件的映射，补少量应用与协议测试。
- 风险：如果把 `api_configured`、模型目录和“最近成功过”混成一个字段，会重新制造假 readiness；凭证/原始 Provider 错误也不能进入普通状态投影。
- 验证路径：先为缺 key、空 model、Provider 构造失败、workspace 不可用、未知状态各写一个纯投影测试；再验证发送入口在非 ready 时不创建 Provider 请求，并保持现有“API 未配置”事件可见。

### 2.2 P1：WebSocket 消息大小与协议新鲜度——改造

Lion 已经在 Python `WireModel`、TypeScript `decodeServerEvent` 上采用严格 schema，这是可复用的安全基础；缺口是文本、thinking、tool args、tool result 和数组没有显式预算，Renderer 收到文本后直接 JSON 解析。Maka 的资源协议证明了两个可分开的契约：wire payload 必须有界；可分页/续读的 projection 必须带 revision，旧 cursor 要明确失败。

决策：**现在只采用 per-field/per-frame 上限与超限的 `protocol_error`；只有产品要求断线后继续当前流时才采用 revision/cursor。** 当前 generation + canonical history 足以防止旧 history load 覆盖新 Session，不应为了形式统一把每条聊天事件改成资源分页。

- 收益：降低恶意/异常 Provider 输出拖垮 Renderer 或内存的风险；协议错误可诊断而不是白屏；未来续接有明确 stale 语义。
- 成本：需要一套共享常量、服务端发送前检查、客户端解码前检查，以及边界测试；revision 续接还需要服务端 durable event identity。
- 风险：随意截断模型可见内容会破坏语义；应在边界拒绝或只对可安全截断的展示字段做摘要/省略。上限必须按 UTF-8 bytes 而不是 JS 字符数猜测。
- 验证路径：构造超长 text/args/tool result、深嵌套/超长数组与非文本 WebSocket frame；确认返回协议错误、连接收敛、canonical history 不被部分事件污染。若未来实现 resume，再测试旧 generation、旧 revision、重复 terminal event。

### 2.3 P2：Session admission 与资源级幂等——有条件采用

Maka 的 admission 不是单纯全局锁：同一 Session 串行，不同 Session 并行；跨多个 Session 时排序避免锁序死锁；lease 内 detached child work 也必须结束；Runtime Resource 再按 `session + ref` 串行，并用 controller identity/sequence/digest 处理重试。Lion 当前只允许一个 WebSocket owner，运行中 prompt 用状态判断拒绝，已经足以覆盖现状。

决策：**保留现状；把 Maka 的行为写成未来扩展的验收矩阵，不现在新增通用 admission/queue。** 触发条件是出现第二个独立客户端、PTY/后台任务等长生命周期资源，或同一资源的 stop/write/observe 发生真实竞态。届时应在 `application/session` 或已有 server 边界按 key 加最小 gate，不能绕过 `ToolRuntime` 或另建执行路径。

- 收益：避免重复 stop/write、旧客户端接管资源、并发 close 与自然终态互相覆盖。
- 成本：需要定义 resource identity、请求 sequence、retry digest、过期状态和客户端重试规则；并增加确定性并发测试。
- 风险：过早引入会把单连接场景复杂化，并可能把 Session 全局串行化，损失不同 Session 并行能力。
- 验证路径：先用现有 `SessionWebsocketBridge` 测试矩阵证明当前边界；只有出现第二 owner/资源后，再做同一 key 串行、不同 key 并行、重复相同请求 replay、相同序号不同输入 conflict、terminal 后拒绝写入五组测试。

### 2.4 P3：Process-lifetime owner——拒绝/延后

Maka 的 owner/marker 协议解决的是“进程被 kill 后，下一进程如何安全认领孤儿资源”，并且需要真实的跨进程文件共享、竞争 claim 和崩溃恢复测试。Lion 当前配置写入是原子替换，WebSocket lease 是单进程对象身份保护；这些证据不能推出 Lion 已有同类问题。

决策：**当前拒绝直接复制。** 若未来 sidecar、Runtime host 或独立后台执行器共同写同一 session/config/artifact，再以具体文件和 writer 清单重新设计；在此之前不增加 `.lease`、`.supervised`、全局 lock gate 或新的持久 ownership schema。

- 现在的收益：减少不必要的锁、清理和 Windows 文件语义风险，保持 `config.py` 的最小原子写入。
- 延后成本：若未来出现多进程写者，需要先做 writer inventory、kill/restart A-B 测试，再决定能否复用成熟 native lock。
- 主要风险：把单进程对象 lease 错当成崩溃恢复保证，或用删除 marker 的启发式判断仍存活进程，都会造成双写。
- 验证路径：未来需求出现时，先证明“同一 durable artifact 有两个独立 writer”且现有原子替换会 lost update/无法恢复；否则保持拒绝结论。

## 3. 新增范围与既有笔记去重

- 不重复既有“取消/超时/子进程清理”：本包只讨论资源 admission 的**触发条件、序号幂等与 protocol freshness**，不重新设计终止状态机。
- 不重复既有“原子持久化/快照边界”：本包只把跨进程 owner 作为**拒绝/延后决策**，不建议改写 Lion 的 `config.py` 或 `WorkspaceSnapshot`。
- 不重复既有“运行账本/终态诊断”：本包关注发送前 readiness blocker 与 wire 层 stale/oversize；不新增第二份 durable history。
- 不重复既有功能笔记：没有把 Browser、Computer Use、Scheduler、MCP 或 tool discovery 作为本轮优化交付物。

## 4. 反向审查

- 每条保留结论均有 Maka 路径、Lion 路径和符号/行号；抽象词若没有对应行为，已降为待触发条件或删除。
- 每个小命题只对应一个决策：资源并发、Provider readiness、wire bounds/revision、process owner；没有把同一结论改名拆分。
- 所有建议均保持 Lion 现有 `ProviderController`、`SessionWebsocketBridge`、`decodeServerEvent`、`ToolRuntime` 与原子写入边界；没有授权或暗示立即实现。
- 本轮产物只应是 Markdown；完成标记只更新 `todo.md` 的任务 1，任务 2 保持未完成。

## 5. 总体适用边界、成功信号与置信度

| 决策 | 最小适用边界 | 不能直接复制 Maka 的部分 | 成功信号 | 置信度 |
| --- | --- | --- | --- | --- |
| Provider readiness | 一次发送/建会话前的当前 Provider、模型、凭证和 workspace 状态 | 不复制多 Provider catalog，不把历史探测当真值 | 各入口 blocker 一致，unknown 不误报，未 ready 不发 Provider 请求 | 高 |
| WebSocket bounds/revision | frame/字段确实可能由异常或恶意输入推大；revision 只用于未来 resume projection | 不照搬 PTY buffer 截半，不把普通聊天强行改成分页流 | 超限得到 protocol error，合法事件不变，旧 revision 不混入新历史 | 高 |
| Admission/idempotency | 出现第二客户端或同一长生命周期资源的 stop/write/observe 竞争 | 不提前复制全局 gate，不让 queue 变成第二 Tool 执行路径 | 同 key 无重复副作用，不同 Session 并行，重复请求可判定 | 中高 |
| Process owner | 同一 durable artifact 存在多个独立进程 writer 且 kill/restart 可复现孤儿问题 | 不复制 `.lease`/`.supervised`/native lock 协议 | 先能复现双写/孤儿，再证明唯一 recovery claimant 与正常清理 | 高 |

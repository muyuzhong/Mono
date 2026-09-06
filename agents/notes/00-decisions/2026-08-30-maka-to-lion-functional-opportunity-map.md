# Maka 对 Lion 的功能借鉴总图

> Historical research snapshot (2026-08-30). Superseded by [the current proposal index](../README.md) on 2026-09-06. Old priorities and implementation claims below are not the active plan.

## 结论摘要

本笔记基于 2026-08-30 的当前工作树：Maka `3eee0bd18af4263ec30e9ccc75b8a6f7b8a9680e`，Lion `41ba83372ecce78c696cbc803626b0ed54df5fd9`。两个仓库均存在 `.codegraph`，本轮先用 `codegraph explore` 建立功能与调用链地图，再回读命中的源码、协议和架构文档。本文只提出功能机会，不授权修改实现。

Lion 已经是完整的本地 Coding Agent，而不是“缺功能的聊天壳”：桌面端能创建、恢复、搜索和重命名同工作区会话；运行中支持 steer、follow-up、cancel、compact；有 Plan 审批、工具确认、Skill、SubAgent、Memory、文件/Shell/Web Fetch 工具、Provider/Thinking/Egress 设置与 canonical history 重连。Maka 值得借鉴之处，是把这些基础能力继续组织成四类用户产品能力：

1. **可脱离当前聊天界面的工作流**：定时任务、后台/托管执行、原会话续跑与独立任务执行。
2. **可见且可撤销的交互式工具面**：内嵌浏览器的 observe→act，以及本地应用的 observe→semantic action→fresh observation。
3. **面向意图的执行模式**：会话创建时明确模型、thinking、permission、collaboration、orchestration 和工具画像，而不是让用户理解内部组件。
4. **可增长的能力目录**：Skill 搜索/加载、延迟工具搜索、MCP/客户端能力投影、进度与图片等富结果。

不建议一次性复制 Maka 的 Runtime Host、插件系统、MCP、Computer Use、Scheduler 和多种编排模式。Lion 最合理的吸收顺序是：先把已有能力做成用户看得懂的“当前会话能力摘要”和受预算约束的发现入口；再做一个受可见会话约束的 Browser Capability；然后用 Supervisor 完成最小的一次性/续跑自动化；最后才评估 Computer Use、独立 hosted execution 和远程客户端工具。

## 1. 证据范围与现状基线

### Maka 当前用户能力

- `packages/runtime-host/src/protocol/session-catalog.ts::SessionCreateInput` 把 workspace、model target、thinking、tool profile、permission、collaboration、orchestration 作为同一份会话创建契约；`SessionCatalogProjection` 把这些设置和 unread、blocked reason、live run state、parent/revision 信息一起投影给客户端。
- `apps/desktop/src/renderer/app-shell-chat-actions.ts`、`app-shell-session-settings-actions.ts::createAppShellSessionSettingsActions` 和 `app-shell.tsx` 将权限、模型、thinking、Agent/Plan 与 orchestration 选择接入真实桌面流程；切换 bypass 权限前有破坏性确认，运行/等待确认期间有禁用原因。
- `packages/core/src/scheduled-task.ts::ScheduledTask` 支持 once、interval、calendar、cron，效果包括本地/机器人通知、恢复原 Session、启动独立 Agent run；每次运行记录 ok/failed/blocked、message、sessionId/runId。
- `packages/runtime/src/scheduled-task-tools.ts::buildScheduledTaskTool` 让 Agent 能创建、列出、暂停、恢复和删除计划任务；`apps/desktop/src/renderer/platform/desktop/create-module-hub-services.ts` 同时给人类 UI 提供 create/update/enable/triggerNow/snooze/clear history/delete。
- `packages/runtime-host/src/server/scheduled-task-coordinator.ts::HostScheduledTaskCoordinator` 在恢复 pending fire 后才启动 scheduler；Agent 执行使用冻结的模型/权限/编排模板与 `durability: 'required'`，不是简单在内存里 `setTimeout`。
- `apps/desktop/src/main/browser/browser-tools.ts::buildBrowserTools` 提供 navigate、snapshot、click、type、wait、extract；`browser/session.ts::withBrowserPage` 和 `browser/logic.ts::browserActionAllowed` 要求目标会话可见，并在用户切走时撤销仍在执行的读取或操作。
- `packages/runtime/src/computer-use-tools.ts::buildComputerUseTools` 暴露单一 `maka_computer` 工具，用 observation id 和 element id 约束语义动作；stale frame、duplicate action、outcome unknown、用户介入和权限缺失都有明确恢复路径。
- `packages/runtime/src/tool-availability.ts` 以 `tool_search` 在 schema 字符预算内按意图激活延迟工具；`packages/runtime/src/skills-agent-tools.ts` 分开 Skill 搜索与指令加载；`packages/runtime/src/mcp-tools.ts::buildMcpTools` 投影 MCP 工具、传播取消/进度，并把文字、图片和 structured content 有界转换为模型结果。
- `packages/runtime-host/src/protocol/hosted-execution.ts` 与 client/server coordinator/runner 提供带 execution identity 的 start/cancel/settlement，明确区分 completed/failed/cancelled 与 indeterminate，并输出 usage/cost。

### Lion 当前用户能力

- `desktop/src/shared/chat.ts::ClientAction` 和 `lion_code/server/models.py::ClientAction` 已有 prompt、steer、follow_up、continue、compact、cancel、slash command、confirm response、plan approval response。
- `desktop/src/renderer/src/lionRuntime.ts::LionAssistantRuntime` 能创建/恢复/重命名 Session，断线后先载入 canonical history 再重连；`CodingSessionBackendAdapter` 支持新旧 Session 枚举与恢复。
- `desktop/src/renderer/src/components/DesktopSidebar.tsx`、`WorkspaceShell.tsx` 已提供同工作区会话搜索、切换、重命名和 Skill 入口；但流式运行时禁用会话切换，桌面服务仍围绕一个当前本地 sidecar。
- `.trellis/spec/backend/desktop-sidecar.md` 规定 Electron Main 只拥有一个当前 workspace 的 Python sidecar，loopback FastAPI 端点与 capability 仅在本地进程边界内使用；`lion_code/server/app.py` 只有当前 Session 的状态、消息、会话、Provider、Egress、Skill、Thinking 与 WebSocket API，没有 hosted execution 或 scheduler API。
- `lion_code/composition/profiles.py` 有 Minimal/Coding/Full 三种**产品组合**，Full 包含 Plan/SubAgent/Skill；它们不是桌面用户逐会话选择的执行模式。
- `lion_code/tooling/builtin.py::create_builtin_tools` 提供 read/write/edit/list/grep/run_shell/web_fetch；`lion_code/tooling/internal.py::create_tool_search_tool` 已能搜索并激活 deferred tools；`ToolRegistry` 已支持激活状态隔离。
- `lion_code/tooling/types.py::ToolResult` 当前以字符串 `content`、JSON details、activated_tools 为主；`ToolCallDTO.result` 也是字符串。Lion 还没有 Maka 那种原生图片/多内容块工具结果契约。
- `docs/advanced-capability-guide.md` 已明确 MCP/Browser 应进入 Capability + ToolSource + AsyncCloseable，Scheduler/Autonomous Execution 应进入 Supervisor，并要求所有工具继续经过 ToolRuntime、Output Sanitizer、Egress Guard 与权限窄腰。这使新增功能有清楚的本地落点。

## 2. 功能机会地图

| 机会 | Maka 已证明的用户价值 | Lion 可复用基础 | 推荐级别 | 不应跨越的边界 |
| --- | --- | --- | --- | --- |
| 能力目录与延迟激活 | 工具/Skill 多时仍可按意图发现，不把全部 schema 塞给模型 | `ToolRegistry.search/activate`、`tool_search`、Skill 列表、Capability SPI | P1 | 先改善排名、预算与 UI 解释，不先引入 MCP Manager |
| 会话能力摘要/预设 | 新建任务时用户能理解“能做什么、会不会确认、如何编排” | Full/Coding/Minimal、Permission、Plan、Thinking、Provider | P1 | 产品 Profile 与会话策略不可混为一谈；不承诺尚不存在的 swarm/graph |
| 内嵌 Browser | 网页任务从文本抓取升级为可见 observe→act，用户能看到 Agent 操作的页面 | ToolRuntime、Egress Guard、Confirmation、Desktop work panel | P1/P2 | 只允许当前可见会话；登录态读取也属于敏感操作；不能复用 `web_fetch` 的安全结论 |
| 最小定时续跑 | 用户可以“稍后继续/每天提醒/到时执行”，任务有历史和 blocked 状态 | Supervisor、Session restore、AgentRunResult、desktop notices | P2 | 首版只做 once + session_resume 或 local notify；不先上 cron、机器人投递、独立模型模板 |
| 语义化 Computer Use | 能操作真实桌面应用，并通过新观察验证结果 | Capability/ToolSource、Confirmation、typed events | P3 | OS 权限、secure fields、用户介入、焦点和 stale frame 必须 fail closed；不能先做坐标点击 MVP |
| Hosted/后台执行 | 任务不依赖当前 UI 连接，有 identity、取消、终态、usage | Session JSONL、Supervisor、桌面重连、运行诊断提案 | P3 | 先证明本地 detached run；不要把 loopback sidecar 直接包装成远程服务 |
| MCP/客户端能力 | 外部工具可动态接入，支持取消、进度、图像与 structured content | Capability SPI、ToolRegistry、Egress Guard | P3 | 先补富结果与网络权限契约；MCP annotation 不能当安全授权 |

## 3. 最值得先做的用户闭环

### 3.1 能力可见性：让“当前任务能做什么”变成产品信息

Lion 现在已经具备 ToolRegistry、deferred tool、Skill、Plan、SubAgent 和多种权限能力，但桌面主要把 Skill 映射为 slash command，把 permission mode 作为一行状态。用户仍需从提示词或失败中推断能力。

可以先增加只读的会话能力摘要设计（本文不授权实现）：

- 当前会话：Coding/Full 的可见名称，不暴露 Python 类名。
- 可直接使用：文件、Shell、Web Fetch、Memory、Skill、SubAgent、Plan。
- 按需发现：延迟工具数量与 `tool_search` 入口。
- 安全方式：permission mode、Egress allowlist、是否允许外部副作用。
- 当前限制：无 Browser、无 Computer Use、无后台调度、工具结果不支持原生图片。

收益是减少“系统到底能不能做”的来回询问，也为后续 Browser/MCP 提供稳定承载面。风险是 UI 读到的 projection 与真实 Registry 漂移，因此真值必须来自已组装的 Capability/ToolRegistry，而不是前端静态清单。

### 3.2 Browser 优先于 Computer Use

Maka 的 Browser 与 Computer Use 都采用 observe-before-act，但风险和实现难度不同。Browser 作用域可以限制在 Lion 自己创建的可见 WebView；Computer Use 涉及整个用户桌面、Accessibility/Screen Recording、焦点、全局指针和 secure field。

因此建议顺序为：

1. Browser 只支持显式打开的页面，首批动作限定 navigate/snapshot/click/type/wait/extract。
2. 用 visible lease 保证只有当前屏幕上的 Session 能读取或操作页面；切换会话立即撤销 in-flight action。
3. 结果先走字符串/结构化 details，等 Lion 有真实图片消费者后再扩展 ToolResult 富内容。
4. Browser 使用稳定后，再评估本地应用 Computer Use；首版也应只做 Accessibility 元素动作，不做坐标点击。

这符合 `docs/advanced-capability-guide.md` 的 Capability + AsyncCloseable 边界，也避免把 Browser 逻辑塞进 AgentRuntime 或 Desktop WebSocket bridge。

### 3.3 自动化优先做“续跑”，不是通用 Cron 平台

Maka 的完整 ScheduledTask 支持四类 schedule、四类 effect、桌面管理页、Agent 工具、pending fire 恢复、run history 与原生投递。Lion 若整体复制，会立即引入时区、睡眠唤醒、并发执行、模型配置冻结、凭据、通知、恢复和删除语义。

Lion 最小闭环应该只有：

- 一次性 `runAt`；
- `local_notify` 或恢复现有 Session 二选一；
- 明确状态 `scheduled/running/completed/failed/blocked/cancelled`；
- 一条 run record，关联 session id 与公开 stop reason；
- Desktop 能列出、取消、立即运行并查看最后结果。

任务调度归 Supervisor，执行仍调用现有 Session/Agent 公共端口。只有一次性续跑在真实使用中稳定，才加入 recurring、独立新 Session、机器人渠道和 frozen execution template。

### 3.4 独立执行与远程能力最后做

Maka Hosted Execution 的价值不是“多一个 API”，而是 execution identity、幂等 start、cancel-before-admission、唯一 settlement、usage/cost 完整性和 Host 生命周期共同组成的功能契约。Lion 当前桌面一个 sidecar、一个当前运行 Session，尚未形成 detached run 的 owner。

若未来需要后台/远程执行，应先在本机证明：关闭/切走 Renderer 后运行仍有 owner；重连能从 canonical history 和运行摘要恢复；取消不会重复执行副作用；completed/failed/cancelled 与 indeterminate 可区分。没有这些事实时，远程 API 只会放大当前生命周期的不确定性。

## 4. 适用边界

- Maka 的 macOS Computer Use、Electron BrowserView、Runtime Host 和 TypeScript 工具协议不能原样移植到 Python/Windows Lion；可借鉴的是用户契约和失败语义。
- Lion 的 Minimal/Coding/Full 是组合根的产品构型，Maka 的 permission/collaboration/orchestration 是逐会话策略；二者不能共用一个“profile”字段草率合并。
- Scheduler 属于 Supervisor，Browser/MCP/Computer Use 属于 Capability + ToolSource + AsyncCloseable；任何工具仍必须走 `ToolRuntime.execute()`，不得从 Desktop 或 MCP client 旁路。
- `web_fetch` 只证明受控 HTTP 文本读取，不证明带登录态浏览器安全；Browser 的 cookie、DOM、下载、弹窗和跨会话可见性要单独建模。
- Tool/MCP/Computer Use 的进度与图片不能直接塞进 Session transcript 或 `ToolResult.content` base64；要有界、可消毒，并区分给模型与给 UI 的投影。
- 自动化的“blocked”必须保留为一等状态；机器休眠、Host 未启动、Provider/凭据不可用不应被记成 Agent 业务失败。

## 5. 收益与风险

### 收益

- 从“用户盯着一段对话”升级为可恢复、可计划、可见的工作流。
- Browser/Computer Use 扩大到登录网页和本地应用，而不是只读文件、Shell 与公开 URL。
- 能力目录让新增 Skill/Tool 不再线性增加 prompt/schema 成本。
- 会话预设降低权限、Plan、Thinking、工具范围之间的认知负担。
- 自动化与 hosted run 为移动端/机器人/未来远程 Host 提供功能基础。

### 风险

- 功能面增长会同时扩大本地权限、网络出口、隐私、持久化和恢复范围。
- 把每种功能都变成新 Manager/Registry/Adapter 会破坏 Lion 已有的 Capability、ToolRuntime、Supervisor 与 Composition 边界。
- 过早支持 cron、MCP、图片、远程 Host 和 Computer Use 会产生多个半成品，用户看到入口却无法信任结果。
- 会话模式若只改 UI 文案、不改变真实 Registry/Permission/Plan 状态，会形成危险的“安全剧场”。
- 自动化若复用普通对话回调作为真值，应用重启后会丢运行或重复副作用。

## 6. 建议路线图与验收

### 阶段 A：发现与说明

- 设计当前会话能力摘要；来源必须是实际 Profile/Capability/Registry/Permission projection。
- 将 `tool_search` 从“子串命中全部并输出全部 schema”收敛为有上限、可解释的匹配；不改 ToolRuntime 路径。
- 验收：用户能在不试错的情况下知道现有能力和限制；模型不会因一次宽泛搜索激活过多工具。

### 阶段 B：可见 Browser

- 新建独立 Browser Capability，状态自有，Composition 接线，ToolRuntime 执行。
- 引入 visible lease、会话切换撤销、显式登录态风险、Egress/下载边界。
- 验收：后台会话无法读取或驱动页面；每次 mutate 后能 snapshot 验证；切换会话可确定取消。

### 阶段 C：一次性自动化

- Supervisor 拥有 schedule 与 run record；只做 once + notify/continue existing session。
- 验收：重启后不会丢失或重复 fire；blocked 与 failed 可区分；用户可取消、立即运行、查看最后结果。

### 阶段 D：扩展面

- 根据真实需求选择 recurring、独立 Agent run、Computer Use、MCP 或 hosted execution，逐项交付。
- 每项都先定义用户可观察终态、权限、取消、恢复、redaction、资源清理和 UI 入口，再讨论抽象。

## 最终建议

Lion 目前最缺的不是更多底层 Runtime，而是把已有 Runtime 能力整理成用户能理解、能发现、能离开当前窗口继续使用的产品功能。优先完成“能力摘要/预算化发现 → 可见 Browser → 一次性续跑”三个闭环。Computer Use、MCP 和 hosted execution 都有高价值，但只有在富结果、安全出口、运行身份和恢复语义成熟后才值得进入主线。

# 借鉴点：从已持久化工具结果开始的可打开产物工作台

## 单一命题

Lion 应先把现有 `ResultStore` 保存的大工具结果和经过校验的 workspace 文件投影成**可打开资源**，让用户从 ToolActivity 一键在 `WorkPanel` 阅读。首版不是 Artifact 平台，不引入上传、资源数据库、多客户端 writer lease 或附件闭包。

优先级：**P0**。判断：**改造采用**。置信度：**高**。

## Maka 证据

- `packages/core/src/artifacts.ts`
  - `ArtifactDescriptor/ArtifactRecord` 把 name、kind、mime、source、status、size 与 session-relative path 组成稳定实体。
  - `ArtifactTextReadResult`、`ArtifactBinaryReadResult`、save/delete failure reason 让 UI 能区分缺失、过大、类型不支持与持久化失败。
- `packages/runtime-host/src/server/artifact-coordinator.ts::HostArtifactCoordinator`
  - 提供 `artifact.ingest/query/delete`；上传 connection-bound，query 支持 text/binary/chunk/list，删除有来源约束。
  - `packages/runtime-host/src/__tests__/artifact-coordinator.test.ts` 覆盖精确重放、身份冲突、分块、有界读取、持久化失败请求 host drain。
- `apps/desktop/src/renderer/features/workbar/tools/artifacts/`
  - 将 Artifact 作为 Workbar 可见对象，而不是把所有内容塞回对话文本。
- `apps/desktop/src/main/attachment-preview.ts::loadApprovalPreview`
  - 路径不出主进程，只返回有大小上限的预览字节；预览失败为 soft failure，原附件仍可发送。

Maka 证明了“产物是会话资源，不等于一段工具文本”，同时也显示完整实现的成本很高。

## Lion 对应证据

- `lion_code/tooling/result_store.py::ResultStore.process`
  - 对声明 `persist_large` 且超过阈值的成功结果，先保存完整 UTF-8 文本，再返回有界预览。
  - `ToolResult.details` 已包含 `persisted_path`、`original_bytes`、`result_policy`。
- `lion_code/tooling/types.py::ToolResult`
  - 已有 `content` 与结构化 `details`，可以承载窄资源投影，无需改变工具执行的唯一 `ToolRuntime` 路径。
- `desktop/src/renderer/src/components/ToolActivity.tsx`
  - 当前把 result 统一压成 string/JSON，只提供复制，没有消费 `persisted_path` 的“打开”动作。
- `desktop/src/renderer/src/components/WorkPanel.tsx`
  - “文件”视图已经存在，但当前只有“还没有打开的文件”的占位文案。
- `lion_code/tui/file_drop.py::normalize_dropped_paths`
  - TUI 拖入文件只规范化为 prompt 路径；Lion 尚无 durable attachment identity，这进一步说明首版不应宣称完整 Artifact/Attachment。

## 最小边界

首版只认两种资源：

1. `ResultStore` 产生并在 `details.persisted_path` 中声明的文本结果。
2. 工具明确返回、且后端重新验证位于当前 workspace 的普通文件路径。

首版能力：

- ToolActivity 显示“在工作面板打开”。
- WorkPanel 只读展示 text、markdown、unified diff；显示名称、路径、大小和更新时间。
- 文件不存在、超限、编码失败、workspace 外路径分别返回明确状态。
- 所有文件读取都在主进程/sidecar 执行，有字节上限；Renderer 只接收内容或有界预览。

明确不做：文件编辑、删除、上传、跨会话收藏、Artifact DB、binary inline、PDF/DOCX 渲染、自动把每个工具结果注册成实体、通用 preview registry。

## 不能直接复制 Maka 的原因

1. Maka 的 Artifact 需要服务 Runtime Host、多客户端、Hosted Turn attachments 和 Deep Research；Lion 当前没有这些已证实场景。
2. Lion `ResultStore` 默认写到 `~/.lion-code/tool-results`，不是 session-scoped。若直接套用 Maka session artifact identity，会迫使一次性迁移存储所有权，超过“打开已有结果”的最小目标。
3. Maka 的 ingest/query/delete 协议解决远程和连接重放；Lion Desktop 与本地 sidecar 的首版可用更窄的只读 IPC 完成。
4. Lion 尚无 durable attachment ref。若把拖入路径或任意 tool `details` 直接当可信 Artifact，会扩大路径读取和秘密暴露面。

## 用户价值、成本与风险

- 用户价值：长日志、分析报告和生成文件不再只是一条会被截断的工具消息；用户可以持续查看、切换和复制。
- 成本：定义一个窄的 `OpenableResource` 投影、受限读取端口、WorkPanel 文件页和 targeted tests。
- 主要风险：任意路径读取、TOCTOU、敏感文件、超大内容、结果文件被清理后 UI 仍声称可用。
- 控制方式：后端每次打开重新 resolve/stat/read；默认 workspace 内，`ResultStore` 路径只能来自受信任结果元数据；严格字节上限与 stale 状态。

## 成功信号与验证路径

- 超阈值工具结果在 ToolActivity 出现可打开动作，WorkPanel 展示完整或明确分页后的内容。
- Renderer 传入任意 workspace 外路径不会获得文件内容。
- 资源被删除或替换后，重新打开显示 stale/changed，而不是保留伪造内容。
- 超大文件、二进制和非 UTF-8 文件不会导致 Renderer 卡死或 IPC 大包。
- 现有 `ResultStore` 截断策略、ToolRuntime、Output Sanitizer/Egress 边界不被绕开。
- 没有新增 Artifact Manager、Registry 或数据库表。

置信度为高：Lion 已经保存了完整结果并预留了 WorkPanel 文件视图，首版主要是安全投影和 UI 接线。

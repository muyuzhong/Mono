# Lion 提案清单

更新：2026-09-06。以下是当前筛选结论；只调整本目录文档，不删除功能实现或运行数据。
历史调研等级不代表当前待办，archive 中的“工作区已实现”也不代表已经提交或发布。

## 值得继续推进的三项

| 顺序 | 提案 | 当前决定与改进重点 |
| --- | --- | --- |
| 1 | [Memory 审查收件箱](01-priority/2026-08-30-maka-memory-review-inbox.md) | P1，下一项产品实施。补齐有界列表、跨项目隔离、错误语义；纠正“validate 成功必然退出 review”。 |
| 2 | [工具 update 队列预算](02-conditional/2026-08-30-maka-resource-budget-and-backpressure.md) | P2，先确定性复现积压。已有取消/停止接收逻辑保留，满队列不能静默丢失任意 update 或堵塞终态。 |
| 3 | [可见 Browser 工作台](02-conditional/2026-08-30-maka-visible-browser-workbench.md) | P2，真实任务触发。补网络出口、SPA 引用失效和副作用未知语义；先用无凭据测试站点完成闭环。 |

按用户“先完成工作量最小的任务”要求，已先完成只读 Session 诊断并归档。
剩余产品候选优先 Memory，原因是已有 Store 行为可以直接形成用户治理闭环。
若先复现工具队列导致明显资源耗尽，则将该具体回归修复提前；不因保留 P2 就立即启动建设。

## 已实现部分与交付边界

| 记录 | 状态 |
| --- | --- |
| [会话历史完整性与只读诊断](archive/2026-08-30-maka-terminal-facts-and-read-only-diagnostics.md) | 本轮工作区已实现 CLI 与应用查询，尚未提交；运行终态保持 unknown。 |
| [可打开产物工作台](archive/2026-08-30-maka-openable-artifact-workbench.md) | 既有交付记录保留。 |
| [Provider readiness 投影](archive/2026-08-30-maka-provider-readiness-reason-catalog.md) | 当前代码已有统一投影；不再计划细分 catalog。 |
| [WebSocket 大小边界](archive/2026-08-30-maka-wire-bounds-and-revision-freshness.md) | 上一轮工作区已实现，尚未提交；保留验证记录与单帧范围限制。 |
| [tool_search 发现预算](archive/2026-08-30-maka-tool-discovery-and-client-capabilities.md) | 上一轮工作区已实现，尚未提交；不自动延伸到 Skill/MCP 平台。 |

## 本轮删除

共删除 7 篇原提案文件。删除表示退出当前提案清单，不能据此推断相关技术永远没有价值。

| 被删除方向（原文件后缀） | 判断依据 | 重新考虑所需证据 |
| --- | --- | --- |
| 原子持久化与测试隔离（atomic-persistence-and-test-isolation） | 将既有原子写入、假设多写者和测试改造混在一起，没有单一可交付缺口。 | 同 goal 多写者的真实入口和可复现丢更新。 |
| 变更串行化与快照（mutation-serialization-and-snapshot-boundaries） | 与上一项重复；当前不值得为假设多写者增加锁/CAS，单独 revision 检查也不能保证跨进程原子性。 | 同上，并明确原子 compare-and-write 的实现边界。 |
| 进程生命周期（cancellation-process-lifecycle） | 以复杂状态机预防尚未复现的竞态，现有取消/清理行为应先复用。 | 残留进程、重复终态或主错误被清理错误覆盖的具体回归。 |
| 可观测性门禁（observability-quality-gates） | 现有门禁已存在；一般规范提醒与一个过时文档不应升级成平台提案。 | 一个实际消费报告的调用方及无法归因的具体失败。 |
| 定时续跑（scheduled-task-user-workflow） | 当前工作区/进程生命周期与触发承诺不匹配，崩溃后副作用去重成本高；本地提醒本身不足以证明新增调度系统值得。 | 明确重复发生的续跑需求、应用退出时语义和执行身份契约。 |
| 外部会话导入（external-session-import-bridge） | 没有指定来源、版本、迁移用户和样本，不能先为潜在迁移维护高成本转换器。 | 一个真实来源与用户任务，以及可验证的转换样本。 |
| 独立运行账本（durable-run-ledger-and-inspection） | 与只读诊断重复；现有来源无法支持原文的完整 run 承诺。 | 有价值的配对/缺失事实要求已合并到保留诊断，无需另一篇账本提案。 |

不再把 Skill 搜索、MCP/富结果、Provider catalog、普通事件 revision/cursor 作为默认后续任务。
它们只有在明确消费者和现有接口不足的证据出现后才重新提案。

## 历史取证资料

[00-decisions](00-decisions/) 的 5 篇调研总图与决策包保留为历史来源，已标明被本清单取代；
其旧优先级、旧 Lion 现状和旧建议不再是执行计划。原 archive 记录保持原样。

当前目录：1 篇 P1、2 篇 P2、5 篇实现记录、5 篇历史取证，另加本索引。

## 本轮验证范围

筛选阶段只改 Markdown，核对文件删除、链接与目录计数。
随后完成最小任务：Session 诊断相关测试 49 通过、1 跳过，相关架构测试 7 通过；
局部 Ruff、mypy 通过。符号链接用例因本机创建权限跳过。上一轮代码和既有暂存改动保留。

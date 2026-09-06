# Memory 审查收件箱

状态：P1，建议下一项实施。2026-09-06 重新核实并收敛范围；本文是提案，不表示功能已经实现。

## 为什么值得做

Memory 已经能隔离失效记忆、归档/恢复条目和管理任务，但用户缺少直接治理入口。
把现有事实变成桌面列表，可以让用户看见“为什么这条记忆未被使用”并作出处理，
收益比新增自动摘要或另建任务系统明确。

## 已核实的事实与需要纠正的判断

- [MemoryStore](../../../lion_code/capabilities/memory/store.py) 的 `needs_review` 默认最多返回 20 项；`recall_tasks` 默认最多 8 项；归档查询也有限额。不能把返回条数当总数，更不能据第一页为空或截断结果宣称整个库已审查完。
- `validate_semantic` 校验 evidence type 和非空 evidence ref，并更新验证时间；它不验证证据引用的真实性，也不修复 `paths`。
- `review_reasons` 每次重新检查时间和路径。因过期进入审查的条目可在补证据后退出；路径仍缺失的条目即使 validate 成功，也仍在审查中。原提案“validate 后退出 review、重新可 recall”的承诺过强。
- 语义记忆包括当前项目与跨项目 long-term；任务仅限当前项目。整数 id 不是授权，命令仍须经 Store 的可见性检查。
- archive 会清除 pinned；restore 不恢复 pinned。已有 active stable key 时 restore 明确冲突。
- [现有规格](../../../.trellis/spec/backend/memory-capability.md) 和 [MemoryCapability](../../../lion_code/capabilities/memory/capability.py) 是领域行为依据；Desktop 不复制 review 判定或直接访问 SQLite。

## 首版用户闭环

1. 从当前工作区打开 Memory，默认看到待审查列表及原因。
2. 选择一条，显示内容、scope、stable key、typed evidence、验证时间、路径和 pinned 状态。
3. 提供新的 evidence type/ref 后验证，或选择归档。提交成功后重新查询；若原因仍存在，显示“已记录验证，仍需审查”及剩余原因。
4. 归档页提供恢复；任务页可切换 open/completed 并执行 complete/reopen。

三个视图共用同一应用入口：待审查、任务、归档（semantic/task）。不用统计首页或每日 LLM 总结。

## 实施前补齐的契约

| 边界 | 建议约定 |
| --- | --- |
| 查询规模 | 默认沿用 Store 限额；请求多一项判定 `has_more`，不提供猜测的 total。超额时显式提示结果有限。若要求遍历全部归档，再在 Store 增加确定排序的分页查询，不在 UI 拉全库。 |
| 详情规模 | 列表摘要有界，详情按 id 获取完整领域内容；长内容使用有界详情策略，不把摘要作为更新输入。 |
| 工作区隔离 | ProjectIdentity 由宿主绑定，UI 不传任意数据库路径或 project key；其他项目 id 与不存在 id 对外使用相同不可用语义。 |
| 查询失败 | 区分空列表、加载失败、数据库不可用；不能把异常转换成“没有待审查项”。 |
| 命令失败 | 区分输入非法、目标不可用、生命周期冲突；提交失败保留表单证据文本，展示可操作原因，不回显原始 SQL 或数据库路径。 |
| 过期 UI | mutation 完成后重新查询；工作区切换后丢弃旧请求响应。首版只允许 Agent 空闲时治理，服务端在实际写入前检查；同一条目的重复提交在处理中禁用。 |
| 并发边界 | 空闲限制仅约束当前应用会话，不宣称多进程 CAS。首版不提供内容编辑或基于旧快照覆盖整条记录；真实多写者需求另行设计。 |
| pinned | 明示 archive 会取消固定、restore 不会重新固定；不提供 pin/unpin/purge，不改变现有确认规则。 |

“提供新证据”表示用户显式提交 evidence，不应谎称系统已运行测试、访问链接或验证来源。
首版不自动改 paths；缺失路径仍可解释，用户可归档，后续确有需求再设计显式修订入口。

## 验收

- 相同项目、时间、路径状态和 limit 下，Desktop 与 `review_memory` 返回相同 review ids/reasons。
- 只过期条目验证后退出 review；缺失路径条目验证后仍在 review，且不会进入 recall。
- 21 条待审查数据不能显示“共 20 条”；空库和查询失败可区分。
- stable key 冲突恢复不覆盖另一条 active entry；跨项目 id 不可读写。
- task complete/reopen 与 Agent 工具结果一致；归档 pinned 条目后恢复保持未固定。
- Agent 运行中命令被后端拒绝；工作区切换中的旧响应不能覆盖新列表。
- 通过相关 Store、Capability 和应用/UI 集成测试验收；不增加数据库表、模型调用或第二套状态。

## 历史借鉴来源

2026-08-30 Maka 的 `daily-review.ts`、`daily-review-panel.tsx` 提供“跨会话事实有可见入口”的启发；
日报生成及独立归档机制不进入本提案。本轮仅重新核实 Lion，未重新核实 Maka。

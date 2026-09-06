# 已有实现：Provider readiness 投影

2026-09-06 从待办移入实现记录。当前代码已有最小 readiness 投影，旧提案中更细分类不继续推进；
本记录不宣称原始四态/多原因方案已经完整实现。

## 当前契约

- [ProviderConfigurationProjection.readiness](../../../lion_code/runtime/provider.py) 返回 ready 与 blocker_code。
- 当前未配置原因是 `provider_configuration_required`，ready 时 blocker 为 null。
- [AgentRuntime.chat](../../../lion_code/runtime/agent.py) 在 readiness 不满足时生成 canonical 错误消息。
- [Desktop status 校验](../../../desktop/src/renderer/src/backend.ts) 校验布尔值和 blocker code 一致。

自由字符串模型与最近使用列表不构成权威模型市场。没有不同修复动作时，不再增加
missing key、unknown provider、model disabled 等整套原因目录。历史成功也不能当成当前网络连通证明。

需要新增原因时，先提供“当前提示无法引导修复”的具体案例，并明确配置事实来自哪个 owner，
再让各客户端消费同一投影。不得仅为枚举齐全而扩充状态。

# 可见 Browser 工作台

状态：P2，有价值但成本高；在出现一个具体浏览器任务后启动。2026-09-06 收敛设计。

## 用户价值与启动条件

Browser 能补充 `web_fetch` 无法完成的 JS 页面观察和交互。优先证明一个端到端任务：
在指定测试网站打开页面、观察可交互元素、填写非敏感表单、提交并验证可见结果。
不要在没有场景时一次建设浏览器、MCP 和通用客户端工具平台。

首个验收场景使用隔离、无凭据的测试站点；用户账号登录、持久登录态和跨站跳转
在安全矩阵明确之前不作为首版承诺。文本首版遇到纯视觉页面应明确不支持，不能猜坐标。

## 现有基础与边界

- [WorkPanel](../../../desktop/src/renderer/src/components/WorkPanel.tsx) 已承载 Git 审查和可打开产物；
  它不再是原文所说的空壳。新增 Browser 入口应共用工作区展示习惯，但独立定义浏览器资源所有权。
- [能力指南](../../../docs/advanced-capability-guide.md) 是 Capability/Composition 接线依据；
  所有模型动作继续经过 ToolRuntime。
- Desktop Main 拥有页面与连接；Capability 接收窄命令依赖，应用层转发，Renderer 仅呈现。
  不把 Browser 或 raw CDP 放进 AgentRuntime，也不向网页暴露 Lion preload/Node/宿主能力。

## 首版能力

navigate、snapshot、click、type、wait、extract 六个原子动作。
snapshot 返回当前页面状态绑定的元素引用；click/type 要求先观察。
extract 返回有界文本与继续读取位置，禁止 silent truncation；页面变化后旧读取位置失效。
wait 必须有固定上限并受取消影响。工具结果返回动作结果和观察依据，不将“点击命令成功”
当作表单提交成功。

## 必须改进的四个设计点

### 1. 可见性须在真实宿主核验

导航、观察、提取与修改都要求当前 session 对应的 Browser 页面可见。
宿主在执行前确认 session/page 身份；切换工作区或会话、关闭面板、销毁页面均撤销正在执行的动作。
“流式运行不能切换会话”不能替代这条契约，因为面板仍可关闭，连接也可能断开。

需要保留真实页面与动作 ownership，不新增通用 LeaseManager。仅在具体调用边界保存所需身份与取消状态。

### 2. URL 检查不等于完整网络出口控制

初始 URL 允许不代表重定向、iframe、脚本请求、WebSocket、下载和新窗口都允许。
必须在 Browser 宿主实际请求路径执行网络策略，并覆盖跳转后的目的地；仅给 navigate 套
现有 HTTP 工具的 allowlist 不足以宣称浏览器受 Egress Guard 保护。

首版允许哪些目标由用户场景明确决定；拒绝 file、自定义协议、下载/上传与新窗口。
若底层无法可靠覆盖这些边界，停在测试站点验证，不开放用户登录态。

### 3. 元素引用与文本分页必须有失效语义

引用至少绑定 session、page、document/snapshot 身份。导航与页面替换后明确 stale_ref；
显著 DOM 变化或元素歧义时要求重新 snapshot，不能静默退化成坐标或模糊 selector。
不得以 URL 未变断言 DOM 未变；SPA 同 URL 更新必须覆盖。

可见性撤销后，动作已提交但结果未知时返回 outcome_unknown，不自动重试 click/type/submit。
断开 CDP 连接不保证已经送出的网页副作用被撤销。

### 4. 单独定义页面安全与清理

使用隔离页面环境，拒绝网页弹窗权限请求与对宿主桥的访问；初版不共享其他 session 的 cookie。
明确新窗口、下载、页面崩溃、宿主关闭和取消时的处理。页面内容经过现有输出净化与预算边界；
不把 DOM 中的指令当成用户授权。

## 验收

- 隐藏 session 的 observe 在建立连接前被拒绝。
- 关闭面板/切换工作区撤销 in-flight 操作，页面和连接在 owner 退出后释放。
- 导航、SPA 更新、元素替换后的旧 ref 明确失败；不能误点同序号的新元素。
- 重定向及子资源访问受真实出口策略约束；网页不能调用 Lion bridge。
- 超限 snapshot/extract、等待超时、页面崩溃返回稳定错误，进程继续可用。
- 副作用已提交后断线返回未知，不自动再提交一次。
- 一项真实测试站点任务完整通过，且没有引入截图/base64、账号凭据、多标签页或后台隐藏操作。

## 历史参考

2026-08-30 Maka 的 `browser-tools.ts`、`browser/logic.ts`、`browser/session.ts`
提供可见性与 observe-before-act 启发。本轮未重新核实第三方代码，
不把“断开连接即可取消副作用”等推断当作已证明的保证。

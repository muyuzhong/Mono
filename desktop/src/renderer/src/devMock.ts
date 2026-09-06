/**
 * 纯浏览器预览 Mock 模块。
 * 仅在普通浏览器环境（window.lionDesktop 未定义）时生效，
 * 完全不侵入或影响生产态与真实 Electron 环境。
 */

import type { BackendEndpoint, BootstrapState, DesktopBridge } from "../../shared/types";
import type { ChatMessage, ServerEvent } from "../../shared/chat";

const MOCK_ENDPOINT: BackendEndpoint = {
  baseUrl: "http://mock-lion.local",
  capability: "mock-capability-token-123456789012345678",
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "你能帮我检查一下这个桌面客户端的 UI 布局，并且实时调整样式吗？",
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: "msg-2",
    role: "assistant",
    reasoning: "正在分析当前的 WorkspaceShell 和 ChatThread 结构，检查暗色模式和间距设置...",
    reasoningDuration: 1.2,
    content: "当然可以！我已经启用了纯浏览器预览模式。你可以通过浏览器 DevTools 或热重载（HMR）实时调整样式与组件，这里展示的是模拟的完整会话与工作区界面。",
    tools: [
      {
        id: "tool-1",
        toolName: "inspect_layout",
        args: { component: "WorkspaceShell", pane: "sidebar" },
        status: "completed",
        result: "已加载 CSS Token 与布局树：边栏 275px，工作面板 340px",
      },
      {
        id: "tool-2",
        toolName: "edit_file",
        args: {
          path: "desktop/src/renderer/src/styles/tokens.css",
          description: "引入深冷曜石级表面阶梯与科技蓝微光 Accent",
        },
        status: "completed",
        result: "成功更新 tokens.css，表面阶梯与发丝级边框已生效。\n+28 行，-6 行",
        openable: {
          path: "desktop/src/renderer/src/styles/tokens.css",
        },
      },
    ],
    createdAt: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: "msg-3",
    role: "user",
    content: "工作面板目前有实际内容吗？",
    createdAt: new Date(Date.now() - 90000).toISOString(),
  },
  {
    id: "msg-4",
    role: "assistant",
    content: "工作面板已接入本地 Git 实时状态树，支持检视变更、折叠文件差异与快捷刷新。",
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: "msg-5",
    role: "user",
    content: "D:\\harness agent 放到这个目录中",
    createdAt: new Date(Date.now() - 30000).toISOString(),
  },
  {
    id: "msg-6",
    role: "assistant",
    content: "移动完成，仓库已就位。最终位置：`D:\\harness agent\\deepseek-harness`\n验证结果：\n- 顶层 15 个目录完整 (`.git`、`apps`、`docs`、`vendor` 等都在)",
    createdAt: new Date(Date.now() - 10000).toISOString(),
  },
];

export function setupDevMockIfNeeded(): void {
  if (typeof window === "undefined" || window.lionDesktop) {
    return; // 原生 Electron 环境已注入真实 bridge，无需 Mock
  }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedPhase = (urlParams.get("phase") || "ready") as BootstrapState["phase"];

  let currentState: BootstrapState = {
    idle: { phase: "idle" as const },
    starting: { phase: "starting" as const, workspacePath: "D:/harness agent/Lion" },
    ready: { phase: "ready" as const, workspacePath: "D:/harness agent/Lion", endpoint: MOCK_ENDPOINT },
    failed: {
      phase: "failed" as const,
      workspacePath: "D:/harness agent/Lion",
      failure: {
        code: "spawn_failed" as const,
        message: "启动 Python sidecar 失败：Python 解释器未找到",
        stderrTail: "FileNotFoundError: [Errno 2] No such file or directory: 'python'",
      },
    },
    exited: {
      phase: "exited" as const,
      workspacePath: "D:/harness agent/Lion",
      failure: { code: "sidecar_exited" as const, message: "Python sidecar 进程异常退出 (exit code: 1)" },
    },
  }[requestedPhase] || { phase: "ready", workspacePath: "D:/harness agent/Lion", endpoint: MOCK_ENDPOINT };

  const listeners = new Set<(state: BootstrapState) => void>();

  function updateState(newState: BootstrapState) {
    currentState = newState;
    listeners.forEach((fn) => fn(newState));
  }

  const mockBridge: DesktopBridge = {
    async getBootstrapState() {
      return currentState;
    },
    onBootstrapStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async selectWorkspace() {
      return "D:/harness agent/Lion";
    },
    async getRecentWorkspaces() {
      return ["D:/harness agent/Lion", "D:/projects/frontend-app", "D:/code/my-agent-workspace"];
    },
    async connectWorkspace(path: string) {
      updateState({ phase: "starting", workspacePath: path });
      setTimeout(() => {
        updateState({ phase: "ready", workspacePath: path, endpoint: MOCK_ENDPOINT });
      }, 400);
    },
    async disconnect() {
      updateState({ phase: "idle" });
    },
  };

  window.lionDesktop = mockBridge;

  // 拦截 mock endpoint 的 fetch 请求
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("mock-lion.local") || url.startsWith("/api/")) {
      return handleMockRestRequest(url, init);
    }
    return originalFetch(input, init);
  };

  // Mock WebSocket
  const OriginalWebSocket = window.WebSocket;
  class MockWebSocket extends EventTarget {
    readyState = 1;
    url: string;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string, _protocols?: string | string[]) {
      super();
      this.url = url;
      setTimeout(() => {
        const ev = new Event("open");
        this.onopen?.(ev);
        this.dispatchEvent(ev);
      }, 50);
    }

    send(data: string) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.action === "prompt") {
          setTimeout(() => {
            this.emitServerEvent({
              type: "notice",
              text: `已接收 Prompt: "${parsed.prompt.slice(0, 20)}..."`,
              role: "info",
            });
          }, 300);
        }
      } catch {
        // ignore
      }
    }

    close() {
      this.readyState = 3;
      const ev = new CloseEvent("close");
      this.onclose?.(ev);
      this.dispatchEvent(ev);
    }

    private emitServerEvent(event: ServerEvent) {
      const msgEv = new MessageEvent("message", { data: JSON.stringify(event) });
      this.onmessage?.(msgEv);
      this.dispatchEvent(msgEv);
    }
  }

  // @ts-expect-error Mock WebSocket assignment
  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    const urlStr = String(url);
    if (urlStr.includes("mock-lion.local")) {
      return new MockWebSocket(urlStr, protocols);
    }
    return new OriginalWebSocket(url, protocols);
  };

  // 添加一个小浮动控制条（方便切换 idle / ready 等各种视图状态）
  if (typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", () => {
      createDevSwitcher(updateState, () => currentState.phase);
    });
  }
}

let mockEgressHosts = ["api.anthropic.com", "api.openai.com", "github.com"];

function handleMockRestRequest(url: string, init?: RequestInit): Response {
  if (url.endsWith("/api/messages")) {
    return jsonResponse(INITIAL_MESSAGES);
  }
  if (url.endsWith("/api/status")) {
    return jsonResponse({
      session_id: "mock-session-1",
      model: "claude-3-7-sonnet",
      provider_name: "anthropic",
      permission_mode: "default",
      api_configured: true,
      provider_blocker_code: null,
      cwd: "D:/harness agent/Lion",
      thinking_level: "medium",
      available_thinking_levels: ["off", "low", "medium", "high"],
      input_tokens: 1250,
      output_tokens: 680,
      cache_read_tokens: 18400,
      cache_write_tokens: 1200,
      cache_hit_rate: 94.2,
      is_running: false,
    });
  }
  if (url.endsWith("/api/sessions")) {
    return jsonResponse([
      {
        id: "mock-session-1",
        label: "优化桌面端 UI 与实时预览",
        startTime: new Date().toISOString(),
        messageCount: 2,
        cwd: "D:/harness agent/Lion",
      },
      {
        id: "mock-session-2",
        label: "重构 Python sidecar 启动通信",
        startTime: new Date(Date.now() - 3600000).toISOString(),
        messageCount: 8,
        cwd: "D:/harness agent/Lion",
      },
    ]);
  }
  if (url.endsWith("/api/models")) {
    return jsonResponse([
      { provider_name: "anthropic", model: "claude-3-7-sonnet" },
      { provider_name: "anthropic", model: "claude-3-5-sonnet" },
      { provider_name: "openai", model: "gpt-4o" },
    ]);
  }
  if (url.endsWith("/api/skills")) {
    return jsonResponse([
      { name: "browseros-neo", description: "真实专用浏览器代理驱动" },
      { name: "frontend-design", description: "专业前端高质量 UI 调整" },
    ]);
  }
  if (url.endsWith("/api/config/provider")) {
    if (init?.method === "POST") {
      return jsonResponse({ success: true });
    }
    return jsonResponse({
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      api_key: "sk-ant-mock-secret-key",
      base_url: "https://api.anthropic.com/v1",
    });
  }
  if (url.endsWith("/api/config/egress")) {
    if (init?.method === "POST") {
      try {
        const body = JSON.parse(init.body as string);
        if (Array.isArray(body.allow_hosts)) {
          mockEgressHosts = body.allow_hosts;
        }
        return jsonResponse({ success: true, allow_hosts: mockEgressHosts });
      } catch {
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ allow_hosts: mockEgressHosts });
  }
  if (url.endsWith("/api/git/review") || url.includes("/api/git/review?")) {
    return jsonResponse({
      state: "ok",
      branch: "feature/dark-mode-redesign",
      revision: "8f2a1b9",
      clean: false,
      truncated: false,
      files: [
        { path: "desktop/src/renderer/src/styles/tokens.css", status: "modified", additions: 28, deletions: 6, binary: false },
        { path: "desktop/src/renderer/src/components/WorkPanel.tsx", status: "modified", additions: 19, deletions: 3, binary: false },
        { path: "desktop/src/renderer/src/styles/shell.css", status: "modified", additions: 45, deletions: 12, binary: false },
        { path: "desktop/src/renderer/src/styles/transcript.css", status: "modified", additions: 32, deletions: 8, binary: false },
      ],
      additions_total: 124,
      deletions_total: 29,
    });
  }
  if (url.includes("/api/git/review/diff") || url.includes("/api/git/diff")) {
    const urlObj = new URL(url, "http://mock-lion.local");
    const targetPath = urlObj.searchParams.get("path") || "desktop/src/renderer/src/styles/tokens.css";

    let diffText = `@@ -10,14 +10,22 @@
 :root {
-  --ds-bg-primary: #18191c;
-  --ds-bg-secondary: #121316;
-  --ds-bg-tertiary: #202226;
+  /* 极简深冷曜石表面阶梯 (Surface Ladder) */
+  --ds-bg-primary: #0e0f12;
+  --ds-bg-secondary: #08090a;
+  --ds-bg-tertiary: #141518;
+  --ds-bg-elevated: #1a1b1f;
+  --ds-bg-inset: #050506;
+
+  /* 科技微光蓝 Accent 与高对比前景色 */
+  --ds-accent: #3b82f6;
+  --ds-accent-hover: #60a5fa;
+  --ds-text-primary: #f8fafc;
+  --ds-text-secondary: #94a3b8;
+  --ds-text-muted: #64748b;
 }`;

    if (targetPath.includes("WorkPanel.tsx")) {
      diffText = `@@ -34,8 +34,14 @@
       <div className="work-panel-body">
-        {view === "Git" ? <GitReviewTab /> : null}
+        {view === "Git" ? (
+          <GitReviewTab />
+        ) : view === "文件" && snapshot.openedResource ? (
+          <FileResourceTab />
+        ) : (
+          <WorkTabEmpty />
+        )}
       </div>`;
    } else if (targetPath.includes("shell.css")) {
      diffText = `@@ -83,6 +83,12 @@
 .work-panel {
   position: relative;
+  border-left: 1px solid var(--ds-border-subtle);
+  background: var(--ds-bg-primary);
+  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.25);
+  transition: width var(--motion-fast);
 }`;
    }

    return jsonResponse({
      path: targetPath,
      diff: diffText,
      binary: false,
      truncated: false,
      untracked: false,
    });
  }
  if (url.includes("/api/resources/open")) {
    const urlObj = new URL(url, "http://mock-lion.local");
    const targetPath = urlObj.searchParams.get("path") || "desktop/src/renderer/src/styles/tokens.css";
    const name = targetPath.split(/[\\/]/).pop() || "tokens.css";

    if (targetPath.endsWith(".md") || targetPath.endsWith(".markdown")) {
      return jsonResponse({
        status: "ready",
        path: targetPath,
        name: name,
        format: "markdown",
        size: 1420,
        modifiedAtNs: "1725619200000000000",
        content: `# 设计系统规范 (Design System Tokens)\n\n## 表面阶梯 (Surface Ladder)\nLion 桌面端遵循高精度硬件级暗黑质感设计规范：\n\n- **Primary Surface**: \`#0e0f12\` 纯净沉浸黑\n- **Secondary Surface**: \`#08090a\` 深邃底色\n- **Elevated Surface**: \`#1a1b1f\` 浮动面板与菜单\n- **Inset Surface**: \`#050506\` 代码块与凹槽\n\n## 科技蓝 Accent\n- 聚焦发光：\`0 0 0 1px var(--ds-accent)\`\n- 状态标识：无任何 Emoji，严格使用 Lucide 图标\n`,
        message: null,
      });
    }

    return jsonResponse({
      status: "ready",
      path: targetPath,
      name: name,
      format: "diff",
      size: 2180,
      modifiedAtNs: "1725619200000000000",
      content: `@@ -12,18 +12,28 @@
 :root {
   /* 基础几何与间距 */
   --radius-sm: 6px;
   --radius-md: 10px;
   --radius-lg: 14px;

-  /* 旧版扁平灰色 */
-  --ds-bg-primary: #1e1e1e;
-  --ds-bg-secondary: #252526;
-  --ds-border-default: #333333;
+  /* 现代硬件级深冷曜石表面阶梯 */
+  --ds-bg-primary: #0e0f12;
+  --ds-bg-secondary: #08090a;
+  --ds-bg-tertiary: #141518;
+  --ds-bg-elevated: #1a1b1f;
+  --ds-bg-inset: #050506;
+
+  /* 科技微光蓝 Accent */
+  --ds-accent: #3b82f6;
+  --ds-accent-hover: #60a5fa;
+  --ds-accent-subtle: rgba(59, 130, 246, 0.12);
+  --ds-focus: #3b82f6;
+
+  /* 高对比专业排版 */
+  --ds-text-primary: #f8fafc;
+  --ds-text-secondary: #94a3b8;
+  --ds-text-muted: #64748b;
+  --ds-border-subtle: rgba(255, 255, 255, 0.07);
+  --ds-border-default: rgba(255, 255, 255, 0.12);
 }`,
      message: null,
    });
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDevSwitcher(updateState: (s: BootstrapState) => void, getCurrentPhase: () => string) {
  const container = document.createElement("div");
  container.id = "lion-dev-switcher";
  Object.assign(container.style, {
    position: "fixed",
    bottom: "64px",
    right: "16px",
    zIndex: "999999",
    background: "rgba(14, 15, 18, 0.85)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "20px",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: "#94a3b8",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    opacity: "0.5",
    transition: "opacity 0.2s ease",
  });
  container.onmouseenter = () => { container.style.opacity = "1"; };
  container.onmouseleave = () => { container.style.opacity = "0.5"; };

  const title = document.createElement("span");
  title.textContent = "DEV";
  title.style.fontWeight = "700";
  title.style.fontSize = "10px";
  title.style.letterSpacing = "0.06em";
  title.style.color = "#64748b";
  container.appendChild(title);

  const phases = [
    { label: "主界面", phase: "ready" },
    { label: "引导页", phase: "idle" },
    { label: "启动中", phase: "starting" },
    { label: "失败页", phase: "failed" },
  ];

  phases.forEach(({ label, phase }) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      background: getCurrentPhase() === phase ? "#3b82f6" : "rgba(255,255,255,0.08)",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "3px 8px",
      cursor: "pointer",
      fontSize: "11px",
      transition: "background 0.15s ease",
    });
    btn.onclick = () => {
      if (phase === "idle") updateState({ phase: "idle" });
      else if (phase === "starting") updateState({ phase: "starting", workspacePath: "D:/harness agent/Lion" });
      else if (phase === "ready") updateState({ phase: "ready", workspacePath: "D:/harness agent/Lion", endpoint: MOCK_ENDPOINT });
      else if (phase === "failed") {
        updateState({
          phase: "failed",
          workspacePath: "D:/harness agent/Lion",
          failure: { code: "spawn_failed", message: "Mock: 模拟启动失败" },
        });
      }
      container.querySelectorAll("button.phase-btn").forEach((b) => {
        (b as HTMLElement).style.background = b === btn ? "#3b82f6" : "rgba(255,255,255,0.08)";
      });
    };
    btn.className = "phase-btn";
    container.appendChild(btn);
  });

  // 分隔竖线
  const sep = document.createElement("span");
  sep.style.width = "1px";
  sep.style.height = "14px";
  sep.style.background = "rgba(255,255,255,0.15)";
  sep.style.margin = "0 2px";
  container.appendChild(sep);

  // 工作面板控制快捷键
  const panelBtn = document.createElement("button");
  panelBtn.textContent = "切换工作面板";
  Object.assign(panelBtn.style, {
    background: "rgba(255,255,255,0.08)",
    color: "#93c5fd",
    border: "none",
    borderRadius: "4px",
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: "11px",
  });
  panelBtn.onclick = () => {
    const returnBtn = document.querySelector(".work-panel-return, .work-panel-collapse") as HTMLButtonElement | null;
    returnBtn?.click();
  };
  container.appendChild(panelBtn);

  // 设置页控制快捷键
  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "设置页";
  Object.assign(settingsBtn.style, {
    background: "rgba(255,255,255,0.08)",
    color: "#c084fc",
    border: "none",
    borderRadius: "4px",
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: "11px",
  });
  settingsBtn.onclick = () => {
    const btn = document.querySelector('button[aria-label="打开设置"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  };
  container.appendChild(settingsBtn);

  document.body.appendChild(container);
}

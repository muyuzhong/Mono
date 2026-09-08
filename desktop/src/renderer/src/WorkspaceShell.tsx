import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { BackendEndpoint } from "../../shared/types";
import { LionRuntimeProvider, useLionRuntime } from "./assistantRuntime";
import { browserBackendBootstrap } from "./backend";
import { ChatThread } from "./ChatThread";
import { DesktopSidebar } from "./components/DesktopSidebar";
import { SettingsPage } from "./components/SettingsPage";
import { WorkPanel } from "./components/WorkPanel";

type Theme = "light" | "dark";

export function WorkspaceShell({ endpoint, workspacePath }: { endpoint: BackendEndpoint; workspacePath: string }) {
  const bootstrap = useMemo(() => browserBackendBootstrap(endpoint), [endpoint.baseUrl, endpoint.capability]);
  return <LionRuntimeProvider bootstrap={bootstrap}><Workspace workspacePath={workspacePath} /></LionRuntimeProvider>;
}

function Workspace({ workspacePath }: { workspacePath: string }) {
  const { adapter, snapshot } = useLionRuntime();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workPanelOpen, setWorkPanelOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("panel");
      if (p === "false" || p === "0" || p === "closed") return false;
      if (p === "true" || p === "1" || p === "open") return true;
    }
    return true;
  });
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillPrompt, setSkillPrompt] = useState<{ key: number; text: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());
  const [sidebarWidth, setSidebarWidth] = useState(() => preferredPaneWidth("lion-sidebar-width", 275, 240, 520));
  const [workPanelWidth, setWorkPanelWidth] = useState(() => preferredPaneWidth("lion-work-panel-width", 360, 280, 640));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const firstRunShown = useRef(false);
  const workspaceName = workspacePath.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || workspacePath;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lion-theme", theme);
  }, [theme]);

  useEffect(() => localStorage.setItem("lion-sidebar-width", String(sidebarWidth)), [sidebarWidth]);
  useEffect(() => localStorage.setItem("lion-work-panel-width", String(workPanelWidth)), [workPanelWidth]);
  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      document.querySelectorAll("details[open]").forEach((details) => {
        if (
          (details.classList.contains("work-panel-context") ||
           details.classList.contains("composer-more") ||
           details.classList.contains("sidebar-notifications")) &&
          !details.contains(target)
        ) {
          details.removeAttribute("open");
        }
      });
    };
    window.addEventListener("pointerdown", handleOutsideClick);
    return () => window.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (snapshot.status?.api_configured === false && !firstRunShown.current) {
      firstRunShown.current = true;
      setSettingsOpen(true);
    }
  }, [snapshot.status?.api_configured]);
  useEffect(() => {
    if (snapshot.openedResource) setWorkPanelOpen(true);
  }, [snapshot.openedResource]);

  const createSession = () => void adapter.createSession();
  const startPaneResize = (pane: "sidebar" | "work-panel", event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const controller = new AbortController();
    document.documentElement.dataset.paneResizing = pane;
    const move = (moveEvent: PointerEvent) => {
      if (pane === "sidebar") {
        setSidebarWidth(clampPaneWidth(moveEvent.clientX, 240, Math.min(520, window.innerWidth - workPanelWidth - 360)));
      } else {
        setWorkPanelWidth(clampPaneWidth(window.innerWidth - moveEvent.clientX, 280, Math.min(640, window.innerWidth - sidebarWidth - 360)));
      }
    };
    const finish = () => {
      controller.abort();
      delete document.documentElement.dataset.paneResizing;
    };
    window.addEventListener("pointermove", move, { signal: controller.signal });
    window.addEventListener("pointerup", finish, { once: true, signal: controller.signal });
    window.addEventListener("blur", finish, { once: true, signal: controller.signal });
  };
  const workPanelConsumesWidth = workPanelOpen && viewportWidth > 980;
  const renderedSidebarWidth = clampPaneWidth(sidebarWidth, 240, Math.min(520, viewportWidth - (workPanelConsumesWidth ? 280 : 0) - 360));
  const renderedWorkPanelWidth = clampPaneWidth(workPanelWidth, 280, Math.min(640, viewportWidth - renderedSidebarWidth - 360));
  const shellStyle = {
    "--ds-sidebar-width": `${renderedSidebarWidth}px`,
    "--work-panel-width": `${renderedWorkPanelWidth}px`,
  } as CSSProperties;
  return (
    <div className={`workspace-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} style={shellStyle}>
      <a className="skip-link" href="#lion-thread">跳到对话</a>
      {!sidebarCollapsed ? <DesktopSidebar
        workspaceName={workspaceName}
        sessions={snapshot.sessions}
        activeSessionId={snapshot.status?.session_id}
        skills={snapshot.skills}
        isStreaming={snapshot.protocol.isStreaming}
        theme={theme}
        formatTime={formatRelativeTime}
        onCreateSession={() => { setSettingsOpen(false); createSession(); }}
        onSwitchSession={(sessionId) => { setSettingsOpen(false); void adapter.switchSession(sessionId); }}
        onRenameSession={(sessionId, label) => adapter.renameSession(sessionId, label)}
        onSelectSkill={(skillName) => setSkillPrompt({ key: Date.now(), text: `/${skillName} ` })}
        onOpenSettings={() => setSettingsOpen((open) => !open)}
        isSettingsOpen={settingsOpen}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onDisconnect={() => void window.lionDesktop.disconnect()}
        onCollapse={() => setSidebarCollapsed(true)}
        searchOpen={sessionSearchOpen}
        onSearchOpenChange={setSessionSearchOpen}
        onResizeStart={(event) => startPaneResize("sidebar", event)}
        onResizeBy={(delta) => setSidebarWidth((width) => clampPaneWidth(width + delta, 240, Math.min(520, window.innerWidth - workPanelWidth - 360)))}
      /> : null}
      <section className="workspace-main">
        {settingsOpen ? (
          <SettingsPage onClose={() => setSettingsOpen(false)} workspacePath={workspacePath} />
        ) : (
          <>
            <ChatThread
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(false)}
              onCreateSession={createSession}
              onOpenSearch={() => { setSidebarCollapsed(false); setSessionSearchOpen(true); }}
              onOpenSettings={() => setSettingsOpen(true)}
              skills={snapshot.skills}
              skillPrompt={skillPrompt}
            />
            {workPanelOpen ? <WorkPanel
              onClose={() => setWorkPanelOpen(false)}
              onResizeStart={(event) => startPaneResize("work-panel", event)}
              onResizeBy={(delta) => setWorkPanelWidth((width) => clampPaneWidth(width + delta, 280, Math.min(640, window.innerWidth - sidebarWidth - 360)))}
            /> : <button className="work-panel-return" type="button" aria-label="打开工作面板" onClick={() => setWorkPanelOpen(true)}><span>工作面板</span></button>}
          </>
        )}
      </section>
    </div>
  );
}

export const ProviderSettings = SettingsPage;

export function formatRelativeTime(value: string | null, now = Date.now()): string {
  if (!value) return "时间未知";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "时间未知";
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(timestamp);
}

function preferredTheme(): Theme {
  const stored = localStorage.getItem("lion-theme");
  return stored === "light" || stored === "dark" ? stored : "dark";
}

function preferredPaneWidth(key: string, fallback: number, minimum: number, maximum: number): number {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? clampPaneWidth(stored, minimum, maximum) : fallback;
}

function clampPaneWidth(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.min(Math.max(value, minimum), Math.max(minimum, maximum)));
}

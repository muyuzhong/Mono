import { GitCommitVertical, MessageSquare, MessageSquarePlus, PanelLeft, Search, ShieldCheck } from "lucide-react";

export function ConversationTopbar({
  title,
  transportStatus,
  transportLabel,
  sidebarCollapsed,
  activeView = "chat",
  toolCallCount = 0,
  onToggleSidebar,
  onCreateSession,
  onOpenSearch,
  onViewChange,
}: {
  title: string;
  transportStatus: string;
  transportLabel: string;
  sidebarCollapsed: boolean;
  activeView?: "chat" | "trajectory";
  toolCallCount?: number;
  onToggleSidebar: () => void;
  onCreateSession: () => void;
  onOpenSearch: () => void;
  onViewChange?: (view: "chat" | "trajectory") => void;
}) {
  const displayTitle = truncateTitle(title);
  return (
    <header className="conversation-topbar" role="toolbar" aria-label="会话工具栏">
      <div className="ct-left">
        {sidebarCollapsed ? (
          <button className="ct-icon-btn" type="button" aria-label="展开侧栏" onClick={onToggleSidebar}>
            <PanelLeft aria-hidden="true" size={16} />
          </button>
        ) : null}
        <strong title={title} className="ct-title">
          # {displayTitle}
        </strong>
        <span className="ct-mode-pill" title="沙箱隔离保护已开启">
          <ShieldCheck size={12} aria-hidden="true" />
          <span>标准模式</span>
        </span>
      </div>

      {onViewChange ? (
        <div className="ct-center" role="tablist" aria-label="视图模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "chat"}
            className={`ct-view-tab ${activeView === "chat" ? "active" : ""}`}
            onClick={() => onViewChange("chat")}
          >
            <MessageSquare size={13} aria-hidden="true" />
            <span>对话</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "trajectory"}
            className={`ct-view-tab ${activeView === "trajectory" ? "active" : ""}`}
            onClick={() => onViewChange("trajectory")}
          >
            <GitCommitVertical size={13} aria-hidden="true" />
            <span>轨迹</span>
            {toolCallCount > 0 ? <span className="ct-view-badge">{toolCallCount}</span> : null}
          </button>
        </div>
      ) : null}

      <div className="ct-actions">
        <span className={`transport-indicator ${transportStatus}`} aria-label={transportLabel} title={transportLabel}>
          <i aria-hidden="true" />
        </span>
        <button className="ct-icon-btn" type="button" aria-label="新建任务" onClick={onCreateSession}>
          <MessageSquarePlus aria-hidden="true" size={16} />
        </button>
        <button className="ct-icon-btn" type="button" aria-label="搜索会话" onClick={onOpenSearch}>
          <Search aria-hidden="true" size={16} />
        </button>
      </div>
    </header>
  );
}

function truncateTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length > 14 ? `${characters.slice(0, 14).join("")}…` : title;
}

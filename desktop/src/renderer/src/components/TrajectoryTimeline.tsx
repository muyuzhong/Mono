import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  FileCode,
  Filter,
  Layers,
  Search,
  Terminal,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatRunDuration, type ChatMessage, type ToolCallItem } from "../../../shared/chat";

interface TrajectoryTimelineProps {
  messages: ChatMessage[];
  metrics: { steps: number; llmMs: number; toolMs: number };
  inputTokens?: number;
  outputTokens?: number;
  cacheHitRate?: number;
}

interface TimelineEvent {
  id: string;
  roundIndex: number;
  role: "user" | "assistant" | "tool";
  timestamp?: string | null;
  tool?: ToolCallItem;
  content?: string;
  reasoning?: string;
}

export function TrajectoryTimeline({
  messages,
  metrics,
  inputTokens = 0,
  outputTokens = 0,
  cacheHitRate,
}: TrajectoryTimelineProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "tool" | "assistant" | "user">("all");
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const events = useMemo(() => {
    const list: TimelineEvent[] = [];
    let currentRound = 1;

    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const msg = messages[msgIdx];
      if (msg.role === "user") {
        list.push({
          id: msg.id,
          roundIndex: currentRound,
          role: "user",
          content: msg.content,
          timestamp: msg.createdAt,
        });
      } else {
        // If there are tool calls in this assistant turn, emit them first
        if (msg.tools && msg.tools.length > 0) {
          for (let toolIdx = 0; toolIdx < msg.tools.length; toolIdx++) {
            const tool = msg.tools[toolIdx];
            list.push({
              id: `${msg.id}-tool-${tool.id || toolIdx}`,
              roundIndex: currentRound,
              role: "tool",
              tool,
              timestamp: msg.createdAt,
            });
          }
        }
        if (msg.content || msg.reasoning) {
          list.push({
            id: `${msg.id}-response`,
            roundIndex: currentRound,
            role: "assistant",
            content: msg.content,
            reasoning: msg.reasoning,
            timestamp: msg.createdAt,
          });
        }
        currentRound++;
      }
    }
    return list;
  }, [messages]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterRole !== "all" && ev.role !== filterRole) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (ev.role === "tool" && ev.tool) {
        const nameMatch = ev.tool.toolName.toLowerCase().includes(q);
        const argsMatch = typeof ev.tool.args === "string"
          ? ev.tool.args.toLowerCase().includes(q)
          : JSON.stringify(ev.tool.args ?? {}).toLowerCase().includes(q);
        const resultMatch = (ev.tool.result ?? "").toLowerCase().includes(q);
        return nameMatch || argsMatch || resultMatch;
      }
      return (
        (ev.content ?? "").toLowerCase().includes(q) ||
        (ev.reasoning ?? "").toLowerCase().includes(q)
      );
    });
  }, [events, filterRole, searchQuery]);

  const totalTools = useMemo(
    () => messages.reduce((sum, m) => sum + (m.tools?.length ?? 0), 0),
    [messages]
  );

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="trajectory-shell" role="region" aria-label="轨迹时间线">
      {/* 顶部指标概览栏 */}
      <div className="trajectory-metrics-banner">
        <div className="trajectory-metric-card">
          <span className="metric-label">
            <Layers size={13} aria-hidden="true" />
            <span>执行轮次</span>
          </span>
          <span className="metric-value">
            {messages.filter((m) => m.role === "user").length || 1}{" "}
            <small>轮 · {events.length} 事件</small>
          </span>
        </div>

        <div className="trajectory-metric-card">
          <span className="metric-label">
            <Wrench size={13} aria-hidden="true" />
            <span>工具调用</span>
          </span>
          <span className="metric-value">
            {totalTools} <small>次已调度</small>
          </span>
        </div>

        <div className="trajectory-metric-card">
          <span className="metric-label">
            <Clock size={13} aria-hidden="true" />
            <span>运行用时</span>
          </span>
          <span className="metric-value">
            LLM {formatRunDuration(metrics.llmMs)}{" "}
            <small>· 工具 {formatRunDuration(metrics.toolMs)}</small>
          </span>
        </div>

        <div className="trajectory-metric-card">
          <span className="metric-label">
            <Cpu size={13} aria-hidden="true" />
            <span>Token 与缓存</span>
          </span>
          <span className="metric-value mono">
            {inputTokens} <small>入 · {outputTokens} 出{cacheHitRate !== undefined ? ` · 缓存 ${cacheHitRate}%` : ""}</small>
          </span>
        </div>
      </div>

      {/* 过滤与搜索工具栏 */}
      <div className="trajectory-toolbar">
        <div className="trajectory-filter-tabs" role="radiogroup" aria-label="类型过滤">
          <button
            type="button"
            className={`filter-btn ${filterRole === "all" ? "active" : ""}`}
            onClick={() => setFilterRole("all")}
          >
            全部 ({events.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterRole === "tool" ? "active" : ""}`}
            onClick={() => setFilterRole("tool")}
          >
            工具调用 ({totalTools})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterRole === "assistant" ? "active" : ""}`}
            onClick={() => setFilterRole("assistant")}
          >
            助手响应
          </button>
          <button
            type="button"
            className={`filter-btn ${filterRole === "user" ? "active" : ""}`}
            onClick={() => setFilterRole("user")}
          >
            用户指令
          </button>
        </div>

        <div className="trajectory-search-wrap">
          <Search size={14} aria-hidden="true" className="search-icon" />
          <input
            type="text"
            className="trajectory-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索轨迹事件、工具名或参数…"
          />
          {searchQuery ? (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* 结构化事件列表 */}
      <div className="trajectory-body">
        {filteredEvents.length === 0 ? (
          <div className="trajectory-empty">
            <Activity size={32} aria-hidden="true" />
            <h3>暂无匹配的轨迹事件</h3>
            <p>在下方输入框发送消息或执行任务后，工具执行与响应时序将在此完整呈现。</p>
          </div>
        ) : (
          <div className="trajectory-timeline-stream">
            {filteredEvents.map((ev, idx) => {
              if (ev.role === "user") {
                return (
                  <div key={ev.id} className="timeline-event event-user">
                    <div className="timeline-marker">
                      <span className="actor-badge user">
                        <User size={11} aria-hidden="true" />
                        <span>用户</span>
                      </span>
                      <span className="timeline-round">第 {ev.roundIndex} 轮</span>
                    </div>
                    <div className="event-card user-card">
                      <div className="event-content-text">{ev.content}</div>
                      {ev.timestamp ? <div className="event-timestamp">{ev.timestamp}</div> : null}
                    </div>
                  </div>
                );
              }

              if (ev.role === "tool" && ev.tool) {
                const isExpanded = expandedTools[ev.id] ?? false;
                const toolArgsStr =
                  typeof ev.tool.args === "string"
                    ? ev.tool.args
                    : JSON.stringify(ev.tool.args ?? {}, null, 2);

                return (
                  <div key={ev.id} className="timeline-event event-tool">
                    <div className="timeline-marker">
                      <span className="actor-badge tool">
                        <Terminal size={11} aria-hidden="true" />
                        <span>工具</span>
                      </span>
                      <span className="timeline-step-index">#{idx + 1}</span>
                    </div>
                    <div className={`event-card tool-card ${ev.tool.status}`}>
                      <div
                        className="tool-card-header"
                        onClick={() => toggleTool(ev.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                      >
                        <div className="tool-title-group">
                          {isExpanded ? (
                            <ChevronDown size={14} aria-hidden="true" />
                          ) : (
                            <ChevronRight size={14} aria-hidden="true" />
                          )}
                          <span className="tool-name mono">{ev.tool.toolName}</span>
                          <span className="tool-arg-preview mono">
                            {typeof ev.tool.args === "object"
                              ? Object.entries(ev.tool.args ?? {})
                                  .slice(0, 2)
                                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                                  .join(", ")
                              : String(ev.tool.args ?? "")}
                          </span>
                        </div>
                        <div className="tool-status-group">
                          {ev.tool.status === "completed" ? (
                            <span
                              className="status-mark success"
                              title="已完成"
                              aria-label="已完成"
                            >
                              <CheckCircle2 size={13} aria-hidden="true" />
                            </span>
                          ) : ev.tool.status === "error" ? (
                            <span
                              className="status-mark error"
                              title="执行失败"
                              aria-label="执行失败"
                            >
                              <XCircle size={13} aria-hidden="true" />
                            </span>
                          ) : (
                            <span
                              className="status-mark running"
                              title="运行中"
                              aria-label="运行中"
                            >
                              <span className="spinner-dot" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="tool-card-details">
                          <div className="detail-section">
                            <div className="detail-header">
                              <span>输入参数 (Arguments)</span>
                              <button
                                type="button"
                                className="icon-copy-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(toolArgsStr);
                                }}
                                title="复制参数"
                              >
                                <Copy size={12} aria-hidden="true" />
                              </button>
                            </div>
                            <pre className="detail-code mono">{toolArgsStr}</pre>
                          </div>

                          {ev.tool.result ? (
                            <div className="detail-section">
                              <div className="detail-header">
                                <span>执行结果 (Output)</span>
                                <button
                                  type="button"
                                  className="icon-copy-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyText(ev.tool!.result!);
                                  }}
                                  title="复制结果"
                                >
                                  <Copy size={12} aria-hidden="true" />
                                </button>
                              </div>
                              <pre className="detail-code mono">{ev.tool.result}</pre>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }

              // Assistant event
              return (
                <div key={ev.id} className="timeline-event event-assistant">
                  <div className="timeline-marker">
                    <span className="actor-badge assistant">
                      <Cpu size={11} aria-hidden="true" />
                      <span>助手</span>
                    </span>
                    <span className="timeline-round">响应</span>
                  </div>
                  <div className="event-card assistant-card">
                    {ev.reasoning ? (
                      <div className="assistant-reasoning">
                        <span className="reasoning-tag">Thinking · 思考过程</span>
                        <div className="reasoning-text">{ev.reasoning}</div>
                      </div>
                    ) : null}
                    {ev.content ? (
                      <div className="event-content-text">{ev.content}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

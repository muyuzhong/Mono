import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "../../../shared/chat";

export interface ConversationRound {
  index: number;
  userMessageId: string;
  userPrompt: string;
  assistantSummary: string;
}

export function extractConversationRounds(messages: ChatMessage[]): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let currentRound: ConversationRound | null = null;
  let roundIndex = 1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (currentRound) {
        rounds.push(currentRound);
      }
      currentRound = {
        index: roundIndex++,
        userMessageId: msg.id,
        userPrompt: msg.content.trim() || "用户输入",
        assistantSummary: "",
      };
    } else if (msg.role === "assistant" && currentRound) {
      let summary = msg.content?.trim() || "";
      if (!summary && msg.tools && msg.tools.length > 0) {
        summary = `调用工具：${msg.tools.map((t) => t.toolName).join("、")}`;
      } else if (!summary && msg.reasoning) {
        summary = msg.reasoning.trim();
      }
      currentRound.assistantSummary = summary;
    }
  }

  if (currentRound) {
    rounds.push(currentRound);
  }

  return rounds;
}

export function ConversationLocator({ messages }: { messages: ChatMessage[] }) {
  const rounds = useMemo(() => extractConversationRounds(messages), [messages]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [hoveredRoundId, setHoveredRoundId] = useState<string | null>(null);

  // 初始化与监听视口滚动，实时同步当前可见轮次
  useEffect(() => {
    if (rounds.length === 0) return;
    if (!activeRoundId && rounds[0]) {
      setActiveRoundId(rounds[0].userMessageId);
    }

    const viewport = document.querySelector<HTMLElement>(".thread-viewport");
    if (!viewport) return;

    const handleScroll = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const threshold = viewportRect.top + 160;

      let current = rounds[0]?.userMessageId ?? null;
      for (const round of rounds) {
        const el = document.querySelector<HTMLElement>(`[data-message-id="${round.userMessageId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= threshold) {
            current = round.userMessageId;
          }
        }
      }
      setActiveRoundId(current);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [rounds, activeRoundId]);

  if (rounds.length === 0) {
    return null;
  }

  const handleScrollToRound = (userMessageId: string) => {
    setActiveRoundId(userMessageId);
    const target = document.querySelector<HTMLElement>(`[data-message-id="${userMessageId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside
      className="conversation-locator"
      role="navigation"
      aria-label="对话轮次定位"
    >
      <div className="locator-track">
        {rounds.map((round) => {
          const isActive = activeRoundId === round.userMessageId;
          const isHovered = hoveredRoundId === round.userMessageId;

          return (
            <div
              key={round.userMessageId}
              className={`locator-item ${isActive ? "active" : ""}`}
              onMouseEnter={() => setHoveredRoundId(round.userMessageId)}
              onMouseLeave={() => setHoveredRoundId(null)}
              onPointerEnter={() => setHoveredRoundId(round.userMessageId)}
              onPointerLeave={() => setHoveredRoundId(null)}
              onFocus={() => setHoveredRoundId(round.userMessageId)}
              onBlur={() => setHoveredRoundId(null)}
            >
              <button
                type="button"
                className="locator-tick-btn"
                aria-label={`第 ${round.index} 轮对话：${round.userPrompt}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => handleScrollToRound(round.userMessageId)}
              >
                <span className="locator-tick-bar" />
              </button>

              {isHovered ? (
                <div
                  className="locator-preview-card"
                  role="tooltip"
                  aria-hidden="false"
                  onClick={() => handleScrollToRound(round.userMessageId)}
                >
                  <div className="locator-card-title">{round.userPrompt}</div>
                  {round.assistantSummary ? (
                    <div className="locator-card-summary">{round.assistantSummary}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

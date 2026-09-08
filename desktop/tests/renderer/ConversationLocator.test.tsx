// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../src/shared/chat";
import {
  ConversationLocator,
  extractConversationRounds,
} from "../../src/renderer/src/components/ConversationLocator";

describe("ConversationLocator component", () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: "msg-1",
      role: "user",
      content: "第一轮用户问题",
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "第一轮助手回复文本",
    },
    {
      id: "msg-3",
      role: "user",
      content: "第二轮用户指令",
    },
    {
      id: "msg-4",
      role: "assistant",
      content: "第二轮助手处理完成",
    },
    {
      id: "msg-5",
      role: "user",
      content: "D:\\harness agent 放到这个目录中",
    },
    {
      id: "msg-6",
      role: "assistant",
      content: "移动完成，仓库已就位。最终位置：D:\\harness agent\\deepseek-harness",
    },
  ];

  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("extractConversationRounds properly groups user and assistant turns", () => {
    const rounds = extractConversationRounds(sampleMessages);
    expect(rounds).toHaveLength(3);
    expect(rounds[0].index).toBe(1);
    expect(rounds[0].userPrompt).toBe("第一轮用户问题");
    expect(rounds[0].assistantSummary).toBe("第一轮助手回复文本");
    expect(rounds[2].index).toBe(3);
    expect(rounds[2].userPrompt).toBe("D:\\harness agent 放到这个目录中");
    expect(rounds[2].assistantSummary).toContain("移动完成");
  });

  it("renders 3 navigation ticks for 3 conversation rounds", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<ConversationLocator messages={sampleMessages} />);
    });

    const locator = container.querySelector(".conversation-locator");
    expect(locator).not.toBeNull();

    const tickButtons = container.querySelectorAll(".locator-tick-btn");
    expect(tickButtons).toHaveLength(3);
    expect(tickButtons[0].getAttribute("aria-label")).toContain("第 1 轮对话");
    expect(tickButtons[2].getAttribute("aria-label")).toContain("第 3 轮对话");
  });

  it("shows preview popover card on hover and hides on mouse leave", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<ConversationLocator messages={sampleMessages} />);
    });

    const items = container.querySelectorAll(".locator-item");
    expect(items).toHaveLength(3);

    const tickButtons = container.querySelectorAll<HTMLButtonElement>(".locator-tick-btn");

    // Initial state: no preview cards
    expect(container.querySelector(".locator-preview-card")).toBeNull();

    // Focus or hover over the 3rd tick item
    await act(async () => {
      tickButtons[2].focus();
    });

    const card = container.querySelector(".locator-preview-card");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".locator-card-title")?.textContent).toBe("D:\\harness agent 放到这个目录中");
    expect(card?.querySelector(".locator-card-summary")?.textContent).toContain("移动完成");

    // Blur / leave
    await act(async () => {
      tickButtons[2].blur();
    });

    expect(container.querySelector(".locator-preview-card")).toBeNull();
  });

  it("triggers scrollIntoView when clicking a tick", async () => {
    const targetMsg = document.createElement("div");
    targetMsg.setAttribute("data-message-id", "msg-5");
    const scrollIntoViewMock = vi.fn();
    targetMsg.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(targetMsg);

    root = createRoot(container);
    await act(async () => {
      root.render(<ConversationLocator messages={sampleMessages} />);
    });

    const tickButtons = container.querySelectorAll<HTMLButtonElement>(".locator-tick-btn");
    await act(async () => {
      tickButtons[2].click();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});

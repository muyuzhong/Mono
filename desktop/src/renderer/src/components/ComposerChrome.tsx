import { ComposerPrimitive, unstable_useComposerInput, unstable_useSlashCommandAdapter } from "@assistant-ui/react";
import { ArrowUp, BookOpen, Check, ChevronDown, CornerDownRight, Cpu, Ellipsis, Settings2, Shield, Sliders, Sparkles, Square, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLionRuntime } from "../assistantRuntime";
import type { SkillSummary } from "../backend";

const THINKING_DESCRIPTIONS: Record<string, string> = {
  off: "直接响应 · 极速回复",
  low: "轻度思考 · 快速推理",
  medium: "标准思考 · 推荐默认",
  high: "深度推理 · 复杂逻辑",
};

export function ComposerChrome({ isStreaming, queuedText, queueCount, hasSteering, runtimeNotice, metrics, model, permissionMode, thinkingLevel, skills, onQueuedTextChange, onSteer, onFollowUp, onContinue, onCompact, onOpenSettings }: {
  isStreaming: boolean;
  queuedText: string;
  queueCount: number;
  hasSteering: boolean;
  runtimeNotice: string | null;
  metrics: { steps: number; llm: string; tools: string };
  model: string;
  permissionMode: string;
  thinkingLevel: string;
  skills: SkillSummary[];
  onQueuedTextChange: (value: string) => void;
  onSteer: () => void;
  onFollowUp: () => void;
  onContinue: () => void;
  onCompact: () => void;
  onOpenSettings: () => void;
}) {
  const { adapter, snapshot } = useLionRuntime();
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const thinkingMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelMenuOpen && !thinkingMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setModelMenuOpen(false);
      }
      if (thinkingMenuOpen && thinkingMenuRef.current && !thinkingMenuRef.current.contains(target)) {
        setThinkingMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [modelMenuOpen, thinkingMenuOpen]);

  const availableModels = snapshot.models.length > 0
    ? snapshot.models
    : [
        { provider_name: "anthropic", model: "claude-3-7-sonnet" },
        { provider_name: "anthropic", model: "claude-3-5-sonnet" },
        { provider_name: "openai", model: "gpt-4o" },
      ];

  const availableThinkingLevels = snapshot.status?.available_thinking_levels ?? ["off", "low", "medium", "high"];

  const selectModel = async (choice: { provider_name: string; model: string }) => {
    const provider = choice.provider_name === "openai" ? "openai" : "anthropic";
    await adapter.configureProvider({ provider, model: choice.model });
    setModelMenuOpen(false);
  };

  const selectThinking = async (level: string) => {
    await adapter.setThinkingLevel(level);
    setThinkingMenuOpen(false);
  };

  const composer = unstable_useComposerInput();
  const slash = unstable_useSlashCommandAdapter({
    commands: skills.map((skill) => ({
      id: skill.name,
      label: `/${skill.name}`,
      description: skill.description ?? "项目技能",
      execute: () => composer.setText(`/${skill.name} `),
    })),
    removeOnExecute: true,
  });
  const cacheHitRate = snapshot.status?.cache_hit_rate !== undefined
    ? snapshot.status.cache_hit_rate
    : snapshot.status?.cache_read_tokens && snapshot.status?.input_tokens
      ? Math.round((snapshot.status.cache_read_tokens / (snapshot.status.input_tokens + snapshot.status.cache_read_tokens)) * 1000) / 10
      : 0;

  return (
    <>
      {runtimeNotice ? <p className="runtime-notice" role="status">{runtimeNotice}</p> : null}
      {queueCount > 0 ? <p className="queue-count">已排队 {queueCount} 项 <span>{hasSteering ? "包含立即转向" : "将在当前任务后继续"}</span></p> : null}
      {isStreaming ? <div className="run-metrics" aria-label="当前运行统计"><span>已处理 {metrics.steps} 个步骤</span><span>LLM {metrics.llm}</span><span>工具 {metrics.tools}</span></div> : null}
      {isStreaming ? (
        <div className="queue-controls">
          <input aria-label="追加运行指令" value={queuedText} onChange={(event) => onQueuedTextChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onFollowUp(); } }} placeholder="追加指令" />
          <button type="button" onClick={onSteer}><CornerDownRight aria-hidden="true" size={14} />立即转向</button>
          <button type="button" onClick={onFollowUp}><ArrowUp aria-hidden="true" size={14} />排队</button>
        </div>
      ) : null}
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Unstable_TriggerPopover char="/" adapter={slash.adapter} className="composer-skill-menu" aria-label="技能列表">
          <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
          <ComposerPrimitive.Unstable_TriggerPopoverItems>
            {(items) => <><div className="composer-skill-heading"><Sparkles aria-hidden="true" size={14} /><span>Skills</span><small>{items.length}</small></div>{items.map((item, index) => <ComposerPrimitive.Unstable_TriggerPopoverItem key={item.id} item={item} index={index} className="composer-skill-item"><strong>{item.label}</strong><small>{item.description}</small></ComposerPrimitive.Unstable_TriggerPopoverItem>)}</>}
          </ComposerPrimitive.Unstable_TriggerPopoverItems>
        </ComposerPrimitive.Unstable_TriggerPopover>
        <ComposerPrimitive.Root className="composer-shell">
          <div className="composer-input-wrap">
            <ComposerPrimitive.Input
              className="composer-input"
              placeholder="发消息或安排任务… 输入 / 调用技能"
              aria-label="消息"
            />
          </div>
          <div className="composer-toolbar">
            <div className="composer-left">
              <span className="composer-mode" title={`当前执行权限：${permissionMode}`}>
                <Shield aria-hidden="true" size={13} />
                <span>{permissionMode === "workspace" ? "工作区内修改" : permissionMode === "default" ? "标准沙箱" : permissionMode}</span>
              </span>
              {!isStreaming ? (
                <details className="composer-more">
                  <summary className="composer-tool" aria-label="更多操作" title="更多操作">
                    <Ellipsis aria-hidden="true" size={14} />
                  </summary>
                  <div className="composer-more-menu">
                    <button
                      type="button"
                      onClick={(event) => {
                        onContinue();
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <BookOpen aria-hidden="true" size={14} />
                      <span>
                        <strong>继续</strong>
                        <small>让智能体继续当前任务</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        onCompact();
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <WandSparkles aria-hidden="true" size={14} />
                      <span>
                        <strong>压缩上下文</strong>
                        <small>释放当前会话上下文</small>
                      </span>
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
            <div className="composer-right">
              <div className="composer-popover-wrap" ref={modelMenuRef}>
                <button
                  type="button"
                  className={`composer-model ${modelMenuOpen ? "active" : ""}`}
                  aria-label="选择模型"
                  aria-expanded={modelMenuOpen}
                  onClick={() => {
                    setModelMenuOpen((open) => !open);
                    setThinkingMenuOpen(false);
                  }}
                >
                  <Cpu aria-hidden="true" size={13} />
                  <span>{model}</span>
                  <ChevronDown aria-hidden="true" size={12} />
                </button>
                {modelMenuOpen ? (
                  <div className="composer-popover-menu" role="menu" aria-label="模型列表">
                    <div className="composer-popover-header">
                      <Cpu aria-hidden="true" size={12} />
                      <span>选择运行模型</span>
                    </div>
                    {availableModels.map((choice) => {
                      const isSelected = choice.model === model;
                      return (
                        <button
                          key={`${choice.provider_name}:${choice.model}`}
                          type="button"
                          className={`composer-popover-item ${isSelected ? "active" : ""}`}
                          onClick={() => void selectModel(choice)}
                        >
                          <span>
                            <strong>{choice.model}</strong>
                            <small>{choice.provider_name}</small>
                          </span>
                          {isSelected ? <Check aria-hidden="true" size={13} /> : null}
                        </button>
                      );
                    })}
                    <div className="composer-popover-divider" />
                    <button
                      type="button"
                      className="composer-popover-action"
                      onClick={() => {
                        setModelMenuOpen(false);
                        onOpenSettings();
                      }}
                    >
                      <Settings2 aria-hidden="true" size={13} />
                      <span>完整 Provider 配置…</span>
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="composer-popover-wrap" ref={thinkingMenuRef}>
                <button
                  type="button"
                  className={`composer-thinking ${thinkingMenuOpen ? "active" : ""}`}
                  aria-label="选择思考级别"
                  aria-expanded={thinkingMenuOpen}
                  onClick={() => {
                    setThinkingMenuOpen((open) => !open);
                    setModelMenuOpen(false);
                  }}
                >
                  <Sliders aria-hidden="true" size={12} />
                  <span>{thinkingLevel}</span>
                  <ChevronDown aria-hidden="true" size={12} />
                </button>
                {thinkingMenuOpen ? (
                  <div className="composer-popover-menu" role="menu" aria-label="思考级别列表">
                    <div className="composer-popover-header">
                      <Sliders aria-hidden="true" size={12} />
                      <span>思考推理深度 (Reasoning)</span>
                    </div>
                    {availableThinkingLevels.map((level) => {
                      const isSelected = level === thinkingLevel;
                      return (
                        <button
                          key={level}
                          type="button"
                          className={`composer-popover-item ${isSelected ? "active" : ""}`}
                          onClick={() => void selectThinking(level)}
                        >
                          <span>
                            <strong>{level}</strong>
                            <small>{THINKING_DESCRIPTIONS[level] ?? level}</small>
                          </span>
                          {isSelected ? <Check aria-hidden="true" size={13} /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {isStreaming ? (
                <ComposerPrimitive.Cancel className="stop-btn" aria-label="停止">
                  <Square aria-hidden="true" size={12} />
                </ComposerPrimitive.Cancel>
              ) : (
                <ComposerPrimitive.Send className="send-btn" aria-label="发送">
                  <ArrowUp aria-hidden="true" size={16} />
                </ComposerPrimitive.Send>
              )}
            </div>
          </div>
        </ComposerPrimitive.Root>

        {/* 单行极客遥测指标状态条（借鉴 DeepSeek Harness 设计） */}
        <div className="composer-telemetry-bar" role="status" aria-label="运行状态指标">
          <span className="telemetry-item">
            <span className={`telemetry-dot ${isStreaming ? "streaming" : "idle"}`} />
            <span>{isStreaming ? "智能体执行中" : "就绪"}</span>
          </span>
          <span className="telemetry-sep">·</span>
          <span className="telemetry-item">
            <strong>{snapshot.protocol.messages.length}</strong> 轮记录
          </span>
          {metrics.steps > 0 ? (
            <>
              <span className="telemetry-sep">·</span>
              <span className="telemetry-item">
                <strong>{metrics.steps}</strong> 步骤
              </span>
            </>
          ) : null}
          <span className="telemetry-sep">|</span>
          <span className="telemetry-item">
            LLM <strong>{metrics.llm}</strong>
          </span>
          <span className="telemetry-sep">·</span>
          <span className="telemetry-item">
            工具 <strong>{metrics.tools}</strong>
          </span>
          <span className="telemetry-sep">|</span>
          <span className="telemetry-item">
            缓存命中 <strong>{cacheHitRate}%</strong>
          </span>
          <span className="telemetry-sep">|</span>
          <span className="telemetry-item mono">
            Tokens: 入 <strong>{snapshot.status?.input_tokens ?? 0}</strong> · 出 <strong>{snapshot.status?.output_tokens ?? 0}</strong>
          </span>
        </div>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </>
  );
}

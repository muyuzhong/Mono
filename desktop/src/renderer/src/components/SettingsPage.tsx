import {
  ArrowLeft,
  Cpu,
  Eye,
  EyeOff,
  Folder,
  Shield,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLionRuntime } from "../assistantRuntime";

export function SettingsPage({
  onClose,
  workspacePath,
}: {
  onClose: () => void;
  workspacePath?: string;
}) {
  const { adapter, snapshot } = useLionRuntime();
  const status = snapshot.status;
  const providerName = status?.provider_name === "openai-compatible" ? "openai" : "anthropic";
  const [provider, setProvider] = useState<"openai" | "anthropic">(providerName);
  const [model, setModel] = useState(status?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [allowHosts, setAllowHosts] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"provider" | "egress" | "workspace">("provider");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const allowHostsCount = allowHosts
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0).length;

  const TAB_META = {
    provider: { kicker: "系统设置 · 模型与协议", title: "AI Provider 配置" },
    egress: { kicker: "系统设置 · 网络出站策略", title: "网络出口白名单 (Network Egress)" },
    workspace: { kicker: "系统设置 · 运行环境", title: "本地工作区与诊断信息" },
  };

  useEffect(() => {
    let mounted = true;
    setApiKeyVisible(false);
    setLoadingConfiguration(true);
    void Promise.all([
      adapter.fetchProviderConfiguration().then((configuration) => {
        if (!mounted || !configuration) return;
        setProvider(configuration.provider);
        setModel(configuration.model);
        setApiKey(configuration.api_key);
        setBaseUrl(configuration.base_url);
      }),
      adapter.fetchEgressConfiguration().then((egress) => {
        if (!mounted || !egress) return;
        setAllowHosts(egress.allow_hosts.join("\n"));
      }),
    ]).finally(() => {
      if (mounted) setLoadingConfiguration(false);
    });
    return () => {
      mounted = false;
    };
  }, [adapter]);

  // 按 Esc 键平滑返回会话
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const parsedHosts = allowHosts
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const [savedProvider, savedEgress] = await Promise.all([
      adapter.configureProvider({
        provider,
        model: model.trim() || undefined,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
      }),
      adapter.configureEgress({ allow_hosts: parsedHosts }),
    ]);
    setSaving(false);
    if (savedProvider && savedEgress) onClose();
  };

  return (
    <div className="settings-page" role="region" aria-label="系统与运行设置">
      <header className="settings-page-header">
        <div className="settings-header-left">
          <button
            type="button"
            className="settings-back-btn"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>返回会话</span>
            <kbd>ESC</kbd>
          </button>
          <div className="settings-header-divider" />
          <div className="settings-header-titles">
            <span className="workspace-kicker">{TAB_META[activeTab].kicker}</span>
            <h1 className="settings-header-h1" id="settings-title">{TAB_META[activeTab].title}</h1>
          </div>
        </div>
        <div className="settings-header-right">
          <span className="settings-sidecar-badge">
            <span className="settings-status-dot" />
            Sidecar 正常运行
          </span>
        </div>
      </header>

      <nav className="settings-nav-tabs" aria-label="设置分区" role="tablist">
        <button
          id="tab-provider"
          role="tab"
          aria-selected={activeTab === "provider"}
          type="button"
          className={activeTab === "provider" ? "active" : ""}
          onClick={() => setActiveTab("provider")}
        >
          <Cpu size={14} aria-hidden="true" />
          <span>AI Provider 与模型</span>
        </button>
        <button
          id="tab-egress"
          role="tab"
          aria-selected={activeTab === "egress"}
          type="button"
          className={activeTab === "egress" ? "active" : ""}
          onClick={() => setActiveTab("egress")}
        >
          <Shield size={14} aria-hidden="true" />
          <span>网络出口白名单 (Egress)</span>
          {allowHostsCount > 0 ? <span className="settings-tab-badge">{allowHostsCount}</span> : null}
        </button>
        <button
          id="tab-workspace"
          role="tab"
          aria-selected={activeTab === "workspace"}
          type="button"
          className={activeTab === "workspace" ? "active" : ""}
          onClick={() => setActiveTab("workspace")}
        >
          <Folder size={14} aria-hidden="true" />
          <span>工作区与诊断信息</span>
        </button>
      </nav>

      <form onSubmit={(event) => void save(event)} className="settings-page-form">
        <div ref={scrollContainerRef} className="settings-page-scroll">
          {snapshot.metadataError ? (
            <div className="form-error" role="alert">
              {snapshot.metadataError}
            </div>
          ) : null}

          {/* Section 1: AI Provider */}
          <div
            className={`settings-tab-panel ${activeTab === "provider" ? "active" : "hidden"}`}
            role="tabpanel"
            aria-labelledby="tab-provider"
          >
            <section id="section-provider" className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <Cpu size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2>Provider 与模型</h2>
                  <p>配置用于驱动 Lion 任务的基础大模型、服务商协议、访问凭据与思考推理深度</p>
                </div>
              </div>

              <div className="settings-card-body">
                <div className="settings-field-group">
                  <div className="settings-field-label">
                    <label htmlFor="provider-select">服务商协议 (Provider)</label>
                    <span>选择大语言模型服务商协议标准</span>
                  </div>
                  <div className="settings-field-control">
                    <select
                      id="provider-select"
                      value={provider}
                      onChange={(event) => setProvider(event.target.value as "openai" | "anthropic")}
                    >
                      <option value="anthropic">Anthropic (Claude 原生协议)</option>
                      <option value="openai">OpenAI compatible (兼容 OpenAI 标准)</option>
                    </select>
                  </div>
                </div>

                <div className="settings-field-group">
                  <div className="settings-field-label">
                    <label htmlFor="model-select">默认模型 (Model)</label>
                    <span>指定 Agent 会话默认调用的模型标识</span>
                  </div>
                  <div className="settings-field-control">
                    <select
                      id="model-select"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                    >
                      {model && !snapshot.models.some((choice) => choice.model === model) ? (
                        <option value={model}>{model}</option>
                      ) : null}
                      {snapshot.models.map((choice) => (
                        <option key={`${choice.provider_name}:${choice.model}`} value={choice.model}>
                          {choice.model} ({choice.provider_name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="settings-field-group">
                  <div className="settings-field-label">
                    <label htmlFor="provider-api-key">API key</label>
                    <span>本地安全加密存储，绝不明文上传云端</span>
                  </div>
                  <div className="settings-field-control">
                    <div className="settings-input-with-action">
                      <input
                        id="provider-api-key"
                        type={apiKeyVisible ? "text" : "password"}
                        autoComplete="off"
                        value={apiKey}
                        disabled={loadingConfiguration}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={
                          loadingConfiguration
                            ? "正在读取…"
                            : status?.api_configured
                              ? "已配置；留空保持不变"
                              : "输入 API key"
                        }
                      />
                      <button
                        type="button"
                        className="settings-input-icon-btn"
                        aria-label={apiKeyVisible ? "隐藏 API key" : "显示 API key"}
                        aria-pressed={apiKeyVisible}
                        aria-controls="provider-api-key"
                        onClick={() => setApiKeyVisible((visible) => !visible)}
                      >
                        {apiKeyVisible ? (
                          <EyeOff aria-hidden="true" size={16} />
                        ) : (
                          <Eye aria-hidden="true" size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-field-group">
                  <div className="settings-field-label">
                    <label htmlFor="provider-base-url">API 地址</label>
                    <span>可选自定义反向代理网关或本地中转地址</span>
                  </div>
                  <div className="settings-field-control">
                    <input
                      id="provider-base-url"
                      value={baseUrl}
                      disabled={loadingConfiguration}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder={
                        provider === "openai"
                          ? "https://api.openai.com/v1"
                          : "可选自定义地址，如 https://api.anthropic.com/v1"
                      }
                    />
                  </div>
                </div>

                <div className="settings-field-group">
                  <div className="settings-field-label">
                    <label htmlFor="thinking-level-select">思考推理深度 (Thinking Level)</label>
                    <span>为支持思考的大模型（如 Claude 3.7 Sonnet）分配推理预算</span>
                  </div>
                  <div className="settings-field-control">
                    <select
                      id="thinking-level-select"
                      value={status?.thinking_level ?? "medium"}
                      onChange={(event) => void adapter.setThinkingLevel(event.target.value)}
                    >
                      {status?.available_thinking_levels.map((level) => (
                        <option key={level} value={level}>
                          {level === "off"
                            ? "off · 直接响应（关闭思考）"
                            : level === "low"
                              ? "low · 轻度思考（快速推理）"
                              : level === "medium"
                                ? "medium · 标准思考（推荐默认）"
                                : level === "high"
                                  ? "high · 深度推理（复杂逻辑）"
                                  : level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Section 2: Network Egress */}
          <div
            className={`settings-tab-panel ${activeTab === "egress" ? "active" : "hidden"}`}
            role="tabpanel"
            aria-labelledby="tab-egress"
          >
            <section id="section-egress" className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <Shield size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2>网络出口策略 (Network Egress)</h2>
                  <p>安全沙箱围栏：严格限制 Agent 工具（Web 检索、外部 API 等）所能访问的出站域名白名单</p>
                </div>
              </div>

              <div className="settings-card-body">
                <div className="settings-field-group vertical">
                  <div className="settings-field-label">
                    <label htmlFor="egress-allow-hosts">允许访问的域名白名单 (Allow Hosts)</label>
                    <span>每行填写一个合法域名。仅白名单内的域名能被 Sidecar 网络出站工具抓取，防止凭据外泄</span>
                  </div>
                  <div className="settings-field-control">
                    <textarea
                      id="egress-allow-hosts"
                      value={allowHosts}
                      onChange={(event) => setAllowHosts(event.target.value)}
                      placeholder={
                        loadingConfiguration
                          ? "正在读取…"
                          : "每行一个域名，例如：\napi.github.com\nraw.githubusercontent.com\napi.anthropic.com"
                      }
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Section 3: Workspace & Diagnostics */}
          <div
            className={`settings-tab-panel ${activeTab === "workspace" ? "active" : "hidden"}`}
            role="tabpanel"
            aria-labelledby="tab-workspace"
          >
            <section id="section-workspace" className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <Folder size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2>工作区与运行诊断</h2>
                  <p>当前挂载的项目上下文与本地 Python 运行进程状态</p>
                </div>
              </div>

              <div className="settings-card-body">
                <div className="settings-info-grid">
                  <div className="settings-info-item">
                    <span className="settings-info-key">当前工作区路径</span>
                    <span className="settings-info-value mono">{workspacePath || status?.cwd || "D:/harness agent/Lion"}</span>
                  </div>
                  <div className="settings-info-item">
                    <span className="settings-info-key">活跃任务会话</span>
                    <span className="settings-info-value">{snapshot.sessions.length} 个历史会话</span>
                  </div>
                  <div className="settings-info-item">
                    <span className="settings-info-key">Sidecar 状态</span>
                    <span className="settings-info-value">{status?.is_running ? "正在执行 Agent 任务" : "就绪 · 待命"}</span>
                  </div>
                  <div className="settings-info-item">
                    <span className="settings-info-key">Token 消耗统计</span>
                    <span className="settings-info-value mono">输入 {status?.input_tokens ?? 0} · 输出 {status?.output_tokens ?? 0}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Sticky Footer */}
        <footer className="settings-page-footer">
          <div className="settings-footer-tip">
            <span>修改后点击保存即刻写入本地配置生效。</span>
          </div>
          <div className="settings-footer-actions">
            <button type="button" className="button-quiet" onClick={onClose}>
              保留当前配置
            </button>
            <button
              type="submit"
              className="settings-save-button"
              disabled={saving || loadingConfiguration || snapshot.protocol.isStreaming}
            >
              {loadingConfiguration ? "正在读取…" : saving ? "正在保存…" : "保存配置"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

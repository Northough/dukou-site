import { useEffect, useRef, useState } from "react";
import { sendChatRequest } from "../api/chatTransport.js";
import { getEmotionState, getInjectedMemories } from "../api/memory.js";
import { exportMessagesJson, getMessageArchiveStats } from "../api/messageArchive.js";
import { clearLocalMessages, getRecentMessages } from "../api/messages.js";
import {
  DEFAULT_MEMORY_SETTINGS,
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_PROMPT_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_TRANSPORT_SETTINGS,
  DEFAULT_UI_SETTINGS,
  PROVIDER_PRESETS,
  STORAGE_KEYS,
  clearModelApiKey,
  getSettings,
  saveSettings,
} from "../store/settings.js";
import { clearContextLogs, getContextLogs, sanitizeContextLog, saveContextSnapshot, updateContextSnapshot } from "../store/contextLogs.js";
import { FUNCTION_STORAGE_KEYS, clearFunctionLocalStore } from "../store/functionLocalStore.js";
import { getSessionId } from "../store/session.js";
import { DEFAULT_SYSTEM_PROMPT, buildContextPreview, buildSystemPrompt } from "../systems/context.js";

const providerOptions = [
  ["deepseek", "DeepSeek"],
  ["kimi", "Kimi"],
  ["glm", "GLM"],
  ["openai", "OpenAI"],
  ["openrouter", "OpenRouter"],
  ["claude", "Claude"],
  ["kiwi_local", "Kiwi Local"],
  ["custom_openai_compatible", "Custom"],
];

const apiStyleOptions = ["openai_compatible", "anthropic"];
const outputModeOptions = ["sentence", "paragraph"];
const chatTransportOptions = ["mock", "direct_model", "kiwi_direct", "backend_gateway"];
const chatTransportLabels = {
  mock: "mock",
  direct_model: "direct",
  kiwi_direct: "kiwi direct",
  backend_gateway: "gateway 占位",
};

const MAX_LOCAL_IMAGE_BYTES = 2 * 1024 * 1024;

const connectionLabels = {
  untested: "未测试",
  testing: "测试中",
  success: "可用",
  error: "失败",
};

const triggerLabels = {
  opening: "opening",
  user_message: "user_message",
  blocked_note: "blocked_note",
  wakeup: "wakeup",
  manual_preview: "manual_preview",
  test_model: "test_model",
};

const statusLabels = {
  preview: "仅预览",
  success: "成功",
  error: "失败",
};

const settingsEntries = [
  { id: "model", title: "模型接入", sub: "Provider、Base URL、Model、API Key", keywords: "provider base url model api key 测试模型 连接 temperature max tokens 输出模式" },
  { id: "terminal", title: "终端", sub: "云端命令行连接地址、访问令牌", keywords: "terminal 终端 命令行 ws websocket cloudflare tunnel token claude code" },

];

const LOCAL_EXPORT_TIME_KEY = "dukou:lastExportAt";
const KEEPSAKE_DRAFTS_KEY = "dukou:conversationKeepsakes";
const DUKOU_LOCAL_PREFIX = "dukou:";

const HELP_TEXT = {
  chatTransport: "聊天请求要发往哪里。mock 只在前端假回复；direct_model 直连模型；kiwi_direct 走本机记忆网关；backend_gateway 是未来后端入口。",
  memoryMode: "长期记忆由谁处理。mock 使用前端样例；kiwi_managed 表示长期记忆交给外部记忆网关，前端不看内部记忆。",
  contextLog: "上下文日志只保存在本机，用来回看最近一次请求前准备了哪些上下文；它不保存 API key 或完整请求头。",
  indexedDbArchive: "IndexedDB 是浏览器本机的小数据库，用来存完整聊天归档，不会自动上传到云端。",
  apiKeyConfigured: "这里只显示是否填过 Key，不展示 Key 内容。kiwi_direct 和 backend_gateway 不要求前端保存真实模型 Key。",
  kiwiDirect: "kiwi_direct 会让前端请求本机 kiwi-mem 验证入口。它适合本地验证，长期使用仍建议改走后端。",
  backendGateway: "backend_gateway 是未来 Node 后端入口。当前只保存和展示占位，不会发起真实后端请求。",
  apiHealth: "未来用来问后端是否还活着。当前未接入，不会真的请求。",
  apiAdminStatus: "未来用来读取后端运行状态，比如工具开关和路由状态。当前未接入。",
  apiAdminConfig: "未来用来读取或修改后端保存的配置，比如子代理模型、工具开关、能力路由。真实 API key 仍然只放后端，不展示给前端。",
  apiChatCompletions: "未来后端兼容的聊天入口。前端发聊天请求到这里，再由后端转给模型或记忆网关。",
  apiMemoryStatus: "未来只读查看记忆网关是否可用，不读取记忆库内部正文。",
  apiMemoryPreview: "未来只读预览少量记忆摘要或状态。当前未接入，也不展示真实长期记忆正文。",
  imageRoute: "未来生图能力的路由名。当前未接入，不调用生图 API，也不在前端保存媒体 Key。",
  voiceRoute: "未来语音能力的路由名。当前未接入，不请求麦克风，也不调用 ASR/TTS。",
  subAgentModels: "未来给摘要、日记、情绪、工具等任务选择模型。当前只是占位，不保存真实配置。",
  backendTools: "未来由后端管理的工具状态，比如导出、MCP、通知、生图和语音。当前不调用真实工具。",
  providerModel: "当前模型接入页保存的 provider 和 model，只读展示，不是第二套配置。",
  baseUrl: "当前模型接入页保存的 Base URL。这里只显示地址本身，不展示 API key 或请求头。",
  memoryOwnership: "长期记忆是否交给外部记忆网关处理。这里不读取内部数据库，也不展示记忆正文。",
  dreamDigest: "Dream / digest 属于记忆库或未来后端能力。当前只显示接管状态，不在前端执行。",
  localClearContextLogs: "只清空本机 contextLogs。不会删除聊天记录、记忆库、后端、Docker volume 或项目文件。",
  localClearMessages: "只清空本机 IndexedDB 聊天归档。不会清理记忆库、后端或项目文件。",
  localClearFunctionData: "只清空功能页 localStorage 数据。不会清理聊天归档、记忆库、后端或项目文件。",
  localClearAll: "只清空当前浏览器里的AI 陪伴前端数据。不会清理记忆库、后端、Docker volume 或项目文件。",
  unsavedLeave: "当前页面有未保存修改。离开会丢弃这些修改，不影响已保存的数据。",
};

function Section({ title, children }) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">{title}</div>
      <div className="settings-panel">{children}</div>
    </section>
  );
}

function Row({ label, sub, children, stack = false }) {
  return (
    <div className={stack ? "settings-row is-stack" : "settings-row"}>
      <div>
        <div className="settings-row-title">{label}</div>
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange, label, labels = {} }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={value === option ? "is-active" : ""}
          onClick={() => onChange(option)}
        >
          {labels[option] || option}
        </button>
      ))}
    </div>
  );
}

function SubHeader({ title, onBack, actionLabel, onAction, actionDisabled = false }) {
  return (
    <header className="settings-sub-header">
      <button className="settings-back-button" type="button" onClick={onBack} aria-label="返回">
        ‹
      </button>
      <strong>{title}</strong>
      {actionLabel ? (
        <button className="settings-save-button" type="button" onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </button>
      ) : (
        <span className="settings-header-spacer" />
      )}
    </header>
  );
}

function EntryRow({ title, sub, onClick }) {
  return (
    <button className="settings-entry-row" type="button" onClick={onClick}>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <span className="settings-entry-arrow">›</span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="8" cy="8" r="5" />
      <path d="m12 12 3 3" />
    </svg>
  );
}

function SmallThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      className={isDark ? "small-theme-toggle is-dark" : "small-theme-toggle"}
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "切换到日间" : "切换到夜间"}
      aria-pressed={isDark}
    >
      <span>{isDark ? "夜" : "日"}</span>
      <i aria-hidden="true" />
    </button>
  );
}

function ThemeEntryRow({ settings, onToggleTheme }) {
  return (
    <div className="settings-entry-row settings-theme-row">
      <span>
        <strong>外观</strong>
        <small>日间 / 夜间</small>
      </span>
      <SmallThemeToggle theme={settings.ui.theme} onToggle={onToggleTheme} />
    </div>
  );
}

function getDefaultBubbleColor(theme, role) {
  if (role === "user") return theme === "dark" ? "#33424d" : "#7b8fa1";
  return theme === "dark" ? "#272a30" : "#ffffff";
}

function getPreviewBubbleBackground(color, opacity) {
  const hex = String(color || "#ffffff").replace("#", "");
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const alpha = Math.min(1, Math.max(0, Number(opacity) || 0));
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

function readLocalImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type?.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }

    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
      reject(new Error("图片不能超过 2MB"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function SurfaceStyleControl({
  label,
  color,
  opacity,
  blur,
  onBlurChange,
  onColorChange,
  onOpacityChange,
}) {
  return (
    <div className="appearance-surface-control">
      <div className="appearance-surface-preview" style={{ backgroundColor: getPreviewBubbleBackground(color, opacity), opacity }}>
        <span>{label}</span>
      </div>
      <label className="appearance-color-row">
        <span>{label}颜色</span>
        <input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} />
        <strong>{color}</strong>
      </label>
      <label className="appearance-range-row">
        <span>透明度</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
        />
        <strong>{Math.round(opacity * 100)}%</strong>
      </label>
      <label className="appearance-range-row">
        <span>磨砂强度</span>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={blur}
          onChange={(event) => onBlurChange(Number(event.target.value))}
        />
        <strong>{blur}px</strong>
      </label>
    </div>
  );
}

function BubbleColorControl({ duColor, userColor, opacity, blur, onBlurChange, onDuColorChange, onOpacityChange, onUserColorChange }) {
  const sampleStyle = (color) => ({
    "--appearance-bubble-bg": getPreviewBubbleBackground(color, opacity),
    "--appearance-bubble-blur": blur + "px",
  });
  return (
    <div className="appearance-bubble-control">
      <div className="appearance-bubble-preview" aria-hidden="true">
        <span className="appearance-bubble-sample is-du" style={sampleStyle(duColor)}>来了。</span>
        <span className="appearance-bubble-sample is-user" style={sampleStyle(userColor)}>嗯。</span>
      </div>
      <label className="appearance-color-row">
        <span>机的对话框</span>
        <input type="color" value={duColor} onChange={(event) => onDuColorChange(event.target.value)} />
        <strong>{duColor}</strong>
      </label>
      <label className="appearance-color-row">
        <span>我的对话框</span>
        <input type="color" value={userColor} onChange={(event) => onUserColorChange(event.target.value)} />
        <strong>{userColor}</strong>
      </label>
      <label className="appearance-range-row">
        <span>气泡透明度</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
        />
        <strong>{Math.round(opacity * 100)}%</strong>
      </label>
      <label className="appearance-range-row">
        <span>气泡磨砂</span>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={blur}
          onChange={(event) => onBlurChange(Number(event.target.value))}
        />
        <strong>{blur}px</strong>
      </label>
    </div>
  );
}

function ImageImportControl({
  id,
  label,
  image,
  opacity,
  blur,
  variant = "avatar",
  showAdjustments = true,
  onBlurChange,
  onClear,
  onError,
  onImageChange,
  onOpacityChange,
}) {
  const hasImage = Boolean(image);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const dataUrl = await readLocalImageFile(file);
      onImageChange(dataUrl);
    } catch (error) {
      onError?.(error.message || "图片读取失败");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className={`appearance-image-control is-${variant}`}>
      <div className="appearance-image-head">
        <div className={`appearance-image-preview is-${variant}`}>
          {hasImage ? <img src={image} alt="" style={{ opacity }} /> : <span>未导入</span>}
        </div>
        <div className="appearance-image-actions">
          <label className="appearance-upload-button" htmlFor={id}>
            导入图片
            <input id={id} type="file" accept="image/*" onChange={handleFileChange} />
          </label>
          <button className="ghost-button" type="button" onClick={onClear} disabled={!hasImage}>
            清除
          </button>
        </div>
      </div>
      {showAdjustments && (
        <label className="appearance-range-row">
          <span>{label}透明度</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            disabled={!hasImage}
          />
          <strong>{Math.round(opacity * 100)}%</strong>
        </label>
      )}
      {showAdjustments && typeof blur === "number" && onBlurChange && (
        <label className="appearance-range-row">
          <span>背景模糊</span>
          <input
            type="range"
            min="0"
            max="18"
            step="1"
            value={blur}
            onChange={(event) => onBlurChange(Number(event.target.value))}
            disabled={!hasImage}
          />
          <strong>{blur}px</strong>
        </label>
      )}
    </div>
  );
}

function InlineNotice({ tone = "neutral", children }) {
  return <div className={`settings-notice is-${tone}`}>{children}</div>;
}

function HelpMark({ topic }) {
  const [open, setOpen] = useState(false);
  const text = HELP_TEXT[topic];
  if (text ? false : true) return null;

  return (
    <span className="settings-help">
      <button
        className="settings-help-button"
        type="button"
        onClick={() => setOpen((value) => (value ? false : true))}
        aria-label="查看说明"
        aria-expanded={open}
      >
        ?
      </button>
      {open ? <span className="settings-help-popover">{text}</span> : null}
    </span>
  );
}

function LabelWithHelp({ children, topic }) {
  return (
    <span className="settings-label-help">
      <span>{children}</span>
      <HelpMark topic={topic} />
    </span>
  );
}

function StatusCard({ label, value, sub, topic }) {
  return (
    <article className="runtime-status-card">
      <small>
        <LabelWithHelp topic={topic}>{label}</LabelWithHelp>
      </small>
      <strong>{value}</strong>
      {sub ? <span>{sub}</span> : null}
    </article>
  );
}

function DataRow({ label, value, sub, topic }) {
  return (
    <div className="runtime-data-row">
      <span>
        <LabelWithHelp topic={topic}>{label}</LabelWithHelp>
        {sub ? <small>{sub}</small> : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function safeBaseUrl(value) {
  const text = String(value || "").trim();
  if (text.length === 0) return "未填写";

  try {
    const url = new URL(text);
    let pathName = url.pathname;
    while (pathName.endsWith("/")) pathName = pathName.slice(0, -1);
    return url.origin + pathName;
  } catch {
    return text.split("?")[0].split("#")[0];
  }
}

function readLocalJson(key, fallback = null) {
  if (typeof window === "undefined" || window.localStorage === undefined) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function localStorageHas(key) {
  return typeof window !== "undefined" && Boolean(window.localStorage && window.localStorage.getItem(key));
}

function countStoredValue(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value).filter((item) => {
      if (Array.isArray(item)) return item.length > 0;
      if (item && typeof item === "object") return Object.keys(item).length > 0;
      return Boolean(item);
    }).length;
  }
  return value ? 1 : 0;
}

function getFunctionDataStats() {
  const details = Object.entries(FUNCTION_STORAGE_KEYS).map(([id, key]) => {
    const value = readLocalJson(key, null);
    return {
      id,
      key,
      exists: localStorageHas(key),
      count: countStoredValue(value),
    };
  });

  return {
    totalCount: details.reduce((sum, item) => sum + item.count, 0),
    details,
  };
}

function getDukouLocalStorageKeys() {
  if (typeof window === "undefined" || window.localStorage === undefined) return [];
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(DUKOU_LOCAL_PREFIX)) keys.push(key);
  }
  return keys;
}

function removeDukouLocalStorage() {
  if (typeof window === "undefined" || window.localStorage === undefined) return 0;
  const keys = getDukouLocalStorageKeys();
  keys.forEach((key) => window.localStorage.removeItem(key));
  return keys.length;
}

async function loadLocalDataStats(logs = []) {
  const functionStats = getFunctionDataStats();
  const keepsakes = readLocalJson(KEEPSAKE_DRAFTS_KEY, []);
  const baseStats = {
    currentChatCacheCount: 0,
    archiveStatus: "未检测",
    archiveVisibleCount: 0,
    archiveTotalCount: 0,
    contextLogCount: logs.length,
    keepsakeCount: Array.isArray(keepsakes) ? keepsakes.length : 0,
    functionDataCount: functionStats.totalCount,
    functionDetails: functionStats.details,
    uiSettingsExists: localStorageHas(STORAGE_KEYS.uiSettings),
    localUserIdExists: localStorageHas(STORAGE_KEYS.localUserId),
    lastExportAt: typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(LOCAL_EXPORT_TIME_KEY) || "" : "",
    dukouLocalKeyCount: getDukouLocalStorageKeys().length,
  };

  try {
    const results = await Promise.all([
      getMessageArchiveStats(),
      getRecentMessages(200, { includeExcluded: true }),
    ]);
    return {
      ...baseStats,
      currentChatCacheCount: results[1].length,
      archiveStatus: "可读取",
      archiveVisibleCount: results[0].visibleCount,
      archiveTotalCount: results[0].totalCount,
    };
  } catch {
    return {
      ...baseStats,
      archiveStatus: "不可读取",
    };
  }
}

function getLatestRouteStatus(chatTransport) {
  if (chatTransport === "mock") return "mock";
  if (chatTransport === "direct_model") return "direct_model";
  if (chatTransport === "kiwi_direct") return "kiwi_direct";
  if (chatTransport === "backend_gateway") return "backend_gateway";
  return "mock";
}

function getMemoryConnectionLabel(logs, chatTransport) {
  if (["kiwi_direct", "backend_gateway"].includes(chatTransport) ? false : true) return "未检测";
  const related = logs.find((log) => ["kiwi_direct", "backend_gateway"].includes(log.chatTransport));
  if (related ? false : true) return "未检测";
  return related.status === "success" ? "可达" : related.status === "error" ? "不可达" : "未检测";
}

function providerLabel(provider) {
  return PROVIDER_PRESETS[provider]?.label || provider || "Custom";
}

function hasApiKey(modelSettings) {
  return Boolean(modelSettings?.apiKey?.trim());
}

function needsFrontendApiKey(settings) {
  return settings.transport?.chatTransport === "direct_model" && settings.model.provider !== "kiwi_local";
}

function formatApiKeyStatus(settings) {
  if (!needsFrontendApiKey(settings)) return "当前模式不需要";
  return hasApiKey(settings.model) ? "已保存" : "未填写";
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizePromptDraft(draft) {
  const text = draft.customSystemPrompt || "";
  if (draft.mode === "custom" && text.trim() && text !== DEFAULT_SYSTEM_PROMPT) {
    return {
      mode: "custom",
      customSystemPrompt: text,
    };
  }

  return DEFAULT_PROMPT_SETTINGS;
}

function formatMessages(messages) {
  if (!messages?.length) return "暂无最近消息。";
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

function formatUsage(usage) {
  if (!usage) return "无";
  return `输入 ${usage.inputTokens || 0} · 输出 ${usage.outputTokens || 0} · 总量 ${usage.totalTokens || 0}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function copyText(text) {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}


function CurrentModelCard({ settings, modelStatus, onTest }) {
  return (
    <section className="settings-model-card">
      <div className="settings-model-card-head">
        <div>
          <small>当前模型</small>
          <strong>{providerLabel(settings.model.provider)}</strong>
        </div>
        <button className="text-button" type="button" onClick={onTest} disabled={modelStatus.status === "testing"}>
          {modelStatus.status === "testing" ? "测试中" : "测试模型"}
        </button>
      </div>
      <div className="settings-model-meta">
        <span>Model</span>
        <strong>{settings.model.model || "未填写"}</strong>
      </div>
      <div className="settings-model-meta">
        <span>API Key</span>
        <strong>{formatApiKeyStatus(settings)}</strong>
      </div>
      <div className="settings-model-meta">
        <span>Chat Transport</span>
        <strong>{settings.transport?.chatTransport || DEFAULT_TRANSPORT_SETTINGS.chatTransport}</strong>
      </div>
      <div className="settings-model-meta">
        <span>Memory Mode</span>
        <strong>{settings.memory.memoryMode}</strong>
      </div>
      <div className="settings-model-meta">
        <span>连接状态</span>
        <strong className={`settings-status is-${modelStatus.status}`}>{connectionLabels[modelStatus.status]}</strong>
      </div>
      {modelStatus.message && <p>{modelStatus.message}</p>}
    </section>
  );
}

function SettingsHome({ settings, modelStatus, homeScrollTop = 0, onHomeScrollChange, onOpen, onTest, onToggleTheme }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const scrollRef = useRef(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    const node = scrollRef.current;
    if (!node) return;

    restoredRef.current = true;
    const restore = () => {
      node.scrollTop = homeScrollTop;
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(restore);
      return;
    }

    restore();
  }, [homeScrollTop]);

  const openPage = (id) => {
    onHomeScrollChange?.(scrollRef.current?.scrollTop || 0);
    onOpen(id);
  };

  const rememberScroll = (event) => {
    onHomeScrollChange?.(event.currentTarget.scrollTop);
  };
  const settingsEntries = [
    { id: "model", title: "模型接入", sub: "Provider、Base URL、Model、API Key", keywords: "provider base url model api key 测试模型 连接 temperature max tokens 输出模式" },
    { id: "persona", title: "人格", sub: "系统提示词、变量、最终提示词预览", keywords: "system prompt custom 默认 自定义 复制 恢复默认 名字 修改名字 机的名字 我的名字 机 我" },
    { id: "memory", title: "记忆与上下文", sub: "Memory Mode、Chat Transport、上下文预览", keywords: "mock direct_model kiwi backend gateway 注入日志 context logs manual preview recent messages" },
    { id: "security", title: "安全与数据", sub: "清除密钥、清空日志、导出聊天记录 JSON", keywords: "api key 清除 日志 导出 debug json 聊天记录 history archive" },
    { id: "appearance", title: "外观", sub: "主题、头像、聊天背景、顶端栏、输入框", keywords: "主题 dark light 夜间 日间 头像 背景 顶端栏 输入框 透明度 磨砂" },
    { id: "about", title: "关于", sub: "版本信息", keywords: "dukou 版本 version" },
  ];
  const runtimeEntries = [
    { id: "systemOverview", title: "系统总览", sub: "当前运行模式、最近请求和本地数据摘要", keywords: "运行 系统 总览 chatTransport memoryMode provider model baseUrl api key contextLog 本地数据" },
    { id: "capabilityRoutes", title: "前端能力路由", sub: "主聊天、生图、语音的当前入口状态", keywords: "能力 路由 主聊天 生图 语音 backend_gateway image generate voice kiwi_direct direct_model" },
    { id: "memoryStatus", title: "记忆库状态", sub: "外部记忆网关接管状态，只读显示", keywords: "记忆库 状态 kiwi_managed kiwi_direct dream digest base url 长期记忆" },
    { id: "backendGateway", title: "Backend Gateway", sub: "未来后端连接、配置、工具和接口占位", keywords: "backend gateway api health admin config chat completions memory status preview 子代理 工具" },
    { id: "localData", title: "本地数据与日志", sub: "聊天归档、contextLogs、功能页本地数据", keywords: "本地数据 日志 IndexedDB contextLogs 潮汐标本 localUserId ui settings 清理 危险区" },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const filterEntries = (entries) => normalizedQuery ? entries.filter((entry) => (entry.title + " " + entry.sub + " " + entry.keywords).toLowerCase().includes(normalizedQuery)) : entries;
  const visibleSettingsEntries = filterEntries(settingsEntries);
  const visibleRuntimeEntries = filterEntries(runtimeEntries);
  const hasVisibleEntries = visibleSettingsEntries.length > 0 || visibleRuntimeEntries.length > 0;

  return (
    <>
      <div className="settings-home-header">
        <span>DUKOU</span>
        <h1>设</h1>
      </div>
      <div className="settings-scroll" ref={scrollRef} onScroll={rememberScroll}>
        <CurrentModelCard settings={settings} modelStatus={modelStatus} onTest={onTest} />
        <section className="settings-section">
          <div className="settings-section-title settings-section-title-row">
            <span>设置</span>
            <button
              className={searchOpen ? "settings-search-button is-active" : "settings-search-button"}
              type="button"
              onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setQuery("");
              }}
              aria-label="搜索设置"
            >
              <SearchIcon />
            </button>
          </div>
          {searchOpen && (
            <div className="settings-search-shell">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索设置"
                autoFocus
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
                  ×
                </button>
              )}
            </div>
          )}
          <div className="settings-panel">
            {visibleSettingsEntries.map((entry) => (
              <EntryRow key={entry.id} title={entry.title} sub={entry.sub} onClick={() => openPage(entry.id)} />
            ))}
            {hasVisibleEntries ? null : <p className="settings-search-empty">没有找到。</p>}
          </div>
        </section>
        {visibleRuntimeEntries.length > 0 || normalizedQuery.length === 0 ? (
          <section className="settings-section">
            <div className="settings-section-title">运行与系统</div>
            <div className="settings-panel">
              {visibleRuntimeEntries.map((entry) => (
                <EntryRow key={entry.id} title={entry.title} sub={entry.sub} onClick={() => openPage(entry.id)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function ModelSettingsPage({ settings, modelStatus, onBack, onRequestLeave, onSave, onTest, showToast }) {
  const [draft, setDraft] = useState(settings.model);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.model);
  const apiKeyDisabled = draft.provider === "kiwi_local";

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const changeProvider = (provider) => {
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom_openai_compatible;
    if (provider === "deepseek") {
      updateDraft({
        provider,
        apiStyle: "openai_compatible",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
      });
      return;
    }

    updateDraft({
      provider,
      apiStyle: preset.apiStyle,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel || "",
      apiKey: provider === "kiwi_local" ? "" : draft.apiKey,
    });
  };

  const save = () => {
    onSave(draft);
    showToast("你正在切换模型。建议先进入「模型试跑」，确认语气稳定后再允许写入长期记忆。");
  };

  return (
    <>
      <SubHeader title="模型接入" onBack={() => onRequestLeave(dirty, onBack)} actionLabel="保存" onAction={save} />
      <div className="settings-scroll">
        <CurrentModelCard settings={{ ...settings, model: draft }} modelStatus={modelStatus} onTest={() => onTest(draft)} />
        <Section title="接入">
          <Row label="Provider">
            <select className="settings-control" value={draft.provider} onChange={(event) => changeProvider(event.target.value)}>
              {providerOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="API Style">
            <select className="settings-control" value={draft.apiStyle} onChange={(event) => updateDraft({ apiStyle: event.target.value })}>
              {apiStyleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Row>
          {draft.provider === "claude" && <InlineNotice>Claude / Anthropic 为 P1，可先保存配置。</InlineNotice>}
          {draft.provider === "kiwi_local" && <InlineNotice>Kiwi Local 请求本机 kiwi-mem 网关；当前前端不保存真实模型 key。</InlineNotice>}
          <Row label="Base URL">
            <input className="settings-control" value={draft.baseUrl} onChange={(event) => updateDraft({ baseUrl: event.target.value })} />
          </Row>
          <Row label="Model">
            <input className="settings-control" value={draft.model} onChange={(event) => updateDraft({ model: event.target.value })} />
          </Row>
          <Row label="API Key" sub={apiKeyDisabled ? "Kiwi Local 不在前端保存真实模型 key" : ""}>
            <input
              className="settings-control"
              type="password"
              value={draft.apiKey}
              onChange={(event) => updateDraft({ apiKey: event.target.value })}
              disabled={apiKeyDisabled}
            />
          </Row>
          <Row label="清除 API Key">
            <button className="danger-button" type="button" onClick={() => updateDraft({ apiKey: "" })} disabled={apiKeyDisabled}>
              清除
            </button>
          </Row>
          <Row label="连接测试" sub={modelStatus.message}>
            <button className="settings-action-button" type="button" onClick={() => onTest(draft)} disabled={modelStatus.status === "testing"}>
              {modelStatus.status === "testing" ? "测试中" : "测试"}
            </button>
          </Row>
        </Section>

        <Section title="高级配置">
          <button className="settings-fold-button" type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            <span>高级配置</span>
            <span>{advancedOpen ? "收起" : "展开"}</span>
          </button>
          {advancedOpen && (
            <>
              <Row label="Temperature" sub={String(draft.temperature)}>
                <input
                  className="settings-control"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={draft.temperature}
                  onChange={(event) => updateDraft({ temperature: Number(event.target.value) })}
                />
              </Row>
              <Row label="Max Tokens">
                <input
                  className="settings-control"
                  type="number"
                  min="1"
                  value={draft.maxTokens}
                  onChange={(event) => updateDraft({ maxTokens: safeNumber(event.target.value, DEFAULT_MODEL_SETTINGS.maxTokens) })}
                />
              </Row>
              <Row label="输出模式">
                <Segmented value={draft.outputMode} options={outputModeOptions} onChange={(value) => updateDraft({ outputMode: value })} label="输出模式" />
              </Row>
            </>
          )}
        </Section>
      </div>
    </>
  );
}
function TerminalSettingsPage({ settings, onBack, onRequestLeave, onSave }) {
  const [draft, setDraft] = useState(settings.terminal || { wsUrl: "", token: "" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.terminal);

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <>
      <SubHeader title="终端" onBack={() => onRequestLeave(dirty, onBack)} actionLabel="保存" onAction={() => onSave(draft)} />
      <div className="settings-scroll">
        <Section title="连接">
          <Row label="WebSocket 地址" sub="Cloudflare Tunnel 暴露的终端服务地址">
            <input
              className="settings-control"
              value={draft.wsUrl}
              onChange={(event) => updateDraft({ wsUrl: event.target.value })}
              placeholder="wss://your-tunnel-domain/term"
            />
          </Row>
          <Row label="访问令牌">
            <input
              className="settings-control"
              type="password"
              value={draft.token}
              onChange={(event) => updateDraft({ token: event.target.value })}
            />
          </Row>
        </Section>
      </div>
    </>
  );
}
function PersonaPromptPage({ settings, onBack, onRequestLeave, onSave, showToast }) {
  const initialPrompt = settings.prompt.mode === "custom" ? settings.prompt.customSystemPrompt : DEFAULT_SYSTEM_PROMPT;
  const [promptText, setPromptText] = useState(initialPrompt);
  const [nameDraft, setNameDraft] = useState({
    duName: settings.ui.duName || DEFAULT_UI_SETTINGS.duName,
    userName: settings.ui.userName || DEFAULT_UI_SETTINGS.userName,
  });
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const draft = normalizePromptDraft({ mode: promptText === DEFAULT_SYSTEM_PROMPT ? "default" : "custom", customSystemPrompt: promptText });
  const currentNameDraft = {
    duName: settings.ui.duName || DEFAULT_UI_SETTINGS.duName,
    userName: settings.ui.userName || DEFAULT_UI_SETTINGS.userName,
  };
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(settings.prompt) ||
    JSON.stringify(nameDraft) !== JSON.stringify(currentNameDraft);
  const isCustom = draft.mode === "custom";

  const updateNameDraft = (patch) => {
    setNameDraft((current) => ({ ...current, ...patch }));
  };

  const save = () => {
    onSave(draft, nameDraft);
    showToast("已保存");
  };

  const restoreDefault = () => {
    setPromptText(DEFAULT_SYSTEM_PROMPT);
    setPreview("");
  };

  const restoreDefaultNames = () => {
    setNameDraft({
      duName: DEFAULT_UI_SETTINGS.duName,
      userName: DEFAULT_UI_SETTINGS.userName,
    });
  };

  const copyPrompt = async () => {
    const ok = await copyText(promptText);
    showToast(ok ? "已复制" : "复制失败");
  };

  const previewPrompt = async () => {
    setLoadingPreview(true);
    try {
      const limit = safeNumber(settings.memory.injectedMemoryLimit, DEFAULT_MEMORY_SETTINGS.injectedMemoryLimit);
      const [memories, emotion] = await Promise.all([getInjectedMemories(limit, settings.memory), getEmotionState()]);
      setPreview(buildSystemPrompt(memories, emotion, draft, settings.memory));
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <>
      <SubHeader title="人格" onBack={() => onRequestLeave(dirty, onBack)} actionLabel="保存" onAction={save} />
      <div className="settings-scroll">
        <button
          className="settings-fold-button persona-name-toggle"
          type="button"
          onClick={() => setNameEditorOpen((value) => !value)}
          aria-expanded={nameEditorOpen}
        >
          <span>修改名字</span>
          <span>{nameEditorOpen ? "收起" : "展开"}</span>
        </button>
        {nameEditorOpen && (
          <Section title="修改名字">
            <Row label="机的名字" sub="只影响本地界面显示，不改变角色语义">
              <input
                className="settings-control"
                value={nameDraft.duName}
                maxLength={8}
                onChange={(event) => updateNameDraft({ duName: event.target.value })}
              />
            </Row>
            <Row label="我的名字" sub="聊天界面、引用和本地纸条会使用这个名字">
              <input
                className="settings-control"
                value={nameDraft.userName}
                maxLength={8}
                onChange={(event) => updateNameDraft({ userName: event.target.value })}
              />
            </Row>
            <Row label="恢复默认名字">
              <button className="ghost-button" type="button" onClick={restoreDefaultNames}>
                恢复
              </button>
            </Row>
          </Section>
        )}
        <div className="persona-status-row">{isCustom ? "自定义提示词" : "默认提示词"}</div>
        <textarea
          className="persona-textarea"
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          spellCheck="false"
        />
        <div className="settings-button-row">
          <button className="settings-action-button" type="button" onClick={save}>
            保存
          </button>
          <button className="ghost-button" type="button" onClick={restoreDefault}>
            恢复默认
          </button>
          <button className="ghost-button" type="button" onClick={copyPrompt}>
            复制
          </button>
          <button className="ghost-button" type="button" onClick={previewPrompt} disabled={loadingPreview}>
            {loadingPreview ? "预览中" : "预览"}
          </button>
        </div>

        <Section title="变量">
          <div className="settings-variable-list">
            <p>
              <code>{"{{MEMORY_BLOCK}}"}</code>：当前注入的长期记忆块
            </p>
            <p>
              <code>{"{{EMOTION_HINT}}"}</code>：当前情绪状态提示
            </p>
            <p>时间信息不写入固定 System Prompt，仍由 buildTimeContext 每次请求动态注入。</p>
            <p>删掉变量后对应信息不会注入。</p>
          </div>
        </Section>

        {preview && (
          <PreviewBlock title="最终提示词预览" value={preview} defaultOpen onCopy={copyText} onCopied={showToast} />
        )}
      </div>
    </>
  );
}

function PreviewBlock({ title, value, defaultOpen = false, onCopy, onCopied }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const copy = async () => {
    const ok = await onCopy(text);
    onCopied(ok ? "已复制" : "复制失败");
  };

  return (
    <details className="context-preview-block" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <button type="button" onClick={(event) => { event.preventDefault(); copy(); }}>
          复制
        </button>
      </summary>
      <pre>{text}</pre>
    </details>
  );
}

function AppearanceSettingsPage({ settings, onBack, onRequestLeave, onSave, showToast }) {
  const [draft, setDraft] = useState(settings.ui);
  const [avatarDetailsOpen, setAvatarDetailsOpen] = useState(false);
  const [backgroundDetailsOpen, setBackgroundDetailsOpen] = useState(false);
  const [surfaceDetailsOpen, setSurfaceDetailsOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.ui);

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const duBubbleColor = draft.duBubbleColor || getDefaultBubbleColor(draft.theme, "du");
  const userBubbleColor = draft.userBubbleColor || getDefaultBubbleColor(draft.theme, "user");
  const chatBubbleOpacity = Number(draft.chatBubbleOpacity);
  const chatBubbleBlur = Number(draft.chatBubbleBlur);

  const save = () => {
    onSave(draft);
    showToast("已保存");
  };

  const resetAvatarDefaults = () => {
    updateDraft({
      duAvatarImage: DEFAULT_UI_SETTINGS.duAvatarImage,
      userAvatarImage: DEFAULT_UI_SETTINGS.userAvatarImage,
      duAvatarOpacity: DEFAULT_UI_SETTINGS.duAvatarOpacity,
      userAvatarOpacity: DEFAULT_UI_SETTINGS.userAvatarOpacity,
    });
  };

  const resetBackgroundDefault = () => {
    updateDraft({
      chatBackgroundImage: DEFAULT_UI_SETTINGS.chatBackgroundImage,
      chatBackgroundOpacity: DEFAULT_UI_SETTINGS.chatBackgroundOpacity,
      chatBackgroundBlur: DEFAULT_UI_SETTINGS.chatBackgroundBlur,
    });
  };

  const resetBubbleDefaults = () => {
    updateDraft({
      duBubbleColor: DEFAULT_UI_SETTINGS.duBubbleColor,
      userBubbleColor: DEFAULT_UI_SETTINGS.userBubbleColor,
      chatBubbleOpacity: DEFAULT_UI_SETTINGS.chatBubbleOpacity,
      chatBubbleBlur: DEFAULT_UI_SETTINGS.chatBubbleBlur,
    });
  };

  const resetGlassDefaults = () => {
    updateDraft({
      chatHeaderColor: DEFAULT_UI_SETTINGS.chatHeaderColor,
      chatHeaderOpacity: DEFAULT_UI_SETTINGS.chatHeaderOpacity,
      chatHeaderBlur: DEFAULT_UI_SETTINGS.chatHeaderBlur,
      chatInputColor: DEFAULT_UI_SETTINGS.chatInputColor,
      chatInputOpacity: DEFAULT_UI_SETTINGS.chatInputOpacity,
      chatInputBlur: DEFAULT_UI_SETTINGS.chatInputBlur,
    });
  };

  return (
    <>
      <SubHeader title="外观" onBack={() => onRequestLeave(dirty, onBack)} actionLabel="保存" onAction={save} />
      <div className="settings-scroll">
        <Section title="主题">
          <Row label="日间 / 夜间">
            <Segmented
              value={draft.theme}
              options={["light", "dark"]}
              labels={{ light: "日间", dark: "夜间" }}
              onChange={(theme) => updateDraft({ theme })}
              label="主题"
            />
          </Row>
        </Section>

        <Section title="头像">
          <Row label="机的头像" sub="从本机导入图片，只保存在当前浏览器" stack>
            <ImageImportControl
              id="du-avatar-image"
              label="机头像"
              image={draft.duAvatarImage}
              opacity={draft.duAvatarOpacity}
              showAdjustments={avatarDetailsOpen}
              onImageChange={(duAvatarImage) => updateDraft({ duAvatarImage })}
              onOpacityChange={(duAvatarOpacity) => updateDraft({ duAvatarOpacity })}
              onClear={() => updateDraft({ duAvatarImage: DEFAULT_UI_SETTINGS.duAvatarImage })}
              onError={showToast}
            />
          </Row>
          <Row label="我的头像" sub="从本机导入图片，只影响本地聊天界面" stack>
            <ImageImportControl
              id="user-avatar-image"
              label="我的头像"
              image={draft.userAvatarImage}
              opacity={draft.userAvatarOpacity}
              showAdjustments={avatarDetailsOpen}
              onImageChange={(userAvatarImage) => updateDraft({ userAvatarImage })}
              onOpacityChange={(userAvatarOpacity) => updateDraft({ userAvatarOpacity })}
              onClear={() => updateDraft({ userAvatarImage: DEFAULT_UI_SETTINGS.userAvatarImage })}
              onError={showToast}
            />
          </Row>
          <button className="settings-fold-button" type="button" onClick={() => setAvatarDetailsOpen((value) => !value)} aria-expanded={avatarDetailsOpen}>
            <span>头像细节</span>
            <span>{avatarDetailsOpen ? "收起" : "展开"}</span>
          </button>
          {avatarDetailsOpen && (
            <Row label="恢复默认头像">
              <button className="ghost-button" type="button" onClick={resetAvatarDefaults}>
                恢复
              </button>
            </Row>
          )}
        </Section>

        <Section title="聊天背景">
          <Row label="背景图片" sub="从本机导入图片，只改变聊天主界面" stack>
            <ImageImportControl
              id="chat-background-image"
              label="背景"
              variant="background"
              image={draft.chatBackgroundImage}
              opacity={draft.chatBackgroundOpacity}
              blur={draft.chatBackgroundBlur}
              showAdjustments={backgroundDetailsOpen}
              onImageChange={(chatBackgroundImage) => updateDraft({ chatBackgroundImage })}
              onOpacityChange={(chatBackgroundOpacity) => updateDraft({ chatBackgroundOpacity })}
              onBlurChange={(chatBackgroundBlur) => updateDraft({ chatBackgroundBlur })}
              onClear={() => updateDraft({ chatBackgroundImage: DEFAULT_UI_SETTINGS.chatBackgroundImage })}
              onError={showToast}
            />
          </Row>
          <button className="settings-fold-button" type="button" onClick={() => setBackgroundDetailsOpen((value) => !value)} aria-expanded={backgroundDetailsOpen}>
            <span>背景细节</span>
            <span>{backgroundDetailsOpen ? "收起" : "展开"}</span>
          </button>
          {backgroundDetailsOpen && (
            <Row label="恢复默认背景">
              <button className="ghost-button" type="button" onClick={resetBackgroundDefault}>
                恢复
              </button>
            </Row>
          )}
        </Section>

        <Section title="对话框">
          <Row label="对话框颜色" sub="调整聊天里机和我的消息气泡颜色" stack>
            <BubbleColorControl
              duColor={duBubbleColor}
              userColor={userBubbleColor}
              opacity={chatBubbleOpacity}
              blur={chatBubbleBlur}
              onDuColorChange={(duBubbleColor) => updateDraft({ duBubbleColor })}
              onOpacityChange={(chatBubbleOpacity) => updateDraft({ chatBubbleOpacity })}
              onBlurChange={(chatBubbleBlur) => updateDraft({ chatBubbleBlur })}
              onUserColorChange={(userBubbleColor) => updateDraft({ userBubbleColor })}
            />
          </Row>
          <Row label="恢复默认对话框">
            <button className="ghost-button" type="button" onClick={resetBubbleDefaults}>
              恢复
            </button>
          </Row>
        </Section>

        <Section title="更多细节">
          <button className="settings-fold-button" type="button" onClick={() => setSurfaceDetailsOpen((value) => !value)} aria-expanded={surfaceDetailsOpen}>
            <span>顶端栏和输入框玻璃</span>
            <span>{surfaceDetailsOpen ? "收起" : "展开"}</span>
          </button>
          {surfaceDetailsOpen && (
            <>
              <Row label="顶端栏" sub="设置聊天顶部栏的颜色、透明度和磨砂强度" stack>
                <SurfaceStyleControl
                  label="顶端栏"
                  color={draft.chatHeaderColor}
                  opacity={draft.chatHeaderOpacity}
                  blur={draft.chatHeaderBlur}
                  onColorChange={(chatHeaderColor) => updateDraft({ chatHeaderColor })}
                  onOpacityChange={(chatHeaderOpacity) => updateDraft({ chatHeaderOpacity })}
                  onBlurChange={(chatHeaderBlur) => updateDraft({ chatHeaderBlur })}
                />
              </Row>
              <Row label="输入框" sub="设置聊天底部输入区的颜色、透明度和磨砂强度" stack>
                <SurfaceStyleControl
                  label="输入框"
                  color={draft.chatInputColor}
                  opacity={draft.chatInputOpacity}
                  blur={draft.chatInputBlur}
                  onColorChange={(chatInputColor) => updateDraft({ chatInputColor })}
                  onOpacityChange={(chatInputOpacity) => updateDraft({ chatInputOpacity })}
                  onBlurChange={(chatInputBlur) => updateDraft({ chatInputBlur })}
                />
              </Row>
              <Row label="恢复默认玻璃">
                <button className="ghost-button" type="button" onClick={resetGlassDefaults}>
                  恢复
                </button>
              </Row>
            </>
          )}
        </Section>
      </div>
    </>
  );
}

function MemoryContextSettingsPage({ settings, onBack, onRequestLeave, onSave, showToast, refreshLogs }) {
  const [draftMemory, setDraftMemory] = useState(settings.memory);
  const [draftTransport, setDraftTransport] = useState(settings.transport || DEFAULT_TRANSPORT_SETTINGS);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const dirty =
    JSON.stringify(draftMemory) !== JSON.stringify(settings.memory) ||
    JSON.stringify(draftTransport) !== JSON.stringify(settings.transport || DEFAULT_TRANSPORT_SETTINGS);

  const updateMemory = (patch) => {
    setDraftMemory((current) => ({ ...current, ...patch }));
  };

  const updateTransport = (patch) => {
    setDraftTransport((current) => ({ ...current, ...patch }));
  };

  const save = () => {
    onSave(draftMemory, draftTransport);
    showToast("已保存");
  };

  const generatePreview = async () => {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const memoryLimit = safeNumber(draftMemory.injectedMemoryLimit, DEFAULT_MEMORY_SETTINGS.injectedMemoryLimit);
      const recentLimit = safeNumber(draftMemory.recentMessageLimit, DEFAULT_MEMORY_SETTINGS.recentMessageLimit);
      const [memories, emotion, recent] = await Promise.all([
        getInjectedMemories(memoryLimit, draftMemory),
        getEmotionState(),
        getRecentMessages(recentLimit),
      ]);
      const recentMessages = recent.map((message) => ({
        role: message.role,
        content: message.content,
        created_at: message.created_at,
      }));
      const nextPreview = buildContextPreview({
        memories,
        emotion,
        recentMessages,
        modelSettings: settings.model,
        memorySettings: draftMemory,
        promptSettings: settings.prompt,
      });
      setPreview(nextPreview);

      if (draftMemory.saveContextLogs !== false) {
        saveContextSnapshot({
          trigger: "manual_preview",
          provider: settings.model.provider,
          model: settings.model.model,
          sessionId: getSessionId(),
          systemPrompt: nextPreview.systemPrompt,
          timeContext: nextPreview.timeContext,
          memoryBlock: nextPreview.memoryBlock,
          injectedMemories: nextPreview.injectedMemories,
          emotionHint: nextPreview.emotionHint,
          recentMessages: nextPreview.recentMessages,
          chatTransport: draftTransport.chatTransport,
          outputMode: settings.model.outputMode,
          usage: null,
          responsePreview: "",
          error: null,
          status: "preview",
        });
        refreshLogs();
      }

      showToast("已生成");
    } catch {
      setPreviewError("上下文预览生成失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <SubHeader title="记忆与上下文" onBack={() => onRequestLeave(dirty, onBack)} actionLabel="保存" onAction={save} />
      <div className="settings-scroll">
        <Section title="记忆参数">
          <Row label={<LabelWithHelp topic="memoryMode">Memory Mode</LabelWithHelp>} sub="kiwi_managed 下长期记忆由 kiwi-mem 接管">
            <Segmented value={draftMemory.memoryMode} options={["mock", "kiwi_managed"]} onChange={(value) => updateMemory({ memoryMode: value })} label="Memory Mode" />
          </Row>
          {draftMemory.memoryMode === "kiwi_managed" && <InlineNotice>kiwi_managed 下前端不读取 kiwi 内部记忆，也不注入 mock 长期记忆。</InlineNotice>}
          <Row label={<LabelWithHelp topic="chatTransport">Chat Transport</LabelWithHelp>} sub="kiwi_direct 会请求本机 kiwi-mem；gateway 仍为未来占位" stack>
            <Segmented
              value={draftTransport.chatTransport}
              options={chatTransportOptions}
              labels={chatTransportLabels}
              onChange={(value) => updateTransport({ chatTransport: value })}
              label="Chat Transport"
            />
          </Row>
          {draftTransport.chatTransport === "kiwi_direct" && <InlineNotice>kiwi_direct 会请求本机 kiwi-mem；建议搭配 Kiwi Local 与 kiwi_managed。</InlineNotice>}
          {draftTransport.chatTransport === "backend_gateway" && <InlineNotice>backend_gateway 仅保存未来接口占位。本轮不会请求 Node / Express 后端。</InlineNotice>}
          <Row label="注入记忆数量">
            <input
              className="settings-control"
              type="number"
              min="1"
              max="30"
              value={draftMemory.injectedMemoryLimit}
              onChange={(event) => updateMemory({ injectedMemoryLimit: safeNumber(event.target.value, DEFAULT_MEMORY_SETTINGS.injectedMemoryLimit) })}
            />
          </Row>
          <Row label="最近消息数量">
            <input
              className="settings-control"
              type="number"
              min="1"
              max="80"
              value={draftMemory.recentMessageLimit}
              onChange={(event) => updateMemory({ recentMessageLimit: safeNumber(event.target.value, DEFAULT_MEMORY_SETTINGS.recentMessageLimit) })}
            />
          </Row>
        </Section>

        <Section title="上下文">
          <button className="settings-entry-row" type="button" onClick={generatePreview} disabled={previewLoading}>
            <span>
              <strong>{previewLoading ? "生成中" : "生成一次上下文预览"}</strong>
              <small>不调用模型，不写入聊天消息</small>
            </span>
            <span className="settings-entry-arrow">›</span>
          </button>
          <EntryRow title="查看最近注入日志" sub="本地最近 10 条" onClick={() => onRequestLeave(dirty, () => onBack("logs"))} />
        </Section>

        {previewError && <InlineNotice tone="error">{previewError}</InlineNotice>}
        {preview && (
          <section className="context-preview">
            <PreviewBlock title="System Prompt" value={preview.systemPrompt} defaultOpen onCopy={copyText} onCopied={showToast} />
            <PreviewBlock title="Time Context" value={preview.timeContext} onCopy={copyText} onCopied={showToast} />
            <PreviewBlock title="Memory Block" value={preview.memoryBlock} onCopy={copyText} onCopied={showToast} />
            <PreviewBlock title="Emotion Hint" value={preview.emotionHint} onCopy={copyText} onCopied={showToast} />
            <PreviewBlock title="Recent Messages" value={formatMessages(preview.recentMessages)} onCopy={copyText} onCopied={showToast} />
          </section>
        )}
      </div>
    </>
  );
}

function ContextLogsPage({ logs, onBack, onClear, showToast }) {
  const [expandedId, setExpandedId] = useState("");

  const copyLog = async (log) => {
    const ok = await copyText(JSON.stringify(sanitizeContextLog(log), null, 2));
    showToast(ok ? "已复制" : "复制失败");
  };

  return (
    <>
      <SubHeader title="最近注入日志" onBack={onBack} actionLabel="清空" onAction={onClear} />
      <div className="settings-scroll">
        {!logs.length && <p className="settings-empty">暂无上下文日志。</p>}
        <div className="context-log-list">
          {logs.map((log) => (
            <article className="context-log-item" key={log.id}>
              <button type="button" onClick={() => setExpandedId(expandedId === log.id ? "" : log.id)}>
                <span>
                  <strong>{formatDateTime(log.createdAt)}</strong>
                  <small>
                    {triggerLabels[log.trigger] || log.trigger} · {log.chatTransport || "mock"} · {providerLabel(log.provider)} · {log.model || "未填写"}
                  </small>
                </span>
                <span className={`settings-status is-${log.status}`}>{statusLabels[log.status]}</span>
              </button>
              <div className="context-log-meta">
                <span>memory {log.injectedMemories?.length || 0}</span>
                <span>recent {log.recentMessages?.length || 0}</span>
                <span>{formatUsage(log.usage)}</span>
              </div>
              {expandedId === log.id && (
                <div className="context-log-detail">
                  <PreviewBlock title="systemPrompt" value={log.systemPrompt} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="timeContext" value={log.timeContext} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="memoryBlock" value={log.memoryBlock} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="emotionHint" value={log.emotionHint} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="recentMessages" value={formatMessages(log.recentMessages)} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="responsePreview" value={log.responsePreview || "无"} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="usage" value={log.usage || {}} onCopy={copyText} onCopied={showToast} />
                  <PreviewBlock title="error" value={log.error || "无"} onCopy={copyText} onCopied={showToast} />
                  <button className="settings-action-button" type="button" onClick={() => copyLog(log)}>
                    复制本条
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

function SecurityDataPage({ settings, logs, onBack, onClearModelKey, onClearLogs, onClearMessages, showToast }) {
  const [debugJson, setDebugJson] = useState("");

  const downloadJson = (text, fileName) => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportDebugInfo = async () => {
    const payload = {
      createdAt: new Date().toISOString(),
      model: {
        provider: settings.model.provider,
        model: settings.model.model,
        baseUrl: safeBaseUrl(settings.model.baseUrl),
        credentialStatus: hasApiKey(settings.model) ? "saved" : "missing",
      },
      memory: {
        memoryMode: settings.memory.memoryMode,
        injectedMemoryLimit: settings.memory.injectedMemoryLimit,
        recentMessageLimit: settings.memory.recentMessageLimit,
      },
      transport: {
        chatTransport: settings.transport?.chatTransport || DEFAULT_TRANSPORT_SETTINGS.chatTransport,
      },
      prompt: {
        mode: settings.prompt.mode,
        isCustom: settings.prompt.mode === "custom" && Boolean(settings.prompt.customSystemPrompt?.trim()),
      },
      contextLogs: logs.map(sanitizeContextLog),
    };
    const text = JSON.stringify(payload, null, 2);
    setDebugJson(text);

    try {
      downloadJson(text, "dukou-debug-redacted.json");
      window.localStorage?.setItem(LOCAL_EXPORT_TIME_KEY, new Date().toISOString());
      showToast("已导出");
    } catch {
      const ok = await copyText(text);
      showToast(ok ? "已复制" : "导出失败");
    }
  };

  const exportChatHistory = async () => {
    try {
      const text = await exportMessagesJson();
      downloadJson(text, `dukou-chat-history-${new Date().toISOString().slice(0, 10)}.json`);
      showToast("已导出");
    } catch {
      showToast("导出失败");
    }
  };

  return (
    <>
      <SubHeader title="安全与数据" onBack={onBack} />
      <div className="settings-scroll">
        <InlineNotice>只有 direct_model 会使用前端保存的 API Key；mock、kiwi_direct 和 backend_gateway 不要求在前端保存真实模型 key。</InlineNotice>
        <Section title="清理">
          <Row label="清除模型 API Key">
            <button className="danger-button" type="button" onClick={onClearModelKey}>
              清除
            </button>
          </Row>
          <Row label="清空上下文注入日志">
            <button className="danger-button" type="button" onClick={onClearLogs}>
              清空
            </button>
          </Row>
          <Row label="清空本地聊天记录" sub="清空本机 IndexedDB 聊天归档">
            <button className="danger-button" type="button" onClick={onClearMessages}>
              清空
            </button>
          </Row>
        </Section>
        <Section title="导出">
          <Row label="聊天记录 JSON" sub="本机 IndexedDB 归档">
            <button className="settings-action-button" type="button" onClick={exportChatHistory}>
              导出
            </button>
          </Row>
        </Section>
        <Section title="调试">
          <Row label="脱敏调试信息" sub="不包含 API key 或 headers">
            <button className="settings-action-button" type="button" onClick={exportDebugInfo}>
              导出
            </button>
          </Row>
        </Section>
        {debugJson && <PreviewBlock title="导出内容" value={debugJson} defaultOpen onCopy={copyText} onCopied={showToast} />}
      </div>
    </>
  );
}

function SystemOverviewPage({ settings, logs, localStats, modelStatus, onBack, onOpen }) {
  const chatTransport = settings.transport?.chatTransport || DEFAULT_TRANSPORT_SETTINGS.chatTransport;
  const latestLog = logs[0];
  const requestStatus = latestLog
    ? (statusLabels[latestLog.status] || latestLog.status) + ' · ' + (latestLog.trigger || 'manual_preview')
    : modelStatus.status === 'untested'
      ? '暂无'
      : connectionLabels[modelStatus.status] || modelStatus.status;

  return (
    <>
      <SubHeader title='系统总览' onBack={onBack} />
      <div className='settings-scroll'>
        <InlineNotice>这里仅显示当前前端能看到的运行状态，不读取旧记忆库，也不展示真实 API Key。</InlineNotice>
        <Section title='运行模式'>
          <div className='runtime-status-grid'>
            <StatusCard label='chatTransport' value={chatTransport} topic='chatTransport' />
            <StatusCard label='memoryMode' value={settings.memory.memoryMode} topic='memoryMode' />
            <StatusCard label='Provider / Model' value={providerLabel(settings.model.provider)} sub={settings.model.model || '未填写模型'} topic='providerModel' />
            <StatusCard label='Base URL' value={safeBaseUrl(settings.model.baseUrl)} topic='baseUrl' />
            <StatusCard label='API key 是否配置' value={hasApiKey(settings.model) ? '已配置' : '未配置'} topic='apiKeyConfigured' />
            <StatusCard label='最近一次请求' value={requestStatus} topic='contextLog' />
          </div>
        </Section>

        <Section title='最近上下文'>
          {latestLog ? (
            <div className='runtime-log-summary'>
              <DataRow label='触发来源' value={latestLog.trigger || 'manual_preview'} />
              <DataRow label='状态' value={statusLabels[latestLog.status] || latestLog.status} />
              <DataRow label='记忆 / 最近消息' value={String(latestLog.injectedMemories?.length || 0) + ' / ' + String(latestLog.recentMessages?.length || 0)} />
              <PreviewBlock title='systemPrompt 摘要' value={latestLog.systemPrompt ? '字数 ' + String(latestLog.systemPrompt.length) : '无'} onCopy={copyText} onCopied={() => {}} />
              <PreviewBlock title='recentMessages 摘要' value={'数量 ' + String(latestLog.recentMessages?.length || 0)} onCopy={copyText} onCopied={() => {}} />
              <PreviewBlock title='responsePreview' value={latestLog.responsePreview || '无'} onCopy={copyText} onCopied={() => {}} />
            </div>
          ) : (
            <p className='settings-empty'>暂无 contextLog。</p>
          )}
        </Section>

        <Section title='本地数据摘要'>
          <div className='runtime-data-list'>
            <DataRow label='当前聊天缓存' value={String(localStats.currentChatCacheCount || 0) + ' 条'} />
            <DataRow label='IndexedDB 归档' value={String(localStats.archiveVisibleCount || 0) + ' 条'} sub={localStats.archiveStatus} topic='indexedDbArchive' />
            <DataRow label='contextLogs' value={String(localStats.contextLogCount || 0) + ' 条'} topic='contextLog' />
            <DataRow label='功能页本地数据' value={String(localStats.functionDataCount || 0) + ' 项'} />
          </div>
        </Section>

        <Section title='修改入口'>
          <EntryRow title='模型接入' sub='修改 provider、model、baseUrl' onClick={() => onOpen('model')} />
          <EntryRow title='记忆与上下文' sub='修改 memoryMode 和 chatTransport' onClick={() => onOpen('memory')} />
        </Section>
      </div>
    </>
  );
}

function CapabilityCard({ title, status, children, topic }) {
  return (
    <article className='runtime-route-card'>
      <div className='runtime-route-head'>
        <strong>{title}</strong>
        <span>{status}</span>
        {topic ? <HelpMark topic={topic} /> : null}
      </div>
      <div className='runtime-data-list'>{children}</div>
    </article>
  );
}

function CapabilityRoutesPage({ settings, logs, onBack, onOpen }) {
  const chatTransport = settings.transport?.chatTransport || DEFAULT_TRANSPORT_SETTINGS.chatTransport;
  const latestLog = logs[0];
  const routeTopic = chatTransport === 'kiwi_direct' ? 'kiwiDirect' : chatTransport === 'backend_gateway' ? 'backendGateway' : 'chatTransport';

  return (
    <>
      <SubHeader title='前端能力路由' onBack={onBack} />
      <div className='settings-scroll'>
        <InlineNotice>主聊天是当前唯一真实可用的能力路由。生图和语音只做后端预留，不请求文件、录音或麦克风权限。</InlineNotice>
        <div className='runtime-route-list'>
          <CapabilityCard title='主聊天' status={getLatestRouteStatus(chatTransport)} topic={routeTopic}>
            <DataRow label='chatTransport' value={chatTransport} topic='chatTransport' />
            <DataRow label='provider / model' value={providerLabel(settings.model.provider) + ' / ' + (settings.model.model || '未填写')} />
            <DataRow label='最近一次请求' value={latestLog ? (statusLabels[latestLog.status] || latestLog.status) + ' · ' + (latestLog.chatTransport || chatTransport) : '暂无'} topic='contextLog' />
            <div className='runtime-link-row'>
              <button className='ghost-button' type='button' onClick={() => onOpen('model')}>模型接入</button>
              <button className='ghost-button' type='button' onClick={() => onOpen('memory')}>记忆与上下文</button>
            </div>
          </CapabilityCard>

          <CapabilityCard title='生图' status='后端预留，未接入' topic='imageRoute'>
            <DataRow label='未来 route' value='backend_gateway:image.generate' topic='imageRoute' />
            <DataRow label='API key' value='由未来后端管理，前端不保存' topic='apiKeyConfigured' />
            <DataRow label='当前行为' value='不调用真实生图 API' />
          </CapabilityCard>

          <CapabilityCard title='语音' status='后端预留，未接入' topic='voiceRoute'>
            <DataRow label='未来 route' value='backend_gateway:voice' topic='voiceRoute' />
            <DataRow label='未来能力' value='ASR / TTS / 录音占位' />
            <DataRow label='当前行为' value='不请求麦克风，不调用语音 API' />
          </CapabilityCard>
        </div>
      </div>
    </>
  );
}

function MemoryStatusPage({ settings, logs, onBack }) {
  const chatTransport = settings.transport?.chatTransport || DEFAULT_TRANSPORT_SETTINGS.chatTransport;
  const memoryConnection = getMemoryConnectionLabel(logs, chatTransport);
  const memoryRequest = logs.find((log) => ['kiwi_direct', 'backend_gateway'].includes(log.chatTransport));
  const usesMemoryGateway = ['kiwi_direct', 'backend_gateway'].includes(chatTransport) ? chatTransport : '否';
  const memoryTopic = chatTransport === 'kiwi_direct' ? 'kiwiDirect' : 'backendGateway';

  return (
    <>
      <SubHeader title='记忆库状态' onBack={onBack} />
      <div className='settings-scroll'>
        <InlineNotice>记忆库状态只显示AI 陪伴前端是否正在把长期记忆交给外部记忆网关处理。这里不是记忆编辑后台。</InlineNotice>
        <Section title='当前状态'>
          <div className='runtime-status-grid'>
            <StatusCard label='当前记忆模式' value={settings.memory.memoryMode} topic='memoryMode' />
            <StatusCard label='聊天通道是否走记忆库' value={usesMemoryGateway} topic={memoryTopic} />
            <StatusCard label='记忆库连接状态' value={memoryConnection} />
            <StatusCard label='当前 Base URL' value={safeBaseUrl(settings.model.baseUrl)} topic='baseUrl' />
            <StatusCard label='长期记忆接管' value={settings.memory.memoryMode === 'kiwi_managed' ? '已交给外部记忆网关' : '未接管'} topic='memoryOwnership' />
            <StatusCard label='Dream / digest' value={settings.memory.memoryMode === 'kiwi_managed' ? '由记忆库管理' : '未接入 / 占位'} topic='dreamDigest' />
          </div>
        </Section>
        <Section title='最近记忆库请求'>
          {memoryRequest ? (
            <div className='runtime-data-list'>
              <DataRow label='通道' value={memoryRequest.chatTransport} topic={memoryRequest.chatTransport === 'kiwi_direct' ? 'kiwiDirect' : 'backendGateway'} />
              <DataRow label='状态' value={statusLabels[memoryRequest.status] || memoryRequest.status} topic='contextLog' />
              <DataRow label='时间' value={formatDateTime(memoryRequest.createdAt)} />
            </div>
          ) : (
            <p className='settings-empty'>暂无 kiwi_direct 或 backend_gateway 相关请求记录。</p>
          )}
        </Section>
      </div>
    </>
  );
}

function GatewayContractRow({ method, path, topic }) {
  return (
    <div className='gateway-contract-row'>
      <code>{method} {path}</code>
      <HelpMark topic={topic} />
    </div>
  );
}

function BackendGatewayPage({ onBack }) {
  return (
    <>
      <SubHeader title='Backend Gateway' onBack={onBack} />
      <div className='settings-scroll'>
        <InlineNotice>本页只做未来后端占位和边界说明。本轮不创建 Node / Express 后端，也不请求真实 /api/*。</InlineNotice>
        <Section title='网关占位'>
          <div className='runtime-status-grid'>
            <StatusCard label='连接状态' value='未接入' sub='未来检测 /api/health' topic='apiHealth' />
            <StatusCard label='配置状态' value='未接入' sub='未来读取和修改后端配置' topic='apiAdminConfig' />
            <StatusCard label='子代理模型' value='占位' sub='summary / diary / emotion / tool' topic='subAgentModels' />
            <StatusCard label='后端工具' value='占位' sub='Obsidian、MCP、唤醒、生图、语音、通知' topic='backendTools' />
          </div>
        </Section>
        <Section title='最小接口契约'>
          <div className='gateway-contract-list'>
            <GatewayContractRow method='GET' path='/api/health' topic='apiHealth' />
            <GatewayContractRow method='GET' path='/api/admin/status' topic='apiAdminStatus' />
            <GatewayContractRow method='GET' path='/api/admin/config' topic='apiAdminConfig' />
            <GatewayContractRow method='PATCH' path='/api/admin/config' topic='apiAdminConfig' />
            <GatewayContractRow method='POST' path='/v1/chat/completions' topic='apiChatCompletions' />
            <GatewayContractRow method='GET' path='/api/memory/status' topic='apiMemoryStatus' />
            <GatewayContractRow method='GET' path='/api/memory/preview' topic='apiMemoryPreview' />
          </div>
        </Section>
      </div>
    </>
  );
}

function LocalDataAndLogsPage({ localStats, logs, onBack, onRefresh, onClearContextLogs, onClearMessages, onClearFunctionData, onClearAll }) {
  const chartItems = [
    { label: '聊天归档', value: localStats.archiveVisibleCount || 0, unit: '条' },
    { label: 'contextLogs', value: logs.length, unit: '条' },
    { label: '功能页数据', value: localStats.functionDataCount || 0, unit: '项' },
  ];
  const maxChartValue = Math.max(...chartItems.map((item) => item.value), 0);

  return (
    <>
      <SubHeader title='本地数据与日志' onBack={onBack} actionLabel='刷新' onAction={onRefresh} />
      <div className='settings-scroll'>
        <InlineNotice>这里显示和清理的只是当前设备上的前端数据，不会清理记忆库、未来后端、模型服务或项目文件。</InlineNotice>
        <Section title='本机状态'>
          <div className='runtime-data-list'>
            <DataRow label='当前聊天缓存数量' value={String(localStats.currentChatCacheCount || 0) + ' 条'} />
            <DataRow label='IndexedDB 历史归档' value={String(localStats.archiveVisibleCount || 0) + ' 条'} sub={localStats.archiveStatus} topic='indexedDbArchive' />
            <DataRow label='contextLogs' value={String(logs.length) + ' 条'} topic='contextLog' />
            <DataRow label='潮汐标本' value={String(localStats.keepsakeCount || 0) + ' 条'} />
            <DataRow label='功能页本地数据' value={String(localStats.functionDataCount || 0) + ' 项'} />
            <DataRow label='UI settings' value={localStats.uiSettingsExists ? '存在' : '不存在'} />
            <DataRow label='localUserId' value={localStats.localUserIdExists ? '存在' : '不存在'} />
            <DataRow label='最近一次导出' value={localStats.lastExportAt ? formatDateTime(localStats.lastExportAt) : '暂无'} />
          </div>
        </Section>
        <Section title='数量图'>
          <div className='runtime-chart-note'>条长表示这三类本地数据的相对数量；最长的一条是当前最多的数据，不代表容量上限。</div>
          <div className='runtime-bar-list'>
            {chartItems.map((item) => {
              const barSize = item.value > 0 && maxChartValue > 0 ? String(Math.max(8, Math.round((item.value / maxChartValue) * 100))) + '%' : '0%';
              return (
                <div className='runtime-bar-row' key={item.label} style={{ '--bar-size': barSize }}>
                  <span>{item.label}</span>
                  <i aria-hidden='true' />
                  <strong>{item.value} {item.unit}</strong>
                </div>
              );
            })}
          </div>
        </Section>
        <Section title='危险区'>
          <div className='danger-zone-copy'>清理按钮只影响本机前端数据。单项清理会二次确认，全量清理需要三次确认。</div>
          <Row label={<LabelWithHelp topic='localClearContextLogs'>清空上下文日志</LabelWithHelp>} sub='系统状态页将看不到最近请求预览，但不会删除聊天记录'>
            <button className='danger-button' type='button' onClick={onClearContextLogs}>清空</button>
          </Row>
          <Row label={<LabelWithHelp topic='localClearMessages'>清空聊天归档</LabelWithHelp>} sub='当前设备上的聊天缓存会消失，不能从前端恢复'>
            <button className='danger-button' type='button' onClick={onClearMessages}>清空</button>
          </Row>
          <Row label={<LabelWithHelp topic='localClearFunctionData'>清空功能页本地数据</LabelWithHelp>} sub='动态、明信片、提醒、日程、周期和书影本机记录会清空'>
            <button className='danger-button' type='button' onClick={onClearFunctionData}>清空</button>
          </Row>
          <Row label={<LabelWithHelp topic='localClearAll'>清空全部本地数据</LabelWithHelp>} sub='清空当前浏览器里的AI 陪伴前端数据，不清理后端或记忆库'>
            <button className='danger-button' type='button' onClick={onClearAll}>清空全部</button>
          </Row>
        </Section>
      </div>
    </>
  );
}

function SettingsConfirmDialog({ dialog, onCancel, onConfirm, onInputChange }) {
  if (!dialog) return null;

  const totalSteps = dialog.messages.length + (dialog.finalText ? 1 : 0);
  const currentStep = Math.min(dialog.step + 1, totalSteps);
  const inputStep = Boolean(dialog.finalText) && dialog.step >= dialog.messages.length;
  const message = inputStep ? '请输入确认文字后再清空。' : dialog.messages[dialog.step];
  const inputMatches = inputStep ? dialog.inputValue === dialog.finalText : true;
  const finalStep = dialog.step >= totalSteps - 1;

  return (
    <div className='settings-confirm-layer' role='presentation' onClick={onCancel}>
      <section
        className='settings-confirm-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='settings-confirm-title'
        aria-describedby='settings-confirm-message'
        onClick={(event) => event.stopPropagation()}
      >
        <small>确认 {currentStep} / {totalSteps}</small>
        <h2 id='settings-confirm-title'>{dialog.title}</h2>
        <p id='settings-confirm-message'>{message}</p>
        {inputStep ? (
          <label className='settings-confirm-input-wrap'>
            <span>输入「{dialog.finalText}」</span>
            <input
              autoFocus
              value={dialog.inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && inputMatches) onConfirm();
              }}
            />
          </label>
        ) : null}
        <div className='settings-confirm-actions'>
          <button type='button' onClick={onCancel}>取消</button>
          <button type='button' className='is-danger' onClick={onConfirm} disabled={!inputMatches}>
            {finalStep ? dialog.confirmLabel : '继续'}
          </button>
        </div>
      </section>
    </div>
  );
}
function AboutPage({ onBack }) {
  return (
    <>
      <SubHeader title="关于" onBack={onBack} />
      <div className="settings-scroll">
        <Section title="关于">
          <Row label="AI 陪伴前端">
            <span className="settings-value">DUKOU 0.1.0</span>
          </Row>
        </Section>
      </div>
    </>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(() => getSettings());
  const [page, setPage] = useState("home");
  const [homeScrollTop, setHomeScrollTop] = useState(0);
  const [toast, setToast] = useState("");
  const [logs, setLogs] = useState(() => getContextLogs());
  const [modelStatus, setModelStatus] = useState({ status: "untested", message: "" });
  const [localStats, setLocalStats] = useState(() => ({
    currentChatCacheCount: 0,
    archiveStatus: "未检测",
    archiveVisibleCount: 0,
    archiveTotalCount: 0,
    contextLogCount: logs.length,
    keepsakeCount: 0,
    functionDataCount: 0,
    functionDetails: [],
    uiSettingsExists: false,
    localUserIdExists: false,
    lastExportAt: "",
    dukouLocalKeyCount: 0,
  }));

  const [clearDialog, setClearDialog] = useState(null);

  const refreshLocalStats = async () => {
    const nextStats = await loadLocalDataStats(getContextLogs());
    setLocalStats(nextStats);
    return nextStats;
  };

  useEffect(() => {
    let active = true;
    loadLocalDataStats(logs).then((nextStats) => {
      if (active) setLocalStats(nextStats);
    });
    return () => {
      active = false;
    };
  }, [logs, settings]);

  const showToast = (message) => {
    setToast(message);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setToast((current) => (current === message ? "" : current));
      }, 1800);
    }
  };

  const persist = (next) => {
    const saved = saveSettings(next);
    setSettings(saved);
    return saved;
  };

  const refreshLogs = () => {
    setLogs(getContextLogs());
  };

  const runModelTest = async (modelSettings = settings.model) => {
    setModelStatus({ status: "testing", message: "正在测试模型..." });
    const transportSettings = settings.transport || DEFAULT_TRANSPORT_SETTINGS;
    const snapshot = saveContextSnapshot({
      trigger: "test_model",
      provider: modelSettings.provider,
      model: modelSettings.model,
      sessionId: getSessionId(),
      systemPrompt: "只回复 OK。",
      timeContext: "",
      memoryBlock: "",
      injectedMemories: [],
      emotionHint: "",
      recentMessages: [{ role: "user", content: "ping" }],
      chatTransport: transportSettings.chatTransport,
      outputMode: modelSettings.outputMode,
      usage: null,
      responsePreview: "",
      error: null,
      status: "preview",
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    const result = await sendChatRequest({
      messages: [{ role: "user", content: "ping" }],
      systemPrompt: "只回复 OK。",
      modelSettings,
      transportSettings,
      signal: controller.signal,
      mockText: "OK",
    });
    window.clearTimeout(timeoutId);

    if (result.ok) {
      updateContextSnapshot(snapshot?.id, {
        status: "success",
        usage: result.usage,
        responsePreview: result.text,
        error: null,
      });
      setModelStatus({
        status: "success",
        message: transportSettings.chatTransport === "mock" ? "当前是 mock，本次没有请求真实模型。" : "模型连接可用。",
      });
    } else {
      updateContextSnapshot(snapshot?.id, {
        status: "error",
        usage: result.usage,
        error: result.error?.message || "模型请求失败",
      });
      setModelStatus({ status: "error", message: result.error?.message || "模型请求失败" });
    }

    refreshLogs();
    return result;
  };

  const requestClearConfirm = ({ title, messages, finalText = '', confirmLabel = '确认清空' }) =>
    new Promise((resolve) => {
      setClearDialog({
        title,
        messages,
        finalText,
        confirmLabel,
        step: 0,
        inputValue: '',
        resolve,
      });
    });

  const cancelClearConfirm = () => {
    if (!clearDialog) return;
    const resolve = clearDialog.resolve;
    setClearDialog(null);
    resolve(false);
  };

  const advanceClearConfirm = () => {
    if (!clearDialog) return;
    const totalSteps = clearDialog.messages.length + (clearDialog.finalText ? 1 : 0);
    const inputStep = Boolean(clearDialog.finalText) && clearDialog.step >= clearDialog.messages.length;
    if (inputStep && clearDialog.inputValue !== clearDialog.finalText) return;

    if (clearDialog.step >= totalSteps - 1) {
      const resolve = clearDialog.resolve;
      setClearDialog(null);
      resolve(true);
      return;
    }

    setClearDialog({ ...clearDialog, step: clearDialog.step + 1, inputValue: '' });
  };

  const updateClearConfirmInput = (inputValue) => {
    setClearDialog((dialog) => (dialog ? { ...dialog, inputValue } : dialog));
  };

  const requestLeaveConfirm = async (dirty, onLeave) => {
    if (!dirty) {
      onLeave();
      return;
    }

    const confirmed = await requestClearConfirm({
      title: '离开未保存页面',
      messages: ['当前页面有未保存修改，离开后这些修改不会保存。是否继续？'],
      confirmLabel: '离开',
    });
    if (confirmed) onLeave();
  };

  const clearAllLogs = async () => {
    const confirmed = await requestClearConfirm({
      title: '清空上下文日志',
      messages: [
        '清空上下文日志后，系统状态页将看不到最近请求的 prompt 预览和错误记录，但不会删除聊天记录。是否继续？',
        '这次清理只影响本机前端日志，不会清理记忆库、后端或模型服务里的数据。确认继续？',
      ],
      confirmLabel: '清空日志',
    });
    if (!confirmed) return;
    clearContextLogs();
    refreshLogs();
    refreshLocalStats();
    showToast('已清空');
  };

  const clearMessages = async () => {
    const confirmed = await requestClearConfirm({
      title: '清空聊天归档',
      messages: [
        '清空后，当前设备上的聊天缓存会消失。你仍然可以继续聊天，但这些本地记录不能从前端恢复。是否继续？',
        '这次清理只影响本机前端数据，不会清理记忆库、后端或模型服务里的数据。确认继续清理本地聊天归档？',
      ],
      confirmLabel: '清空归档',
    });
    if (!confirmed) return;
    await clearLocalMessages();
    refreshLocalStats();
    showToast('已清空');
  };

  const clearFunctionData = async () => {
    const confirmed = await requestClearConfirm({
      title: '清空功能页本地数据',
      messages: [
        '清空功能页本地数据后，动态、明信片、提醒、日程、周期和书影本机记录会消失。是否继续？',
        '这次清理只影响本机功能页数据，不会清理聊天归档、记忆库或后端。确认继续？',
      ],
      confirmLabel: '清空功能数据',
    });
    if (!confirmed) return;
    clearFunctionLocalStore();
    refreshLocalStats();
    showToast('已清空');
  };

  const clearModelKey = async () => {
    const confirmed = await requestClearConfirm({
      title: '清除模型 API Key',
      messages: [
        '清除后，direct_model 将不能继续使用当前前端保存的模型 API Key。是否继续？',
        '这次清理只影响本机前端设置，不会清理后端、记忆库或模型服务里的数据。确认继续？',
      ],
      confirmLabel: '清除 Key',
    });
    if (!confirmed) return;
    setSettings(clearModelApiKey());
    setModelStatus({ status: "untested", message: "" });
    refreshLocalStats();
    showToast("已清除");
  };

  const clearAllLocalData = async () => {
    const confirmed = await requestClearConfirm({
      title: '清空全部本地数据',
      messages: [
        '清空后，当前设备上的聊天缓存、设置、上下文日志和功能页本地数据都会消失。你仍然可以继续使用AI 陪伴前端，但这些本地记录不能从前端恢复。是否继续？',
        '这次清理只影响本机前端数据，不会清理记忆库、后端或模型服务里的数据。确认继续清理本地数据？',
      ],
      finalText: '清空本地数据',
      confirmLabel: '清空全部',
    });
    if (!confirmed) return;
    await clearLocalMessages();
    removeDukouLocalStorage();
    const nextSettings = getSettings();
    setSettings(nextSettings);
    setLogs(getContextLogs());
    setModelStatus({ status: 'untested', message: '' });
    refreshLocalStats();
    showToast('已清空');
  };
  const toggleTheme = () => {
    const theme = settings.ui.theme === "dark" ? "light" : "dark";
    persist({ ...settings, ui: { ...settings.ui, theme } });
  };

  return (
    <section className="settings-root">
      {page === "home" && (
        <SettingsHome
          settings={settings}
          modelStatus={modelStatus}
          homeScrollTop={homeScrollTop}
          onHomeScrollChange={setHomeScrollTop}
          onOpen={setPage}
          onTest={() => runModelTest(settings.model)}
          onToggleTheme={toggleTheme}
        />
      )}
      {page === "model" && (
        <ModelSettingsPage
          settings={settings}
          modelStatus={modelStatus}
          onBack={() => setPage("home")}
          onRequestLeave={requestLeaveConfirm}
          onSave={(model) => {
            persist({ ...settings, model });
            setModelStatus({ status: "untested", message: "" });
          }}
          onTest={runModelTest}
          showToast={showToast}
        />
      )}
      {page === "terminal" && (
        <TerminalSettingsPage
          settings={settings}
          onBack={() => setPage("home")}
          onRequestLeave={requestLeaveConfirm}
          onSave={(terminal) => persist({ ...settings, terminal })}
        />
      )}
      {page === "persona" && (
        <PersonaPromptPage
          settings={settings}
          onBack={() => setPage("home")}
          onRequestLeave={requestLeaveConfirm}
          onSave={(prompt, uiPatch) => persist({ ...settings, prompt, ui: { ...settings.ui, ...(uiPatch || {}) } })}
          showToast={showToast}
        />
      )}
      {page === "appearance" && (
        <AppearanceSettingsPage
          settings={settings}
          onBack={() => setPage("home")}
          onRequestLeave={requestLeaveConfirm}
          onSave={(ui) => persist({ ...settings, ui })}
          showToast={showToast}
        />
      )}
      {page === "memory" && (
        <MemoryContextSettingsPage
          settings={settings}
          onBack={(nextPage = "home") => setPage(nextPage)}
          onRequestLeave={requestLeaveConfirm}
          onSave={(memory, transport) => persist({ ...settings, memory, transport })}
          showToast={showToast}
          refreshLogs={refreshLogs}
        />
      )}
      {page === "logs" && (
        <ContextLogsPage logs={logs} onBack={() => setPage("memory")} onClear={clearAllLogs} showToast={showToast} />
      )}
      {page === "systemOverview" && (
        <SystemOverviewPage
          settings={settings}
          logs={logs}
          localStats={localStats}
          modelStatus={modelStatus}
          onBack={() => setPage("home")}
          onOpen={setPage}
        />
      )}
      {page === "capabilityRoutes" && (
        <CapabilityRoutesPage settings={settings} logs={logs} onBack={() => setPage("home")} onOpen={setPage} />
      )}
      {page === "memoryStatus" && (
        <MemoryStatusPage settings={settings} logs={logs} onBack={() => setPage("home")} />
      )}
      {page === "backendGateway" && <BackendGatewayPage onBack={() => setPage("home")} />}
      {page === "localData" && (
        <LocalDataAndLogsPage
          localStats={localStats}
          logs={logs}
          onBack={() => setPage("home")}
          onRefresh={refreshLocalStats}
          onClearContextLogs={clearAllLogs}
          onClearMessages={clearMessages}
          onClearFunctionData={clearFunctionData}
          onClearAll={clearAllLocalData}
        />
      )}
      {page === "security" && (
        <SecurityDataPage
          settings={settings}
          logs={logs}
          onBack={() => setPage("home")}
          onClearModelKey={clearModelKey}
          onClearLogs={clearAllLogs}
          onClearMessages={clearMessages}
          showToast={showToast}
        />
      )}
      {page === "about" && <AboutPage onBack={() => setPage("home")} />}
      {clearDialog && (
        <SettingsConfirmDialog
          dialog={clearDialog}
          onCancel={cancelClearConfirm}
          onConfirm={advanceClearConfirm}
          onInputChange={updateClearConfirmInput}
        />
      )}
      {toast && <div className="settings-toast">{toast}</div>}
    </section>
  );
}

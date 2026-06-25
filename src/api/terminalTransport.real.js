// src/api/terminalTransport.js
import { getSettings } from "../store/settings.js";
//
// 终端层的连接边界。Chat 走 chatTransport，终端走这里，两条通道互不干扰。
// 这个文件只负责：建立 WebSocket、收发数据、重连、关闭。
// 不负责：渲染、鉴权 UI、业务指令解析——那些留给 TerminalView 和后端。

const DEFAULT_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 15000;

/**
 * 从本地设置读取终端服务地址。
 * 复用现有 settings 的存储位置（localStorage），约定新增字段：
 *   settings.terminal = { wsUrl: "wss://your-tunnel-domain/term", token: "..." }
 * 如果你们的 settings.js 结构不同，把这个函数换成对应的读取方式即可，
 * 其他代码不需要改。
 */
function readTerminalSettings() {
  return getSettings().terminal || { wsUrl: "", token: "" };
}

/**
 * 创建一个终端连接会话。
 * 返回的对象提供 send / resize / close，以及事件回调挂载点。
 *
 * @param {Object} handlers
 * @param {(text: string) => void} handlers.onData     收到 PTY 输出
 * @param {(status: "connecting"|"open"|"closed"|"error") => void} handlers.onStatus
 */
export function createTerminalSession({ onData, onStatus }) {
  let ws = null;
  let reconnectDelay = DEFAULT_RECONNECT_DELAY_MS;
  let reconnectTimer = null;
  let manuallyClosed = false;

  function emitStatus(status) {
    onStatus?.(status);
  }

  function connect() {
    const { wsUrl, token } = readTerminalSettings();

    if (!wsUrl) {
      emitStatus("error");
      return;
    }

    manuallyClosed = false;
    emitStatus("connecting");

    // token 通过 query string 传递；如果你的 Cloudflare Access / 网关
    // 用别的鉴权方式（比如 cookie），这里可以去掉 token 拼接。
    const url = token
      ? `${wsUrl}${wsUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
      : wsUrl;

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectDelay = DEFAULT_RECONNECT_DELAY_MS;
      emitStatus("open");
    };

    ws.onmessage = (event) => {
      // 约定：后端直接发原始 PTY 输出文本（xterm.js 可以直接 write）。
      // 如果后端用 JSON 包了一层（比如 {type:"data", payload:"..."}），
      // 在这里解一层 JSON.parse 再取 payload 即可。
      onData?.(event.data);
    };

    ws.onclose = () => {
      emitStatus("closed");
      if (!manuallyClosed) scheduleReconnect();
    };

    ws.onerror = () => {
      emitStatus("error");
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.6, MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelay);
  }

  /** 发送用户在终端里输入的原始按键/文本 */
  function send(text) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(text);
    }
  }

  /** 终端尺寸变化时通知后端 PTY 调整行列数（node-pty 的 resize） */
  function resize(cols, rows) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ __resize: { cols, rows } }));
    }
  }

  function close() {
    manuallyClosed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  }

  connect();

  return { send, resize, close };
}

// src/components/terminal/TerminalView.jsx
import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { createTerminalSession } from "../../api/terminalTransport.js";
import "xterm/css/xterm.css";

/**
 * 纯终端渲染组件。不关心抽屉怎么滑出、怎么关闭——只管
 * "挂载后建立连接，卸载后断开连接，中间负责收发字符"。
 */
export default function TerminalView() {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const sessionRef = useRef(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const term = new Terminal({
      convertEol: true,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      theme: {
        // 深色玻璃面板配色，刻意跳出App主体的暖色调
        background: "#11161c",
        foreground: "#d7ddE6",
        cursor: "#7fd8a4",
        cursorAccent: "#11161c",
        selectionBackground: "#2a3744",
        black: "#11161c",
        green: "#7fd8a4",
        yellow: "#e3c878",
        red: "#e2766f",
        blue: "#7aa7d6",
        magenta: "#b390d6",
        cyan: "#74c7c4",
        white: "#d7ddE6",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[90m· 正在连接终端 ...\x1b[0m");

    const session = createTerminalSession({
      onData: (text) => term.write(text),
      onStatus: (next) => {
        setStatus(next);
        if (next === "open") {
          term.writeln("\x1b[32m· 已连接\x1b[0m");
        } else if (next === "closed") {
          term.writeln("\x1b[33m· 连接已断开，正在重试 ...\x1b[0m");
        } else if (next === "error") {
          term.writeln("\x1b[31m· 连接出错，检查终端服务地址和 token\x1b[0m");
        }
      },
    });
    sessionRef.current = session;

    term.onData((data) => {
      session.send(data);
    });

    function handleResize() {
      fitAddon.fit();
      session.resize(term.cols, term.rows);
    }
    window.addEventListener("resize", handleResize);

    // 抽屉滑入动画结束后尺寸可能还没稳定，延迟一次 fit 兜底
    const settleTimer = setTimeout(handleResize, 250);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(settleTimer);
      session.close();
      term.dispose();
    };
  }, []);

  function sendKey(bytes) {
    sessionRef.current?.send(bytes);
    // 发完之后把焦点拉回终端，确保软键盘后续输入还能继续接上
    xtermRef.current?.focus();
  }

  return (
    <div className="terminal-view">
      <div className="terminal-view__status" data-status={status}>
        <span className="terminal-view__dot" />
        {status === "open" && "已连接"}
        {status === "connecting" && "连接中"}
        {status === "closed" && "已断开 · 重连中"}
        {status === "error" && "连接异常"}
      </div>
      <div ref={containerRef} className="terminal-view__surface" />
      <TerminalKeyToolbar onSendKey={sendKey} />
    </div>
  );
}

/**
 * 手机端没有物理键盘，Ctrl/Tab/方向键这些控制字符打不出来，
 * 靠这一排常驻按钮直接发送对应的转义序列。
 * 横向可滑动，避免在窄屏上挤不下。
 */
function TerminalKeyToolbar({ onSendKey }) {
  const keys = [
    { label: "Esc", bytes: "\x1b" },
    { label: "Tab", bytes: "\t" },
    { label: "↑", bytes: "\x1b[A" },
    { label: "↓", bytes: "\x1b[B" },
    { label: "←", bytes: "\x1b[D" },
    { label: "→", bytes: "\x1b[C" },
    { label: "Ctrl+C", bytes: "\x03", variant: "warn" },
    { label: "Ctrl+D", bytes: "\x04" },
    { label: "Ctrl+L", bytes: "\x0c" },
    { label: "Ctrl+Z", bytes: "\x1a" },
  ];

  return (
    <div className="terminal-key-toolbar">
      {keys.map((key) => (
        <button
          key={key.label}
          type="button"
          className="terminal-key-toolbar__key"
          data-variant={key.variant || "default"}
          onClick={() => onSendKey(key.bytes)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

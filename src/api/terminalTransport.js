// src/api/terminalTransport.js
//
// ⚠️ 这是 MOCK 测试版本，没有真实网络连接，只是定时往终端塞假文本，
// 用来确认抽屉动画、关闭按钮、状态指示这些 UI 交互是否正常。
// 确认满意后，换回真实版本（带 WebSocket 的那份）。

const FAKE_LINES = [
  "$ claude-code status",
  "✓ session ready",
  "✓ workspace: /home/user/project",
  "$ _",
];

export function createTerminalSession({ onData, onStatus }) {
  let timer = null;
  let lineIndex = 0;

  onStatus?.("connecting");

  // 模拟 1.2 秒后连接成功
  const connectTimer = setTimeout(() => {
    onStatus?.("open");
    onData?.("\x1b[32m已连接（这是 mock 数据，不是真实终端）\x1b[0m\r\n");

    // 模拟每隔 1.5 秒输出一行假内容
    timer = setInterval(() => {
      if (lineIndex < FAKE_LINES.length) {
        onData?.(FAKE_LINES[lineIndex] + "\r\n");
        lineIndex += 1;
      }
    }, 1500);
  }, 1200);

  function send(text) {
    // 用户在终端里敲字符时，直接回显出来（模拟 echo），
    // 真实版本里这个回显应该是后端 PTY 做的，这里只是为了测试体验。
    onData?.(text === "\r" ? "\r\n$ " : text);
  }

  function resize() {
    // mock 版本不需要真的处理 resize
  }

  function close() {
    clearTimeout(connectTimer);
    clearInterval(timer);
  }

  return { send, resize, close };
}

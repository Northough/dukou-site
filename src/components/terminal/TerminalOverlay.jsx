// src/components/terminal/TerminalOverlay.jsx
import { useEffect } from "react";
import TerminalView from "./TerminalView.jsx";
import "../../styles/terminal.css";

/**
 * 从聊天页右上角图标唤出的全屏终端抽屉。
 *
 * 用法（在 App.jsx 里）：
 *
 *   const [terminalOpen, setTerminalOpen] = useState(false);
 *   ...
 *   {terminalOpen && <TerminalOverlay onClose={() => setTerminalOpen(false)} />}
 *
 * 在 Chat.jsx 顶部按钮调用传入的 onOpenTerminal（从 App.jsx 往下传，
 * 跟现有 onOpenSettings / onOpenFunction 的传参方式一致）。
 */
export default function TerminalOverlay({ onClose }) {
  // 安卓物理返回键：按返回先关终端，不退出整个 App。
  useEffect(() => {
    window.history.pushState({ terminalOverlay: true }, "");

    function handlePopState() {
      onClose();
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCloseClick() {
    // 如果还停留在我们 push 的那个历史记录上，退回去，
    // 避免再点一次返回键时多弹一层。
    if (window.history.state?.terminalOverlay) {
      window.history.back();
    } else {
      onClose();
    }
  }

  return (
    <div className="terminal-overlay" role="dialog" aria-label="终端">
      <div className="terminal-overlay__header">
        <div className="terminal-overlay__title">
          <span className="terminal-overlay__prompt">&gt;_</span>
          终端
        </div>
        <button
          type="button"
          className="terminal-overlay__close"
          onClick={handleCloseClick}
          aria-label="关闭终端"
        >
          收起
        </button>
      </div>
      <TerminalView />
    </div>
  );
}

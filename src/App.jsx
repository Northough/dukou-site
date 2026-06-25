import { useEffect, useState } from "react";
import Entry from "./pages/Entry.jsx";
import Chat from "./pages/Chat.jsx";
import Settings from "./pages/Settings.jsx";
import FunctionPage from "./pages/FunctionPage.jsx";
import BottomNav from "./components/BottomNav.jsx";
import TerminalOverlay from "./components/terminal/TerminalOverlay.jsx";

export default function App() {
  const [screen, setScreen] = useState("entry");
  const [activeTab, setActiveTab] = useState("chat");
  const [hideFunctionBottomNav, setHideFunctionBottomNav] = useState(false);
  const [pendingChatQuote, setPendingChatQuote] = useState(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    if (activeTab !== "function") {
      setHideFunctionBottomNav(false);
    }
  }, [activeTab]);

  function openChatWithQuote(quote) {
    setPendingChatQuote({
      ...quote,
      id: `quote-${Date.now()}`,
    });
    setActiveTab("chat");
  }

  return (
    <div className="app-backdrop">
      <main className="phone-shell" aria-label="AI 陪伴前端">
        {screen === "entry" ? (
          <Entry onEnter={() => setScreen("main")} />
        ) : (
          <>
            <div className="page-host">
              {activeTab === "chat" && (
                <Chat
                  pendingQuote={pendingChatQuote}
                  onPendingQuoteAccepted={() => setPendingChatQuote(null)}
                  onOpenSettings={() => setActiveTab("settings")}
                  onOpenFunction={() => setActiveTab("function")}
                  onOpenTerminal={() => setTerminalOpen(true)}
                />
              )}
              {activeTab === "function" && (
                <FunctionPage onDetailOverlayChange={setHideFunctionBottomNav} onOpenChatWithQuote={openChatWithQuote} />
              )}
              {activeTab === "settings" && <Settings />}
            </div>
            {activeTab !== "chat" && !(activeTab === "function" && hideFunctionBottomNav) && (
              <BottomNav activeTab={activeTab} onChange={setActiveTab} />
            )}
            
          {terminalOpen && <TerminalOverlay onClose={() => setTerminalOpen(false)} />}
          </>
        )}
      </main>
    </div>
  );
}

function NavIcon({ type }) {
  if (type === "chat") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14v9.2H9.4L5 19V6.5z" />
      </svg>
    );
  }

  if (type === "group") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 11.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM15.8 11.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2z" />
        <path d="M3.8 19.2c.5-3.1 2.1-5 4.4-5s3.9 1.9 4.4 5M11.4 19.2c.5-3.1 2.1-5 4.4-5 2.2 0 3.8 1.9 4.4 5" />
      </svg>
    );
  }

  if (type === "function") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4.5 9h15" />
        <rect x="4.5" y="5" width="15" height="15" rx="2.5" />
        <path d="M8 13h2M12 13h2M16 13h.01M8 16h2M12 16h2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2m0 12.6v2.2M4.6 7.8l1.9 1.1m11 6.2 1.9 1.1M4.6 16.2l1.9-1.1m11-6.2 1.9-1.1" />
    </svg>
  );
}

const tabs = [
  { id: "chat", label: "Chat", caption: "聊天" },
  { id: "function", label: "Function", caption: "功能" },
  { id: "settings", label: "Settings", caption: "设置" },
];

export default function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          className={activeTab === tab.id ? "bottom-nav-item is-active" : "bottom-nav-item"}
          aria-label={tab.caption}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          <NavIcon type={tab.id} />
          <span className="bottom-nav-copy">
            <strong>{tab.label}</strong>
            <small>{tab.caption}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

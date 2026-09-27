const { Logo, Icon, Avatar, SidebarItem, Breadcrumb } = window.DS;

function TedrisShell({ route, onNavigate, breadcrumb, children }) {
  const nav = [
    { id: "ev", label: "Ev", icon: "home" },
    { id: "ogrenme", label: "Öğrenme", icon: "book" },
    { id: "desteler", label: "Desteler", icon: "table" },
  ];
  const active = route === "course" || route === "lesson" ? "ogrenme" : route;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)" }}>
      <aside style={{ width: "var(--sidebar-w-tedris)", flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 16px" }}>
        <div style={{ padding: "4px 8px 20px" }}>
          <Logo mark="madrasah" size={40} withWordmark subtitle="Talebe" />
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 9, marginBottom: 16,
          border: "1px solid var(--border)", borderRadius: "var(--r-8)",
          padding: "9px 12px", color: "var(--muted)",
        }}>
          <Icon name="search" size={16} />
          <span style={{ font: "var(--fw-regular) var(--fs-13-5)/1 var(--font-ui)" }}>Ara...</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {nav.map((n) => (
            <SidebarItem
              key={n.id} label={n.label} active={active === n.id}
              icon={<Icon name={n.icon} size={19} />}
              onClick={() => onNavigate(n.id)}
            />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 10px" }}>
          <Avatar initials="DU" shape="square" size={32} ring={false} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ font: "var(--fw-semibold) var(--fs-13-5)/1.2 var(--font-ui)" }}>Developer User</div>
            <div style={{ font: "var(--fw-regular) var(--fs-11-5)/1.2 var(--font-ui)", color: "var(--muted)" }}>Talebe</div>
          </div>
          <Icon name="chevronsUpDown" size={15} style={{ color: "var(--faint)" }} />
        </div>
      </aside>

      <main style={{ flex: 1, padding: "12px 12px 12px 0", minWidth: 0 }}>
        <div style={{
          minHeight: "calc(100vh - 24px)",
          border: "1px solid var(--border)", borderRadius: "var(--r-14)",
          display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 30px", borderBottom: "1px solid var(--border-soft)",
          }}>
            <div style={{ flex: 1 }}><Breadcrumb size="sm" items={breadcrumb} /></div>
            <Icon name="bell" size={19} style={{ color: "var(--ink)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { TedrisShell });

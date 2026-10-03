const { Logo, Icon, Avatar, SidebarItem, Breadcrumb, Button } = window.DS;

function NizamShell({ route, onNavigate, breadcrumb, children }) {
  const nav = [
    { id: "desteler", label: "Desteler", icon: "table" },
    { id: "koskler", label: "Köşkler", icon: "home" },
  ];
  const active = route === "koskDetail" || route === "courseEdit" ? "koskler"
    : route === "deckDetail" ? "desteler" : route;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)", color: "var(--ink)" }}>
      <aside style={{ width: "var(--sidebar-w)", flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 16px" }}>
        <div style={{ padding: "4px 8px 22px" }}>
          <Logo mark="nizam" size={44} withWordmark subtitle="Online Madrasah" />
        </div>

        <div style={{ font: "var(--fw-medium) var(--fs-13)/1 var(--font-ui)", color: "var(--faint)", padding: "6px 10px 8px" }}>
          İçerik
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
          <Avatar initials="DU" shape="square" size={34} ring={false} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ font: "var(--fw-semibold) var(--fs-14)/1.2 var(--font-ui)" }}>Developer User</div>
            <div style={{
              font: "var(--fw-regular) var(--fs-12)/1.2 var(--font-ui)", color: "var(--muted)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>developer@ameltech.c...</div>
          </div>
          <Icon name="chevronsUpDown" size={16} style={{ color: "var(--faint)" }} />
        </div>
        <Button variant="ghost" size="lg" fullWidth icon={<Icon name="globe" size={17} />} style={{ marginTop: 10 }}>
          Türkçe
        </Button>
      </aside>

      <main style={{ flex: 1, padding: "12px 12px 12px 0", minWidth: 0 }}>
        <div style={{
          minHeight: "calc(100vh - 24px)",
          border: "1px solid var(--line)", borderRadius: "var(--r-14)",
          background: "var(--surface)", display: "flex", flexDirection: "column",
          overflow: "hidden", position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 26px" }}>
            <Icon name="sidebar" size={20} style={{ color: "var(--slate-500)" }} />
            <div style={{ width: 1, height: 20, background: "var(--line)" }} />
            <Breadcrumb items={breadcrumb} />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "10px var(--pad-page-x-nizam) 48px", minWidth: 0 }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NzHead({ title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 30 }}>
      <div>
        <h1 style={{ margin: 0, font: "var(--fw-extrabold) var(--fs-33)/var(--lh-tight) var(--font-ui)", letterSpacing: "var(--tracking-display)" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: "8px 0 0", font: "var(--fw-regular) var(--fs-16)/1.5 var(--font-ui)", color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, flexShrink: 0, paddingTop: 4 }}>{actions}</div>}
    </div>
  );
}

Object.assign(window, { NizamShell, NzHead });

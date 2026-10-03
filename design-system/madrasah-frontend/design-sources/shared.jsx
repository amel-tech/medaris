/* eslint-disable */
// Shared tokens, icons, and the global header used across all pages.

const MD_COLORS = {
  brand: "#0b1f3a",
  text: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  border: "#e5e7eb",
  borderSoft: "#eef0f3",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  surfaceSunken: "#f3f4f6",
  accent: "#1d4ed8",
  accentSoft: "#eff4ff",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  dark: "#0f172a",
};

const MD_FONT = `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

// ------- Icons (stroke=currentColor, 1.6 weight to match the source) -------
const Icon = ({ d, size = 18, fill = "none", stroke = "currentColor", strokeWidth = 1.6, children, viewBox = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

const IconSearch  = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
const IconBell    = (p) => <Icon {...p} d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Zm4 13a2 2 0 0 0 4 0" />;
const IconGlobe   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
const IconChevron = (p) => <Icon {...p} d="m6 9 6 6 6-6" />;
const IconChevronRight = (p) => <Icon {...p} d="m9 6 6 6-6 6" />;
const IconChevronLeft  = (p) => <Icon {...p} d="m15 6-6 6 6 6" />;
const IconBookmark = ({ filled, ...p }) => (
  <Icon {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4Z" />
  </Icon>
);
const IconLock    = (p) => <Icon {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></Icon>;
const IconUnlock  = (p) => <Icon {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></Icon>;
const IconPublic  = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
const IconPlus    = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;
const IconUsers   = (p) => <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="8" r="3" /><path d="M17 14c2.8 0 5 2.2 5 5" /></Icon>;
const IconStar    = ({ filled, ...p }) => <Icon {...p} fill={filled ? "currentColor" : "none"}><path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.3-.9L12 3Z" /></Icon>;
const IconClock   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
const IconBook    = (p) => <Icon {...p} d="M4 4h12a4 4 0 0 1 4 4v13H8a4 4 0 0 1-4-4V4Zm0 0v13a4 4 0 0 1 4-4h12" />;
const IconPlay    = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M8 5v14l11-7L8 5Z" /></Icon>;
const IconPlayOutline = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5Z" /></Icon>;
const IconDoc     = (p) => <Icon {...p} d="M7 3h7l4 4v14H7V3Zm7 0v4h4" />;
const IconPdf     = (p) => <Icon {...p}><path d="M7 3h7l4 4v14H7V3Z" /><path d="M14 3v4h4" /><text x="9" y="17" fontSize="5" fontFamily="ui-monospace" fill="currentColor" stroke="none">PDF</text></Icon>;
const IconHeadset = (p) => <Icon {...p} d="M3 14v-2a9 9 0 1 1 18 0v2m-3 6h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2v8Zm-12 0h2v-8H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z" />;
const IconQuiz    = (p) => <Icon {...p}><path d="M12 17v.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1.9-1.1 1.7v.5" /><circle cx="12" cy="12" r="9" /></Icon>;
const IconCheck   = (p) => <Icon {...p} d="m5 12 5 5L20 6" />;
const IconCheckCircle = ({ filled, ...p }) => filled
  ? <Icon {...p} fill={MD_COLORS.success} stroke="white"><circle cx="12" cy="12" r="10" stroke="none" /><path d="m7 12 3.5 3.5L17 9" /></Icon>
  : <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Icon>;
const IconCircle  = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /></Icon>;
const IconCalendar = (p) => <Icon {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
const IconClose   = (p) => <Icon {...p} d="m6 6 12 12M18 6 6 18" />;
const IconArrowLeft = (p) => <Icon {...p} d="M19 12H5m6 6-6-6 6-6" />;
const IconShare   = (p) => <Icon {...p}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></Icon>;
const IconMore    = (p) => <Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></Icon>;
const IconSettings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>;
const IconUpload  = (p) => <Icon {...p} d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14" />;
const IconTrash   = (p) => <Icon {...p} d="M4 7h16M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />;
const IconGrip    = (p) => <Icon {...p}><circle cx="9" cy="6"  r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6"  r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></Icon>;
const IconDownload = (p) => <Icon {...p} d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />;
const IconChat    = (p) => <Icon {...p} d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.6-4.4A8 8 0 1 1 21 12Z" />;
const IconFilter  = (p) => <Icon {...p} d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />;
const IconLink    = (p) => <Icon {...p} d="M10 14a4 4 0 0 1 0-5.7l2.8-2.8a4 4 0 1 1 5.7 5.7L17 12.7m-3-2.7a4 4 0 0 1 0 5.7L11.3 18.5a4 4 0 1 1-5.7-5.7L7 11.4" />;
const IconCertificate = (p) => <Icon {...p}><circle cx="12" cy="10" r="5" /><path d="m9 14-2 7 5-3 5 3-2-7" /></Icon>;
const IconArrowRight = (p) => <Icon {...p} d="M5 12h14m-6-6 6 6-6 6" />;
const IconHome    = (p) => <Icon {...p} d="M4 11.5 12 4l8 7.5M6 10v9h12v-9M10 19v-5h4v5" />;
const IconTable   = (p) => <Icon {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16M10 10v9" /></Icon>;
const IconSidebar = (p) => <Icon {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 5v14" /></Icon>;
const IconEye     = (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>;
const IconShield  = (p) => <Icon {...p} d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />;
const IconChevronsUpDown = (p) => <Icon {...p} d="m8 9 4-4 4 4M8 15l4 4 4-4" />;
const IconGreenBadge = ({ filled, ...p }) => <Icon {...p} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="9" /></Icon>;

// Madrasah dome logo (matches the small icon in the source)
const MadrasahLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="9" fill={MD_COLORS.brand} />
    <path
      d="M24 9c-1.6 3-3.4 4.8-6 6.4v15.8h12V15.4C27.4 13.8 25.6 12 24 9Z"
      fill="#dbeafe"
    />
    <rect x="18" y="33" width="12" height="6" fill="#dbeafe" />
    <rect x="22.2" y="20" width="3.6" height="11" rx="1.8" fill={MD_COLORS.brand} />
    <circle cx="24" cy="12" r="0.9" fill={MD_COLORS.brand} />
  </svg>
);

// ------------------------------ Header ------------------------------
const Header = ({ activeTab = "ogrenme" }) => {
  const TABS = [
    { id: "ev", label: "Ev" },
    { id: "ogrenme", label: "Öğrenme" },
    { id: "desteler", label: "Desteler" },
  ];

  return (
    <header style={{ background: MD_COLORS.surface, borderBottom: `1px solid ${MD_COLORS.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", padding: "18px 36px", gap: 24, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MadrasahLogo size={36} />
          <span style={{ fontSize: 20, fontWeight: 600, color: MD_COLORS.brand, letterSpacing: -0.2 }}>Online Madrasah</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${MD_COLORS.border}`, borderRadius: 10, padding: "8px 14px", width: 240, color: MD_COLORS.muted, background: MD_COLORS.surface }}>
            <IconSearch size={16} />
            <span style={{ fontSize: 14 }}>Ara...</span>
          </div>
          {/* Bell */}
          <button style={{ ...btnReset, color: MD_COLORS.text }}>
            <IconBell size={20} />
          </button>
          {/* User */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${MD_COLORS.border}`, borderRadius: 10, padding: "6px 10px 6px 6px" }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: "#e2e8f0", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: MD_COLORS.text }}>DU</div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MD_COLORS.text }}>Developer User</div>
              <div style={{ fontSize: 11, color: MD_COLORS.muted }}>Talebe</div>
            </div>
            <IconChevron size={14} />
          </div>
          {/* Lang */}
          <button style={{ ...btnReset, display: "flex", alignItems: "center", gap: 8, border: `1px solid ${MD_COLORS.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, color: MD_COLORS.text, fontWeight: 500 }}>
            <IconGlobe size={16} /> Türkçe
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav style={{ display: "flex", gap: 28, padding: "0 36px", borderBottom: `1px solid ${MD_COLORS.borderSoft}` }}>
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <div key={t.id} style={{
              padding: "12px 4px 14px",
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              color: active ? MD_COLORS.text : MD_COLORS.muted,
              borderBottom: active ? `2px solid ${MD_COLORS.accent}` : "2px solid transparent",
              cursor: "pointer",
            }}>{t.label}</div>
          );
        })}
      </nav>
    </header>
  );
};

const btnReset = { background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };

// Pill ---------------------------------------------------------------
const Pill = ({ children, active, dark, onClick, leading }) => (
  <button onClick={onClick} style={{
    ...btnReset,
    background: dark ? MD_COLORS.dark : (active ? MD_COLORS.dark : MD_COLORS.surfaceSunken),
    color: dark || active ? "white" : MD_COLORS.text,
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 14px",
    borderRadius: 999,
    border: "none",
  }}>
    {leading}
    {children}
  </button>
);

// Course cover placeholder ------------------------------------------
const CoverPlaceholder = ({ hue = 220, label, height = 160, dense = false }) => (
  <div style={{
    height,
    borderRadius: 10,
    background: `linear-gradient(135deg, oklch(0.94 0.04 ${hue}) 0%, oklch(0.88 0.07 ${hue}) 100%)`,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "flex-end",
    padding: dense ? 14 : 18,
    color: `oklch(0.32 0.08 ${hue})`,
  }}>
    {/* arabesque-y stripe pattern */}
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18 }} aria-hidden="true">
      <defs>
        <pattern id={`p-${hue}`} width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M0 18a18 18 0 0 1 36 0M0 18a18 18 0 0 0 36 0" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p-${hue})`} />
    </svg>
    {label && (
      <div style={{ position: "relative", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>
        {label}
      </div>
    )}
  </div>
);

// Avatar -------------------------------------------------------------
const Avatar = ({ name = "MD", size = 32, hue = 220 }) => (
  <div style={{
    width: size, height: size, borderRadius: 999,
    background: `oklch(0.92 0.05 ${hue})`,
    color: `oklch(0.32 0.08 ${hue})`,
    display: "grid", placeItems: "center",
    fontSize: Math.round(size * 0.38), fontWeight: 600,
    flexShrink: 0,
    border: "2px solid white",
  }}>{name}</div>
);

// Page shell ---------------------------------------------------------
const PageShell = ({ activeTab, children, label }) => (
  <div data-screen-label={label} style={{ fontFamily: MD_FONT, background: MD_COLORS.surface, color: MD_COLORS.text, minHeight: 900, fontFeatureSettings: '"ss01", "cv11"' }}>
    <Header activeTab={activeTab} />
    {children}
  </div>
);

Object.assign(window, {
  MD_COLORS, MD_FONT, MadrasahLogo, Header, PageShell, Pill, CoverPlaceholder, Avatar, btnReset,
  IconSearch, IconBell, IconGlobe, IconChevron, IconChevronRight, IconChevronLeft, IconBookmark,
  IconLock, IconUnlock, IconPublic, IconPlus, IconUsers, IconStar, IconClock, IconBook, IconPlay,
  IconPlayOutline, IconDoc, IconPdf, IconHeadset, IconQuiz, IconCheck, IconCheckCircle, IconCircle,
  IconCalendar, IconClose, IconArrowLeft, IconShare, IconMore, IconSettings, IconUpload, IconTrash,
  IconGrip, IconDownload, IconChat, IconFilter, IconLink, IconCertificate, IconArrowRight,
  IconHome, IconTable, IconSidebar, IconEye, IconShield, IconChevronsUpDown, IconGreenBadge,
});

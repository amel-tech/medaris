/* eslint-disable */
// Tedris (student) — ALTERNATIVE layout.
// Current student app uses a top header + horizontal tabs (Ev / Öğrenme / Desteler).
// This explores a left-sidebar layout instead — consistent with the Nizam admin app,
// freeing the top bar and giving the learning content more vertical room.

const TD = {
  ...window.MD_COLORS,
  ink: "#16181d",
  line: "#e7e8ea",
  lineSoft: "#eef0f2",
  navActive: "#f1f2f4",
};

const TedrisAltPage = () => {
  const C = TD;

  const nav = [
    { id: "ev", label: "Ev", icon: (s) => <IconHome size={s} /> },
    { id: "ogrenme", label: "Öğrenme", icon: (s) => <IconBook size={s} /> },
    { id: "desteler", label: "Desteler", icon: (s) => <IconTable size={s} /> },
  ];

  const continuing = [
    { kosk: "Süleymaniye Köşkü", course: "Bina ve İzhar Şerhi", hue: 145, cat: "Sarf", lesson: "Beşinci Babın Şerhi — فَتَحَ Bâbı", type: "video", left: "11 dk kaldı", progress: 0.35, week: "Hafta 3" },
    { kosk: "Karaman Köşkü", course: "Avâmil — Nahiv Esasları", hue: 270, cat: "Nahiv", lesson: "Tatbikat Defteri 3 — Âmil Çeşitleri", type: "doc", left: "2 alıştırma kaldı", progress: 0.62, week: "Hafta 4" },
    { kosk: "Fâtih Köşkü", course: "Hadis Usûlü", hue: 28, cat: "Hadis", lesson: "Hafta Sonu Müzakeresi", type: "live", left: "Cumartesi 21:00", progress: 0.48, week: "Hafta 2" },
  ];

  const kosks = [
    { name: "Süleymaniye Köşkü", hue: 215, courses: 14, students: 482, tags: ["Arapça", "Fıkıh"], level: "Tüm seviyeler" },
    { name: "Beyazıt Köşkü", hue: 270, courses: 8, students: 221, tags: ["Mantık"], level: "İleri" },
    { name: "Karaman Köşkü", hue: 145, courses: 16, students: 538, tags: ["Arapça", "Kıraat"], level: "Başlangıç" },
    { name: "Nûruosmaniye Köşkü", hue: 340, courses: 6, students: 158, tags: ["Akaid"], level: "Orta" },
  ];

  return (
    <div data-screen-label="Tedris (alternatif sidebar)" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 900, display: "flex", fontFeatureSettings: '"ss01", "cv11"' }}>
      {/* sidebar */}
      <aside style={{ width: 264, flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 8px 22px" }}>
          <MadrasahLogo size={40} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Tedris</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>Online Madrasah</div>
          </div>
        </div>

        {/* search in sidebar */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", color: C.muted, marginBottom: 16 }}>
          <IconSearch size={16} /> <span style={{ fontSize: 13.5 }}>Ara...</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {nav.map((n) => {
            const on = n.id === "ogrenme";
            return (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, background: on ? C.navActive : "transparent", color: on ? C.ink : "#3f444c", fontSize: 15, fontWeight: on ? 600 : 500, cursor: "pointer" }}>
                <span style={{ color: on ? C.ink : "#6b7280", display: "flex" }}>{n.icon(19)}</span>
                {n.label}
              </div>
            );
          })}
        </nav>

        {/* mini "devam et" shortcut in sidebar */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, color: C.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, padding: "0 10px 10px" }}>Devam et</div>
          {continuing.slice(0, 2).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, cursor: "pointer" }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: `oklch(0.92 0.05 ${c.hue})`, display: "grid", placeItems: "center", color: `oklch(0.4 0.08 ${c.hue})`, flexShrink: 0 }}>
                <IconPlay size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.course}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{c.week} · %{Math.round(c.progress * 100)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 10, cursor: "pointer" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: C.ink }}>DU</div>
          <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Developer User</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>Talebe</div>
          </div>
          <IconChevronsUpDown size={15} style={{ color: C.faint }} />
        </div>
        <button style={{ ...btnReset, justifyContent: "center", gap: 9, marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 14px", fontSize: 14, fontWeight: 500, color: C.ink }}>
          <IconGlobe size={16} /> Türkçe
        </button>
      </aside>

      {/* main */}
      <main style={{ flex: 1, padding: "12px 12px 12px 0" }}>
        <div style={{ height: "100%", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* slim top bar (just breadcrumb + actions, no tabs) */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 30px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, flex: 1 }}>
              <span style={{ color: C.muted }}>Öğrenme</span>
              <IconChevronRight size={14} style={{ color: C.faint }} />
              <span style={{ color: C.ink, fontWeight: 500 }}>Köşkler</span>
            </div>
            <button style={{ ...btnReset, color: C.ink }}><IconBell size={19} /></button>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "26px 30px 48px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.ink, margin: "0 0 4px", letterSpacing: -0.6 }}>Öğrenme</h1>
            <p style={{ fontSize: 15, color: C.muted, margin: "0 0 26px" }}>Kaldığın yerden devam et veya yeni köşkler keşfet.</p>

            {/* devam et */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Kaldığın yerden devam et</h2>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: C.accentSoft, padding: "2px 9px", borderRadius: 99 }}>{continuing.length} ders</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 34 }}>
              {continuing.map((c, i) => <TdContinueCard key={i} c={c} />)}
            </div>

            {/* köşkler */}
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px", letterSpacing: -0.3 }}>Köşkleri keşfet</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
              {kosks.map((k, i) => <TdKoskCard key={i} k={k} />)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const TdContinueCard = ({ c }) => {
  const C = TD;
  const tm = {
    video: { label: "Video ders", icon: <IconPlayOutline size={13} />, color: "#1d4ed8" },
    doc:   { label: "Doküman", icon: <IconPdf size={13} />, color: "#64748b" },
    live:  { label: "Canlı halka", icon: <IconHeadset size={13} />, color: "#dc2626" },
  }[c.type];
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
      <div style={{ position: "relative", padding: 10 }}>
        <CoverPlaceholder hue={c.hue} label={c.cat} height={104} dense />
        <div style={{ position: "absolute", top: 18, left: 18, background: "rgba(255,255,255,.94)", borderRadius: 99, padding: "4px 10px 4px 4px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.ink }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: `oklch(0.92 0.05 ${c.hue})`, display: "grid", placeItems: "center" }}><MadrasahLogo size={13} /></div>
          {c.kosk}
        </div>
        <div style={{ position: "absolute", right: 22, bottom: 22, width: 38, height: 38, borderRadius: 99, background: "white", boxShadow: "0 4px 14px rgba(15,23,42,.22)", display: "grid", placeItems: "center", color: C.ink }}><IconPlay size={17} /></div>
      </div>
      <div style={{ padding: "4px 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: tm.color }}>{tm.icon} {tm.label}</span>
          <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
          <span style={{ fontSize: 11, color: C.muted }}>{c.week}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{c.course}</div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: 0, letterSpacing: -0.2, lineHeight: 1.3 }}>{c.lesson}</h3>
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 5, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${c.progress * 100}%`, background: C.accent, borderRadius: 99 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}><IconClock size={12} /> {c.left}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, display: "inline-flex", alignItems: "center", gap: 4 }}>Devam et <IconArrowRight size={13} /></span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TdKoskCard = ({ k }) => {
  const C = TD;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
      <div style={{ position: "relative", height: 72 }}>
        <CoverPlaceholder hue={k.hue} height={72} />
        <div style={{ position: "absolute", left: 14, bottom: -20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: "white", border: `1px solid ${C.line}`, display: "grid", placeItems: "center" }}><MadrasahLogo size={30} /></div>
        </div>
      </div>
      <div style={{ padding: "28px 16px 16px" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: "0 0 3px", letterSpacing: -0.2 }}>{k.name}</h3>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{k.level}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {k.tags.map(t => <span key={t} style={{ fontSize: 11, fontWeight: 500, color: C.ink, background: C.surfaceSunken, padding: "3px 9px", borderRadius: 999 }}>{t}</span>)}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.muted, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconBook size={13} /> {k.courses}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconUsers size={13} /> {k.students}</span>
        </div>
      </div>
    </div>
  );
};

window.TedrisAltPage = TedrisAltPage;

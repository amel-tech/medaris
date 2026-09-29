/* eslint-disable */
// Nizam — DIVERGENT layout explorations (3 directions).
//   A. Icon rail + dense table (maximize data workspace)
//   B. Top-nav + contextual sub-tabs (Linear/Vercel style)
//   C. Three-column master-detail (rail → list → inline editor)

const NL = {
  ...window.MD_COLORS,
  green: "#0f9d63",
  ink: "#16181d",
  line: "#e7e8ea",
  lineSoft: "#eef0f2",
  navActive: "#f1f2f4",
};

const NL_KOSKS = [
  { name: "Süleymaniye Köşkü", courses: 14, students: 482, muderris: 6, status: "Aktif", hue: 215 },
  { name: "Fâtih Köşkü", courses: 11, students: 364, muderris: 4, status: "Aktif", hue: 28 },
  { name: "Beyazıt Köşkü", courses: 8, students: 221, muderris: 3, status: "Aktif", hue: 270 },
  { name: "Karaman Köşkü", courses: 16, students: 538, muderris: 7, status: "Aktif", hue: 145 },
  { name: "Nûruosmaniye Köşkü", courses: 6, students: 158, muderris: 2, status: "Taslak", hue: 340 },
];

const nlBtnDark  = { ...btnReset, gap: 8, background: NL.ink, color: "white", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 500 };
const nlBtnGreen = { ...btnReset, gap: 8, background: NL.green, color: "white", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 500 };
const nlBtnGhost = { ...btnReset, gap: 8, background: "white", color: NL.ink, border: `1px solid ${NL.line}`, borderRadius: 10, padding: "9px 15px", fontSize: 14, fontWeight: 500 };

// =================================================================
// A. ICON RAIL + DENSE TABLE
// =================================================================
const NizamIconRail = () => {
  const C = NL;
  const railItems = [
    { icon: (s)=><IconTable size={s} />, on: false },
    { icon: (s)=><IconHome size={s} />, on: true },
  ];
  return (
    <div data-screen-label="Nizam A · İkon ray + tablo" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 820, display: "flex" }}>
      {/* 64px icon rail */}
      <div style={{ width: 66, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 10 }}>
        <NizamLogo size={38} />
        <div style={{ height: 8 }} />
        {railItems.map((it, i) => (
          <div key={i} style={{ width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", background: it.on ? C.navActive : "transparent", color: it.on ? C.ink : "#6b7280", cursor: "pointer" }}>{it.icon(20)}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>DU</div>
      </div>

      {/* content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* top strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Köşkler</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 12px", color: C.muted, width: 220 }}><IconSearch size={15} /><span style={{ fontSize: 13 }}>Köşk ara...</span></div>
          <button style={nlBtnGhost}><IconFilter size={15} /> Filtre</button>
          <button style={nlBtnDark}><IconPlus size={16} /> Yeni Köşk</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Köşkler</h1>
            <span style={{ fontSize: 14, color: C.muted }}>{NL_KOSKS.length} köşk · 55 ders</span>
          </div>
          <p style={{ fontSize: 14, color: C.muted, margin: "0 0 20px" }}>Tüm köşkleri tek tabloda yönetin.</p>

          {/* dense table */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px 110px 80px", padding: "11px 18px", background: "#fafafa", borderBottom: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 600, color: C.muted }}>
              <div>Köşk</div><div>Ders</div><div>Talebe</div><div>Müderris</div><div>Durum</div><div style={{ textAlign: "right" }}>İşlem</div>
            </div>
            {NL_KOSKS.map((k, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 90px 90px 90px 110px 80px", padding: "13px 18px", alignItems: "center", borderBottom: i < NL_KOSKS.length - 1 ? `1px solid ${C.lineSoft}` : "none", fontSize: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `oklch(0.92 0.05 ${k.hue})`, display: "grid", placeItems: "center", flexShrink: 0 }}><MadrasahLogo size={20} /></div>
                  <span style={{ fontWeight: 600 }}>{k.name}</span>
                </div>
                <div style={{ color: C.muted }}>{k.courses}</div>
                <div style={{ color: C.muted }}>{k.students}</div>
                <div style={{ color: C.muted }}>{k.muderris}</div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: k.status === "Aktif" ? "#dcfce7" : C.surfaceSunken, color: k.status === "Aktif" ? "#15803d" : C.muted }}>{k.status}</span>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button style={{ ...btnReset, color: C.muted }}><IconEye size={16} /></button>
                  <button style={{ ...btnReset, color: C.muted }}><IconSettings size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =================================================================
// B. TOP-NAV + SUB-TABS
// =================================================================
const NizamTopNav = () => {
  const C = NL;
  const courses = [
    { cat: "TEFSIR", level: "BAŞLANGIÇ", title: "Tefsir Usûlüne Giriş", sub: "6 hafta · 4 ders", hue: 165, status: "Yayında", sc: C.ink },
    { cat: "HADİS", level: "ORTA", title: "Hadis Usûlü", sub: "8 hafta · 12 ders", hue: 28, status: "Taslak", sc: "#6b7280" },
    { cat: "HADİS", level: "İLERİ", title: "Erbaîn Şerhi", sub: "10 hafta · 16 ders", hue: 200, status: "Yayında", sc: C.ink },
  ];
  return (
    <div data-screen-label="Nizam B · Üst nav + alt sekme" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 820 }}>
      {/* primary top nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 32px", borderBottom: `1px solid ${C.line}`, height: 58 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NizamLogo size={32} /><span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Nizam</span></div>
        <nav style={{ display: "flex", gap: 4, height: "100%" }}>
          {["Köşkler", "Desteler"].map((t, i) => (
            <div key={t} style={{ display: "flex", alignItems: "center", padding: "0 14px", fontSize: 14, fontWeight: i === 0 ? 600 : 500, color: i === 0 ? C.ink : C.muted, borderBottom: i === 0 ? `2px solid ${C.ink}` : "2px solid transparent" }}>{t}</div>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 12px", color: C.muted, width: 200 }}><IconSearch size={15} /><span style={{ fontSize: 13 }}>Ara...</span></div>
        <button style={{ ...btnReset, color: C.ink }}><IconBell size={18} /></button>
        <div style={{ width: 32, height: 32, borderRadius: 99, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>DU</div>
      </div>

      {/* page header */}
      <div style={{ padding: "26px 40px 0", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.muted, marginBottom: 14 }}>
          <span>Köşkler</span><IconChevronRight size={13} /><span style={{ color: C.ink, fontWeight: 500 }}>Fâtih Köşkü</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.6 }}>Fâtih Köşkü</h1>
            <p style={{ fontSize: 15, color: C.muted, margin: "6px 0 0" }}>Tefsir ve hadis usûlü ağırlıklı köşk · 11 ders · 364 talebe</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={nlBtnGhost}><IconSettings size={15} /> Köşkü Düzenle</button>
            <button style={nlBtnGreen}><IconPlus size={16} /> Yeni Ders Aç</button>
          </div>
        </div>

        {/* sub-tabs */}
        <div style={{ display: "flex", gap: 26, marginTop: 22, borderBottom: `1px solid ${C.line}` }}>
          {[
            { t: "Dersler", n: 11, on: true },
            { t: "Talebeler", n: 364 },
            { t: "Müderrisler", n: 4 },
            { t: "Ayarlar" },
          ].map((s) => (
            <div key={s.t} style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px 12px", fontSize: 14, fontWeight: s.on ? 600 : 500, color: s.on ? C.ink : C.muted, borderBottom: s.on ? `2px solid ${C.green}` : "2px solid transparent", cursor: "pointer" }}>
              {s.t}{s.n !== undefined && <span style={{ fontSize: 11.5, fontWeight: 600, background: s.on ? "#dcfce7" : C.surfaceSunken, color: s.on ? "#15803d" : C.muted, padding: "1px 7px", borderRadius: 99 }}>{s.n}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* content */}
      <div style={{ padding: "24px 40px 48px", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {courses.map((c, i) => (
            <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ position: "relative" }}>
                <CoverPlaceholder hue={c.hue} height={130} />
                <div style={{ position: "absolute", top: 12, right: 12, background: c.sc, color: "white", fontSize: 12, fontWeight: 600, padding: "4px 11px", borderRadius: 7 }}>{c.status}</div>
              </div>
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, fontSize: 11.5, fontWeight: 600, color: C.muted, letterSpacing: 0.4 }}>{c.cat}<span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />{c.level}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", letterSpacing: -0.3 }}>{c.title}</h3>
                <div style={{ fontSize: 13, color: C.muted }}>{c.sub}</div>
              </div>
            </div>
          ))}
          <button style={{ ...btnReset, flexDirection: "column", gap: 9, border: `1.5px dashed ${C.line}`, borderRadius: 14, color: C.muted, fontSize: 14, fontWeight: 500, minHeight: 130, justifyContent: "center" }}><IconPlus size={20} /> Yeni ders aç</button>
        </div>
      </div>
    </div>
  );
};

// =================================================================
// C. THREE-COLUMN MASTER-DETAIL
// =================================================================
const NizamThreeCol = () => {
  const C = NL;
  return (
    <div data-screen-label="Nizam C · Üç sütun master-detail" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 820, display: "flex" }}>
      {/* icon rail */}
      <div style={{ width: 58, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 8 }}>
        <NizamLogo size={34} />
        <div style={{ height: 6 }} />
        <div style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", color: "#6b7280" }}><IconTable size={19} /></div>
        <div style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: C.navActive, color: C.ink }}><IconHome size={19} /></div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>DU</div>
      </div>

      {/* list column */}
      <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Köşkler</span>
          <button style={{ ...btnReset, width: 32, height: 32, justifyContent: "center", borderRadius: 9, background: C.ink, color: "white" }}><IconPlus size={16} /></button>
        </div>
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 11px", color: C.muted }}><IconSearch size={15} /><span style={{ fontSize: 13 }}>Ara...</span></div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
          {NL_KOSKS.map((k, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 10, background: i === 1 ? C.navActive : "transparent", cursor: "pointer", marginBottom: 2 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `oklch(0.92 0.05 ${k.hue})`, display: "grid", placeItems: "center", flexShrink: 0 }}><MadrasahLogo size={22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: i === 1 ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{k.courses} ders · {k.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* detail/editor pane */}
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "oklch(0.92 0.05 28)", display: "grid", placeItems: "center" }}><MadrasahLogo size={24} /></div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Fâtih Köşkü</div>
              <div style={{ fontSize: 12.5, color: C.muted }}>11 ders · 364 talebe · 4 müderris</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={nlBtnGhost}>Köşkü Düzenle</button>
            <button style={nlBtnGreen}><IconPlus size={15} /> Yeni Ders Aç</button>
          </div>
        </div>

        <div style={{ padding: "22px 28px 40px" }}>
          {/* inline editable köşk fields */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: 0.6, marginBottom: 12 }}>KÖŞK BİLGİLERİ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 26 }}>
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Köşk adı</div>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, fontWeight: 500 }}>Fâtih Köşkü</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Görünürlük</div>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>Herkese açık <IconChevron size={15} style={{ color: C.faint }} /></div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: 0.6 }}>DERSLER (11)</div>
            <span style={{ fontSize: 13, color: C.muted }}>Sürükleyip sırala</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { t: "Tefsir Usûlüne Giriş", cat: "Tefsir", n: "4 ders", st: "Yayında", sc: "#15803d", sb: "#dcfce7" },
              { t: "Hadis Usûlü", cat: "Hadis", n: "12 ders", st: "Taslak", sc: "#6b7280", sb: NL.surfaceSunken },
              { t: "Erbaîn Şerhi", cat: "Hadis", n: "16 ders", st: "Yayında", sc: "#15803d", sb: "#dcfce7" },
            ].map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, border: `1px solid ${C.line}`, borderRadius: 11, padding: "12px 15px" }}>
                <IconGrip size={16} style={{ color: C.faint }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{d.t}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>{d.cat} · {d.n}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: d.sb, color: d.sc }}>{d.st}</span>
                <button style={{ ...btnReset, color: C.muted }}><IconSettings size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { NizamIconRail, NizamTopNav, NizamThreeCol });

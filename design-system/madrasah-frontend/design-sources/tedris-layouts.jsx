/* eslint-disable */
// Tedris — DIVERGENT layout explorations (3 directions).
// Each takes the same learning content; only the layout archetype changes.
//   A. Two-pane reader (master köşk list ↔ detail)
//   B. Bento dashboard home (widget grid)
//   C. Content feed (horizontal rails, no sidebar)

const TL = {
  ...window.MD_COLORS,
  ink: "#16181d",
  line: "#e7e8ea",
  lineSoft: "#eef0f2",
  navActive: "#f1f2f4",
};

const TL_KOSKS = [
  { name: "Süleymaniye Köşkü", hue: 215, courses: 14, students: 482, tags: ["Arapça", "Fıkıh"], level: "Tüm seviyeler", on: true },
  { name: "Karaman Köşkü", hue: 145, courses: 16, students: 538, tags: ["Arapça", "Kıraat"], level: "Başlangıç" },
  { name: "Beyazıt Köşkü", hue: 270, courses: 8, students: 221, tags: ["Mantık"], level: "İleri" },
  { name: "Fâtih Köşkü", hue: 28, courses: 11, students: 364, tags: ["Tefsir", "Hadis"], level: "Orta" },
  { name: "Nûruosmaniye Köşkü", hue: 340, courses: 6, students: 158, tags: ["Akaid"], level: "Orta" },
];

const TL_CONT = [
  { kosk: "Süleymaniye Köşkü", course: "Bina ve İzhar Şerhi", hue: 145, cat: "Sarf", lesson: "Beşinci Babın Şerhi", type: "video", left: "11 dk kaldı", progress: 0.35, week: "Hafta 3" },
  { kosk: "Karaman Köşkü", course: "Avâmil — Nahiv", hue: 270, cat: "Nahiv", lesson: "Tatbikat Defteri 3", type: "doc", left: "2 alıştırma", progress: 0.62, week: "Hafta 4" },
  { kosk: "Fâtih Köşkü", course: "Hadis Usûlü", hue: 28, cat: "Hadis", lesson: "Hafta Sonu Müzakeresi", type: "live", left: "Cmt 21:00", progress: 0.48, week: "Hafta 2" },
  { kosk: "Beyazıt Köşkü", course: "Îsâgûcî — Mantık", hue: 200, cat: "Mantık", lesson: "İkinci Bölüm", type: "video", left: "18 dk kaldı", progress: 0.22, week: "Hafta 1" },
];

const tlType = {
  video: { label: "Video", icon: (s=13)=><IconPlayOutline size={s} />, color: "#1d4ed8" },
  doc:   { label: "Doküman", icon: (s=13)=><IconPdf size={s} />, color: "#64748b" },
  live:  { label: "Canlı", icon: (s=13)=><IconHeadset size={s} />, color: "#dc2626" },
};

// =================================================================
// A. TWO-PANE READER
// =================================================================
const TedrisTwoPane = () => {
  const C = TL;
  const sel = TL_KOSKS[0];
  const courses = [
    { cat: "Sarf", hue: 145, title: "Bina ve İzhar Şerhi", sub: "10 hafta · 40 ders", prog: 0.35, muderris: "AH" },
    { cat: "Sarf", hue: 28, title: "Emsile — Sarf'a Giriş", sub: "8 hafta · 32 ders", prog: 0.72, muderris: "MÖ" },
    { cat: "Nahiv", hue: 270, title: "Avâmil — Nahiv Esasları", sub: "6 hafta · 24 ders", prog: 1, muderris: "SY" },
    { cat: "Mantık", hue: 60, title: "Îsâgûcî — Mantığa Giriş", sub: "6 hafta · 18 ders", prog: 0, muderris: "İA" },
  ];
  return (
    <div data-screen-label="Tedris A · İki pano" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 880, display: "flex" }}>
      {/* MASTER rail */}
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 11 }}>
          <MadrasahLogo size={34} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Tedris</span>
          <div style={{ flex: 1 }} />
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>DU</div>
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", color: C.muted }}>
            <IconSearch size={16} /> <span style={{ fontSize: 13.5 }}>Köşk veya ders ara...</span>
          </div>
        </div>
        <div style={{ padding: "4px 14px 6px", fontSize: 11.5, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>Takip ettiğin köşkler</div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
          {TL_KOSKS.map((k, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 11, background: k.on ? C.navActive : "transparent", cursor: "pointer", marginBottom: 2 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `oklch(0.92 0.05 ${k.hue})`, display: "grid", placeItems: "center", flexShrink: 0 }}><MadrasahLogo size={24} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: k.on ? 600 : 500, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{k.courses} ders · {k.level}</div>
              </div>
              {k.on && <div style={{ width: 7, height: 7, borderRadius: 99, background: C.accent }} />}
            </div>
          ))}
        </div>
      </div>

      {/* DETAIL pane */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* köşk hero */}
        <div style={{ position: "relative" }}>
          <CoverPlaceholder hue={sel.hue} height={150} />
        </div>
        <div style={{ padding: "0 36px 40px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: -34 }}>
            <div style={{ width: 84, height: 84, borderRadius: 18, background: "white", border: `1px solid ${C.line}`, display: "grid", placeItems: "center", boxShadow: "0 8px 24px -12px rgba(0,0,0,.2)" }}><MadrasahLogo size={52} /></div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{sel.name}</h1>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{sel.courses} ders · {sel.students} talebe · 6 müderris</div>
            </div>
            <button style={{ ...btnReset, background: C.ink, color: "white", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 500, gap: 7 }}><IconCheck size={15} /> Takipte</button>
          </div>

          <div style={{ display: "flex", gap: 8, margin: "20px 0 22px" }}>
            {["Tüm dersler", "Devam edenler", "Tamamlananlar"].map((f, i) => (
              <span key={f} style={{ fontSize: 13, fontWeight: 500, padding: "7px 14px", borderRadius: 999, background: i === 0 ? C.ink : C.surfaceSunken, color: i === 0 ? "white" : C.ink }}>{f}</span>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {courses.map((c, i) => (
              <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", display: "flex", cursor: "pointer" }}>
                <div style={{ width: 120, flexShrink: 0 }}><CoverPlaceholder hue={c.hue} height={132} dense /></div>
                <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{c.cat}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: -0.2, lineHeight: 1.3 }}>{c.title}</h3>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{c.sub}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <Avatar name={c.muderris} hue={c.hue} size={22} />
                    <div style={{ flex: 1, height: 5, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.prog * 100}%`, background: c.prog === 1 ? C.success : C.accent }} />
                    </div>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{c.prog === 1 ? "✓" : c.prog ? `%${Math.round(c.prog*100)}` : "Yeni"}</span>
                  </div>
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
// B. BENTO DASHBOARD
// =================================================================
const TedrisBento = () => {
  const C = TL;
  const hero = TL_CONT[0];
  return (
    <div data-screen-label="Tedris B · Bento dashboard" style={{ fontFamily: MD_FONT, background: "#fafafa", color: C.ink, minHeight: 880 }}>
      {/* slim top */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 32px", background: "white", borderBottom: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><MadrasahLogo size={32} /><span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Tedris</span></div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, background: C.surfaceSunken, borderRadius: 999, padding: 4 }}>
          {["Ev", "Öğrenme", "Desteler"].map((t, i) => (
            <span key={t} style={{ fontSize: 13, fontWeight: 500, padding: "7px 16px", borderRadius: 999, background: i === 0 ? "white" : "transparent", color: C.ink, boxShadow: i === 0 ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>{t}</span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ ...btnReset, color: C.ink }}><IconBell size={19} /></button>
        <div style={{ width: 34, height: 34, borderRadius: 99, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>DU</div>
      </div>

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "30px 32px 48px" }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, margin: "0 0 3px", letterSpacing: -0.6 }}>Merhaba, Developer 👋</h1>
        <p style={{ fontSize: 15, color: C.muted, margin: "0 0 24px" }}>Bugün 2 dersin ve 1 canlı halkan var.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "auto auto", gap: 18 }}>
          {/* HERO continue — spans 3 cols, 2 rows */}
          <div style={{ gridColumn: "1 / 4", gridRow: "1 / 3", border: `1px solid ${C.line}`, borderRadius: 18, background: "white", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", flex: 1, minHeight: 220 }}>
              <CoverPlaceholder hue={hero.hue} height={260} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 26, background: "linear-gradient(transparent 40%, rgba(0,0,0,.45))" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "white", opacity: 0.9, marginBottom: 6 }}>KALDIĞIN YERDEN DEVAM ET · {hero.kosk}</span>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: "white", margin: 0, letterSpacing: -0.4 }}>{hero.course}</h2>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", marginTop: 4 }}>{hero.week} · {hero.lesson}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px" }}>
              <button style={{ ...btnReset, background: C.ink, color: "white", borderRadius: 11, padding: "12px 22px", fontSize: 15, fontWeight: 600, gap: 8 }}><IconPlay size={16} /> Devam et</button>
              <div style={{ flex: 1 }}>
                <div style={{ height: 6, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${hero.progress*100}%`, background: C.accent }} /></div>
              </div>
              <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{hero.left}</span>
            </div>
          </div>

          {/* schedule — col 4, spans 2 rows */}
          <div style={{ gridColumn: "4 / 5", gridRow: "1 / 3", border: `1px solid ${C.line}`, borderRadius: 18, background: "white", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><IconCalendar size={17} /><span style={{ fontSize: 15, fontWeight: 700 }}>Bu hafta</span></div>
            {[
              { d: "Bugün", t: "Sarf — Beşinci bab", c: C.accent },
              { d: "Çar", t: "Nahiv tatbikat", c: "#64748b" },
              { d: "Cmt", t: "Canlı halka 21:00", c: "#dc2626" },
            ].map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 9, height: 9, borderRadius: 99, background: e.c, marginTop: 4 }} />
                  {i < 2 && <div style={{ width: 2, flex: 1, background: C.lineSoft, marginTop: 4, minHeight: 28 }} />}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: e.c }}>{e.d}</div>
                  <div style={{ fontSize: 13.5, color: C.ink, marginTop: 2, lineHeight: 1.35 }}>{e.t}</div>
                </div>
              </div>
            ))}
          </div>

          {/* progress ring */}
          <div style={{ gridColumn: "1 / 2", gridRow: "3", border: `1px solid ${C.line}`, borderRadius: 18, background: "white", padding: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <ProgressRing value={0.42} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>%42</div>
              <div style={{ fontSize: 12.5, color: C.muted }}>genel ilerleme</div>
            </div>
          </div>

          {/* live */}
          <div style={{ gridColumn: "2 / 3", gridRow: "3", border: `1px solid ${C.line}`, borderRadius: 18, background: "white", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "#ef4444" }} /><span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Canlı yakında</span></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>Hafta Sonu Müzakeresi</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Cmt 21:00 · Süleymaniye</div>
          </div>

          {/* streak */}
          <div style={{ gridColumn: "3 / 4", gridRow: "3", border: `1px solid ${C.line}`, borderRadius: 18, background: "white", padding: 20 }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, color: C.ink }}>12<span style={{ fontSize: 15, color: C.muted, fontWeight: 600 }}> gün</span></div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>çalışma serisi</div>
            <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
              {Array.from({length:7}).map((_,i)=><div key={i} style={{ flex: 1, height: 22, borderRadius: 5, background: i < 5 ? C.accent : C.surfaceSunken }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProgressRing = ({ value }) => {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <svg width={58} height={58} viewBox="0 0 58 58">
      <circle cx="29" cy="29" r={r} fill="none" stroke={TL.surfaceSunken} strokeWidth="7" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={TL.accent} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 29 29)" />
    </svg>
  );
};

// =================================================================
// C. CONTENT FEED (horizontal rails)
// =================================================================
const TedrisFeed = () => {
  const C = TL;
  return (
    <div data-screen-label="Tedris C · İçerik feed" style={{ fontFamily: MD_FONT, background: "#fff", color: C.ink, minHeight: 880 }}>
      {/* centered top nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "18px 40px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><MadrasahLogo size={32} /><span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Tedris</span></div>
        <nav style={{ display: "flex", gap: 22, marginLeft: 20 }}>
          {["Ev", "Öğrenme", "Desteler"].map((t, i) => (
            <span key={t} style={{ fontSize: 14, fontWeight: i === 1 ? 600 : 500, color: i === 1 ? C.ink : C.muted, paddingBottom: 2, borderBottom: i === 1 ? `2px solid ${C.ink}` : "none" }}>{t}</span>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 16px", color: C.muted, width: 220 }}><IconSearch size={16} /><span style={{ fontSize: 13.5 }}>Ara...</span></div>
        <div style={{ width: 34, height: 34, borderRadius: 99, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>DU</div>
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "30px 40px 50px" }}>
        {/* rail 1: continue */}
        <FeedRail title="Kaldığın yerden devam et" badge={`${TL_CONT.length} ders`}>
          {TL_CONT.map((c, i) => {
            const tm = tlType[c.type];
            return (
              <div key={i} style={{ width: 264, flexShrink: 0, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
                <div style={{ position: "relative", padding: 8 }}>
                  <CoverPlaceholder hue={c.hue} label={c.cat} height={96} dense />
                  <div style={{ position: "absolute", right: 18, bottom: 18, width: 34, height: 34, borderRadius: 99, background: "white", boxShadow: "0 3px 12px rgba(0,0,0,.2)", display: "grid", placeItems: "center" }}><IconPlay size={15} /></div>
                </div>
                <div style={{ padding: "4px 14px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: 11, fontWeight: 600, color: tm.color }}>{tm.icon()} {tm.label} <span style={{ color: C.faint, fontWeight: 400 }}>· {c.week}</span></div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{c.lesson}</div>
                  <div style={{ fontSize: 12, color: C.muted, margin: "3px 0 10px" }}>{c.course}</div>
                  <div style={{ height: 5, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${c.progress*100}%`, background: C.accent }} /></div>
                </div>
              </div>
            );
          })}
        </FeedRail>

        {/* rail 2: köşkler */}
        <FeedRail title="Köşkleri keşfet" link="Tümü">
          {TL_KOSKS.map((k, i) => (
            <div key={i} style={{ width: 220, flexShrink: 0, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ position: "relative", height: 64 }}>
                <CoverPlaceholder hue={k.hue} height={64} />
                <div style={{ position: "absolute", left: 14, bottom: -18 }}><div style={{ width: 42, height: 42, borderRadius: 10, background: "white", border: `1px solid ${C.line}`, display: "grid", placeItems: "center" }}><MadrasahLogo size={28} /></div></div>
              </div>
              <div style={{ padding: "26px 14px 14px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: -0.2 }}>{k.name}</div>
                <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 10px" }}>{k.level}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.muted, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconBook size={12} /> {k.courses}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconUsers size={12} /> {k.students}</span>
                </div>
              </div>
            </div>
          ))}
        </FeedRail>

        {/* rail 3: recommended */}
        <FeedRail title="Senin için önerilen" link="Tümü">
          {[
            { cat: "Belâgat", hue: 240, title: "Meânî İlmine Giriş", muderris: "Müderris Fatih Kaya" },
            { cat: "Fıkıh", hue: 165, title: "Nûru'l-Îzâh Şerhi", muderris: "Müderris Ahmed Hilmi" },
            { cat: "Hadis", hue: 28, title: "Erbaîn-i Neveviyye", muderris: "Müderris Ömer Faruk" },
            { cat: "Akaid", hue: 340, title: "Akâid-i Nesefî", muderris: "Müderris Selim Yavuz" },
          ].map((c, i) => (
            <div key={i} style={{ width: 264, flexShrink: 0, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ padding: 8 }}><CoverPlaceholder hue={c.hue} label={c.cat} height={104} dense /></div>
              <div style={{ padding: "4px 14px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{c.cat}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: -0.2 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{c.muderris}</div>
              </div>
            </div>
          ))}
        </FeedRail>
      </div>
    </div>
  );
};

const FeedRail = ({ title, badge, link, children }) => {
  const C = TL;
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>{title}</h2>
        {badge && <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: C.accentSoft, padding: "2px 9px", borderRadius: 99 }}>{badge}</span>}
        <div style={{ flex: 1 }} />
        {link && <span style={{ fontSize: 13, fontWeight: 500, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>{link} <IconArrowRight size={13} /></span>}
      </div>
      <div style={{ display: "flex", gap: 16, overflow: "hidden" }}>{children}</div>
    </section>
  );
};

Object.assign(window, { TedrisTwoPane, TedrisBento, TedrisFeed });

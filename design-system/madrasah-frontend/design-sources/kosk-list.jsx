/* eslint-disable */
// /kosk — Köşkler listing page (the "Öğrenme" landing).
// Lists every köşk (publisher) a talebe can browse: featured strip, filter
// chips, and a responsive grid of köşk cards. Clicking a card → /kosk/[id].

const KoskListPage = () => {
  const C = MD_COLORS;

  const filters = ["Tümü", "Takip ettiklerim", "Önerilen", "Yeni açılanlar"];
  const fields = [
    { id: "all",   label: "Tüm alanlar", count: 38, active: true },
    { id: "alet",  label: "Âlet ilimleri", count: 14 },
    { id: "fiqh",  label: "Fıkıh & Usûl", count: 9 },
    { id: "akaid", label: "Akaid & Kelâm", count: 6 },
    { id: "tefsir",label: "Tefsir & Hadis", count: 5 },
    { id: "tasav", label: "Tasavvuf & Ahlâk", count: 4 },
  ];

  const featured = null;

  // Devam eden dersler — kullanıcının farklı köşklerde yarım kalan dersleri.
  const continuing = [
    {
      kosk: "Süleymaniye Köşkü", course: "Bina ve İzhar Şerhi", hue: 145, cat: "Sarf",
      lesson: "Beşinci Babın Şerhi — فَتَحَ Bâbı", type: "video", dur: "31 dk",
      left: "11 dk kaldı", progress: 0.35, week: "Hafta 3", muderris: "AH", mhue: 145,
    },
    {
      kosk: "Karaman Köşkü", course: "Avâmil — Nahiv Esasları", hue: 270, cat: "Nahiv",
      lesson: "Tatbikat Defteri 3 — Âmil Çeşitleri", type: "doc", dur: "PDF",
      left: "2 alıştırma kaldı", progress: 0.62, week: "Hafta 4", muderris: "SY", mhue: 270,
    },
    {
      kosk: "Fâtih Köşkü", course: "Hadis Usûlü", hue: 28, cat: "Hadis",
      lesson: "Hafta Sonu Müzakeresi", type: "live", dur: "60 dk",
      left: "Cumartesi 21:00", progress: 0.48, week: "Hafta 2", muderris: "MÖ", mhue: 28,
    },
  ];

  const kosks = [
    { name: "Fâtih Köşkü", handle: "@fatih", hue: 28, courses: 11, students: 364, muderris: 4, rating: 4.7,
      desc: "Tefsir ve hadis usûlü ağırlıklı; rivayet zincirleri ve metin tahlili.", tags: ["Tefsir", "Hadis"], following: true, level: "Tüm seviyeler" },
    { name: "Beyazıt Köşkü", handle: "@beyazit", hue: 270, courses: 8, students: 221, muderris: 3, rating: 4.9,
      desc: "Mantık ve âdâbu'l-bahs üzerine yoğunlaşan ileri düzey halkalar.", tags: ["Mantık", "Münâzara"], following: false, level: "İleri" },
    { name: "Karaman Köşkü", handle: "@karaman", hue: 145, courses: 16, students: 538, muderris: 7, rating: 4.6,
      desc: "Yeni başlayanlar için Arapça sarf-nahiv ve kıraat temelleri.", tags: ["Arapça", "Kıraat"], following: true, level: "Başlangıç" },
    { name: "Nûruosmaniye Köşkü", handle: "@nuruosmaniye", hue: 340, courses: 6, students: 158, muderris: 2, rating: 4.8,
      desc: "Akaid ve kelâm metinleri; Nesefî ve Senûsî şerhleri.", tags: ["Akaid", "Kelâm"], following: false, level: "Orta" },
    { name: "Sahn-ı Semân", handle: "@sahnisemman", hue: 200, courses: 22, students: 904, muderris: 11, rating: 4.9,
      desc: "Köklü medrese geleneğini sürdüren geniş müfredatlı büyük köşk.", tags: ["Fıkıh", "Usûl", "Belâgat"], following: false, level: "Tüm seviyeler", verified: true },
    { name: "Dârülhadis Köşkü", handle: "@darulhadis", hue: 60, courses: 9, students: 276, muderris: 4, rating: 4.7,
      desc: "Kütüb-i sitte üzerine sistematik hadis dersleri ve şerhleri.", tags: ["Hadis", "Şerh"], following: false, level: "Orta" },
    { name: "Eyüp Köşkü", handle: "@eyup", hue: 12, courses: 7, students: 189, muderris: 3, rating: 4.5,
      desc: "Tasavvuf, ahlâk ve âdâb dersleri; klasik ahlâk metinleri.", tags: ["Tasavvuf", "Ahlâk"], following: true, level: "Başlangıç" },
    { name: "Ayasofya Köşkü", handle: "@ayasofya", hue: 240, courses: 13, students: 421, muderris: 5, rating: 4.8,
      desc: "Belâgat üçlemesi: meânî, beyân, bedî' ile metin estetiği.", tags: ["Belâgat", "Edebiyat"], following: false, level: "İleri" },
  ];

  return (
    <PageShell activeTab="ogrenme" label="00 Köşkler">
      <div style={{ padding: "20px 36px 60px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
          <span>Öğrenme</span>
          <IconChevronRight size={14} />
          <span style={{ color: C.text, fontWeight: 500 }}>Köşkler</span>
        </div>

        {/* Page heading */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.4 }}>Köşkler</h1>
            <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0", maxWidth: 560 }}>
              İlim halkalarını yürüten köşkleri keşfedin, takip edin ve derslerine katılın.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", width: 240, color: C.muted, background: "white" }}>
              <IconSearch size={16} />
              <span style={{ fontSize: 13 }}>Köşk ara...</span>
            </div>
          </div>
        </div>

        {/* Devam eden dersler — kullanıcının yarım kalan dersleri, köşk seçmeden hızlı erişim */}
        <section style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.3 }}>Kaldığın yerden devam et</h2>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: C.accentSoft, padding: "2px 9px", borderRadius: 99 }}>{continuing.length} ders</span>
            </div>
            <a href="#" style={{ ...btnReset, fontSize: 13, fontWeight: 500, color: C.muted, textDecoration: "none" }}>
              Tüm derslerim <IconArrowRight size={13} />
            </a>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {continuing.map((c, i) => <ContinueCard key={i} c={c} />)}
          </div>
        </section>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {filters.map((f, i) => <Pill key={f} active={i === 0}>{f}</Pill>)}
          <div style={{ flex: 1 }} />
          <button style={{ ...ghostBtn(C), padding: "8px 12px" }}>
            <IconFilter size={14} /> Sırala: Popüler
          </button>
        </div>

        {/* Layout: sidebar fields + grid */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28 }}>
          <aside>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: C.faint, marginBottom: 10, paddingLeft: 10 }}>İlim alanları</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {fields.map(f => (
                <li key={f.id}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8,
                    background: f.active ? C.surfaceSunken : "transparent",
                    fontSize: 13, fontWeight: f.active ? 600 : 500,
                    color: f.active ? C.text : C.muted, cursor: "pointer",
                  }}>
                    <span>{f.label}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{f.count}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div style={{ height: 1, background: C.borderSoft, margin: "16px 0" }} />

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: C.surfaceAlt }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <IconUsers size={16} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Köşk aç</span>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px", lineHeight: 1.55 }}>
                Müderris misiniz? Kendi köşkünüzü açıp ders halkalarınızı başlatın.
              </p>
              <button style={{ ...ghostBtnFull(C), width: "100%" }}>Başvuru yap</button>
            </div>
          </aside>

          {/* Köşk grid */}
          <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {kosks.map((k, i) => <KoskCard key={i} k={k} />)}
          </main>
        </div>
      </div>
    </PageShell>
  );
};

const KoskCard = ({ k }) => {
  const C = MD_COLORS;
  return (
    <a href="design-sources/kosk.html" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 14, background: "white",
        overflow: "hidden", height: "100%", display: "flex", flexDirection: "column",
      }}>
        {/* banner */}
        <div style={{ position: "relative", height: 84 }}>
          <CoverPlaceholder hue={k.hue} height={84} />
          <div style={{ position: "absolute", left: 16, bottom: -22 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: "white", border: `1px solid ${C.border}`, display: "grid", placeItems: "center" }}>
              <MadrasahLogo size={34} />
            </div>
          </div>
        </div>

        <div style={{ padding: "30px 16px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, letterSpacing: -0.2 }}>{k.name}</h3>
            {k.verified && <IconCheckCircle filled size={15} />}
            <span style={{ flex: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: C.text }}>
              <IconStar filled size={12} style={{ color: "#f59e0b" }} /> {k.rating}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{k.handle} · {k.level}</div>
          <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px", lineHeight: 1.5, flex: 1 }}>{k.desc}</p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {k.tags.map(t => (
              <span key={t} style={{ fontSize: 11, fontWeight: 500, color: C.text, background: C.surfaceSunken, padding: "3px 9px", borderRadius: 999 }}>{t}</span>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${C.borderSoft}` }}>
            <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.muted }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconBook size={13} /> {k.courses}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconUsers size={13} /> {k.students}</span>
            </div>
            <button onClick={(e) => e.preventDefault()} style={{
              ...btnReset,
              fontSize: 12, fontWeight: 600,
              padding: "5px 12px", borderRadius: 999,
              border: k.following ? "none" : `1px solid ${C.border}`,
              background: k.following ? C.surfaceSunken : "white",
              color: k.following ? C.muted : C.text,
            }}>
              {k.following ? <><IconCheck size={12} /> Takipte</> : <><IconPlus size={12} /> Takip</>}
            </button>
          </div>
        </div>
      </div>
    </a>
  );
};

const ContinueCard = ({ c }) => {
  const C = MD_COLORS;
  const typeMeta = {
    video: { label: "Video ders", icon: <IconPlayOutline size={13} />, color: "#1d4ed8" },
    doc:   { label: "Doküman",     icon: <IconPdf size={13} />,        color: "#64748b" },
    live:  { label: "Canlı halka", icon: <IconHeadset size={13} />,    color: "#dc2626" },
    quiz:  { label: "Sınav",       icon: <IconQuiz size={13} />,       color: "#d97706" },
  }[c.type] || { label: "Ders", icon: <IconBook size={13} />, color: C.muted };

  return (
    <a href={`design-sources/lesson.html?type=${c.type}`} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 14, background: "white",
        overflow: "hidden", height: "100%", display: "flex", flexDirection: "column",
      }}>
        {/* cover with play overlay */}
        <div style={{ position: "relative", padding: 10 }}>
          <CoverPlaceholder hue={c.hue} label={c.cat} height={110} dense />
          {/* köşk chip */}
          <div style={{ position: "absolute", top: 18, left: 18, background: "rgba(255,255,255,.94)", borderRadius: 99, padding: "4px 10px 4px 4px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.text }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: `oklch(0.92 0.05 ${c.hue})`, display: "grid", placeItems: "center" }}><MadrasahLogo size={13} /></div>
            {c.kosk}
          </div>
          {/* resume button */}
          <div style={{ position: "absolute", right: 22, bottom: 22, width: 40, height: 40, borderRadius: 99, background: "white", boxShadow: "0 4px 14px rgba(15,23,42,.22)", display: "grid", placeItems: "center", color: C.dark }}>
            <IconPlay size={18} />
          </div>
        </div>

        <div style={{ padding: "4px 16px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
          {/* type + week */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: typeMeta.color }}>
              {typeMeta.icon} {typeMeta.label}
            </span>
            <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
            <span style={{ fontSize: 11, color: C.muted }}>{c.week}</span>
          </div>

          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{c.course}</div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, letterSpacing: -0.2, lineHeight: 1.3, flex: 1 }}>{c.lesson}</h3>

          {/* progress */}
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 5, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.progress * 100}%`, background: C.accent, borderRadius: 99 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <IconClock size={12} /> {c.left}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, display: "inline-flex", alignItems: "center", gap: 4 }}>
                Devam et <IconArrowRight size={13} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
};

const primaryBtn = (C) => ({
  ...btnReset, background: C.dark, color: "white", borderRadius: 10,
  padding: "9px 16px", fontSize: 13, fontWeight: 500,
});
const ghostBtn = (C) => ({
  ...btnReset, background: "white", color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 500,
});
const ghostBtnFull = (C) => ({
  ...btnReset, background: "white", color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 500,
  justifyContent: "center",
});

window.KoskListPage = KoskListPage;

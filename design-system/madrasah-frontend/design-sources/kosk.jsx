/* eslint-disable */
// Köşk (publisher) detail page — /kosk/[koskId]
// Lists the courses that belong to a particular köşk, with a header summary card,
// filter pills, and a CTA to create a new course.

const KoskPage = () => {
  const C = MD_COLORS;

  const kosk = {
    name: "Süleymaniye Köşkü",
    handle: "@suleymaniye",
    description:
      "Klasik medrese müfredatına dayalı; sarf, nahiv, mantık ve usûl-i fıkıh dersleri sunan köşk. Her hafta canlı müzakereler ve müderris–talebe halkaları.",
    cover: 215,
    stats: { courses: 14, students: 482, muderris: 6, rating: 4.8 },
    muderris: [
      { name: "MÖ", hue: 28 },
      { name: "AH", hue: 145 },
      { name: "SY", hue: 270 },
      { name: "FK", hue: 200 },
      { name: "İA", hue: 340 },
      { name: "+1", hue: 0 },
    ],
    tags: ["Arapça", "Fıkıh", "Akaid", "Mantık"],
  };

  const filters = ["Tümü", "Devam ediyorum", "Tamamlandım", "Kayıt bekliyor"];
  const categories = [
    { id: "all",   label: "Tüm dersler", count: 14, active: true },
    { id: "sarf",  label: "Sarf",        count: 3 },
    { id: "nahv",  label: "Nahiv",       count: 4 },
    { id: "fiqh",  label: "Fıkıh",       count: 3 },
    { id: "mantq", label: "Mantık",      count: 2 },
    { id: "akaid", label: "Akaid",       count: 2 },
  ];

  const courses = [
    {
      title: "Emsile — Sarf'a Giriş",
      subtitle: "Birinci sınıf · 8 hafta",
      muderris: "Müderris Ömer Faruk",
      muderrisInit: "MÖ",
      muderrisHue: 28,
      cat: "Sarf",
      hue: 28,
      weeks: 8, lessons: 32, kaynak: 4,
      progress: 0.72,
      status: "enrolled",
      level: "Başlangıç",
    },
    {
      title: "Bina ve İzhar Şerhi",
      subtitle: "İkinci sınıf · 10 hafta",
      muderris: "Müderris Ahmed Hilmi",
      muderrisInit: "AH",
      muderrisHue: 145,
      cat: "Sarf",
      hue: 145,
      weeks: 10, lessons: 40, kaynak: 5,
      progress: 0.35,
      status: "enrolled",
      level: "Orta",
    },
    {
      title: "Avâmil — Nahiv Esasları",
      subtitle: "Birinci sınıf · 6 hafta",
      muderris: "Müderris Selim Yavuz",
      muderrisInit: "SY",
      muderrisHue: 270,
      cat: "Nahiv",
      hue: 270,
      weeks: 6, lessons: 24, kaynak: 3,
      progress: 1.0,
      status: "completed",
      level: "Başlangıç",
    },
    {
      title: "İzhâru'l-Esrâr",
      subtitle: "İkinci sınıf · 12 hafta",
      muderris: "Müderris Selim Yavuz",
      muderrisInit: "SY",
      muderrisHue: 270,
      cat: "Nahiv",
      hue: 200,
      weeks: 12, lessons: 48, kaynak: 6,
      progress: 0.18,
      status: "enrolled",
      level: "Orta",
    },
    {
      title: "Kâfiye — İleri Nahiv",
      subtitle: "Üçüncü sınıf · 14 hafta",
      muderris: "Müderris Fatih Kaya",
      muderrisInit: "FK",
      muderrisHue: 200,
      cat: "Nahiv",
      hue: 340,
      weeks: 14, lessons: 56, kaynak: 8,
      progress: 0,
      status: "available",
      level: "İleri",
    },
    {
      title: "Îsâgûcî — Mantığa Giriş",
      subtitle: "Birinci sınıf · 6 hafta",
      muderris: "Müderris İbrahim Aksoy",
      muderrisInit: "İA",
      muderrisHue: 340,
      cat: "Mantık",
      hue: 60,
      weeks: 6, lessons: 18, kaynak: 2,
      progress: 0,
      status: "available",
      level: "Başlangıç",
    },
  ];

  return (
    <PageShell activeTab="ogrenme" label="01 Köşk · Süleymaniye">
      <div style={{ padding: "20px 36px 60px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 20 }}>
          <span>Öğrenme</span>
          <IconChevronRight size={14} />
          <a href="design-sources/kosk-list.html" style={{ color: C.muted, textDecoration: "none" }}>Köşkler</a>
          <IconChevronRight size={14} />
          <span style={{ color: C.text, fontWeight: 500 }}>Süleymaniye Köşkü</span>
        </div>

        {/* Köşk header card */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 22,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 24,
          alignItems: "center",
          marginBottom: 28,
          background: "linear-gradient(180deg, #fafbfd 0%, #ffffff 80%)",
        }}>
          {/* avatar */}
          <div style={{ position: "relative" }}>
            <div style={{ width: 96, height: 96, borderRadius: 18, background: `oklch(0.95 0.05 ${kosk.cover})`, border: `1px solid ${C.border}`, display: "grid", placeItems: "center" }}>
              <MadrasahLogo size={56} />
            </div>
            <div style={{ position: "absolute", bottom: -6, right: -6, background: "white", border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 600, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconLock size={11} /> Özel
            </div>
          </div>

          {/* main */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.4 }}>{kosk.name}</h1>
              <span style={{ fontSize: 13, color: C.muted }}>{kosk.handle}</span>
            </div>
            <p style={{ fontSize: 14, color: C.muted, margin: "0 0 12px", maxWidth: 720, lineHeight: 1.55 }}>{kosk.description}</p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {kosk.tags.map(t => (
                <span key={t} style={{ fontSize: 12, fontWeight: 500, color: C.text, background: C.surfaceSunken, padding: "4px 10px", borderRadius: 999 }}>{t}</span>
              ))}
            </div>
          </div>

          {/* stats column */}
          <div style={{ display: "flex", gap: 28, paddingLeft: 12, borderLeft: `1px solid ${C.borderSoft}` }}>
            {[
              { label: "Ders", value: kosk.stats.courses },
              { label: "Talebe", value: kosk.stats.students },
              { label: "Müderris", value: kosk.stats.muderris },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center", minWidth: 56 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", marginRight: 0 }}>
                {kosk.muderris.slice(0, 5).map((m, i) => (
                  <div key={i} style={{ marginLeft: i ? -8 : 0 }}>
                    <Avatar name={m.name} hue={m.hue} size={28} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>Müderrisler</div>
            </div>
          </div>
        </div>

        {/* Toolbar: filters + new course */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {filters.map((f, i) => (
            <Pill key={f} active={i === 0}>{f}</Pill>
          ))}
          <div style={{ flex: 1 }} />
          <button style={{
            ...btnReset,
            background: "white",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: C.text,
          }}>
            <IconFilter size={14} /> Sırala: En yeni
          </button>
          <a href="design-sources/new-course.html" style={{ textDecoration: "none" }}>
            <button style={{
              ...btnReset,
              background: C.dark,
              color: "white",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 500,
            }}>
              <IconPlus size={14} /> Yeni Kurs
            </button>
          </a>
        </div>

        {/* Layout: sidebar categories + grid */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28 }}>
          {/* Categories */}
          <aside>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: C.faint, marginBottom: 10, paddingLeft: 10 }}>Kategoriler</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {categories.map(c => (
                <li key={c.id}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 8,
                    background: c.active ? C.surfaceSunken : "transparent",
                    fontSize: 13,
                    fontWeight: c.active ? 600 : 500,
                    color: c.active ? C.text : C.muted,
                    cursor: "pointer",
                  }}>
                    <span>{c.label}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{c.count}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div style={{ height: 1, background: C.borderSoft, margin: "16px 0" }} />

            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: C.faint, marginBottom: 10, paddingLeft: 10 }}>Seviye</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {["Başlangıç", "Orta", "İleri"].map(l => (
                <li key={l} style={{ padding: "8px 10px", fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${C.border}` }} />
                  {l}
                </li>
              ))}
            </ul>
          </aside>

          {/* Course grid */}
          <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {courses.map((c, i) => <CourseCard key={i} c={c} />)}
          </main>
        </div>
      </div>
    </PageShell>
  );
};

const CourseCard = ({ c }) => {
  const C = MD_COLORS;
  return (
    <a href="design-sources/course.html" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        background: "white",
        overflow: "hidden",
        transition: "border-color .15s, transform .15s",
        position: "relative",
        height: "100%",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: 10 }}>
          <CoverPlaceholder hue={c.hue} label={c.cat} height={132} dense />
        </div>

        <div style={{ padding: "4px 16px 16px" }}>
          {/* Level + category */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{c.cat}</span>
            <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
            <span style={{ fontSize: 11, color: C.muted }}>{c.level}</span>
            <span style={{ flex: 1 }} />
            <button style={{ ...btnReset, color: C.faint }}><IconBookmark filled size={16} /></button>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, letterSpacing: -0.2, lineHeight: 1.3 }}>{c.title}</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{c.subtitle}</p>

          {/* Müderris */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <Avatar name={c.muderrisInit} hue={c.muderrisHue} size={22} />
            <span style={{ fontSize: 12, color: C.text }}>{c.muderris}</span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 14, marginTop: 12, color: C.muted, fontSize: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconCalendar size={13} /> {c.weeks} hafta
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconPlayOutline size={13} /> {c.lessons} ders
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconBook size={13} /> {c.kaynak} kaynak
            </span>
          </div>

          {/* Progress */}
          {c.status !== "available" && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 5, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${c.progress * 100}%`,
                  background: c.progress === 1 ? C.success : C.accent,
                  borderRadius: 99,
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11 }}>
                <span style={{ color: c.progress === 1 ? C.success : C.muted, fontWeight: 500 }}>
                  {c.progress === 1 ? "Tamamlandı" : `%${Math.round(c.progress * 100)} tamamlandı`}
                </span>
                <span style={{ color: C.faint }}>{Math.round(c.lessons * c.progress)}/{c.lessons} ders</span>
              </div>
            </div>
          )}

          {c.status === "available" && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.accent, fontWeight: 500 }}>
              <IconPlus size={13} /> Kayıt ol
            </div>
          )}
        </div>
      </div>
    </a>
  );
};

window.KoskPage = KoskPage;

/* eslint-disable */
// /courses/[courseId] — Course detail page (Udemy-like learning surface).
// /courses/[courseId]/syllabus — overlay modal triggered from the "Tüm Müfredatı Gör" button.

const COURSE = {
  title: "Bina ve İzhar Şerhi",
  subtitle: "Klasik sarf metni — şerh, illet ve tatbiki örneklerle.",
  category: "Sarf",
  level: "Orta",
  level_ar: "متوسط",
  hue: 145,
  rating: 4.8,
  rating_count: 132,
  students: 248,
  duration_h: 22,
  language: "Türkçe / Arapça",
  last_updated: "Ekim 2026",
  weeks: 10,
  lessons_total: 40,
  progress: 0.35,
  next_lesson: "Hafta 3 · Dördüncü Bab Şerhi",
  next_dur: "29 dk",
  description: "Sarf ilminin orta seviye eseri olan Bina kitabını, klasik şerh metoduyla; her babın yapısı, illetleri ve tatbiki örnekleriyle birlikte ele alır. Talebeler haftalık müzakerelere ve müderris kontrolündeki tatbikat defterlerine erişim kazanır.",
  outcomes: [
    "Sülâsî mücerredin altı babını ezberden çekebilme",
    "İlel ve idğâm kaidelerini metin üzerinde tatbik",
    "Mezîd fiil bablarının manalarını ayırt edebilme",
    "Klasik şerh metodunda not tutma ve müzakere",
  ],
  muderris: [
    { init: "AH", name: "Müderris Ahmed Hilmi", title: "Sarf ve Nahiv Müderrisi", hue: 145, students: 1240, courses: 8, rating: 4.9,
      bio: "On beş yıldır klasik medrese müfredatında sarf, nahiv ve belâgat dersleri vermektedir. Şam ve İstanbul'da icâzetlidir." },
    { init: "MÖ", name: "Müderris Ömer Faruk", title: "Müzakere ve tatbikat", hue: 28, students: 980, courses: 5, rating: 4.8,
      bio: "Haftalık müzakere halkalarını yürütür, tatbikat defterlerini değerlendirir." },
  ],
  kaynaklar: [
    { name: "Bina ve İzhar — Klasik metin", meta: "PDF · 124 sayfa", type: "pdf" },
    { name: "Sarf — Vocabulary Deck",       meta: "Deste · 86 kart", type: "deck" },
    { name: "Tatbikat defteri",             meta: "Doküman · 38 alıştırma", type: "doc" },
  ],
};

const SYLLABUS = [
  {
    week: 1, title: "Sülâsî Mücerred — Birinci Bab", state: "done",
    summary: "Müfredat tanıtımı ve birinci babın îsâgûcîsi, türev örnekleri.",
    lessons: [
      { title: "Açılış mütalaası ve müfredat tanıtımı", type: "video", dur: "12 dk", done: true,  preview: true,  kaynak: null },
      { title: "Birinci babın îsâgûcîsi",                type: "video", dur: "28 dk", done: true,  kaynak: "Bina · s. 4-9" },
      { title: "Türev örnekleri tatbikat",               type: "doc",   dur: "PDF",   done: true,  kaynak: "Tatbikat 1" },
      { title: "Hafta sonu müzakeresi",                   type: "live",  dur: "45 dk", done: true,  kaynak: "Canlı halka" },
    ],
  },
  {
    week: 2, title: "İkinci ve Üçüncü Bab", state: "done",
    summary: "نَصَر / ضَرَب babları ve aralarındaki illet farkları.",
    lessons: [
      { title: "İkinci bab şerhi",       type: "video", dur: "32 dk", done: true, kaynak: "Bina · s. 10-15" },
      { title: "Üçüncü bab şerhi",       type: "video", dur: "30 dk", done: true, kaynak: "Bina · s. 16-19" },
      { title: "Karşılaştırmalı tablo",  type: "doc",   dur: "PDF",   done: true },
      { title: "Müzakere",                type: "live",  dur: "45 dk", done: true },
      { title: "Ölçme ve değerlendirme",  type: "quiz",  dur: "10 soru", done: true },
    ],
  },
  {
    week: 3, title: "Dördüncü ve Beşinci Bab", state: "active",
    summary: "فَتَح bâbı ve harf-i halk illetleri.",
    lessons: [
      { title: "Dördüncü babın şerhi",   type: "video", dur: "29 dk", done: true,  current: false },
      { title: "Beşinci babın şerhi",     type: "video", dur: "31 dk", done: false, current: true },
      { title: "Tatbikat defteri 3",      type: "doc",   dur: "PDF",   done: false },
      { title: "Müzakere",                type: "live",  dur: "45 dk", done: false },
    ],
  },
  {
    week: 4, title: "Altıncı Bab ve Tekrar", state: "locked", locked: false,
    summary: "Altıncı bab şerhi, ilk altı babın umumi tekrarı ve sınav.",
    lessons: [
      { title: "Altıncı babın şerhi",     type: "video", dur: "28 dk" },
      { title: "Genel tekrar",            type: "video", dur: "40 dk" },
      { title: "Ara sınav",                type: "quiz",  dur: "20 soru" },
    ],
  },
  {
    week: 5, title: "Sülâsî Mezîd — Bablar", state: "locked",
    summary: "İf'âl, tef'îl, mufâ'ele bablarının yapısı ve manaları.",
    lessons: [
      { title: "İf'âl babı",   type: "video", dur: "34 dk" },
      { title: "Tef'îl babı",  type: "video", dur: "32 dk" },
      { title: "Mufâ'ele",     type: "video", dur: "28 dk" },
      { title: "Müzakere",     type: "live",  dur: "45 dk" },
    ],
  },
  { week: 6, title: "İnfi'âl, İfti'âl, İstef'âl", state: "locked", summary: "Mezîdin sülâsîye uzanışı, anlamca incelikler.", lessons: new Array(4).fill({ type: "video", dur: "28 dk", title: "Ders" }) },
  { week: 7, title: "İdğâm Kaideleri",              state: "locked", summary: "Misleyn, mütekâriben ve mütecâniseyn idğâmı.", lessons: new Array(3).fill({ type: "video", dur: "26 dk", title: "Ders" }) },
  { week: 8, title: "İllet ve Kalb",                state: "locked", summary: "Va‑vlı ve ya‑lı kelimelerde illet.",            lessons: new Array(4).fill({ type: "video", dur: "30 dk", title: "Ders" }) },
  { week: 9, title: "İzhâr — Genel Tatbikat",       state: "locked", summary: "İzhâr metni üzerinde uygulamalı şerh.",         lessons: new Array(3).fill({ type: "live", dur: "60 dk", title: "Halka" }) },
  { week: 10, title: "İcâzet ve Mütalaa",           state: "locked", summary: "Genel müzakere, bitirme sınavı ve icâzet.",     lessons: new Array(3).fill({ type: "quiz", dur: "Sınav", title: "Final" }) },
];

const LessonIcon = ({ type, size = 14 }) => {
  const C = MD_COLORS;
  switch (type) {
    case "video": return <IconPlayOutline size={size} />;
    case "doc":   return <IconPdf size={size} />;
    case "live":  return <IconHeadset size={size} />;
    case "quiz":  return <IconQuiz size={size} />;
    default:      return <IconDoc size={size} />;
  }
};

const CoursePage = () => {
  const C = MD_COLORS;
  const [showSyllabus, setShowSyllabus] = React.useState(false);
  const [tab, setTab] = React.useState("mufredat");
  const [openWeek, setOpenWeek] = React.useState(3);

  return (
    <PageShell activeTab="ogrenme" label="03 Kurs · Bina ve İzhar Şerhi">
      <div style={{ background: C.surface }}>

        {/* Hero band */}
        <div style={{
          background: `linear-gradient(180deg, oklch(0.97 0.025 ${COURSE.hue}) 0%, white 100%)`,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 36px 28px" }}>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
              <a href="design-sources/kosk.html" style={{ color: C.muted, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconArrowLeft size={14} /> Süleymaniye Köşkü
              </a>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 36, alignItems: "start" }}>
              {/* left: title block */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{COURSE.category}</span>
                  <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{COURSE.level}</span>
                  <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{COURSE.language}</span>
                </div>
                <h1 style={{ fontSize: 34, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.6, lineHeight: 1.15 }}>{COURSE.title}</h1>
                <p style={{ fontSize: 15, color: C.muted, margin: "10px 0 18px", maxWidth: 640, lineHeight: 1.55 }}>{COURSE.subtitle}</p>

                {/* meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13, color: C.text, marginBottom: 18 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconStar filled size={14} style={{ color: "#f59e0b" }} />
                    <span style={{ fontWeight: 600 }}>{COURSE.rating}</span>
                    <span style={{ color: C.muted }}>({COURSE.rating_count} değerlendirme)</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted }}>
                    <IconUsers size={14} /> {COURSE.students} talebe
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted }}>
                    <IconClock size={14} /> {COURSE.duration_h} saat
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted }}>
                    Son güncelleme {COURSE.last_updated}
                  </span>
                </div>

                {/* Müderrisler */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex" }}>
                    {COURSE.muderris.map((m, i) => (
                      <div key={i} style={{ marginLeft: i ? -8 : 0 }}>
                        <Avatar name={m.init} hue={m.hue} size={32} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Müderris</span>{" "}
                    <span style={{ color: C.text, fontWeight: 500 }}>{COURSE.muderris.map(m => m.name).join(", ")}</span>
                  </div>
                </div>
              </div>

              {/* right: enroll card (sticky) */}
              <div style={{
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                background: "white",
                boxShadow: "0 20px 40px -28px rgba(15, 23, 42, 0.18)",
                overflow: "hidden",
              }}>
                <CoverPlaceholder hue={COURSE.hue} label={COURSE.category} height={160} />
                <div style={{ padding: "16px 18px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>Devam ediyorsun</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>%{Math.round(COURSE.progress * 100)}</span>
                  </div>
                  <div style={{ height: 6, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{ width: `${COURSE.progress * 100}%`, height: "100%", background: C.accent }} />
                  </div>

                  <div style={{ padding: "10px 12px", background: C.surfaceAlt, borderRadius: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Sıradaki ders</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{COURSE.next_lesson}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                      <IconClock size={11} /> {COURSE.next_dur}
                    </div>
                  </div>

                  <a href="design-sources/lesson.html?type=video" style={{ textDecoration: "none" }}>
                    <button style={{ ...primaryBtnFull(C) }}>
                      <IconPlay size={14} /> Derse devam et
                    </button>
                  </a>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ ...ghostBtnFull(C), flex: 1 }}>
                      <IconBookmark size={14} /> Kaydet
                    </button>
                    <button style={{ ...ghostBtnFull(C), flex: 1 }}>
                      <IconShare size={14} /> Paylaş
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${C.borderSoft}`, padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: C.muted, marginBottom: 2 }}>Süre</div>
                    <div style={{ color: C.text, fontWeight: 500 }}>{COURSE.weeks} hafta · {COURSE.lessons_total} ders</div>
                  </div>
                  <div>
                    <div style={{ color: C.muted, marginBottom: 2 }}>İcâzet</div>
                    <div style={{ color: C.text, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <IconCertificate size={14} /> Veriliyor
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section tabs */}
            <div style={{ marginTop: 28, display: "flex", gap: 28, borderBottom: `1px solid ${C.borderSoft}` }}>
              {[
                { id: "genel", label: "Genel Bakış" },
                { id: "mufredat", label: "Müfredat", badge: COURSE.lessons_total },
                { id: "muderris", label: "Müderrisler" },
                { id: "kaynak", label: "Kaynaklar", badge: COURSE.kaynaklar.length },
                { id: "soru", label: "Sorular", badge: 18 },
              ].map(t => {
                const active = tab === t.id;
                return (
                  <div key={t.id} onClick={() => setTab(t.id)} style={{
                    padding: "0 4px 12px",
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? C.text : C.muted,
                    borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}>
                    {t.label}
                    {t.badge !== undefined && (
                      <span style={{ background: active ? C.accentSoft : C.surfaceSunken, color: active ? C.accent : C.muted, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 99 }}>{t.badge}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main body */}
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 36px 60px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 36 }}>

          {/* LEFT */}
          <div>
            {/* Outcomes */}
            <section style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 14px", letterSpacing: -0.2 }}>Bu kursta öğreneceklerin</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {COURSE.outcomes.map((o, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    <div style={{ flexShrink: 0, marginTop: 1, color: C.success }}><IconCheck size={16} /></div>
                    <span>{o}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Müfredat */}
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: -0.2 }}>Müfredat</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {COURSE.weeks} hafta · {COURSE.lessons_total} ders · {COURSE.duration_h} saat
                  </span>
                  <button onClick={() => setShowSyllabus(true)} style={{
                    ...btnReset, fontSize: 13, fontWeight: 500, color: C.accent,
                  }}>
                    Tüm müfredatı gör <IconArrowRight size={13} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {SYLLABUS.slice(0, 5).map((m) => (
                  <WeekModule key={m.week} m={m} open={openWeek === m.week} onToggle={() => setOpenWeek(openWeek === m.week ? null : m.week)} />
                ))}
              </div>

              <button onClick={() => setShowSyllabus(true)} style={{
                ...btnReset, marginTop: 14,
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "10px 16px", fontSize: 13, fontWeight: 500, color: C.text,
                width: "100%", justifyContent: "center",
              }}>
                Kalan 5 haftayı gör
              </button>
            </section>

            {/* Description */}
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px", letterSpacing: -0.2 }}>Açıklama</h2>
              <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.65, maxWidth: 720 }}>{COURSE.description}</p>
            </section>

            {/* Müderrisler */}
            <section style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px", letterSpacing: -0.2 }}>Müderrisler</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {COURSE.muderris.map((m, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 14 }}>
                    <Avatar name={m.init} hue={m.hue} size={48} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{m.title}</div>
                      <p style={{ fontSize: 12, color: C.text, margin: "0 0 10px", lineHeight: 1.55 }}>{m.bio}</p>
                      <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.muted }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconStar filled size={12} style={{ color: "#f59e0b" }} /> {m.rating}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconUsers size={12} /> {m.students.toLocaleString("tr-TR")}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconBook size={12} /> {m.courses} kurs</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT sidebar — kaynaklar */}
          <aside style={{ position: "sticky", top: 24, alignSelf: "start", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Bu kursun kaynakları</h3>
                <span style={{ fontSize: 11, color: C.muted }}>{COURSE.kaynaklar.length} adet</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {COURSE.kaynaklar.map((k, i) => {
                  const icon = k.type === "pdf" ? <IconPdf size={16} /> : k.type === "deck" ? <IconBook size={16} /> : <IconDoc size={16} />;
                  return (
                    <a key={i} href="#" style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 7, background: C.surfaceAlt, display: "grid", placeItems: "center", color: C.muted }}>{icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{k.meta}</div>
                        </div>
                        <IconArrowRight size={14} />
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, background: C.surfaceAlt }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <IconCertificate size={18} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>İcâzet belgesi</span>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px", lineHeight: 1.55 }}>
                Müfredatı %85 ve üzeri tamamlayan talebelere müderris onaylı icâzet verilir.
              </p>
              <div style={{ height: 5, background: "white", borderRadius: 99, marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${COURSE.progress * 100}%`, background: C.accent, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", justifyContent: "space-between" }}>
                <span>%{Math.round(COURSE.progress * 100)} tamamlandı</span>
                <span>%85 hedef</span>
              </div>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>Talebe halkası</h3>
              <div style={{ display: "flex", marginBottom: 10 }}>
                {[28, 145, 270, 200, 340].map((hue, i) => (
                  <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                    <Avatar name={["AY","BE","CN","DH","ES"][i]} hue={hue} size={28} />
                  </div>
                ))}
                <div style={{ marginLeft: -10, width: 28, height: 28, borderRadius: 99, background: C.surfaceSunken, color: C.muted, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, border: "2px solid white" }}>+243</div>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                Hafta 3'ün müzakeresi <span style={{ color: C.text, fontWeight: 500 }}>Cumartesi 21:00</span>'de.
              </p>
              <button style={{ ...ghostBtnFull(C), marginTop: 12, width: "100%", justifyContent: "center" }}>
                <IconChat size={14} /> Halkaya katıl
              </button>
            </div>
          </aside>
        </div>

        {showSyllabus && <SyllabusModal onClose={() => setShowSyllabus(false)} />}
      </div>
    </PageShell>
  );
};

const WeekModule = ({ m, open, onToggle }) => {
  const C = MD_COLORS;
  const locked = m.state === "locked";
  const done = m.state === "done";
  const active = m.state === "active";

  const totalDur = m.lessons.reduce((s, l) => {
    const n = parseInt((l.dur || "").match(/\d+/)?.[0] || 0); return s + n;
  }, 0);

  return (
    <div style={{
      border: `1px solid ${active ? "#cbd5e1" : C.border}`,
      borderRadius: 12,
      background: active ? `oklch(0.985 0.012 ${MD_COLORS.brand === "#0b1f3a" ? 220 : 220})` : "white",
      overflow: "hidden",
      opacity: locked ? 0.85 : 1,
    }}>
      <div onClick={!locked ? onToggle : undefined} style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
        cursor: locked ? "default" : "pointer",
      }}>
        {/* status icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 99,
          display: "grid", placeItems: "center",
          background: done ? C.success : active ? C.dark : "white",
          border: locked ? `1.5px dashed ${C.border}` : "none",
          color: locked ? C.faint : "white",
          fontSize: 11, fontWeight: 600,
        }}>
          {done ? <IconCheck size={14} /> : locked ? <IconLock size={12} /> : m.week}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Hafta {m.week}</span>
            {active && <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: C.accentSoft, padding: "1px 7px", borderRadius: 99, textTransform: "uppercase", letterSpacing: 0.4 }}>Devam ediyor</span>}
            {done && <span style={{ fontSize: 10, fontWeight: 600, color: C.success, background: "#dcfce7", padding: "1px 7px", borderRadius: 99, textTransform: "uppercase", letterSpacing: 0.4 }}>Tamamlandı</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: locked ? C.muted : C.text }}>{m.title}</div>
        </div>

        <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 16 }}>
          <span>{m.lessons.length} ders</span>
          {totalDur > 0 && <span>{totalDur} dk</span>}
          {!locked && <IconChevron size={14} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />}
        </div>
      </div>

      {open && !locked && (
        <div style={{ borderTop: `1px solid ${C.borderSoft}`, padding: "6px 0" }}>
          {m.summary && (
            <div style={{ padding: "8px 16px 4px 58px", fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{m.summary}</div>
          )}
          {m.lessons.map((l, i) => <LessonItem key={i} l={l} />)}
        </div>
      )}
    </div>
  );
};

const LessonItem = ({ l }) => {
  const C = MD_COLORS;
  const typeLabel = { video: "Video", doc: "Doküman", live: "Canlı halka", quiz: "Sınav" }[l.type] || "Ders";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 16px 8px 58px",
      background: l.current ? "rgba(29, 78, 216, 0.04)" : "transparent",
      borderLeft: l.current ? `2px solid ${C.accent}` : "2px solid transparent",
      paddingLeft: l.current ? 56 : 58,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 99,
        display: "grid", placeItems: "center",
        background: l.done ? "#dcfce7" : l.current ? C.accentSoft : C.surfaceSunken,
        color: l.done ? C.success : l.current ? C.accent : C.muted,
      }}>
        {l.done ? <IconCheck size={13} /> : <LessonIcon type={l.type} size={13} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: l.current ? 600 : 500, color: l.done ? C.muted : C.text, textDecoration: l.done ? "line-through" : "none", textDecorationColor: "rgba(100,116,139,.4)" }}>{l.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: C.muted }}>{typeLabel}</span>
          {l.kaynak && (
            <>
              <span style={{ width: 2, height: 2, borderRadius: 99, background: C.faint }} />
              <span style={{ fontSize: 11, color: C.accent }}>{l.kaynak}</span>
            </>
          )}
          {l.preview && (
            <>
              <span style={{ width: 2, height: 2, borderRadius: 99, background: C.faint }} />
              <span style={{ fontSize: 11, color: C.success, fontWeight: 500 }}>Ön izleme</span>
            </>
          )}
        </div>
      </div>

      <span style={{ fontSize: 12, color: C.muted, minWidth: 56, textAlign: "right" }}>{l.dur}</span>
    </div>
  );
};

// ------- Syllabus modal -------
// `contained`: when true, the modal scopes itself to its nearest positioned
// ancestor (absolute, not fixed) — used inside the design-canvas artboard so
// the overlay doesn't escape the artboard and cover the whole canvas.
const SyllabusModal = ({ onClose, contained = false }) => {
  const C = MD_COLORS;
  const [openWeek, setOpenWeek] = React.useState(3);

  const stats = {
    done: SYLLABUS.filter(w => w.state === "done").length,
    weeks: SYLLABUS.length,
    lessons: SYLLABUS.reduce((s, w) => s + w.lessons.length, 0),
    doneLessons: SYLLABUS.reduce((s, w) => s + w.lessons.filter(l => l.done).length, 0),
  };

  return (
    <div role="dialog" aria-modal style={{
      position: contained ? "absolute" : "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      zIndex: 100, padding: 24,
      backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: "min(960px, 100%)",
        maxHeight: contained ? "calc(100% - 48px)" : "92vh",
        marginTop: contained ? 60 : 0,
        display: "flex", flexDirection: "column",
        boxShadow: "0 30px 60px -20px rgba(15,23,42,.4)",
      }}>
        {/* header */}
        <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Tam Müfredat</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>{COURSE.title}</h2>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={ghostBtn(C)}>
                <IconDownload size={14} /> PDF olarak indir
              </button>
              <button onClick={onClose} style={{ ...iconBtn(C), padding: 8, borderRadius: 8, background: C.surfaceAlt, color: C.text }}>
                <IconClose size={18} />
              </button>
            </div>
          </div>

          {/* progress meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {[
              { label: "Hafta",  v: `${stats.done}/${stats.weeks}` },
              { label: "Ders",   v: `${stats.doneLessons}/${stats.lessons}` },
              { label: "Süre",   v: `${COURSE.duration_h} sa` },
              { label: "Seviye", v: COURSE.level },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.v}</div>
              </div>
            ))}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 4 }}>
                <span>Genel ilerleme</span>
                <span>%{Math.round(COURSE.progress * 100)}</span>
              </div>
              <div style={{ height: 5, background: C.surfaceSunken, borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${COURSE.progress * 100}%`, background: C.accent, borderRadius: 99 }} />
              </div>
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ overflowY: "auto", padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {SYLLABUS.map(m => (
            <WeekModule key={m.week} m={m} open={openWeek === m.week} onToggle={() => setOpenWeek(openWeek === m.week ? null : m.week)} />
          ))}
        </div>

        {/* footer */}
        <div style={{ borderTop: `1px solid ${C.borderSoft}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconCalendar size={14} /> Müfredat son güncelleme: {COURSE.last_updated}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtn(C)}>Kapat</button>
            <button style={primaryBtn(C)}>
              <IconPlay size={13} /> Sıradaki derse devam et
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const primaryBtnFull = (C) => ({
  ...btnReset, background: C.dark, color: "white", borderRadius: 10,
  padding: "11px 16px", fontSize: 14, fontWeight: 500,
  width: "100%", justifyContent: "center",
});
const ghostBtnFull = (C) => ({
  ...btnReset, background: "white", color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 500,
  justifyContent: "center",
});

window.CoursePage = CoursePage;
window.SyllabusModal = SyllabusModal;

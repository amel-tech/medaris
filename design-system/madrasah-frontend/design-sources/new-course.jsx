/* eslint-disable */
// /kosk/[koskId]/courses/new — New course creation page
// Layout: form on the left (60ch), live summary on the right.

const NewCoursePage = () => {
  const C = MD_COLORS;

  // sketch state would normally live in React.useState; for a static prototype we hard-wire
  // a "halfway-through-filling-it-out" state to make the page feel real.
  const [title]   = ["Bina ve İzhar Şerhi"];
  const [summary] = ["Sarf ilminin orta seviye eseri olan Bina kitabını, klasik şerh metoduyla; her babın yapısı, illetleri ve tatbiki örnekleriyle birlikte ele alır."];
  const muderrisAssigned = [{ init: "AH", name: "Müderris Ahmed Hilmi", hue: 145 }, { init: "MÖ", name: "Müderris Ömer Faruk", hue: 28 }];

  const modules = [
    {
      week: 1, title: "Sülâsî Mücerred — Birinci Bab", expanded: true,
      lessons: [
        { title: "Açılış mütalaası ve müfredat tanıtımı", type: "video", dur: "12 dk", kaynak: "—" },
        { title: "Birinci babın îsâgûcîsi", type: "video", dur: "28 dk", kaynak: "Bina · s. 4-9" },
        { title: "Türev örnekleri tatbikat", type: "doc",   dur: "PDF",   kaynak: "Tatbikat defteri 1" },
        { title: "Hafta sonu müzakeresi",     type: "live",  dur: "45 dk", kaynak: "Canlı halka" },
      ],
    },
    {
      week: 2, title: "İkinci ve Üçüncü Bab", expanded: false,
      lessons: [
        { title: "İkinci bab şerhi",   type: "video", dur: "32 dk" },
        { title: "Üçüncü bab şerhi",   type: "video", dur: "30 dk" },
        { title: "Ölçme ve değerlendirme", type: "quiz", dur: "10 soru" },
      ],
    },
    {
      week: 3, title: "Dördüncü Bab", expanded: false,
      lessons: [{ title: "Şerh", type: "video", dur: "29 dk" }, { title: "Müzakere", type: "live", dur: "45 dk" }],
    },
  ];

  return (
    <PageShell activeTab="ogrenme" label="02 Köşk · Yeni Kurs">
      <div style={{ padding: "20px 36px 60px", maxWidth: 1440, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 16 }}>
          <span>Öğrenme</span>
          <IconChevronRight size={14} />
          <a href="design-sources/kosk.html" style={{ color: C.muted, textDecoration: "none" }}>Süleymaniye Köşkü</a>
          <IconChevronRight size={14} />
          <span style={{ color: C.text, fontWeight: 500 }}>Yeni Kurs</span>
        </div>

        {/* Page heading */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, paddingBottom: 18, borderBottom: `1px solid ${C.borderSoft}` }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.4 }}>Yeni Kurs Oluştur</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0" }}>Müfredat ekleyin, kaynakları bağlayın ve talebelere açın.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={ghostBtn(C)}>İptal</button>
            <button style={ghostBtn(C)}>Taslak Kaydet</button>
            <button style={primaryBtn(C)}>Yayımla</button>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28 }}>
          {[
            { i: 1, label: "Temel bilgiler", state: "done" },
            { i: 2, label: "Müderris & kaynaklar", state: "active" },
            { i: 3, label: "Müfredat", state: "active" },
            { i: 4, label: "Yayın ayarları", state: "todo" },
          ].map((s, idx, arr) => (
            <React.Fragment key={s.i}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 99,
                  display: "grid", placeItems: "center",
                  fontSize: 12, fontWeight: 600,
                  background: s.state === "done" ? C.success : s.state === "active" ? C.dark : "white",
                  color: s.state === "todo" ? C.faint : "white",
                  border: s.state === "todo" ? `1px dashed ${C.border}` : "none",
                }}>
                  {s.state === "done" ? <IconCheck size={13} /> : s.i}
                </div>
                <span style={{ fontSize: 13, fontWeight: s.state === "todo" ? 400 : 500, color: s.state === "todo" ? C.muted : C.text }}>{s.label}</span>
              </div>
              {idx < arr.length - 1 && (
                <div style={{ flex: "0 0 40px", height: 1, background: C.border }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Two-column form */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 28 }}>

          {/* LEFT: form sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Section: Temel */}
            <FormSection title="Temel bilgiler" subtitle="Talebelerin köşk listesinde göreceği bilgiler.">
              <Field label="Kurs adı" required>
                <input defaultValue={title} style={inputStyle(C)} />
              </Field>
              <Field label="Açıklama" required hint="Birkaç cümle ile dersin amacı ve hedef kitlesi.">
                <textarea defaultValue={summary} rows={3} style={{ ...inputStyle(C), resize: "vertical", lineHeight: 1.55, fontFamily: "inherit" }} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Field label="Kategori">
                  <Select options={["Sarf", "Nahiv", "Fıkıh", "Mantık", "Akaid"]} value="Sarf" />
                </Field>
                <Field label="Seviye">
                  <Select options={["Başlangıç", "Orta", "İleri"]} value="Orta" />
                </Field>
                <Field label="Süre">
                  <Select options={["6 hafta", "8 hafta", "10 hafta", "12 hafta", "Sınırsız"]} value="10 hafta" />
                </Field>
              </div>

              <Field label="Kapak görseli" hint="Önerilen 1280 × 640 px, PNG/JPG · max 4 MB">
                <div style={{
                  border: `1.5px dashed ${C.border}`,
                  borderRadius: 12,
                  padding: 24,
                  display: "flex", alignItems: "center", gap: 14,
                  background: C.surfaceAlt,
                }}>
                  <div style={{ width: 88, height: 56, borderRadius: 8, background: "white", border: `1px solid ${C.border}`, display: "grid", placeItems: "center", color: C.muted }}>
                    <IconUpload size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Görsel yükle veya bırak</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Henüz yüklenmedi · varsayılan desen kullanılacak</div>
                  </div>
                  <button style={ghostBtn(C)}>Dosya Seç</button>
                </div>
              </Field>
            </FormSection>

            {/* Section: Müderris & kaynak */}
            <FormSection title="Müderris ve kaynaklar" subtitle="Bu kursta birlikte ders verecek müderrisleri ve referans kaynaklarını seçin.">
              <Field label="Müderrisler" hint="Talebeler tüm müderrisleri ders kartında görür.">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {muderrisAssigned.map(m => (
                    <div key={m.init} style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: C.surfaceSunken, borderRadius: 999,
                      padding: "4px 12px 4px 4px",
                    }}>
                      <Avatar name={m.init} hue={m.hue} size={24} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{m.name}</span>
                      <IconClose size={12} />
                    </div>
                  ))}
                  <button style={{ ...ghostBtn(C), padding: "5px 10px", fontSize: 12 }}>
                    <IconPlus size={12} /> Müderris ekle
                  </button>
                </div>
              </Field>

              <Field label="Bağlı kaynaklar (desteler)" hint="Müfredatta atıf yapacağınız kaynak desteleri.">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { name: "Bina ve İzhar — Klasik metin", meta: "PDF · 124 sayfa", icon: <IconPdf size={16} /> },
                    { name: "Sarf — Vocabulary Deck",       meta: "Deste · 86 kart",  icon: <IconBook size={16} /> },
                  ].map((k, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10,
                    }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: C.surfaceSunken, display: "grid", placeItems: "center", color: C.muted }}>{k.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{k.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{k.meta}</div>
                      </div>
                      <button style={iconBtn(C)}><IconTrash size={15} /></button>
                    </div>
                  ))}
                  <button style={{
                    ...btnReset, justifyContent: "center",
                    border: `1.5px dashed ${C.border}`, borderRadius: 10,
                    padding: "10px 12px", fontSize: 13, fontWeight: 500, color: C.muted,
                    background: "transparent",
                  }}>
                    <IconLink size={14} /> Mevcut desteyi bağla
                  </button>
                </div>
              </Field>
            </FormSection>

            {/* Section: Müfredat */}
            <FormSection title="Müfredat" subtitle="Haftalar ve haftalara bağlı dersler. Sürükleyip yeniden sıralayabilirsiniz.">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {modules.map((m, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: "white" }}>
                    {/* Module header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: m.expanded ? C.surfaceAlt : "white", borderBottom: m.expanded ? `1px solid ${C.borderSoft}` : "none" }}>
                      <IconGrip size={16} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Hafta {m.week}</span>
                      <input defaultValue={m.title} style={{ ...inputStyle(C), border: "none", background: "transparent", padding: "0", fontSize: 14, fontWeight: 600, flex: 1 }} />
                      <span style={{ fontSize: 12, color: C.muted }}>{m.lessons.length} ders</span>
                      <button style={iconBtn(C)}><IconMore size={16} /></button>
                      <IconChevron size={16} style={{ transform: m.expanded ? "none" : "rotate(-90deg)" }} />
                    </div>

                    {m.expanded && (
                      <div style={{ padding: 8 }}>
                        {m.lessons.map((l, j) => (
                          <LessonRow key={j} lesson={l} />
                        ))}
                        <button style={{
                          ...btnReset, justifyContent: "flex-start",
                          padding: "8px 10px", fontSize: 12, color: C.accent, fontWeight: 500,
                        }}>
                          <IconPlus size={12} /> Ders ekle
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <button style={{
                  ...btnReset, justifyContent: "center",
                  border: `1.5px dashed ${C.border}`, borderRadius: 10,
                  padding: "12px", fontSize: 13, fontWeight: 500, color: C.muted, background: "transparent",
                }}>
                  <IconPlus size={14} /> Hafta ekle
                </button>
              </div>
            </FormSection>
          </div>

          {/* RIGHT: live preview / summary */}
          <aside style={{ position: "sticky", top: 24, alignSelf: "start", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: "white" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: C.faint, marginBottom: 10 }}>Önizleme</div>
              <CoverPlaceholder hue={145} label="Sarf" height={120} dense />
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Sarf</span>
                  <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
                  <span style={{ fontSize: 11, color: C.muted }}>Orta</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.text, letterSpacing: -0.2 }}>{title}</h3>
                <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0", lineHeight: 1.5 }}>{summary}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <Avatar name="AH" hue={145} size={22} />
                  <span style={{ fontSize: 12, color: C.text }}>Müderris Ahmed Hilmi <span style={{ color: C.muted }}>+1</span></span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, color: C.muted, fontSize: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconCalendar size={13} /> 10 hafta</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconPlayOutline size={13} /> 9 ders</span>
                </div>
              </div>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: C.faint, marginBottom: 12 }}>Tamamlanma</div>
              {[
                { label: "Temel bilgiler", v: 1.0 },
                { label: "Müderris & kaynaklar", v: 0.66 },
                { label: "Müfredat", v: 0.3 },
                { label: "Yayın ayarları", v: 0 },
              ].map((s, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: C.text }}>{s.label}</span>
                    <span style={{ color: C.muted }}>%{Math.round(s.v * 100)}</span>
                  </div>
                  <div style={{ height: 4, background: C.surfaceSunken, borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${s.v * 100}%`, background: s.v === 1 ? C.success : C.accent, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: C.surfaceAlt }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <IconCertificate size={16} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>İcâzet ayarı</span>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                Müfredatı tamamlayan talebelere otomatik icâzet belgesi verilsin mi? Yayın ayarlarında yapılandırılabilir.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
};

// ----- form bits -----
const FormSection = ({ title, subtitle, children }) => {
  const C = MD_COLORS;
  return (
    <section style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, background: "white" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: C.text, letterSpacing: -0.2 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </section>
  );
};

const Field = ({ label, required, hint, children }) => {
  const C = MD_COLORS;
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.danger }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{hint}</div>}
    </label>
  );
};

const inputStyle = (C) => ({
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: C.text,
  background: "white",
  outline: "none",
  boxSizing: "border-box",
});

const Select = ({ options, value }) => {
  const C = MD_COLORS;
  return (
    <div style={{ ...inputStyle(C), display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
      <span style={{ fontSize: 13, color: C.text }}>{value}</span>
      <IconChevron size={14} />
    </div>
  );
};

const LessonRow = ({ lesson }) => {
  const C = MD_COLORS;
  const TYPE = {
    video: { icon: <IconPlayOutline size={14} />, label: "Video", color: C.accent },
    doc:   { icon: <IconPdf size={14} />,         label: "Doküman", color: C.muted },
    live:  { icon: <IconHeadset size={14} />,     label: "Canlı",   color: C.danger },
    quiz:  { icon: <IconQuiz size={14} />,        label: "Sınav",   color: C.warning },
  }[lesson.type] || { icon: <IconDoc size={14} />, label: "Ders", color: C.muted };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 10px", borderRadius: 8,
    }}>
      <IconGrip size={14} />
      <div style={{ color: TYPE.color, display: "flex" }}>{TYPE.icon}</div>
      <input defaultValue={lesson.title} style={{ ...inputStyle(C), border: "none", background: "transparent", padding: 0, fontSize: 13, flex: 1 }} />
      {lesson.kaynak && lesson.kaynak !== "—" && (
        <span style={{ fontSize: 11, color: C.accent, background: C.accentSoft, padding: "2px 8px", borderRadius: 99, fontWeight: 500 }}>
          {lesson.kaynak}
        </span>
      )}
      <span style={{ fontSize: 12, color: C.muted, minWidth: 50, textAlign: "right" }}>{lesson.dur}</span>
      <button style={iconBtn(C)}><IconMore size={14} /></button>
    </div>
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
const iconBtn = (C) => ({
  ...btnReset, color: C.muted, padding: 4,
});

window.NewCoursePage = NewCoursePage;

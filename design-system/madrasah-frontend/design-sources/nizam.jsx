/* eslint-disable */
// Nizam — müderris (teacher) management app.
// Left sidebar shell + screens: Desteler list, Deste detail, Köşkler grid,
// Köşk detail, Kursu Düzenle. Recreated from provided screenshots.

const NZ = {
  ...window.MD_COLORS,
  green: "#0f9d63",
  greenDark: "#0c8454",
  ink: "#16181d",
  pageBg: "#ffffff",
  line: "#e7e8ea",
  lineSoft: "#eef0f2",
  navHover: "#f4f5f6",
  navActive: "#f1f2f4",
};

// Nizam logo — dark rounded square with a light mihrab/arch portal.
const NizamLogo = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="12" fill="#1c2430" />
    <path d="M24 13c-3.6 0-6.5 2.9-6.5 6.5V33a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V19.5C30.5 15.9 27.6 13 24 13Z" fill="#bfe3ea" />
    <path d="M24 18c-1.7 0-3 1.3-3 3v12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V21c0-1.7-1.3-3-3-3Z" fill="#1c2430" />
  </svg>
);

// ---------------- Sidebar shell ----------------
const NizamShell = ({ active = "kosk", breadcrumb = ["Ev"], children, label }) => {
  const C = NZ;
  const nav = [
    { id: "desteler", label: "Desteler", icon: (s) => <IconTable size={s} /> },
    { id: "kosk",     label: "Köşkler",  icon: (s) => <IconHome size={s} /> },
  ];

  return (
    <div data-screen-label={label} style={{ fontFamily: MD_FONT, background: C.pageBg, color: C.ink, minHeight: 900, display: "flex", fontFeatureSettings: '"ss01", "cv11"' }}>
      {/* sidebar */}
      <aside style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 16px", borderRight: `0px` }}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 8px 22px" }}>
          <NizamLogo size={44} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Nizam</div>
            <div style={{ fontSize: 13, color: C.muted }}>Online Madrasah</div>
          </div>
        </div>

        {/* section label */}
        <div style={{ fontSize: 13, color: C.faint, fontWeight: 500, padding: "6px 10px 8px" }}>İçerik</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {nav.map((n) => {
            const on = n.id === active;
            return (
              <div key={n.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 9,
                background: on ? C.navActive : "transparent",
                color: on ? C.ink : "#3f444c",
                fontSize: 15, fontWeight: on ? 600 : 500, cursor: "pointer",
              }}>
                <span style={{ color: on ? C.ink : "#6b7280", display: "flex" }}>{n.icon(19)}</span>
                {n.label}
              </div>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* user card */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 10, cursor: "pointer" }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#eceef1", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: C.ink }}>DU</div>
          <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Developer User</div>
            <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>developer@ameltech.c...</div>
          </div>
          <IconChevronsUpDown size={16} style={{ color: C.faint }} />
        </div>

        {/* language */}
        <button style={{ ...btnReset, justifyContent: "center", gap: 9, marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 14px", fontSize: 14, fontWeight: 500, color: C.ink, background: "white" }}>
          <IconGlobe size={17} /> Türkçe
        </button>
      </aside>

      {/* main panel — rounded bordered card */}
      <main style={{ flex: 1, padding: "12px 12px 12px 0" }}>
        <div style={{ height: "100%", border: `1px solid ${C.line}`, borderRadius: 16, background: "white", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* breadcrumb bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 26px", }}>
            <button style={{ ...btnReset, color: "#6b7280" }}><IconSidebar size={20} /></button>
            <div style={{ width: 1, height: 20, background: C.line }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15 }}>
              {breadcrumb.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <IconChevronRight size={15} style={{ color: C.faint }} />}
                  <span style={{ color: i === breadcrumb.length - 1 ? C.ink : C.muted, fontWeight: i === breadcrumb.length - 1 ? 500 : 400 }}>{b}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "10px 40px 48px" }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

// page header (title + subtitle + actions)
const NzHead = ({ title, subtitle, actions }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 30 }}>
    <div>
      <h1 style={{ fontSize: 33, fontWeight: 800, color: NZ.ink, margin: 0, letterSpacing: -0.8 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 16, color: NZ.muted, margin: "8px 0 0" }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: "flex", gap: 10, flexShrink: 0, paddingTop: 4 }}>{actions}</div>}
  </div>
);

const nzBtnDark  = { ...btnReset, gap: 8, background: NZ.ink, color: "white", borderRadius: 11, padding: "12px 18px", fontSize: 15, fontWeight: 500 };
const nzBtnGreen = { ...btnReset, gap: 8, background: NZ.green, color: "white", borderRadius: 11, padding: "12px 18px", fontSize: 15, fontWeight: 500 };
const nzBtnGhost = { ...btnReset, gap: 8, background: "white", color: NZ.ink, border: `1px solid ${NZ.line}`, borderRadius: 11, padding: "11px 18px", fontSize: 15, fontWeight: 500 };
const nzIconBtn  = { ...btnReset, width: 40, height: 40, justifyContent: "center", border: `1px solid ${NZ.line}`, borderRadius: 11, color: "#6b7280", background: "white" };

// ============================ DESTELER (decks list) ============================
const NzDecksList = () => {
  const C = NZ;
  const rows = [
    { title: "testtest", desc: "test test test" },
    { title: "Sarf — Emsile Kartları", desc: "Birinci bab türevleri ve illetleri" },
    { title: "Nahiv — Âmiller", desc: "Avâmil-i mie ezber destesi" },
    { title: "Akaid — Istılahlar", desc: "Kelâm terimleri ve tanımları" },
  ];
  return (
    <NizamShell active="desteler" breadcrumb={["Ev", "Decks"]} label="Nizam · Desteler">
      <NzHead
        title="Bilgi Kartı Desteleri"
        subtitle="Bilgi kartı destelerinizi ve çalışma materyallerinizi yönetin."
        actions={<button style={nzBtnDark}><IconPlus size={17} /> Yeni Güverte</button>}
      />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        {/* header row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", padding: "16px 24px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Başlık</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Açıklama</div>
          <div />
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", padding: "18px 24px", alignItems: "center", borderBottom: i < rows.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{r.title}</div>
            <div style={{ fontSize: 15, color: C.ink }}>{r.desc}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={{ ...nzIconBtn, width: 38, height: 38 }}><IconEye size={17} /></button>
              <button style={{ ...nzIconBtn, width: 38, height: 38 }}><IconTrash size={17} /></button>
            </div>
          </div>
        ))}
      </div>
    </NizamShell>
  );
};

// ============================ DESTE DETAIL (cards) ============================
const NzDeckDetail = () => {
  const C = NZ;
  const cards = [
    { front: "“Cenâb-ı Hakk'ın ni'metlerine şükür, o ni'metin zevâline (yok olmasına) emândır.” (Deylemî)", back: "اَلْحَمْدُ عَلَى النِّعْمَةِ أَمَانٌ لِزَوَالِهِ", backAr: true },
    { front: "أَهْلاً", frontAr: true, back: "selam" },
    { front: "Sarf nedir?", back: "Kelimenin yapısını ve değişimini inceleyen ilim." },
  ];
  return (
    <NizamShell active="desteler" breadcrumb={["Ev", "Decks"]} label="Nizam · Deste detayı">
      <NzHead
        title="testtest"
        subtitle="test test test"
        actions={<button style={nzBtnGhost}>Toplu İşlemler</button>}
      />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px", padding: "16px 24px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ön Yüz</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Arka Yüz</div>
          <div />
        </div>
        {cards.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px", padding: "20px 24px", alignItems: "center", borderBottom: i < cards.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
            <div style={{ fontSize: 16, color: C.ink, lineHeight: 1.55, paddingRight: 20, direction: c.frontAr ? "rtl" : "ltr", fontFamily: c.frontAr ? "'Amiri', serif" : "inherit", fontSize: c.frontAr ? 22 : 16 }}>{c.front}</div>
            <div style={{ fontSize: 16, color: C.ink, lineHeight: 1.6, direction: c.backAr ? "rtl" : "ltr", fontFamily: c.backAr ? "'Amiri', serif" : "inherit", fontSize: c.backAr ? 22 : 16 }}>{c.back}</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...nzIconBtn, width: 38, height: 38 }}><IconTrash size={17} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* import toast */}
      <div style={{ position: "absolute", right: 28, bottom: 24, display: "flex", alignItems: "center", gap: 12, background: "white", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 16px 40px -16px rgba(15,23,42,.22)" }}>
        <IconCheckCircle filled size={22} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>İthal Kartlar</div>
          <div style={{ fontSize: 13, color: C.muted }}>2 kart başarıyla içe aktarıldı.</div>
        </div>
      </div>
    </NizamShell>
  );
};

// ============================ KÖŞKLER (admin grid) ============================
const NzKosks = () => {
  const C = NZ;
  const kosks = [
    { name: "Süleymaniye Köşkü", desc: "Klasik medrese müfredatına dayalı; sarf, nahiv, mantık ve usûl-i fıkıh dersleri sunan köşk. Her hafta canlı müzakereler." },
    { name: "Fâtih Köşkü", desc: "Tefsir ve hadis usûlü ağırlıklı; rivayet zincirleri ve metin tahlili." },
    { name: "Beyazıt Köşkü", desc: "Mantık ve âdâbu'l-bahs üzerine yoğunlaşan ileri düzey halkalar." },
    { name: "Karaman Köşkü", desc: "Yeni başlayanlar için Arapça sarf-nahiv ve kıraat temelleri." },
    { name: "Nûruosmaniye Köşkü", desc: "Akaid ve kelâm metinleri; Nesefî ve Senûsî şerhleri." },
  ];
  return (
    <NizamShell active="kosk" breadcrumb={["Ev", "Köşkler"]} label="Nizam · Köşkler">
      <NzHead
        title="Köşkler"
        subtitle="Yönetiminizdeki köşkleri ve dersleri buradan görüntüleyebilirsiniz."
        actions={<button style={nzBtnDark}><IconPlus size={17} /> Yeni Köşk</button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 22 }}>
        {kosks.map((k, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: "22px 22px 26px", cursor: "pointer", minHeight: 180 }}>
            <div style={{ width: 46, height: 46, borderRadius: 11, background: "#f1f2f4", display: "grid", placeItems: "center", color: "#3f444c", marginBottom: 22 }}>
              <IconHome size={22} />
            </div>
            <h3 style={{ fontSize: 21, fontWeight: 700, color: C.ink, margin: "0 0 10px", letterSpacing: -0.3 }}>{k.name}</h3>
            <p style={{ fontSize: 15, color: C.muted, margin: 0, lineHeight: 1.55 }}>{k.desc}</p>
          </div>
        ))}
      </div>
    </NizamShell>
  );
};

// ============================ KÖŞK DETAIL (admin) ============================
const NzKoskDetail = () => {
  const C = NZ;
  const courses = [
    { cat: "TEFSIR", level: "BAŞLANGIÇ", title: "Tefsir Usûlüne Giriş", sub: "Birinci sınıf · 6 hafta", weeks: 2, lessons: 4, kaynak: 1, hue: 165, status: "Yayında", statusColor: C.ink },
    { cat: "HADİS", level: "ORTA", title: "Hadis Usûlü", sub: "İkinci sınıf · 8 hafta", weeks: 4, lessons: 12, kaynak: 3, hue: 28, status: "Taslak", statusColor: "#6b7280" },
  ];
  return (
    <NizamShell active="kosk" breadcrumb={["Ev", "Köşkler"]} label="Nizam · Köşk detayı">
      <NzHead
        title="Fâtih Köşkü"
        subtitle="Bu köşkte yer alan dersler ve müfredat yönetimi."
        actions={<>
          <button style={nzBtnGhost}><IconSettings size={17} /> Köşkü Düzenle</button>
          <button style={nzBtnGreen}><IconPlus size={17} /> Yeni Ders Aç</button>
        </>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 22 }}>
        {courses.map((c, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
            <div style={{ position: "relative" }}>
              <CoverPlaceholder hue={c.hue} height={150} />
              <div style={{ position: "absolute", top: 14, right: 14, background: c.statusColor, color: "white", fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 8 }}>{c.status}</div>
            </div>
            <div style={{ padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: 0.5 }}>{c.cat}</span>
                <span style={{ width: 3, height: 3, borderRadius: 99, background: C.faint }} />
                <span style={{ fontSize: 12, color: C.muted, letterSpacing: 0.4 }}>{c.level}</span>
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: "0 0 4px", letterSpacing: -0.3 }}>{c.title}</h3>
              <p style={{ fontSize: 14, color: C.muted, margin: "0 0 16px" }}>{c.sub}</p>
              <div style={{ display: "flex", gap: 18, color: C.muted, fontSize: 14, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconCalendar size={15} /> {c.weeks} hafta</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconPlayOutline size={15} /> {c.lessons} ders</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconBook size={15} /> {c.kaynak} kaynak</span>
              </div>
            </div>
          </div>
        ))}
        {/* add-course ghost card */}
        <button style={{ ...btnReset, flexDirection: "column", gap: 10, border: `1.5px dashed ${C.line}`, borderRadius: 14, color: C.muted, fontSize: 15, fontWeight: 500, minHeight: 150, justifyContent: "center" }}>
          <IconPlus size={22} /> Yeni ders aç
        </button>
      </div>
    </NizamShell>
  );
};

// ============================ KURSU DÜZENLE (edit course) ============================
const NzCourseEdit = () => {
  const C = NZ;
  return (
    <NizamShell active="kosk" breadcrumb={["Ev", "Köşkler"]} label="Nizam · Kursu Düzenle">
      <NzHead
        title="Kursu Düzenle"
        subtitle="Müfredat ekleyin, kaynakları bağlayın ve talebelere açın."
        actions={<>
          <button style={nzBtnGhost}>İptal</button>
          <button style={nzBtnGhost}>Taslak Kaydet</button>
          <button style={nzBtnDark}>Yayımla</button>
        </>}
      />
      <div style={{ height: 1, background: C.line, margin: "0 0 26px" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 28 }}>
        {/* form column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Temel bilgiler */}
          <NzSection title="Temel bilgiler" subtitle="Talebelerin köşk listesinde göreceği bilgiler.">
            <NzField label="Kurs adı" required>
              <input defaultValue="Tefsir Usûlüne Giriş" style={nzInput(C)} />
            </NzField>
            <NzField label="Açıklama" hint="Birkaç cümle ile dersin amacı ve hedef kitlesi.">
              <textarea rows={3} style={{ ...nzInput(C), resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }} />
            </NzField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <NzField label="Kategori"><input defaultValue="Tefsir" style={nzInput(C)} /></NzField>
              <NzField label="Seviye"><NzSelect value="Başlangıç" /></NzField>
              <NzField label="Süre (hafta)"><input defaultValue="6" style={nzInput(C)} /></NzField>
            </div>
          </NzSection>

          {/* Müderris ve kaynaklar */}
          <NzSection title="Müderris ve kaynaklar" subtitle="Bu kursta ders verecek müderrisleri ve referans kaynaklarını ekleyin.">
            <NzField label="Müderrisler">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input defaultValue="Müderris Fatih Kaya" style={nzInput(C)} />
                <button style={{ ...nzIconBtn }}><IconClose size={17} /></button>
              </div>
              <button style={{ ...btnReset, justifyContent: "center", width: "100%", marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px", fontSize: 14, color: C.muted, fontWeight: 500 }}>
                <IconPlus size={15} /> Müderris ekle
              </button>
            </NzField>
            <NzField label="Bağlı kaynaklar">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input defaultValue="Tefsir Usûlü" style={nzInput(C)} />
                <input defaultValue="PDF · 88 sayfa" style={{ ...nzInput(C), color: C.muted }} />
                <button style={{ ...nzIconBtn }}><IconTrash size={17} /></button>
              </div>
              <button style={{ ...btnReset, justifyContent: "center", width: "100%", marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px", fontSize: 14, color: C.muted, fontWeight: 500 }}>
                <IconPlus size={15} /> Kaynak ekle
              </button>
            </NzField>
          </NzSection>

          {/* Müfredat */}
          <NzSection title="Müfredat" subtitle="Haftalar ve haftalara bağlı canlı dersler. Bu aşamada yalnızca canlı ders içeriği desteklenir.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { w: 1, t: "Tefsir Usûlünün Tanımı", adding: true, lessons: [
                  { title: "Açılış halkası — usûlün tanımı", day: "Pzt 21:00", dur: "60 dk" },
                  { title: "Müzakere ve soru-cevap", day: "Cmt 21:00", dur: "45 dk" },
                ] },
                { w: 2, t: "Esbâb-ı Nüzul", lessons: [
                  { title: "Esbâb-ı nüzulün önemi", day: "Pzt 21:00", dur: "60 dk" },
                ] },
              ].map((m) => (
                <div key={m.w} style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: "hidden" }}>
                  {/* week header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "#fafafa", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <IconGrip size={17} style={{ color: C.faint }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Hafta {m.w}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, flex: 1 }}>{m.t}</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{m.lessons.length} canlı ders</span>
                    <button style={{ ...btnReset, color: C.faint }}><IconMore size={17} /></button>
                  </div>
                  {/* live lessons */}
                  <div style={{ padding: 8 }}>
                    {m.lessons.map((l, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 10px" }}>
                        <IconGrip size={15} style={{ color: C.faint }} />
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#fef2f2", display: "grid", placeItems: "center", color: "#dc2626", flexShrink: 0 }}><IconHeadset size={15} /></div>
                        <span style={{ fontSize: 14.5, color: C.ink, flex: 1 }}>{l.title}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", background: "#fef2f2", padding: "3px 9px", borderRadius: 99 }}>Canlı ders</span>
                        <span style={{ fontSize: 12.5, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5, minWidth: 78 }}><IconCalendar size={13} /> {l.day}</span>
                        <span style={{ fontSize: 12.5, color: C.muted, minWidth: 44, textAlign: "right" }}>{l.dur}</span>
                        <button style={{ ...btnReset, color: C.muted }}><IconTrash size={15} /></button>
                      </div>
                    ))}
                    {m.adding
                      ? <NzLiveLessonEditor />
                      : <button style={{ ...btnReset, justifyContent: "flex-start", padding: "8px 10px", fontSize: 13.5, color: "#dc2626", fontWeight: 500 }}>
                          <IconPlus size={14} /> Canlı ders ekle
                        </button>}
                  </div>
                </div>
              ))}
              <button style={{ ...btnReset, justifyContent: "center", border: `1.5px dashed ${C.line}`, borderRadius: 11, padding: "13px", fontSize: 15, color: C.muted, fontWeight: 500 }}>
                <IconPlus size={16} /> Hafta ekle
              </button>
            </div>
          </NzSection>
        </div>

        {/* preview + settings column */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 0, alignSelf: "start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: 0.8, marginBottom: 12 }}>ÖNİZLEME</div>
            <div style={{ height: 138, borderRadius: 12, overflow: "hidden" }}>
              <CoverPlaceholder hue={155} height={138} />
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>TEFSIR</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.3 }}>Tefsir Usûlüne Giriş</h3>
              <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 14, color: C.muted }}>
                <span>2 hafta</span>
                <span>4 ders</span>
              </div>
            </div>
          </div>

          <NzToggle icon={<IconCertificate size={18} />} title="İcâzet verilsin" desc="Müfredatı tamamlayan talebelere otomatik icâzet belgesi verilsin mi?" />
          <NzToggle icon={<IconShield size={18} />} title="Kayıt onayı gereksin" desc="Açık olduğunda talebelerin kaydı, siz onaylayana kadar beklemede kalır." />
        </aside>
      </div>
    </NizamShell>
  );
};

// ---- edit-form helpers ----
const NzSection = ({ title, subtitle, children }) => (
  <section style={{ border: `1px solid ${NZ.line}`, borderRadius: 14, padding: 24 }}>
    <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: NZ.ink, letterSpacing: -0.2 }}>{title}</h2>
    {subtitle && <p style={{ fontSize: 14, color: NZ.muted, margin: "6px 0 18px" }}>{subtitle}</p>}
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: subtitle ? 0 : 16 }}>{children}</div>
  </section>
);

const NzField = ({ label, required, hint, children }) => (
  <label style={{ display: "block" }}>
    <div style={{ fontSize: 14, fontWeight: 500, color: NZ.ink, marginBottom: 7 }}>
      {label}{required && <span style={{ color: NZ.danger, marginLeft: 4 }}>*</span>}
    </div>
    {children}
    {hint && <div style={{ fontSize: 13, color: NZ.muted, marginTop: 7 }}>{hint}</div>}
  </label>
);

const nzInput = (C) => ({ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px", fontSize: 15, color: C.ink, background: "white", outline: "none", boxSizing: "border-box" });

const NzSelect = ({ value }) => (
  <div style={{ ...nzInput(NZ), display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
    <span>{value}</span><IconChevron size={16} style={{ color: NZ.faint }} />
  </div>
);

const NzToggle = ({ icon, title, desc }) => (
  <div style={{ display: "flex", gap: 12, border: `1px solid ${NZ.line}`, borderRadius: 13, padding: 16 }}>
    <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${NZ.border}`, flexShrink: 0, marginTop: 2 }} />
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ color: NZ.ink, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 15.5, fontWeight: 600, color: NZ.ink }}>{title}</span>
      </div>
      <p style={{ fontSize: 13.5, color: NZ.muted, margin: 0, lineHeight: 1.55 }}>{desc}</p>
    </div>
  </div>
);

Object.assign(window, { NizamShell, NizamLogo, NzDecksList, NzDeckDetail, NzKosks, NzKoskDetail, NzCourseEdit });

// ---- live-lesson editor: opens inline after "Canlı ders ekle" is clicked ----
// No manual platform picker — the platform is RESOLVED from the meeting URL.
const NZ_PLATFORMS = [
  { match: "meet.google", name: "Google Meet", color: "#00897b", soft: "#e6f4f1" },
  { match: "zoom.us",     name: "Zoom",        color: "#2d8cff", soft: "#e9f2ff" },
  { match: "jit.si",      name: "Jitsi Meet",  color: "#1d6fb8", soft: "#e7f0f9" },
];
const nzResolvePlatform = (url = "") => NZ_PLATFORMS.find(p => url.includes(p.match)) || { name: "Bilinmeyen platform", color: "#94a3b8", soft: "#f1f5f9" };

const NzLiveLessonEditor = () => {
  const C = NZ;
  const meetingUrl = "https://meet.google.com/bqx-mfzn-rde"; // statik prototip değeri
  const resolved = nzResolvePlatform(meetingUrl);
  const agenda = [
    { t: "21:00", title: "Açılış ve geçen haftanın özeti" },
    { t: "21:15", title: "Metin müzakeresi" },
    { t: "21:40", title: "Talebe sorularının cevaplanması" },
  ];

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, margin: "6px 4px 4px", background: "#fff", boxShadow: "0 12px 30px -18px rgba(15,23,42,.25)" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#fef2f2", display: "grid", placeItems: "center", color: "#dc2626" }}><IconHeadset size={15} /></div>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Yeni canlı ders</span>
        <span style={{ flex: 1 }} />
        <button style={{ ...btnReset, color: C.faint }}><IconClose size={17} /></button>
      </div>

      {/* title */}
      <NzField label="Ders başlığı" required>
        <input placeholder="örn. Birinci bab müzakeresi" style={nzInput(C)} />
      </NzField>

      {/* schedule row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
        <NzField label="Gün"><NzSelect value="Pazartesi" /></NzField>
        <NzField label="Saat"><input defaultValue="21:00" style={nzInput(C)} /></NzField>
        <NzField label="Süre"><NzSelect value="60 dk" /></NzField>
      </div>

      {/* meeting URL — platform auto-resolved from the link */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, marginBottom: 7 }}>Toplantı bağlantısı <span style={{ color: C.danger, marginLeft: 4 }}>*</span></div>
        <input defaultValue={meetingUrl} style={{ ...nzInput(C), fontFamily: "ui-monospace, monospace", fontSize: 13.5 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: resolved.color, background: resolved.soft, padding: "5px 11px", borderRadius: 99 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: resolved.color }} />
            {resolved.name}
          </span>
          <span style={{ fontSize: 12.5, color: C.muted }}>bağlantıdan otomatik algılandı</span>
        </div>
      </div>

      {/* MÜZAKERE AKIŞI (agenda) editor */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>Müzakere akışı</span>
          <span style={{ fontSize: 12, color: C.muted }}>· talebe bu akışı ders sayfasında görür</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {agenda.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconGrip size={15} style={{ color: C.faint }} />
              <input defaultValue={a.t} style={{ ...nzInput(C), width: 88, flex: "none", fontVariantNumeric: "tabular-nums", textAlign: "center", fontSize: 13.5 }} />
              <input defaultValue={a.title} style={{ ...nzInput(C), flex: 1 }} />
              <button style={{ ...btnReset, color: C.muted }}><IconTrash size={15} /></button>
            </div>
          ))}
          <button style={{ ...btnReset, justifyContent: "flex-start", padding: "8px 2px", fontSize: 13.5, color: C.green, fontWeight: 500 }}>
            <IconPlus size={14} /> Akış adımı ekle
          </button>
        </div>
      </div>

      {/* footer actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
        <button style={nzBtnGhost}>İptal</button>
        <button style={{ ...nzBtnGreen, gap: 7 }}><IconCheck size={16} /> Canlı dersi kaydet</button>
      </div>
    </div>
  );
};

window.NzLiveLessonEditor = NzLiveLessonEditor;

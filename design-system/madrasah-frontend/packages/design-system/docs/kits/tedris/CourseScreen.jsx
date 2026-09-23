const { Card, CoverPattern, Icon, Badge, Tabs, Button, ProgressBar, Avatar, AvatarStack,
        WeekAccordion, LessonRow, Dialog } = window.DS;

const WEEKS = [
  { week: 1, title: "Sülâsî Mücerred — Birinci Bab", state: "done", summary: "Müfredat tanıtımı ve birinci babın îsâgûcîsi.",
    lessons: [
      { title: "Açılış halkası — müfredat tanıtımı", type: "live", duration: "60 dk", done: true },
      { title: "Birinci babın müzakeresi", type: "live", duration: "45 dk", done: true },
    ] },
  { week: 2, title: "İkinci ve Üçüncü Bab", state: "done", summary: "نَصَر / ضَرَب babları ve illet farkları.",
    lessons: [
      { title: "İkinci bab müzakeresi", type: "live", duration: "60 dk", done: true },
      { title: "Üçüncü bab müzakeresi", type: "live", duration: "60 dk", done: true },
    ] },
  { week: 3, title: "Dördüncü ve Beşinci Bab", state: "active", summary: "فَتَح bâbı ve harf-i halk illetleri.",
    lessons: [
      { title: "Dördüncü babın şerhi", type: "live", duration: "60 dk", done: true },
      { title: "Beşinci babın şerhi — فَتَحَ bâbı", type: "live", duration: "60 dk", current: true, source: "Bina · s. 20-24" },
      { title: "Hafta sonu müzakeresi", type: "live", duration: "45 dk" },
    ] },
  { week: 4, title: "Altıncı Bab ve Tekrar", state: "locked", lessons: [{ title: "Altıncı babın şerhi", type: "live", duration: "60 dk" }] },
  { week: 5, title: "Sülâsî Mezîd — Bablar", state: "locked", lessons: [{ title: "İf'âl babı", type: "live", duration: "60 dk" }] },
];

function CourseScreen({ onOpenLesson }) {
  const [tab, setTab] = React.useState("mufredat");
  const [open, setOpen] = React.useState(3);
  const [syllabus, setSyllabus] = React.useState(false);

  const renderWeek = (w) => (
    <WeekAccordion
      key={w.week} week={w.week} title={w.title} state={w.state} summary={w.summary}
      meta={<span>{w.lessons.length} canlı ders</span>}
      open={open === w.week} onToggle={() => setOpen(open === w.week ? null : w.week)}
    >
      {w.lessons.map((l, i) => (
        <LessonRow key={i} {...l} typeLabel="Canlı ders" />
      ))}
    </WeekAccordion>
  );

  return (
    <div>
      <div style={{ background: "linear-gradient(180deg, oklch(0.97 0.025 145) 0%, var(--surface) 100%)", borderBottom: "1px solid var(--border-soft)" }}>
        <div style={{ padding: "22px 30px 26px", display: "grid", gridTemplateColumns: "1fr var(--aside-w)", gap: 36, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {["Sarf", "Orta", "Türkçe / Arapça"].map((t, i) => (
                <React.Fragment key={t}>
                  {i > 0 && <span style={{ width: 3, height: 3, borderRadius: "var(--r-pill)", background: "var(--faint)" }} />}
                  <span style={{
                    font: `${i === 0 ? "var(--fw-semibold)" : "var(--fw-regular)"} var(--fs-11)/1 var(--font-ui)`,
                    letterSpacing: i === 0 ? "var(--tracking-eyebrow)" : 0,
                    textTransform: i === 0 ? "uppercase" : "none", color: "var(--muted)",
                  }}>{t}</span>
                </React.Fragment>
              ))}
            </div>
            <h1 style={{ margin: 0, font: "var(--fw-bold) var(--fs-34)/var(--lh-tight) var(--font-ui)", letterSpacing: "var(--tracking-title)" }}>
              Bina ve İzhar Şerhi
            </h1>
            <p style={{ margin: "10px 0 18px", maxWidth: "var(--reading-max)", font: "var(--fw-regular) var(--fs-15)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
              Klasik sarf metni — şerh, illet ve tatbiki örneklerle.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 18, font: "var(--fw-regular) var(--fs-13)/1 var(--font-ui)", marginBottom: 18 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="star" filled size={14} style={{ color: "var(--amber)" }} />
                <strong style={{ fontWeight: "var(--fw-semibold)" }}>4.8</strong>
                <span style={{ color: "var(--muted)" }}>(132 değerlendirme)</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}><Icon name="users" size={14} /> 248 talebe</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}><Icon name="clock" size={14} /> 22 saat</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AvatarStack people={[{ initials: "AH", hue: 145 }, { initials: "MÖ", hue: 28 }]} size={32} />
              <span style={{ font: "var(--fw-regular) var(--fs-13)/1 var(--font-ui)" }}>
                <span style={{ color: "var(--muted)" }}>Müderris</span>{" "}
                <span style={{ fontWeight: "var(--fw-medium)" }}>Ahmed Hilmi, Ömer Faruk</span>
              </span>
            </div>
          </div>

          <Card
            style={{ boxShadow: "var(--shadow-sticky-card)" }}
            media={<CoverPattern hue={145} label="Sarf" height={160} />}
            footer={
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, font: "var(--fw-regular) var(--fs-12)/1.3 var(--font-ui)" }}>
                <div>
                  <div style={{ color: "var(--muted)", marginBottom: 2 }}>Süre</div>
                  <div style={{ fontWeight: "var(--fw-medium)" }}>10 hafta · 40 ders</div>
                </div>
                <div>
                  <div style={{ color: "var(--muted)", marginBottom: 2 }}>İcâzet</div>
                  <div style={{ fontWeight: "var(--fw-medium)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="certificate" size={14} /> Veriliyor
                  </div>
                </div>
              </div>
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, font: "var(--fw-medium) var(--fs-12)/1 var(--font-ui)" }}>
              <span style={{ color: "var(--muted)" }}>Devam ediyorsun</span>
              <span style={{ fontWeight: "var(--fw-semibold)" }}>%35</span>
            </div>
            <ProgressBar value={0.35} height={6} style={{ marginBottom: 12 }} />
            <div style={{ padding: "10px 12px", background: "var(--surface-alt)", borderRadius: "var(--r-8)", marginBottom: 12 }}>
              <div style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)", marginBottom: 3 }}>Sıradaki ders</div>
              <div style={{ font: "var(--fw-medium) var(--fs-13)/1.35 var(--font-ui)" }}>Hafta 3 · Beşinci Babın Şerhi</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>
                <Icon name="headset" size={11} /> Canlı halka · Cmt 21:00
              </div>
            </div>
            <Button size="lg" fullWidth icon={<Icon name="play" filled size={14} />} onClick={onOpenLesson}>
              Derse devam et
            </Button>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button variant="ghost" fullWidth icon={<Icon name="bookmark" size={14} />}>Kaydet</Button>
              <Button variant="ghost" fullWidth icon={<Icon name="share" size={14} />}>Paylaş</Button>
            </div>
          </Card>
        </div>

        <div style={{ padding: "0 30px" }}>
          <Tabs
            value={tab} onChange={setTab}
            items={[
              { id: "genel", label: "Genel Bakış" },
              { id: "mufredat", label: "Müfredat", badge: 40 },
              { id: "muderris", label: "Müderrisler" },
              { id: "kaynak", label: "Kaynaklar", badge: 3 },
            ]}
            style={{ borderBottom: "none" }}
          />
        </div>
      </div>

      <div style={{ padding: "28px 30px 48px", display: "grid", gridTemplateColumns: "1fr var(--aside-w)", gap: 36, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, font: "var(--fw-bold) var(--fs-18)/1.3 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>Müfredat</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>10 hafta · 40 ders · 22 saat</span>
              <Button variant="link" iconAfter={<Icon name="arrowRight" size={13} />} onClick={() => setSyllabus(true)}>
                Tüm müfredatı gör
              </Button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{WEEKS.map(renderWeek)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <h3 style={{ margin: "0 0 12px", font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)" }}>Bu kursun kaynakları</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["Bina ve İzhar — Klasik metin", "PDF · 124 sayfa", "pdf"],
                ["Sarf — Vocabulary Deck", "Deste · 86 kart", "table"],
                ["Tatbikat defteri", "Doküman · 38 alıştırma", "doc"]].map(([n, m, ic]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: "var(--r-8)" }}>
                  <span style={{ width: 32, height: 32, borderRadius: "var(--r-5)", background: "var(--surface-alt)", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                    <Icon name={ic} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "var(--fw-medium) var(--fs-13)/1.3 var(--font-ui)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div>
                    <div style={{ font: "var(--fw-regular) var(--fs-11)/1.3 var(--font-ui)", color: "var(--muted)" }}>{m}</div>
                  </div>
                  <Icon name="arrowRight" size={14} style={{ color: "var(--muted)" }} />
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ background: "var(--surface-alt)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Icon name="certificate" size={18} />
              <span style={{ font: "var(--fw-semibold) var(--fs-14)/1 var(--font-ui)" }}>İcâzet belgesi</span>
            </div>
            <p style={{ margin: "0 0 12px", font: "var(--fw-regular) var(--fs-12)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
              Müfredatı %85 ve üzeri tamamlayan talebelere müderris onaylı icâzet verilir.
            </p>
            <ProgressBar value={0.35} label="%35 tamamlandı" showLabel />
          </Card>
        </div>
      </div>

      <Dialog
        open={syllabus} contained onClose={() => setSyllabus(false)}
        eyebrow="Tam Müfredat" title="Bina ve İzhar Şerhi" width={860}
        headerExtra={<Button variant="ghost" size="sm" icon={<Icon name="download" size={14} />}>PDF olarak indir</Button>}
        actions={<>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>
            <Icon name="calendar" size={14} /> Müfredat son güncelleme: Ekim 2026
          </span>
          <Button icon={<Icon name="play" filled size={13} />} onClick={onOpenLesson}>Sıradaki derse devam et</Button>
        </>}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 16 }}>
          {[["Hafta", "2/10"], ["Ders", "14/40"], ["Süre", "22 sa"], ["Seviye", "Orta"]].map(([k, v]) => (
            <div key={k}>
              <div style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)", marginBottom: 3 }}>{k}</div>
              <div style={{ font: "var(--fw-semibold) var(--fs-14)/1 var(--font-ui)" }}>{v}</div>
            </div>
          ))}
          <div style={{ flex: 1 }}><ProgressBar value={0.35} label="Genel ilerleme · %35" showLabel /></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{WEEKS.map(renderWeek)}</div>
      </Dialog>
    </div>
  );
}

Object.assign(window, { CourseScreen });

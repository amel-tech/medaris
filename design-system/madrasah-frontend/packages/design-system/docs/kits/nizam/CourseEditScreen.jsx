const { Card, Icon, Button, IconButton, Badge, Field, Input, Textarea, Select,
        CheckboxRow, CoverPattern, LessonRow } = window.DS;

// Platform is resolved from the meeting URL — there is no picker. DESIGN_RULES §7.
const PLATFORMS = [
  { match: "meet.google", name: "Google Meet", color: "var(--platform-meet)", soft: "var(--platform-meet-soft)" },
  { match: "zoom.us", name: "Zoom", color: "var(--platform-zoom)", soft: "var(--platform-zoom-soft)" },
  { match: "jit.si", name: "Jitsi Meet", color: "var(--platform-jitsi)", soft: "var(--platform-jitsi-soft)" },
];
const resolvePlatform = (url = "") =>
  PLATFORMS.find((p) => url.includes(p.match)) ?? { name: "Bilinmeyen platform", color: "var(--faint)", soft: "var(--surface-sunken)" };

function Section({ title, subtitle, children }) {
  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "var(--pad-section)" }}>
      <h2 style={{ margin: 0, font: "var(--fw-bold) var(--fs-19)/1.25 var(--font-ui)", letterSpacing: "var(--tracking-subhead)" }}>{title}</h2>
      {subtitle && (
        <p style={{ margin: "6px 0 18px", font: "var(--fw-regular) var(--fs-14)/1.5 var(--font-ui)", color: "var(--muted)" }}>{subtitle}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </section>
  );
}

function LiveLessonEditor({ onCancel }) {
  const [url, setUrl] = React.useState("https://meet.google.com/bqx-mfzn-rde");
  const [agenda, setAgenda] = React.useState([
    { t: "21:00", title: "Açılış ve geçen haftanın özeti" },
    { t: "21:15", title: "Metin müzakeresi" },
    { t: "21:40", title: "Talebe sorularının cevaplanması" },
  ]);
  const p = resolvePlatform(url);

  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: "var(--r-10)", padding: 18,
      margin: "6px 4px 4px", background: "var(--surface)", boxShadow: "var(--shadow-inline-editor)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ width: 28, height: 28, borderRadius: "var(--r-6)", background: "var(--danger-bg)", color: "var(--danger)", display: "grid", placeItems: "center" }}>
          <Icon name="headset" size={15} />
        </span>
        <span style={{ font: "var(--fw-bold) var(--fs-15)/1 var(--font-ui)" }}>Yeni canlı ders</span>
        <span style={{ flex: 1 }} />
        <IconButton variant="bare" label="Kapat" icon={<Icon name="close" size={17} />} onClick={onCancel} />
      </div>

      <Field label="Ders başlığı" required>
        <Input placeholder="örn. Birinci bab müzakeresi" />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        <Field label="Gün"><Select value="Pazartesi" /></Field>
        <Field label="Saat"><Input defaultValue="21:00" /></Field>
        <Field label="Süre"><Select value="60 dk" /></Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Toplantı bağlantısı" required>
          <Input mono value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            font: "var(--fw-semibold) var(--fs-13)/1 var(--font-ui)",
            color: p.color, background: p.soft, padding: "5px 11px", borderRadius: "var(--r-pill)",
          }}>
            <span style={{ width: 9, height: 9, borderRadius: "var(--r-pill)", background: p.color }} />
            {p.name}
          </span>
          <span style={{ font: "var(--fw-regular) var(--fs-12-5)/1 var(--font-ui)", color: "var(--muted)" }}>
            bağlantıdan otomatik algılandı
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ font: "var(--fw-medium) var(--fs-14)/1 var(--font-ui)" }}>Müzakere akışı</span>
          <span style={{ font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>
            · talebe bu akışı ders sayfasında görür
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agenda.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="more" size={15} style={{ color: "var(--faint)", transform: "rotate(90deg)" }} />
              <Input defaultValue={a.t} style={{ width: 88, flex: "none", textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: "var(--fs-13-5)" }} />
              <Input defaultValue={a.title} />
              <IconButton variant="bare" label="Adımı sil" icon={<Icon name="trash" size={15} />}
                onClick={() => setAgenda(agenda.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button
            variant="link" icon={<Icon name="plus" size={14} />} style={{ color: "var(--green)", alignSelf: "flex-start" }}
            onClick={() => setAgenda([...agenda, { t: "22:00", title: "" }])}
          >
            Akış adımı ekle
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
        <Button variant="ghost" onClick={onCancel}>İptal</Button>
        <Button variant="create" icon={<Icon name="check" size={16} />}>Canlı dersi kaydet</Button>
      </div>
    </div>
  );
}

const WEEKS = [
  { week: 1, title: "Tefsir Usûlünün Tanımı", lessons: [
    { title: "Açılış halkası — usûlün tanımı", day: "Pzt 21:00", duration: "60 dk" },
    { title: "Müzakere ve soru-cevap", day: "Cmt 21:00", duration: "45 dk" },
  ] },
  { week: 2, title: "Esbâb-ı Nüzul", lessons: [
    { title: "Esbâb-ı nüzulün önemi", day: "Pzt 21:00", duration: "60 dk" },
  ] },
];

function CourseEditScreen() {
  const [addingTo, setAddingTo] = React.useState(1);
  const [icazet, setIcazet] = React.useState(true);
  const [onay, setOnay] = React.useState(false);

  return (
    <>
      <NzHead
        title="Kursu Düzenle"
        subtitle="Müfredat ekleyin, kaynakları bağlayın ve talebelere açın."
        actions={<>
          <Button variant="ghost" size="lg">İptal</Button>
          <Button variant="ghost" size="lg">Taslak Kaydet</Button>
          <Button size="lg">Yayımla</Button>
        </>}
      />
      <div style={{ height: 1, background: "var(--line)", margin: "0 0 26px" }} />

      <div style={{ display: "grid", gridTemplateColumns: `1fr var(--aside-w-nizam)`, gap: 28, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Section title="Temel bilgiler" subtitle="Talebelerin köşk listesinde göreceği bilgiler.">
            <Field label="Kurs adı" required><Input defaultValue="Tefsir Usûlüne Giriş" /></Field>
            <Field label="Açıklama" hint="Birkaç cümle ile dersin amacı ve hedef kitlesi."><Textarea rows={3} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Field label="Kategori"><Input defaultValue="Tefsir" /></Field>
              <Field label="Seviye"><Select value="Başlangıç" /></Field>
              <Field label="Süre (hafta)"><Input defaultValue="6" /></Field>
            </div>
          </Section>

          <Section title="Müderris ve kaynaklar" subtitle="Bu kursta ders verecek müderrisleri ve referans kaynaklarını ekleyin.">
            <Field label="Müderrisler">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Input defaultValue="Müderris Fatih Kaya" />
                <IconButton label="Kaldır" icon={<Icon name="close" size={17} />} />
              </div>
              <Button variant="ghost" fullWidth icon={<Icon name="plus" size={15} />} style={{ marginTop: 10, color: "var(--muted)" }}>
                Müderris ekle
              </Button>
            </Field>
            <Field label="Bağlı kaynaklar">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Input defaultValue="Tefsir Usûlü" />
                <Input defaultValue="PDF · 88 sayfa" style={{ color: "var(--muted)" }} />
                <IconButton label="Sil" icon={<Icon name="trash" size={17} />} />
              </div>
              <Button variant="ghost" fullWidth icon={<Icon name="plus" size={15} />} style={{ marginTop: 10, color: "var(--muted)" }}>
                Kaynak ekle
              </Button>
            </Field>
          </Section>

          <Section title="Müfredat" subtitle="Haftalar ve haftalara bağlı canlı dersler. Bu aşamada yalnızca canlı ders içeriği desteklenir.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {WEEKS.map((w) => (
                <div key={w.week} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-9)", overflow: "hidden" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 15px",
                    background: "var(--surface-page-alt)", borderBottom: "1px solid var(--line-soft)",
                  }}>
                    <Icon name="more" size={17} style={{ color: "var(--faint)", transform: "rotate(90deg)" }} />
                    <span style={{
                      font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)",
                      letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--muted)",
                    }}>Hafta {w.week}</span>
                    <span style={{ flex: 1, font: "var(--fw-semibold) var(--fs-15)/1.3 var(--font-ui)" }}>{w.title}</span>
                    <span style={{ font: "var(--fw-regular) var(--fs-13)/1 var(--font-ui)", color: "var(--muted)" }}>
                      {w.lessons.length} canlı ders
                    </span>
                    <IconButton variant="bare" label="Hafta menüsü" icon={<Icon name="more" size={17} />} />
                  </div>

                  <div style={{ padding: 8 }}>
                    {w.lessons.map((l, i) => (
                      <LessonRow
                        key={i} title={l.title} type="live" typeLabel="Canlı ders"
                        duration={l.duration} indent={10}
                        trailing={
                          <>
                            <Badge tone="live">Canlı ders</Badge>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5, minWidth: 78,
                              font: "var(--fw-regular) var(--fs-12-5)/1 var(--font-ui)", color: "var(--muted)",
                            }}><Icon name="calendar" size={13} /> {l.day}</span>
                          </>
                        }
                      />
                    ))}

                    {addingTo === w.week ? (
                      <LiveLessonEditor onCancel={() => setAddingTo(null)} />
                    ) : (
                      <Button
                        variant="link" icon={<Icon name="plus" size={14} />}
                        style={{ color: "var(--danger)", padding: "8px 10px" }}
                        onClick={() => setAddingTo(w.week)}
                      >
                        Canlı ders ekle
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="ghost" fullWidth size="lg" icon={<Icon name="plus" size={16} />}
                style={{ border: "1.5px dashed var(--line)", color: "var(--muted)" }}
              >
                Hafta ekle
              </Button>
            </div>
          </Section>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 0 }}>
          <div>
            <div style={{
              font: "var(--fw-bold) var(--fs-12)/1 var(--font-ui)", letterSpacing: "0.8px",
              color: "var(--faint)", marginBottom: 12,
            }}>ÖNİZLEME</div>
            <CoverPattern hue={165} height={138} />
            <div style={{ marginTop: 14 }}>
              <div style={{
                font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)", letterSpacing: "var(--tracking-eyebrow)",
                color: "var(--muted)", marginBottom: 6,
              }}>TEFSIR</div>
              <h3 style={{ margin: 0, font: "var(--fw-bold) var(--fs-19)/1.25 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
                Tefsir Usûlüne Giriş
              </h3>
              <div style={{ display: "flex", gap: 18, marginTop: 12, font: "var(--fw-regular) var(--fs-14)/1 var(--font-ui)", color: "var(--muted)" }}>
                <span>2 hafta</span><span>3 canlı ders</span>
              </div>
            </div>
          </div>

          <CheckboxRow
            checked={icazet} onChange={() => setIcazet(!icazet)}
            icon={<Icon name="certificate" size={18} />}
            title="İcâzet verilsin"
            description="Müfredatı tamamlayan talebelere otomatik icâzet belgesi verilsin mi?"
          />
          <CheckboxRow
            checked={onay} onChange={() => setOnay(!onay)}
            icon={<Icon name="shield" size={18} />}
            title="Kayıt onayı gereksin"
            description="Açık olduğunda talebelerin kaydı, siz onaylayana kadar beklemede kalır."
          />
        </aside>
      </div>
    </>
  );
}

Object.assign(window, { CourseEditScreen, LiveLessonEditor, resolvePlatform });

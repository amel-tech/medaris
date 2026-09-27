const { Card, Icon, Button, Badge, CoverPattern } = window.DS;

const KOSKS = [
  { name: "Süleymaniye Köşkü", desc: "Klasik medrese müfredatına dayalı; sarf, nahiv, mantık ve usûl-i fıkıh dersleri sunan köşk. Her hafta canlı müzakereler." },
  { name: "Fâtih Köşkü", desc: "Tefsir ve hadis usûlü ağırlıklı; rivayet zincirleri ve metin tahlili." },
  { name: "Beyazıt Köşkü", desc: "Mantık ve âdâbu'l-bahs üzerine yoğunlaşan ileri düzey halkalar." },
  { name: "Karaman Köşkü", desc: "Yeni başlayanlar için Arapça sarf-nahiv ve kıraat temelleri." },
  { name: "Nûruosmaniye Köşkü", desc: "Akaid ve kelâm metinleri; Nesefî ve Senûsî şerhleri." },
];

function KosksScreen({ onOpenKosk }) {
  return (
    <>
      <NzHead
        title="Köşkler"
        subtitle="Yönetiminizdeki köşkleri ve dersleri buradan görüntüleyebilirsiniz."
        actions={<Button size="lg" icon={<Icon name="plus" size={17} />}>Yeni Köşk</Button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "var(--gap-card-grid-nizam)" }}>
        {KOSKS.map((k) => (
          <Card key={k.name} app="nizam" interactive onClick={onOpenKosk} style={{ minHeight: 180 }}>
            <div style={{
              width: 46, height: 46, borderRadius: "var(--r-9)", background: "var(--nav-active)",
              display: "grid", placeItems: "center", color: "var(--slate-600)", marginBottom: 22,
            }}><Icon name="home" size={22} /></div>
            <h3 style={{ margin: "0 0 10px", font: "var(--fw-bold) var(--fs-21)/1.25 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
              {k.name}
            </h3>
            <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-15)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
              {k.desc}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}

const COURSES = [
  { cat: "TEFSIR", level: "BAŞLANGIÇ", title: "Tefsir Usûlüne Giriş", sub: "Birinci sınıf · 6 hafta",
    weeks: 2, lessons: 4, kaynak: 1, hue: 165, status: "Yayında", tone: "published" },
  { cat: "HADİS", level: "ORTA", title: "Hadis Usûlü", sub: "İkinci sınıf · 8 hafta",
    weeks: 4, lessons: 12, kaynak: 3, hue: 28, status: "Taslak", tone: "draft" },
];

function KoskDetailScreen({ onEditCourse }) {
  return (
    <>
      <NzHead
        title="Fâtih Köşkü"
        subtitle="Bu köşkte yer alan dersler ve müfredat yönetimi."
        actions={<>
          <Button variant="ghost" size="lg" icon={<Icon name="settings" size={17} />}>Köşkü Düzenle</Button>
          <Button variant="create" size="lg" icon={<Icon name="plus" size={17} />}>Yeni Ders Aç</Button>
        </>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "var(--gap-card-grid-nizam)" }}>
        {COURSES.map((c) => (
          <Card
            key={c.title} app="nizam" interactive onClick={onEditCourse} pad="16px 18px 18px"
            media={
              <div style={{ position: "relative" }}>
                <CoverPattern hue={c.hue} height={150} />
                <div style={{ position: "absolute", top: 14, right: 14 }}>
                  <Badge tone={c.tone} shape="chip">{c.status}</Badge>
                </div>
              </div>
            }
            footer={
              <div style={{ display: "flex", gap: 18, font: "var(--fw-regular) var(--fs-14)/1 var(--font-ui)", color: "var(--muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="calendar" size={15} /> {c.weeks} hafta</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="headset" size={15} /> {c.lessons} ders</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="book" size={15} /> {c.kaynak} kaynak</span>
              </div>
            }
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)",
                letterSpacing: "var(--tracking-eyebrow)", color: "var(--muted)",
              }}>{c.cat}</span>
              <span style={{ width: 3, height: 3, borderRadius: "var(--r-pill)", background: "var(--faint)" }} />
              <span style={{ font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", letterSpacing: "0.4px", color: "var(--muted)" }}>{c.level}</span>
            </div>
            <h3 style={{ margin: "0 0 4px", font: "var(--fw-bold) var(--fs-19)/1.25 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
              {c.title}
            </h3>
            <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-14)/1.4 var(--font-ui)", color: "var(--muted)" }}>{c.sub}</p>
          </Card>
        ))}
        <button
          onClick={onEditCourse}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            border: "1.5px dashed var(--line)", borderRadius: "var(--r-card)", background: "transparent",
            color: "var(--muted)", font: "var(--fw-medium) var(--fs-15)/1 var(--font-ui)",
            minHeight: 150, cursor: "pointer",
          }}
        >
          <Icon name="plus" size={22} /> Yeni ders aç
        </button>
      </div>
    </>
  );
}

Object.assign(window, { KosksScreen, KoskDetailScreen });

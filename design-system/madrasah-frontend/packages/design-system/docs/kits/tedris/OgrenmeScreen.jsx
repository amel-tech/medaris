const { Card, CoverPattern, Logo, Icon, Badge, Pill, ProgressBar, Button } = window.DS;

const CONTINUING = [
  { kosk: "Süleymaniye Köşkü", course: "Bina ve İzhar Şerhi", hue: 145, cat: "Sarf",
    lesson: "Beşinci Babın Şerhi", type: "live", left: "Cmt 21:00", progress: 0.35, week: "Hafta 3" },
  { kosk: "Karaman Köşkü", course: "Avâmil — Nahiv Esasları", hue: 270, cat: "Nahiv",
    lesson: "Âmil Çeşitleri Müzakeresi", type: "live", left: "Pzt 21:00", progress: 0.62, week: "Hafta 4" },
  { kosk: "Fâtih Köşkü", course: "Hadis Usûlü", hue: 28, cat: "Hadis",
    lesson: "Rivayet Zincirleri", type: "live", left: "14 dk sonra", progress: 0.48, week: "Hafta 2" },
];

const KOSKS = [
  { name: "Süleymaniye Köşkü", hue: 215, courses: 14, students: 482, tags: ["Arapça", "Fıkıh"], level: "Tüm seviyeler" },
  { name: "Beyazıt Köşkü", hue: 270, courses: 8, students: 221, tags: ["Mantık"], level: "İleri" },
  { name: "Karaman Köşkü", hue: 145, courses: 16, students: 538, tags: ["Arapça", "Kıraat"], level: "Başlangıç" },
  { name: "Nûruosmaniye Köşkü", hue: 340, courses: 6, students: 158, tags: ["Akaid"], level: "Orta" },
];

function ContinueCard({ item, onOpen }) {
  return (
    <Card
      interactive onClick={onOpen}
      pad="4px var(--pad-card) var(--pad-card)"
      media={
        <div style={{ position: "relative", padding: 10 }}>
          <CoverPattern hue={item.hue} label={item.cat} height={104} dense />
          <div style={{
            position: "absolute", top: 18, left: 18,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,.94)", borderRadius: "var(--r-pill)",
            padding: "4px 10px 4px 4px",
            font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)", color: "var(--ink)",
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: "var(--r-3)", display: "grid", placeItems: "center",
              background: `oklch(0.92 0.05 ${item.hue})`,
            }}><Logo mark="madrasah" size={13} /></span>
            {item.kosk}
          </div>
          <div style={{
            position: "absolute", right: 22, bottom: 22,
            width: 38, height: 38, borderRadius: "var(--r-pill)",
            background: "var(--surface)", boxShadow: "var(--shadow-float)",
            display: "grid", placeItems: "center", color: "var(--ink)",
          }}><Icon name="play" filled size={17} /></div>
        </div>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)", color: "var(--type-live)",
        }}><Icon name="headset" size={13} /> Canlı halka</span>
        <span style={{ width: 3, height: 3, borderRadius: "var(--r-pill)", background: "var(--faint)" }} />
        <span style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>{item.week}</span>
      </div>
      <div style={{ font: "var(--fw-regular) var(--fs-12)/1.3 var(--font-ui)", color: "var(--muted)", marginBottom: 2 }}>{item.course}</div>
      <h3 style={{ margin: 0, font: "var(--fw-semibold) var(--fs-15)/var(--lh-heading) var(--font-ui)", letterSpacing: "var(--tracking-subhead)" }}>
        {item.lesson}
      </h3>
      <div style={{ marginTop: 12 }}>
        <ProgressBar value={item.progress} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>
            <Icon name="clock" size={12} /> {item.left}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)", color: "var(--accent)" }}>
            Devam et <Icon name="arrowRight" size={13} />
          </span>
        </div>
      </div>
    </Card>
  );
}

function OgrenmeScreen({ onOpenCourse, onOpenLesson }) {
  return (
    <div style={{ padding: "26px 30px 48px" }}>
      <h1 style={{ margin: "0 0 4px", font: "var(--fw-extrabold) var(--fs-26)/var(--lh-tight) var(--font-ui)", letterSpacing: "var(--tracking-title)" }}>
        Öğrenme
      </h1>
      <p style={{ margin: "0 0 26px", font: "var(--fw-regular) var(--fs-15)/1.5 var(--font-ui)", color: "var(--muted)" }}>
        Kaldığın yerden devam et veya yeni köşkler keşfet.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, font: "var(--fw-bold) var(--fs-18)/1.3 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
          Kaldığın yerden devam et
        </h2>
        <Badge tone="accent">{CONTINUING.length} ders</Badge>
        <div style={{ flex: 1 }} />
        <Button variant="link" iconAfter={<Icon name="arrowRight" size={13} />} style={{ color: "var(--muted)" }}>
          Tüm derslerim
        </Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "var(--gap-card-grid)", marginBottom: 34 }}>
        {CONTINUING.map((c, i) => <ContinueCard key={i} item={c} onOpen={onOpenLesson} />)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h2 style={{ margin: 0, font: "var(--fw-bold) var(--fs-18)/1.3 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
          Köşkleri keşfet
        </h2>
        <div style={{ flex: 1 }} />
        <Pill active>Tümü</Pill><Pill>Takip ettiklerim</Pill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "var(--gap-card-grid)" }}>
        {KOSKS.map((k, i) => (
          <Card key={i} interactive onClick={onOpenCourse}
            pad="28px var(--pad-card) var(--pad-card)"
            media={
              <div style={{ position: "relative", height: 72 }}>
                <CoverPattern hue={k.hue} height={72} />
                <div style={{ position: "absolute", left: 14, bottom: -20 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: "var(--r-9)",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    display: "grid", placeItems: "center",
                  }}><Logo mark="madrasah" size={30} /></div>
                </div>
              </div>
            }
            footer={
              <div style={{ display: "flex", gap: 14, font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="book" size={13} /> {k.courses}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="users" size={13} /> {k.students}</span>
              </div>
            }
          >
            <h3 style={{ margin: "0 0 3px", font: "var(--fw-semibold) var(--fs-15)/1.3 var(--font-ui)", letterSpacing: "var(--tracking-subhead)" }}>{k.name}</h3>
            <div style={{ font: "var(--fw-regular) var(--fs-12)/1.3 var(--font-ui)", color: "var(--muted)", marginBottom: 12 }}>{k.level}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {k.tags.map((t) => <Pill key={t} tag>{t}</Pill>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { OgrenmeScreen, ContinueCard });

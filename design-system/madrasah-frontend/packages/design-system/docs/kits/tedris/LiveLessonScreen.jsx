const { Card, Icon, Badge, Button, Avatar, AvatarStack, ProgressBar, Input,
        SidebarItem, LessonRow } = window.DS;

// Platform is RESOLVED from the meeting URL — never picked. See DESIGN_RULES §7.
const PLATFORMS = [
  { match: "meet.google", name: "Google Meet", color: "var(--platform-meet)", soft: "var(--platform-meet-soft)" },
  { match: "zoom.us", name: "Zoom", color: "var(--platform-zoom)", soft: "var(--platform-zoom-soft)" },
  { match: "jit.si", name: "Jitsi Meet", color: "var(--platform-jitsi)", soft: "var(--platform-jitsi-soft)" },
];
const resolvePlatform = (url = "") =>
  PLATFORMS.find((p) => url.includes(p.match)) ?? { name: "Bilinmeyen platform", color: "var(--faint)", soft: "var(--surface-sunken)" };

const AGENDA = [
  { t: "21:00", title: "Açılış ve geçen haftanın özeti" },
  { t: "21:15", title: "Dördüncü–beşinci bab müzakeresi" },
  { t: "21:40", title: "Talebe sorularının cevaplanması" },
  { t: "22:00", title: "Hafta sonu vazifesinin tayini" },
];

const RAIL = [
  { week: 1, title: "Birinci Bab", lessons: [{ title: "Açılış halkası", duration: "60 dk", done: true }] },
  { week: 2, title: "İkinci ve Üçüncü Bab", lessons: [{ title: "İkinci bab müzakeresi", duration: "60 dk", done: true }] },
  { week: 3, title: "Dördüncü ve Beşinci Bab", lessons: [
    { title: "Dördüncü babın şerhi", duration: "60 dk", done: true },
    { title: "Beşinci babın şerhi", duration: "60 dk", current: true },
    { title: "Hafta sonu müzakeresi", duration: "45 dk" },
  ] },
];

function LiveLessonScreen({ onBack }) {
  const url = "https://meet.google.com/bqx-mfzn-rde";
  const p = resolvePlatform(url);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 22px", borderBottom: "1px solid var(--border-soft)" }}>
        <Button variant="quiet" icon={<Icon name="arrowLeft" size={16} />} onClick={onBack} style={{ color: "var(--ink)" }}>
          Kursa dön
        </Button>
        <div style={{ width: 1, height: 22, background: "var(--border-soft)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>
            <span>Bina ve İzhar Şerhi</span><Icon name="chevronRight" size={11} /><span>Hafta 3</span>
          </div>
          <div style={{ font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)" }}>Hafta Sonu Müzakeresi</div>
        </div>
        <div style={{ width: 120 }}><ProgressBar value={0.35} height={6} /></div>
        <span style={{ font: "var(--fw-medium) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>14/40 ders</span>
        <Button size="sm" icon={<Icon name="check" size={15} />}>Tamamlandı işaretle</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "var(--rail-w-list) 1fr", flex: 1, minHeight: 0 }}>
        <aside style={{ borderRight: "1px solid var(--border-soft)", background: "#fcfcfd", padding: "14px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 18px 12px", font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)" }}>
            <span>Müfredat</span><span style={{ color: "var(--muted)", fontWeight: "var(--fw-regular)" }}>%35</span>
          </div>
          {RAIL.map((w) => (
            <div key={w.week} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px" }}>
                <span style={{
                  font: "var(--fw-semibold) var(--fs-10)/1 var(--font-ui)",
                  letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--faint)",
                }}>Hafta {w.week}</span>
                <span style={{ font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)" }}>· {w.title}</span>
              </div>
              {w.lessons.map((l, i) => (
                <LessonRow key={i} title={l.title} type="live" typeLabel="Canlı ders"
                  duration={l.duration} done={l.done} current={l.current} indent={22} />
              ))}
            </div>
          ))}
        </aside>

        <main style={{ overflow: "auto", background: "var(--surface-page-alt)", padding: "24px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card pad={0}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 22px", background: p.soft, borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ width: 40, height: 40, borderRadius: "var(--r-7)", background: p.color, display: "grid", placeItems: "center", color: "var(--white)" }}>
                    <Icon name="headset" size={20} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "var(--fw-regular) var(--fs-12)/1.3 var(--font-ui)", color: "var(--muted)" }}>
                      Bu halka şu platform üzerinden yapılacaktır
                    </div>
                    <div style={{ font: "var(--fw-bold) var(--fs-17)/1.2 var(--font-ui)" }}>{p.name}</div>
                  </div>
                  <Badge tone="live" dot>14 dk sonra</Badge>
                </div>

                <div style={{ padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Badge tone="live" icon={<Icon name="headset" size={12} />}>Canlı halka</Badge>
                    <span style={{ font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>Cumartesi 21:00 · 60 dk</span>
                  </div>
                  <h1 style={{ margin: "0 0 14px", font: "var(--fw-bold) var(--fs-22)/1.2 var(--font-ui)", letterSpacing: "var(--tracking-heading)" }}>
                    Hafta Sonu Müzakeresi
                  </h1>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--r-8)", marginBottom: 16 }}>
                    <Icon name="link" size={16} style={{ color: "var(--muted)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        font: "var(--fw-regular) var(--fs-10)/1 var(--font-ui)", color: "var(--muted)",
                        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2,
                      }}>Toplantı bağlantısı</div>
                      <div style={{ font: "var(--fw-medium) var(--fs-13-5)/1.3 var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {url.replace("https://", "")}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" icon={<Icon name="link" size={13} />}>Kopyala</Button>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <Button
                      as="a" href={url} target="_blank" rel="noopener" size="lg" fullWidth
                      icon={<Icon name="headset" size={18} />} iconAfter={<Icon name="arrowRight" size={16} />}
                      style={{ background: p.color, fontWeight: "var(--fw-semibold)" }}
                    >
                      {p.name}'te katıl
                    </Button>
                    <Button variant="ghost" size="lg" icon={<Icon name="calendar" size={16} />}>Takvime ekle</Button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, font: "var(--fw-regular) var(--fs-12)/1.4 var(--font-ui)", color: "var(--muted)" }}>
                    <Icon name="arrowRight" size={13} /> Bağlantı yeni sekmede açılır. Toplantıya köşk hesabınızla katılabilirsiniz.
                  </div>
                </div>
              </Card>

              <Card>
                <div style={{ font: "var(--fw-semibold) var(--fs-13)/1 var(--font-ui)", marginBottom: 14 }}>Müzakere akışı</div>
                {AGENDA.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < AGENDA.length - 1 ? 16 : 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "var(--r-pill)", background: i === 0 ? p.color : "var(--border)", marginTop: 4 }} />
                      {i < AGENDA.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 22, background: "var(--border-soft)", marginTop: 4 }} />}
                    </div>
                    <div>
                      <div style={{ font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)", color: p.color, fontVariantNumeric: "tabular-nums" }}>{a.t}</div>
                      <div style={{ font: "var(--fw-regular) var(--fs-13-5)/1.4 var(--font-ui)", marginTop: 3 }}>{a.title}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ font: "var(--fw-semibold) var(--fs-13)/1 var(--font-ui)" }}>Katılacaklar</span>
                  <span style={{ font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)" }}>32 kayıtlı</span>
                </div>
                <AvatarStack size={34} max={7} overflow={25}
                  people={[["AY",28],["BE",145],["CN",270],["DH",200],["ES",340],["FK",60],["GH",12]]
                    .map(([initials, hue]) => ({ initials, hue }))} />
              </Card>

              <Card style={{ background: "var(--surface-alt)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar initials="AH" hue={145} size={26} />
                  <div>
                    <div style={{ font: "var(--fw-semibold) var(--fs-12-5)/1.2 var(--font-ui)" }}>Müderris Ahmed Hilmi</div>
                    <div style={{ font: "var(--fw-regular) var(--fs-11)/1.2 var(--font-ui)", color: "var(--muted)" }}>Halkayı yönetiyor</div>
                  </div>
                </div>
                <p style={{ margin: "10px 0 0", font: "var(--fw-regular) var(--fs-12)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
                  Sorularınızı önceden hazırlayıp halka başında müderrise iletebilirsiniz.
                </p>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { LiveLessonScreen, resolvePlatform });

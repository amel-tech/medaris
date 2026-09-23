/* eslint-disable */
// /courses/[courseId]/lessons/[lessonId] — Lesson study workspace.
// A single shell (curriculum rail + content stage + footer nav) whose center
// adapts to the lesson type: video · doc · live · quiz.

const L_COLORS = window.MD_COLORS;

// Compact curriculum for the left rail (mirrors the course syllabus).
const LESSON_RAIL = [
    { week: 1, title: "Birinci Bab", state: "done", lessons: [
    { id: "1-1", title: "Açılış mütalaası", type: "video", dur: "12 dk", done: true },
    { id: "1-2", title: "Birinci babın îsâgûcîsi", type: "video", dur: "28 dk", done: true },
    { id: "1-3", title: "Türev tatbikatı", type: "doc", dur: "PDF", done: true },
    { id: "1-4", title: "Müzakere", type: "live", dur: "45 dk", done: true },
  ]},
  { week: 2, title: "İkinci ve Üçüncü Bab", state: "done", lessons: [
    { id: "2-1", title: "İkinci bab şerhi", type: "video", dur: "32 dk", done: true },
    { id: "2-2", title: "Üçüncü bab şerhi", type: "video", dur: "30 dk", done: true },
    { id: "2-3", title: "Karşılaştırmalı tablo", type: "doc", dur: "PDF", done: true },
    { id: "2-4", title: "Ölçme ve değerlendirme", type: "quiz", dur: "10 soru", done: true },
  ]},
  { week: 3, title: "Dördüncü ve Beşinci Bab", state: "active", lessons: [
    { id: "3-1", title: "Dördüncü babın şerhi", type: "video", dur: "29 dk", done: true },
    { id: "3-2", title: "Beşinci babın şerhi", type: "video", dur: "31 dk", current: true },
    { id: "3-3", title: "Tatbikat defteri 3", type: "doc", dur: "PDF" },
    { id: "3-4", title: "Hafta sonu müzakeresi", type: "live", dur: "45 dk" },
    { id: "3-5", title: "Hafta sonu sınavı", type: "quiz", dur: "10 soru" },
  ]},
  { week: 4, title: "Altıncı Bab ve Tekrar", state: "locked", lessons: [
    { id: "4-1", title: "Altıncı babın şerhi", type: "video", dur: "28 dk" },
    { id: "4-2", title: "Ara sınav", type: "quiz", dur: "20 soru" },
  ]},
];

const L_TYPE_META = {
  video: { label: "Video ders", icon: (s) => <IconPlayOutline size={s} />, color: "#1d4ed8" },
  doc:   { label: "Doküman",     icon: (s) => <IconPdf size={s} />,        color: "#64748b" },
  live:  { label: "Canlı halka", icon: (s) => <IconHeadset size={s} />,    color: "#dc2626" },
  quiz:  { label: "Sınav",       icon: (s) => <IconQuiz size={s} />,       color: "#d97706" },
};

// --------------------------------------------------------------------------
const LessonPage = ({ type = "video", provider = "native" }) => {
  const C = L_COLORS;
  const [railOpen, setRailOpen] = React.useState(true);

  const meta = L_TYPE_META[type];
  const titleByType = {
    video: "Beşinci Babın Şerhi",
    doc: "Tatbikat Defteri 3 — فَتَحَ Bâbı",
    live: "Hafta Sonu Müzakeresi",
    quiz: "Hafta 3 — Ölçme ve Değerlendirme",
  };

  return (
    <div data-screen-label={`Çalışma · ${meta.label}`} style={{ fontFamily: MD_FONT, background: "#fff", color: C.text, minHeight: 900, display: "flex", flexDirection: "column" }}>
      {/* ---- top bar ---- */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 22px", borderBottom: `1px solid ${C.borderSoft}`, background: "white", position: "sticky", top: 0, zIndex: 20 }}>
        <a href="design-sources/course.html" style={{ ...btnReset, color: C.text, fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
          <IconArrowLeft size={16} /> Kursa dön
        </a>
        <div style={{ width: 1, height: 22, background: C.borderSoft }} />
        <button onClick={() => setRailOpen(!railOpen)} style={{ ...btnReset, color: C.muted }}>
          <IconBook size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Bina ve İzhar Şerhi</span>
            <IconChevronRight size={11} />
            <span>Hafta 3</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titleByType[type]}</div>
        </div>

        {/* mini progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 120, height: 6, background: C.surfaceSunken, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: "35%", height: "100%", background: C.accent }} />
          </div>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>14/40 ders</span>
        </div>

        <div style={{ width: 1, height: 22, background: C.borderSoft }} />
        <button style={lBtnGhost(C)}><IconBookmark size={15} /> Kaydet</button>
        <button style={lBtnPrimary(C)}><IconCheck size={15} /> Tamamlandı işaretle</button>
      </header>

      {/* ---- body: rail + stage ---- */}
      <div style={{ display: "grid", gridTemplateColumns: railOpen ? "300px 1fr" : "0 1fr", transition: "grid-template-columns .2s", flex: 1, minHeight: 0 }}>
        {/* curriculum rail */}
        <aside style={{ borderRight: `1px solid ${C.borderSoft}`, overflow: "hidden", background: "#fcfcfd" }}>
          <LessonRail currentType={type} />
        </aside>

        {/* content stage */}
        <main style={{ overflow: "auto", background: "#f7f8fa" }}>
          {type === "video" && <VideoStudy />}
          {type === "doc"   && <DocStudy />}
          {type === "live"  && (provider === "native" ? <LiveStudy /> : <LiveStudyExternal provider={provider} />)}
          {type === "quiz"  && <QuizStudy />}
        </main>
      </div>
    </div>
  );
};

// ---- left curriculum rail ----
const LessonRail = ({ currentType }) => {
  const C = L_COLORS;
  return (
    <div style={{ padding: "14px 0 24px" }}>
      <div style={{ padding: "4px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Müfredat</span>
        <span style={{ fontSize: 11, color: C.muted }}>%35</span>
      </div>
      {LESSON_RAIL.map((wk) => {
        const locked = wk.state === "locked";
        return (
          <div key={wk.week} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>Hafta {wk.week}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: locked ? C.muted : C.text }}>· {wk.title}</span>
              {locked && <IconLock size={11} style={{ color: C.faint, marginLeft: "auto" }} />}
            </div>
            {wk.lessons.map((l) => {
              const m = L_TYPE_META[l.type];
              const isCurrent = l.current && l.type === currentType;
              return (
                <div key={l.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 18px 8px 22px",
                  background: isCurrent ? "#eef4ff" : "transparent",
                  borderLeft: isCurrent ? `3px solid ${C.accent}` : "3px solid transparent",
                  cursor: locked ? "default" : "pointer",
                  opacity: locked ? 0.55 : 1,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                    display: "grid", placeItems: "center",
                    background: l.done ? "#dcfce7" : isCurrent ? C.accentSoft : C.surfaceSunken,
                    color: l.done ? C.success : isCurrent ? C.accent : C.muted,
                  }}>
                    {l.done ? <IconCheck size={12} /> : m.icon(12)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isCurrent ? 600 : 500, color: l.done ? C.muted : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                    <div style={{ fontSize: 10.5, color: C.faint, display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{m.label}</span><span>·</span><span>{l.dur}</span>
                    </div>
                  </div>
                  {isCurrent && <IconPlay size={12} style={{ color: C.accent }} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// ============================== VIDEO ==============================
const VideoStudy = () => {
  const C = L_COLORS;
  const [tab, setTab] = React.useState("transkript");
  const chapters = [
    { t: "00:00", title: "Giriş ve önceki bahsin tekrarı", active: false },
    { t: "03:24", title: "Fâtih babının tanımı", active: true },
    { t: "11:08", title: "Harf-i halk illeti", active: false },
    { t: "19:42", title: "Tatbiki örnekler", active: false },
    { t: "25:50", title: "Hafta sonu vazifesi", active: false },
  ];
  const transcript = [
    { t: "03:24", ar: false, text: "Bu derste فَتَحَ babını, yani fethatü'l-ayn bâbını ele alacağız." },
    { t: "03:51", ar: true,  text: "فَتَحَ يَفْتَحُ فَتْحًا — bu babın temel kalıbıdır." },
    { t: "04:30", ar: false, text: "Dikkat ediniz: ayn-ı fiil ile lâm-ı fiilden biri harf-i halk olduğunda muzâri bu baba gelir." },
    { t: "05:12", ar: false, text: "Harf-i halk altı tanedir: ء ه ع ح غ خ. Bunları ezberlemek bu babın anahtarıdır." },
  ];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 24px 48px" }}>
      {/* player */}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", aspectRatio: "16 / 9", boxShadow: "0 24px 50px -24px rgba(0,0,0,.6)" }}>
        {/* poster */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 120% at 30% 20%, #1e293b 0%, #0b1020 70%)", display: "grid", placeItems: "center" }}>
          <div style={{ fontFamily: "'Amiri', 'Scheherazade New', serif", fontSize: 64, color: "rgba(255,255,255,.16)", letterSpacing: 4 }}>فَتَحَ</div>
        </div>
        {/* center play */}
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ width: 78, height: 78, borderRadius: 99, background: "rgba(255,255,255,.95)", display: "grid", placeItems: "center", boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
            <div style={{ color: "#0b1020", marginLeft: 4 }}><IconPlay size={32} /></div>
          </div>
        </div>
        {/* controls */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "26px 18px 12px", background: "linear-gradient(transparent, rgba(0,0,0,.75))" }}>
          <div style={{ height: 5, background: "rgba(255,255,255,.25)", borderRadius: 99, marginBottom: 12, position: "relative" }}>
            <div style={{ width: "38%", height: "100%", background: "#fff", borderRadius: 99 }} />
            <div style={{ position: "absolute", left: "38%", top: "50%", transform: "translate(-50%,-50%)", width: 13, height: 13, borderRadius: 99, background: "#fff" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#fff" }}>
            <IconPlay size={18} />
            <IconArrowRight size={18} />
            <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>11:48 / 31:02</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, border: "1px solid rgba(255,255,255,.4)", borderRadius: 6, padding: "2px 8px" }}>1.0×</span>
            <span style={{ fontSize: 12, border: "1px solid rgba(255,255,255,.4)", borderRadius: 6, padding: "2px 8px" }}>HD</span>
            <IconHeadset size={18} />
            <IconSettings size={18} />
          </div>
        </div>
      </div>

      {/* title + actions */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "20px 0 16px", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8", background: "#eff4ff", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5 }}><IconPlayOutline size={12} /> Video ders</span>
            <span style={{ fontSize: 12, color: C.muted }}>Hafta 3 · 31 dk</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3, color: C.text }}>Beşinci Babın Şerhi — فَتَحَ Bâbı</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Avatar name="AH" hue={145} size={26} />
            <span style={{ fontSize: 13, color: C.text }}>Müderris Ahmed Hilmi</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button style={lBtnGhost(C)}><IconDownload size={15} /> İndir</button>
          <button style={lBtnGhost(C)}><IconShare size={15} /> Paylaş</button>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 24, borderBottom: `1px solid ${C.borderSoft}`, marginBottom: 18 }}>
        {[
          { id: "transkript", label: "Transkript" },
          { id: "notlar", label: "Notlarım", badge: 3 },
          { id: "kaynak", label: "Kaynaklar", badge: 2 },
          { id: "soru", label: "Sorular", badge: 5 },
        ].map(t => {
          const active = tab === t.id;
          return (
            <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: "0 2px 12px", fontSize: 14, fontWeight: active ? 600 : 500, color: active ? C.text : C.muted, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
              {t.label}
              {t.badge && <span style={{ fontSize: 11, fontWeight: 600, background: active ? "#eff4ff" : C.surfaceSunken, color: active ? C.accent : C.muted, padding: "1px 7px", borderRadius: 99 }}>{t.badge}</span>}
            </div>
          );
        })}
      </div>

      {/* tab body: transcript + chapters side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
        <div>
          {tab === "transkript" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {transcript.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "10px 12px", borderRadius: 10, background: i === 1 ? "#eff4ff" : "transparent" }}>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 42, cursor: "pointer" }}>{s.t}</span>
                  <span style={{ fontSize: 14, color: C.text, lineHeight: 1.6, direction: s.ar ? "rtl" : "ltr", fontFamily: s.ar ? "'Amiri', serif" : "inherit", fontSize: s.ar ? 18 : 14, textAlign: s.ar ? "right" : "left", flex: 1 }}>{s.text}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "notlar" && <NotesPanel />}
          {tab === "kaynak" && <MiniResourceList />}
          {tab === "soru" && <QnAPanel />}
        </div>

        {/* chapters */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Bölümler</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {chapters.map((ch, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 10px", borderRadius: 8, background: ch.active ? "#eff4ff" : "transparent", cursor: "pointer" }}>
                <span style={{ fontSize: 11, color: ch.active ? C.accent : C.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{ch.t}</span>
                <span style={{ fontSize: 12.5, color: ch.active ? C.text : C.muted, fontWeight: ch.active ? 600 : 500, lineHeight: 1.4 }}>{ch.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <LessonFooterNav prev="Dördüncü babın şerhi" next="Tatbikat defteri 3" />
    </div>
  );
};

// ============================== DOC / PDF ==============================
const DocStudy = () => {
  const C = L_COLORS;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "76px 1fr 300px", height: "100%", minHeight: 760 }}>
      {/* page thumbs */}
      <div style={{ borderRight: `1px solid ${C.borderSoft}`, background: "#fff", padding: "16px 0", overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {[1,2,3,4,5].map(p => (
          <div key={p} style={{ textAlign: "center" }}>
            <div style={{ width: 44, height: 58, background: "#fff", border: p === 2 ? `2px solid ${C.accent}` : `1px solid ${C.border}`, borderRadius: 4, margin: "0 auto", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }} />
            <div style={{ fontSize: 10, color: p === 2 ? C.accent : C.faint, marginTop: 4, fontWeight: p === 2 ? 600 : 400 }}>{p}</div>
          </div>
        ))}
      </div>

      {/* page viewer */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* doc toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", background: C.surfaceSunken, padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5 }}><IconPdf size={12} /> Doküman</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Tatbikat Defteri 3</span>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted }}>
            <IconChevronLeft size={16} />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>2 / 14</span>
            <IconChevronRight size={16} />
          </div>
          <div style={{ width: 1, height: 18, background: C.borderSoft }} />
          <span style={{ fontSize: 12, color: C.muted }}>100%</span>
          <button style={lBtnGhost(C)}><IconDownload size={14} /> İndir</button>
        </div>

        {/* the page */}
        <div style={{ flex: 1, overflow: "auto", background: "#eceef1", padding: "28px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 620, background: "#fff", borderRadius: 4, boxShadow: "0 4px 24px rgba(0,0,0,.10)", padding: "56px 60px", minHeight: 760 }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontFamily: "'Amiri', serif", fontSize: 30, color: C.text, direction: "rtl" }}>باب فَتَحَ يَفْتَحُ</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Tatbikat Defteri · Üçüncü Hafta</div>
              <div style={{ height: 1, background: C.borderSoft, margin: "20px 0" }} />
            </div>
            <div style={{ fontSize: 14, lineHeight: 2, color: C.text }}>
              <p style={{ marginTop: 0 }}>Aşağıdaki fiilleri فَتَحَ babına göre çekiniz ve harf-i halk illetini gösteriniz:</p>
              <ol style={{ direction: "rtl", textAlign: "right", fontFamily: "'Amiri', serif", fontSize: 20, lineHeight: 2.2, paddingRight: 24 }}>
                <li>ذَهَبَ</li>
                <li>سَأَلَ</li>
                <li>قَرَأَ</li>
                <li>مَنَعَ</li>
              </ol>
              <div style={{ marginTop: 24, padding: 16, border: `1px dashed ${C.border}`, borderRadius: 8, background: C.surfaceAlt, fontSize: 13, color: C.muted }}>
                <strong style={{ color: C.text }}>Not:</strong> Her fiilin muzârisini yazarken ayn-ı fiilin harekesine dikkat ediniz. Çözümünüzü müderrise teslim için aşağıdaki butonu kullanabilirsiniz.
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.borderSoft}`, background: "#fff" }}>
          <LessonFooterNav prev="Beşinci babın şerhi" next="Hafta sonu müzakeresi" inline />
        </div>
      </div>

      {/* notes / submit */}
      <div style={{ borderLeft: `1px solid ${C.borderSoft}`, background: "#fff", padding: 18, overflow: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Tatbikat teslimi</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: C.surfaceSunken, display: "grid", placeItems: "center", color: C.muted }}><IconUpload size={15} /></div>
            <div style={{ fontSize: 12, color: C.muted }}>Çözümünü yükle (PDF / görsel)</div>
          </div>
          <button style={{ ...lBtnGhost(C), width: "100%", justifyContent: "center" }}>Dosya seç</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Notlarım</div>
        <NotesPanel compact />
      </div>
    </div>
  );
};

// ============================== LIVE ==============================
const LiveStudy = () => {
  const C = L_COLORS;
  const agenda = [
    { t: "21:00", title: "Açılış ve geçen haftanın özeti" },
    { t: "21:15", title: "Dördüncü–beşinci bab müzakeresi" },
    { t: "21:40", title: "Talebe sorularının cevaplanması" },
    { t: "22:00", title: "Hafta sonu vazifesinin tayini" },
  ];
  const participants = [["AY",28],["BE",145],["CN",270],["DH",200],["ES",340],["FK",60],["GH",12]];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 24px 48px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
        {/* stage */}
        <div>
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "16 / 9", background: "radial-gradient(120% 120% at 50% 0%, #1e293b, #0b1020)", display: "grid", placeItems: "center" }}>
            {/* scheduled badge */}
            <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 7, background: "rgba(220,38,38,.16)", border: "1px solid rgba(220,38,38,.5)", color: "#fca5a5", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: "#ef4444" }} /> Canlı yayın · 14 dk sonra
            </div>
            <div style={{ textAlign: "center", color: "#fff" }}>
              <div style={{ width: 72, height: 72, borderRadius: 99, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
                <IconHeadset size={34} />
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>Müzakere yakında başlıyor</div>
              <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}>00:14:32</div>
            </div>
          </div>

          {/* title */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "20px 0 14px", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5 }}><IconHeadset size={12} /> Canlı halka</span>
                <span style={{ fontSize: 12, color: C.muted }}>Cumartesi 21:00 · 60 dk</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Hafta Sonu Müzakeresi</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <Avatar name="AH" hue={145} size={26} />
                <span style={{ fontSize: 13, color: C.text }}>Müderris Ahmed Hilmi</span>
                <span style={{ fontSize: 12, color: C.muted }}>· yönetiyor</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button style={lBtnGhost(C)}><IconCalendar size={15} /> Takvime ekle</button>
              <button style={{ ...lBtnPrimary(C), background: "#dc2626" }}><IconHeadset size={15} /> Halkaya katıl</button>
            </div>
          </div>

          {/* agenda */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Müzakere akışı</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {agenda.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < agenda.length - 1 ? 16 : 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: i === 0 ? C.accent : C.border, marginTop: 4 }} />
                    {i < agenda.length - 1 && <div style={{ width: 2, flex: 1, background: C.borderSoft, marginTop: 4 }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.t}</div>
                    <div style={{ fontSize: 13.5, color: C.text, marginTop: 2 }}>{a.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* side: participants + chat preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Katılımcılar</span>
              <span style={{ fontSize: 12, color: C.muted }}>32 kayıtlı</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {participants.map((p, i) => <Avatar key={i} name={p[0]} hue={p[1]} size={34} />)}
              <div style={{ width: 34, height: 34, borderRadius: 99, background: C.surfaceSunken, color: C.muted, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>+25</div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", display: "flex", flexDirection: "column", flex: 1, minHeight: 300 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, fontSize: 13, fontWeight: 600 }}>Halka sohbeti</div>
            <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { n: "BE", h: 145, name: "Bilal E.", msg: "Hocam harf-i halkı tekrar eder misiniz?" },
                { n: "CN", h: 270, name: "Cemal N.", msg: "Geçen haftanın kaydı paylaşılacak mı?" },
              ].map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <Avatar name={c.n} hue={c.h} size={28} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{c.msg}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${C.borderSoft}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", color: C.muted, fontSize: 12.5 }}>
                <IconChat size={15} /> Mesaj yaz...
              </div>
            </div>
          </div>
        </div>
      </div>
      <LessonFooterNav prev="Tatbikat defteri 3" next="Hafta sonu sınavı" />
    </div>
  );
};

// ---- external-platform provider brand chips ----
const PROVIDERS = {
  meet: {
    name: "Google Meet",
    color: "#00897b",
    soft: "#e6f4f1",
    logo: (s = 28) => (
      <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="6" y="13" width="26" height="22" rx="3" fill="#00ac47" />
        <path d="M32 20l8-5v18l-8-5z" fill="#00832d" />
        <path d="M32 20v8l-8-7 8-1z" fill="#ffba00" />
        <rect x="6" y="13" width="9" height="22" rx="3" fill="#0066da" />
        <path d="M32 20l8-5v6l-8-1z" fill="#e94235" />
      </svg>
    ),
  },
  zoom: {
    name: "Zoom",
    color: "#2d8cff",
    soft: "#e9f2ff",
    logo: (s = 28) => (
      <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="11" fill="#2d8cff" />
        <path d="M12 18a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V18Zm18 4 6-4v12l-6-4v-4Z" fill="#fff" />
      </svg>
    ),
  },
  jitsi: {
    name: "Jitsi Meet",
    color: "#1d6fb8",
    soft: "#e7f0f9",
    logo: (s = 28) => (
      <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="11" fill="#1d6fb8" />
        <path d="M11 18a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V18Zm19 4 7-5v14l-7-5v-4Z" fill="#fff" />
      </svg>
    ),
  },
};

// ============================== LIVE (external platform) ==============================
const LiveStudyExternal = ({ provider = "meet" }) => {
  const C = L_COLORS;
  const p = PROVIDERS[provider] || PROVIDERS.meet;
  const link = {
    meet: "meet.google.com/bqx-mfzn-rde",
    zoom: "zoom.us/j/8842031567",
    jitsi: "meet.jit.si/SuleymaniyeHafta3",
  }[provider];
  const agenda = [
    { t: "21:00", title: "Açılış ve geçen haftanın özeti" },
    { t: "21:15", title: "Dördüncü–beşinci bab müzakeresi" },
    { t: "21:40", title: "Talebe sorularının cevaplanması" },
    { t: "22:00", title: "Hafta sonu vazifesinin tayini" },
  ];
  const participants = [["AY",28],["BE",145],["CN",270],["DH",200],["ES",340],["FK",60],["GH",12]];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 24px 48px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
        {/* stage → external join card */}
        <div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
            {/* branded header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 22px", background: p.soft, borderBottom: `1px solid ${C.borderSoft}` }}>
              {p.logo(40)}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.muted }}>Bu halka şu platform üzerinden yapılacaktır</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{p.name}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(220,38,38,.10)", color: "#dc2626", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: "#ef4444" }} /> 14 dk sonra
              </div>
            </div>

            {/* body */}
            <div style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5 }}><IconHeadset size={12} /> Canlı halka</span>
                <span style={{ fontSize: 12, color: C.muted }}>Cumartesi 21:00 · 60 dk</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 14px", letterSpacing: -0.3 }}>Hafta Sonu Müzakeresi</h1>

              {/* meeting link row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.surfaceAlt, marginBottom: 16 }}>
                <IconLink size={16} style={{ color: C.muted }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>Toplantı bağlantısı</div>
                  <div style={{ fontSize: 13.5, color: C.text, fontWeight: 500, fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{link}</div>
                </div>
                <button style={{ ...lBtnGhost(C), padding: "7px 12px" }}><IconLink size={13} /> Kopyala</button>
              </div>

              {/* primary actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btnReset, flex: 1, justifyContent: "center", gap: 9, background: p.color, color: "#fff", borderRadius: 10, padding: "13px 18px", fontSize: 14, fontWeight: 600 }}>
                  {p.logo(20)} {p.name}'te katıl
                  <IconArrowRight size={16} />
                </button>
                <button style={{ ...lBtnGhost(C), padding: "13px 16px" }}><IconCalendar size={16} /> Takvime ekle</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: C.muted }}>
                <IconArrowRight size={13} /> Bağlantı yeni sekmede açılır. Toplantıya köşk hesabınızla katılabilirsiniz.
              </div>
            </div>
          </div>

          {/* agenda */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, background: "#fff", marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Müzakere akışı</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {agenda.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < agenda.length - 1 ? 16 : 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: i === 0 ? p.color : C.border, marginTop: 4 }} />
                    {i < agenda.length - 1 && <div style={{ width: 2, flex: 1, background: C.borderSoft, marginTop: 4 }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: p.color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.t}</div>
                    <div style={{ fontSize: 13.5, color: C.text, marginTop: 2 }}>{a.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* side: how-to + participants */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Katılacaklar</span>
              <span style={{ fontSize: 12, color: C.muted }}>32 kayıtlı</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {participants.map((pt, i) => <Avatar key={i} name={pt[0]} hue={pt[1]} size={34} />)}
              <div style={{ width: 34, height: 34, borderRadius: 99, background: C.surfaceSunken, color: C.muted, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>+25</div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.surfaceAlt }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Avatar name="AH" hue={145} size={26} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Müderris Ahmed Hilmi</div>
                <div style={{ fontSize: 11, color: C.muted }}>Halkayı yönetiyor</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
              Sorularınızı önceden hazırlayıp halka başında müderrise iletebilirsiniz.
            </p>
          </div>
        </div>
      </div>
      <LessonFooterNav prev="Tatbikat defteri 3" next="Hafta sonu sınavı" />
    </div>
  );
};
const QuizStudy = () => {
  const C = L_COLORS;
  const total = 10, current = 3;
  const options = [
    { k: "A", text: "ء ه ع ح غ خ", correct: false },
    { k: "B", text: "ا و ي", correct: false },
    { k: "C", text: "ء ه ع ح غ خ — boğaz harfleri", correct: true, selected: true },
    { k: "D", text: "ن م ل ر", correct: false },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 24px 48px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#d97706", background: "#fffbeb", padding: "3px 9px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5 }}><IconQuiz size={12} /> Sınav</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted, display: "inline-flex", alignItems: "center", gap: 6 }}><IconClock size={15} /> 08:24 kaldı</span>
        </div>
      </div>

      {/* progress dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: i < current - 1 ? C.success : i === current - 1 ? C.accent : C.surfaceSunken }} />
        ))}
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginLeft: 8, minWidth: 44 }}>{current} / {total}</span>
      </div>

      {/* question card */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, background: "#fff", boxShadow: "0 8px 30px -20px rgba(15,23,42,.2)" }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Soru {current}</div>
        <h2 style={{ fontSize: 19, fontWeight: 600, margin: "0 0 6px", lineHeight: 1.45, color: C.text }}>
          فَتَحَ babının gelmesini gerektiren harf-i halk harfleri hangileridir?
        </h2>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 22px" }}>Doğru olan tek seçeneği işaretleyiniz.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {options.map((o) => {
            const sel = o.selected;
            return (
              <div key={o.k} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                border: sel ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                background: sel ? "#eff4ff" : "#fff",
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600,
                  background: sel ? C.accent : C.surfaceSunken,
                  color: sel ? "#fff" : C.muted,
                }}>{o.k}</div>
                <span style={{ fontSize: 16, color: C.text, fontFamily: "'Amiri', serif", direction: "rtl", flex: 1 }}>{o.text}</span>
                {sel && <IconCheckCircle filled size={20} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22 }}>
        <button style={{ ...lBtnGhost(C), padding: "10px 16px" }}><IconChevronLeft size={16} /> Önceki</button>
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600,
              background: i === current - 1 ? C.accent : i < current - 1 ? "#dcfce7" : C.surfaceSunken,
              color: i === current - 1 ? "#fff" : i < current - 1 ? C.success : C.muted, cursor: "pointer" }}>{i + 1}</div>
          ))}
        </div>
        <button style={{ ...lBtnPrimary(C), padding: "10px 18px" }}>Sonraki <IconChevronRight size={16} /></button>
      </div>
    </div>
  );
};

// ---- shared small panels ----
const NotesPanel = ({ compact }) => {
  const C = L_COLORS;
  const notes = [
    { t: "05:12", text: "Harf-i halk altı tane: ء ه ع ح غ خ — ezberle!" },
    { t: "11:40", text: "Ayn veya lâm harf-i halk olursa muzâri fetha alır." },
    { t: "19:02", text: "ذَهَبَ → يَذْهَبُ örneğini tekrar dinle." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.muted, fontSize: 13 }}>
          <IconPlus size={15} /> Şu an (11:48) için not ekle...
        </div>
      )}
      {notes.map((n, i) => (
        <div key={i} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 12, display: "flex", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n.t}</span>
          <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5, flex: 1 }}>{n.text}</span>
        </div>
      ))}
    </div>
  );
};

const MiniResourceList = () => {
  const C = L_COLORS;
  const items = [
    { name: "Bina ve İzhar — s. 20-24", meta: "PDF · bu dersin metni", icon: <IconPdf size={16} /> },
    { name: "Harf-i halk kartları", meta: "Deste · 6 kart", icon: <IconBook size={16} /> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((k, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: C.surfaceAlt, display: "grid", placeItems: "center", color: C.muted }}>{k.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{k.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{k.meta}</div>
          </div>
          <IconDownload size={15} style={{ color: C.muted }} />
        </div>
      ))}
    </div>
  );
};

const QnAPanel = () => {
  const C = L_COLORS;
  const qs = [
    { n: "BE", h: 145, name: "Bilal E.", q: "Hocam, lâm-ı fiil harf-i halk olduğunda da bu bab gelir mi?", a: 2, time: "2 gün önce" },
    { n: "ES", h: 340, name: "Esra S.", q: "ذَهَبَ örneğinde illet neden ذ değil de ه?", a: 1, time: "4 gün önce" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.muted, fontSize: 13 }}>
        <IconChat size={15} /> Bu ders hakkında soru sor...
      </div>
      {qs.map((q, i) => (
        <div key={i} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Avatar name={q.n} hue={q.h} size={26} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{q.name}</span>
            <span style={{ fontSize: 11, color: C.faint }}>· {q.time}</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{q.q}</div>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <IconChat size={13} /> {q.a} cevap
          </div>
        </div>
      ))}
    </div>
  );
};

const LessonFooterNav = ({ prev, next, inline }) => {
  const C = L_COLORS;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: inline ? 0 : 32, paddingTop: inline ? 0 : 24, borderTop: inline ? "none" : `1px solid ${C.borderSoft}` }}>
      <button style={{ ...lBtnGhost(C), padding: "10px 16px" }}><IconChevronLeft size={16} /> <span style={{ textAlign: "left" }}><span style={{ display: "block", fontSize: 10, color: C.faint }}>Önceki</span>{prev}</span></button>
      <button style={{ ...lBtnPrimary(C), padding: "10px 18px" }}><span style={{ textAlign: "right" }}><span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,.6)" }}>Sıradaki</span>{next}</span> <IconChevronRight size={16} /></button>
    </div>
  );
};

// ---- buttons (local to this babel scope) ----
const lBtnPrimary = (C) => ({ ...btnReset, background: C.dark, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 500 });
const lBtnGhost   = (C) => ({ ...btnReset, background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 500 });

window.LessonPage = LessonPage;

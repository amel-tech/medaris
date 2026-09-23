const { DataTable, IconButton, Icon, Button, Toast } = window.DS;

const DECKS = [
  { title: "testtest", desc: "test test test" },
  { title: "Sarf — Emsile Kartları", desc: "Birinci bab türevleri ve illetleri" },
  { title: "Nahiv — Âmiller", desc: "Avâmil-i mie ezber destesi" },
  { title: "Akaid — Istılahlar", desc: "Kelâm terimleri ve tanımları" },
];

function DecksScreen({ onOpenDeck }) {
  return (
    <>
      <NzHead
        title="Bilgi Kartı Desteleri"
        subtitle="Bilgi kartı destelerinizi ve çalışma materyallerinizi yönetin."
        actions={<Button size="lg" icon={<Icon name="plus" size={17} />}>Yeni Güverte</Button>}
      />
      <DataTable
        rowKey={(r) => r.title}
        rows={DECKS}
        columns={[
          { header: "Başlık", strong: true, key: "title" },
          { header: "Açıklama", key: "desc" },
          { header: "", width: "120px", align: "right", cell: () => (
            <>
              <IconButton size="sm" label="Görüntüle" icon={<Icon name="eye" size={17} />} onClick={onOpenDeck} />
              <IconButton size="sm" label="Sil" icon={<Icon name="trash" size={17} />} />
            </>
          ) },
        ]}
      />
      <Toast title="İthal Kartlar" description="2 kart başarıyla içe aktarıldı." />
    </>
  );
}

function DeckDetailScreen() {
  const CARDS = [
    { front: "“Cenâb-ı Hakk'ın ni'metlerine şükür, o ni'metin zevâline emândır.” (Deylemî)",
      back: "اَلْحَمْدُ عَلَى النِّعْمَةِ أَمَانٌ لِزَوَالِهِ", backAr: true },
    { front: "أَهْلاً", frontAr: true, back: "selam" },
    { front: "Sarf nedir?", back: "Kelimenin yapısını ve değişimini inceleyen ilim." },
  ];
  const face = (text, ar) => (
    <span style={{
      font: ar
        ? `var(--fw-regular) var(--fs-22)/var(--lh-arabic) var(--font-arabic)`
        : `var(--fw-regular) var(--fs-16)/var(--lh-body) var(--font-ui)`,
      direction: ar ? "rtl" : "ltr", display: "block",
    }}>{text}</span>
  );

  return (
    <>
      <NzHead title="testtest" subtitle="test test test"
        actions={<Button variant="ghost" size="lg">Toplu İşlemler</Button>} />
      <DataTable
        rows={CARDS} rowKey={(r, i) => i}
        columns={[
          { header: "Ön Yüz", cell: (r) => face(r.front, r.frontAr) },
          { header: "Arka Yüz", cell: (r) => face(r.back, r.backAr) },
          { header: "", width: "70px", align: "right",
            cell: () => <IconButton size="sm" label="Sil" icon={<Icon name="trash" size={17} />} /> },
        ]}
      />
    </>
  );
}

Object.assign(window, { DecksScreen, DeckDetailScreen });

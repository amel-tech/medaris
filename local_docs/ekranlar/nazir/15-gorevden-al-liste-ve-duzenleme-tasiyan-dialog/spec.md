# 15 — Görevden al (liste ve düzenleme taşıyan Dialog)

Kaynak: `local_docs/ekranlar/nazir/15-gorevden-al-liste-ve-duzenleme-tasiyan-dialog/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: 05 üzerinde Dialog (apps/nazir/app/medrese/[medreseId]/nazirlar/_gorevden-al-dialog.tsx, öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Dialog 'Fatma Zehra Çelebioğlu görevden alınıyor' (üst etiket 'SÜLEYMANİYE MEDRESESİ').
- Açıklama: 'Fatma Zehra Çelebioğlu şu kişilere rol ve izin vermişti. Her biri için ne olacağını seçin.'
- Her atanmış kişi için satır (monogram, ad, e-posta, 'Medrese nazırı · … · süresiz · verildi 30 Eylül 2026', 'Hiç izni yok; …'), `ToggleGroup` 'Devral' / 'Düşür' (hiçbiri seçili gelmez), 'Düzenle' bağlantısı (06 pencerisi; iç içe mi aynı pencere mi belirsiz — kural 15).
- Not: 'Devralırsanız rol ve izin sürer, veren olarak siz görünürsünüz; düşürürseniz hemen geri alınır. Her karar denetim kaydına yazılır.'; özet 'Fatma … “Ders açma ve kadro” ve “Yasak ve itiraz” grupları ile üç ek izni hemen düşer.'; 'Her satır için seçim yapılmadan görevden alınamaz.'; 'Vazgeç' / 'Görevden al'.

## 3. Durumlar

- 'Görevden al' tüm satırlarda seçim yapılana dek disabled (kural 14). Alt başlık/yardım metinleri tuvalde.
- Satır yoksa (veren kimseye izin vermemişse) seçim adımı atlanır; metni tuvalde yok — doğrulanamadı.
- Yükleniyor: satırlar sunucudan gelir (iskelet).

## 4. Etkileşimler

- Her satırda Devral/Düşür seç; 'Düzenle' → 06.
- 'Görevden al' → atomik: seçimlere göre devral/düşür + görevden alma; 05 listesi güncellenir.
- 'Vazgeç' → kapatır.

## 5. API

- YOK — yeni endpoint: `GET /madrasahs/:id/nazirs/:userId/grants` (verdikleri), `DELETE /madrasahs/:id/nazirs/:userId` {decisions:[{userId, action:'take-over'|'revoke'}]}. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land'). Yetki sabiti: `REMOVE_NAZIR` — `libs/common/src/authz/scopes.ts:72`.

## 6. Sınıf

**B** — Görevden alınan nazırın verdiği rol/izinlerin devral/düşür kararı yeni modeldir; backend yok → B. Kural 15: 4 Ekim 2026'ya kadar pencere açılmaz.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Her satır için seçim yapılmadan 'Görevden al' disabled.
2. 'Devral' seçilen kişinin izni sürer, veren olarak görevden alan değil devralan görünür.
3. 'Düşür' seçilen kişinin rolü/izni hemen kalkar.
4. İşlem tek transaction'dır; kısmi uygulanmaz.
5. Denetim kaydı yazılır.

## 9. Test senaryoları

- Unit: karar durum makinesi (tüm satırlar seçilmeden disabled).
- Playwright: nazır görevden al → bir satırda Devral, bir satırda Düşür → 05'te görevden alınan yok, devralınan 'Veren: siz'.

# 18 — Medrese dersini gizle (AlertDialog)

Kaynak: `local_docs/ekranlar/nazir/18-medrese-dersini-gizle-alertdialog/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: 07 üzerinde AlertDialog (apps/nazir/app/medrese/[medreseId]/dersler/_gizle-alert.tsx, öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- AlertDialog 'Dersi gizle' (üst etiket 'SÜLEYMANİYE MEDRESESİ'): 'Bina ve İzhar Şerhi talebelerden, ziyaretçilerden ve Nûruosmaniye Köşkü’nün sayfasından gizlenecek; celseleri talebelerin takviminden düşecek. 35 talebe celselere ve ders kayıtlarına erişemez.'
- Not: 'Hiçbir şey silinmez; Arşiv’den geri alabilirsiniz. Öğeyi gizleyen kademe ya da üstü geri alır.'
- 'Vazgeç' (odak burada, kural 13) / 'Gizle'.

## 3. Durumlar

- Onay bekler; perdeyle kapanmaz (kural 20, doğrulanmadı).
- Gönderim: 'Gizle' spinner; başarıda Toast, satır 07'den düşer; hata Toast.
- Yetki: 'Medrese derslerini gizle, geri al' izni.

## 4. Etkileşimler

- 'Gizle' → ders gizlenir (07'den düşer, 12'de görünür).
- 'Vazgeç' → kapatır.

## 5. API

- YOK — yeni endpoint: `POST /madrasahs/:id/courses/:courseId/hide` / `.../restore`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Mevcut yok eden uç `DELETE courses/:id` — `apps/tedrisat/src/course/course.controller.ts:139-150`; gizleme değil, silmedir (kullanılamaz).

## 6. Sınıf

**B** — Gizleme bayrağı ve kademeli geri alma yeni; backend yok → B. Tabloya göre (kural 11) 'Gizle' AlertDialog'dur, yikici değil: primary düğme + ghost 'Vazgeç'.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Metindeki talebe sayısı gerçek kayıtlı sayıdır.
2. Gizlenen ders talebe takvimi, aramalar ve köşk sayfasından kalkar; veri silinmez.
3. Dersin 12 Arşiv'de 'Ders' türüyle görünmesi.
4. Yetkisiz kullanıcı için 403.

## 9. Test senaryoları

- Unit: metin üretimi (ad, köşk, sayı).
- Playwright: 07 → Dersi gizle → Gizle → satır kaybolur; 12'de 'Ders' satırı.

# 04 — Medrese ayarları

Kaynak: `local_docs/ekranlar/nazir/04-medrese-ayarlari/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/ayarlar/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Medrese ayarları'; 'Medrese sayfasını gör (yeni sekmede açılır)' bağlantısı.
- 'Genel': 'Medrese adı*' (yardım: 'Talebeler bu adı medrese sayfasında ve medrese derslerinin sayfalarında görür.'), 'Açıklama' (textarea; 'Medrese sayfasında, derslerin listesinin üstünde görünür.').
- 'Politikalar' (3 anahtar, `Switch`): 'Kapalı ders zorunlu', 'Kayıt her zaman onaylı', 'Ders kayıtları herkese açılamaz' — her birinin açıklama metni tuvalde (ekran.txt).
- Not: 'Politika değişikliği kaydettiğiniz anda geçerli olur ve denetim kaydına yazılır.' ve 'Köşk politikası daha dar olabilir'.
- 'Son değişiklik 29 Eylül 2026 · Mehmet Emin Işıkoğlu'; 'Vazgeç' / 'Kaydet'.
- Yan panel 'Politikalar nasıl birleşir': 4 kademe (Medaris → Dersin açıldığı köşk → bu medrese → Ders ayarları).
- 'Politikaların uygulandığı dersler' listesi: ders adı, köşk, kadro, durum (Yayında/Taslak).

## 3. Durumlar

- Yükleniyor: form alanları iskelet.
- Form doğrulama: 'Medrese adı*' boş olamaz (hata metni tuvalde YOK, doğrulanamadı); `Field.Error` yardımın yerini alır (kural 9).
- Kaydedilmemiş değişiklik: 'Kaydet' aktif, 'Vazgeç' form sıfırlar.
- Yetkisiz: 'Medrese ayarlarını ve politikalarını değiştir' izni yoksa alanlar salt okunur/disabled, 'Kaydet' gizli (tuvalde ayrı durum yok — doğrulanamadı).
- Hata: kayıt başarısızsa Toast (`timeout: 0`).

## 4. Etkileşimler

- 'Kaydet' → PATCH ile ad/açıklama/politikaları yazar; denetim kaydı düşer; 'Son değişiklik' satırı güncellenir; Toast başarı.
- 'Vazgeç' → son kaydedilen değerlere döner.
- 'Medrese sayfasını gör' → yeni sekmede herkese açık medrese sayfası (bu sayfa nazır tuvalinde yok, doğrulanamadı).
- Politika anahtarı: diğer kademeler kapatmışsa etkisi bilgi notuyla gösterilir (Köşk politikasına bağımlılık).

## 5. API

- YOK — yeni endpoint: `GET /madrasahs/:id`, `PATCH /madrasahs/:id` {name, description, policies:{closedCourseRequired, alwaysApproval, noPublicRecordings}}, `GET /madrasahs/:id/courses` (politika uygulanan dersler). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Karşılaştırma: köşk güncelleme `PATCH kosks/:id` — `apps/tedrisat/src/kosk/kosk.controller.ts:95-109` (ad/açıklama alanı var ama politika alanı yok; `apps/tedrisat/src/database/schema/kosk.schema.ts` kolon listesinde politika yok). Ders düzeyinde `requiresApproval` kolonu var — `apps/tedrisat/src/database/schema/course.schema.ts` (courses.requiresApproval), 'kapalı ders'/'kayıtlar herkese açılamaz' kolonları YOK (doğrulanamadı: başka şemada yok).

## 6. Sınıf

**B** — Medrese varlığı ve politika alanları backend'de yok; yeni tablo + PATCH ve denetim kaydı yazılır. Üçüncü parti gerekmez → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Ad boşken 'Kaydet' reddedilir ve alan altında hata görünür.
2. Politika kaydedilince ilgili medrese derslerinde etkin ayar sunucuda kapalı olur (örn. 'Kayıt her zaman onaylı' açıkken ders `requiresApproval=true` zorlanır).
3. Kaydet sonrası 'Son değişiklik' tarih ve kullanıcı güncellenir; denetim kaydı satırı oluşur.
4. İzni olmayan nazır alanları değiştiremez; PATCH 403 döner.
5. Politika kademe paneli dört kademeyi sırayla gösterir.

## 9. Test senaryoları

- Unit: form şeması (zod) ve politika birleşim hesabı (en dar olan geçerli).
- Playwright: başmüderris giriş → Medrese ayarları → adı değiştir → Kaydet → yenile → kalıcı; politika aç → ders ayarında kilit görünür.
- Playwright: izinsiz nazır → PATCH 403, düğme yok.

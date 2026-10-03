# 24 — Ders kayıtları sekmesi (B9)

Kaynak: `local_docs/ekranlar/tedris/24-ders-kayitlari-sekmesi-b9/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/courses/[courseId]?tab=kayitlar` (mevcut sayfa: apps/tedris/app/[locale]/courses/[courseId]/page.tsx, bileşen apps/tedris/features/courses/components/course-page.tsx; sekme durumu `useState("mufredat")` satır 55, URL'ye bağlı değil).

## 2. Gösterim

- Üst bar + breadcrumb: Nûruosmaniye Köşkü / Emsile ve Bina; kapak (CoverPattern, Arapça etiket الصرف), başlık, tanıtım, meta (köşk · 8 hafta · 16 celse · 14 saat), müderris satırı (avatar AK, ad, rozet 'İmam').
- Sekmeler: Müfredat / Ders kayıtları (sayaç rozeti 5) / Ders destesi / Müderrisler.
- Oynatıcı alanı: 'Ders kaydı burada oynar' yer tutucusu; altında seçili kaydın başlığı ve meta (Hafta 4 · 26 Eylül 2026 Cumartesi · 58 dk).
- 'Bütün ders kayıtları' (alt: 'Haftalara göre, yeniden eskiye'): hafta kartları (HAFTA N, hafta başlığı) içinde kayıt satırları: başlık, tarih · süre; durum etiketleri: 'Hazırlanıyor' (yayına hazır değil), 'Oynatıcıda' (şu an seçili), sağlayıcı rozeti 'Google Drive' / 'YouTube', 'Herkese açık' (kesikli rozet), eylem 'Oynat' veya 'Ders kaydını aç' (dış bağlantı, yeni sekme).
- Sağ kart: durum rozeti 'Devam ediyor', 'SIRADAKİ CELSE · Öbür gün', celse başlığı, '3 Ekim Cumartesi 21:00 · 60 dk', 'Toplantı bağlantısı henüz eklenmedi.', 'Derse devam et', 'Takvime ekle', 'Ders ilerlemen %40' + ilerleme çubuğu, yardım metni, 'İlerlemeni güncelle' bağlantısı.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: sekme gövdesinde iskelet (oynatıcı + 3 satır).
- Boş: kayıt yoksa EmptyState (metin tuvalde yok — doğrulanamadı).
- 'Hazırlanıyor': kayıt kaydı var ama bağlantı yok; oynat/aç eylemi yok.
- Hata: sekme içinde SystemState + 'Yeniden dene'.
- Yetkisiz: kayıtlı olmayan kullanıcı için 'yalnız kayıtlılara açık' kayıtlar listelenmez; 'Herkese açık' kayıtlar görünür (kural doğrulanamadı, 05/06 ekranlarıyla birlikte teyit edilmeli).

## 4. Etkileşimler

- Sekme tıklaması: sekmeyi değiştirir (URL parametresi önerilir, mevcut kodda yok).
- 'Oynat': kaydı üstteki oynatıcıya yükler; YouTube için gömülü oynatıcı, Drive için gömülü önizleme ya da 'Ders kaydını aç' (yeni sekme, rel=noopener).
- 'Ders kaydını aç': sağlayıcı bağlantısını yeni sekmede açar.
- 'Derse devam et': ders sayfasında kalınan yere gider (hedef doğrulanamadı).
- 'Takvime ekle': ekran 22'deki menüyü açar.
- 'İlerlemeni güncelle': ilerleme girişini açar → PUT /courses/:id/progress.

## 5. API

- İlerleme güncelleme: `PUT courses/:id/progress` — apps/tedrisat/src/course/course.controller.ts:225 (UpdateProgressDto: progress, status).
- Ders detayı + hafta/celse: `GET courses/:id` — apps/tedrisat/src/course/course.controller.ts:92 (haftalar, celseler; scheduledAt/meetingUrl var). Ders kaydı alanı YOK: LessonResponse'ta kayıt/sağlayıcı/görünürlük alanı bulunmuyor (apps/tedrisat/src/course/dto/course-response.dto.ts:12-27); `LessonType` içinde VIDEO var ama kayıt URL'si, sağlayıcı, 'hazırlanıyor' durumu, 'herkese açık' bayrağı yok.
- YOK — yeni endpoint: `GET /courses/:id/recordings` → `[{id, weekId, weekNumber, title, recordedAt, durationMin, provider:'YOUTUBE'|'DRIVE'|'OTHER', url, visibility:'PUBLIC'|'ENROLLED', status:'PROCESSING'|'READY'}]` (yetkiye göre süzülmüş). Yükleme/yönetim (nazır tarafı) bu ekranın kapsamı dışı; tablo+migration gerekir (apps/tedrisat/src/database/schema/course.schema.ts'e `lesson_recordings`).
- Sıradaki celse: `GET courses/:id` içindeki lessons.scheduledAt'ten istemci hesaplar (ayrı endpoint gerekmez).

## 6. Sınıf

**B** — B: backend'de ders kaydı modeli yok, yeni tablo + 1 okuma endpoint'i yazılarak kodlanabilir. YouTube/Drive için API çağrısı gerekmiyor (yalnız bağlantı saklanıp gömülür/açılır) — bu yüzden C değil. Gömme (embed) izinleri/CSP frame-src ayarı doğrulanamadı.

## 7. Mevcut durum

course-page.tsx içinde 'mufredat' sekmesi var (satır 55/288-296); kayıtlar sekmesi, oynatıcı, kayıt satırları YOK. Sayfa shadcn kabuğunda.

## 8. Kabul kriterleri

1. Ders kayıtları sekmesi seçilince sayaç = READY+PROCESSING kayıt sayısı (tuvalde 5) görünür.
2. Kayıtlar hafta numarasına göre azalan sırada, hafta içinde tarihe göre azalan listelenir.
3. 'Hazırlanıyor' kaydında Oynat/Aç düğmesi yoktur.
4. YouTube kaydında 'Oynat' oynatıcıyı doldurur; Drive kaydında 'Ders kaydını aç' bağlantısı yeni sekmede açılır.
5. Kayıtlı olmayan kullanıcı ENROLLED görünürlüklü kaydı göremez; PUBLIC olanı görür.
6. İlerleme güncellemesi başarılı olunca kartta yüzde güncellenir.

## 9. Test senaryoları

- Unit: kayıt listesi gruplama/sıralama fonksiyonu; sağlayıcıya göre eylem seçimi; durum rozeti eşlemesi.
- Unit: sekme bileşeni boş/yükleniyor/hata durumları.
- E2E (Playwright, gerçek API): kayıtlı talebe olarak giriş → ders sayfası → 'Ders kayıtları' → listede en az bir hafta kartı → 'Oynat' → oynatıcı başlığı güncellenir; kayıtsız kullanıcıyla ENROLLED kaydın görünmediği doğrulanır. Önkoşul: test verisi seed (endpoint yazıldıktan sonra).

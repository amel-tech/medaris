# 01 — Pano (partner portalı)

Kaynak: `local_docs/ekranlar/nazir/01-pano-partner-portali/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/page.tsx (öneri; mevcut dosya yok). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Pano'; karşılama: 'Selâmün aleyküm, {Ad} Hoca. Önümüzdeki 7 günde {n} celse var; {m} başvuru onayınızı bekliyor.' Sağ üstte birincil düğme 'Medrese dersi aç' (08'i açar).
- 'Kapsamlarınız / Görev aldığınız medrese ve dersler': kart ızgarası — medrese kartı (SM monogram, ad, 'Medrese başmüderrisi', '{n} medrese nazırı', '{n} medrese dersi · {n} köşkte barındırma hakkı') ve her ders için kapak kartı (Arapça ders etiketi, ders adı, Yayında/Taslak/Gizli rozeti, 'Müderris · dersin imamı', '{Köşk} · {n} talebe').
- 'Yaklaşan celseler / Önümüzdeki 7 gün' tablosu: Ders (ad + 'Hafta N · Köşk'), Zaman ('3 Eki Cmt 19:00'), Platform (Google Meet/Zoom çipi), Durum ('Planlandı'), İşlemler 'Düzenle'.
- 'Bekleyen başvurular' tablosu ('{n} başvuru · {m} derste'): Talebe · ders, Başvuru tarihi, 'Onayla' ve 'Reddet'.
- 'Barındırma hakkı olan köşkler': köşk monogramı, ad, ilim alanı, '{n} medrese dersi'; açıklama 'Medrese dersleri yalnız bu köşklerde açılır. Barındırma hakkını köşkün nazımı ya da Medaris yönetimi verir ve geri alır.'; bağlantı 'Medrese dışı ders talebi gönder' (09).
- Telefon kopyası: `ekran-telefon.html/png` (kabuk 21/22 numaralı menüyle).

Kabuk (tüm medrese/ders kapsamı ekranlarında ortak): sol yan menü (Medaris NAZIR logosu, kapsam seçici düğmesi 'Kapsam değiştir: {medrese}', GENEL: Pano, Bildirimler [okunmamış rozeti]; MEDRESE: Dersler [rozet], Talebeler, Medrese nazırları, Yasaklamalar, İtirazlar, Arşiv; YÖNETİM: Kabul kuralları, Medrese ayarları; altta kullanıcı satırı → Hesap ve ayarlar). Kural referansı: `local_docs/ekranlar/_kurallar.md` madde 3, 18, 36, 40 (lang=tr, `data-density="compact"`, kabuk libs/ui bileşeni olacak).

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.
- Kapsam seçili değilse ilk kapsam (medrese) varsayılan açılır; kapsam seçici 03.
- Onayla/Reddet sırasında satır düğmeleri disabled + `mds-btn__spinner`; başarı Toast (6 sn), hata Toast (`timeout: 0`) — `_kurallar.md` madde 21.
- Platform çipi yalnız toplantı bağlantısından türetilebiliyorsa gösterilir; bağlantı yoksa 'bağlantısı eksik' (22 menüsündeki 'bağlantısı eksik' rozetiyle uyumlu) — alan şeması doğrulanamadı.

## 4. Etkileşimler

- 'Medrese dersi aç' → 08 (izin: 'Medrese dersi aç').
- Ders kartı → o dersin ders kapsamı pano'su (ders kapsamı ekranları bu tuvalde YOK; index.md 'Ders 22 | 0 | kaynak dosya yok').
- Celse 'Düzenle' → ders kapsamı celse düzenleme (tuvalde yok, doğrulanamadı).
- 'Onayla' → başvuruyu onaylar, satır listeden düşer, rozet ve sayaç azalır. 'Reddet' → ret gerekçesi Dialog'u (kural 17: 'Ret gerekcesi*', ders başvurusunda '(istege bagli)') — pano satırında hangi biçim olduğu tuvalde yok, doğrulanamadı.
- 'Medrese dışı ders talebi gönder' → 09.
- Kapsam seçici düğmesi → 03.

## 5. API

- Bekleyen başvurular (köşk bazında): `GET kosks/:koskId/enrollments/pending` — `apps/tedrisat/src/course/course.controller.ts:175-186`; yanıt `PendingEnrollmentResponse` (`apps/tedrisat/src/course/dto/course-response.dto.ts:80`, courseTitle + öğrenci adı/e-posta/tarih). Medrese kapsamlı toplu uç YOK; yeni: `GET /madrasahs/:id/enrollments/pending`.
- Onayla: `POST courses/:id/enrollments/:userId/approve` — `apps/tedrisat/src/course/course.controller.ts:196-208` (kanıt: yalnız köşk sahibi için; medrese nazırı/müderris izin modeli YOK). Reddet: `DELETE courses/:id/enrollments/:userId` — `apps/tedrisat/src/course/course.controller.ts:211-222`.
- Köşk listesi/ilim alanı: `GET kosks` — `apps/tedrisat/src/kosk/kosk.controller.ts:49-64`. Müderris/celse verisi: `GET courses/:id` — `apps/tedrisat/src/course/course.controller.ts:92-103`; celse alanları `lessons.scheduledAt`, `lessons.meetingUrl` — `apps/tedrisat/src/database/schema/course.schema.ts` (lessons tablosu).
- YOK — yeni endpoint: `GET /me/assignments` → {madrasahlar[], dersler[]} (kapsam seçici ve kartlar); `GET /madrasahs/:id/dashboard` → {nazirSayisi, dersSayisi, hakKosk[], yaklasanCelseler[], bekleyenBasvurular[]}; `GET /madrasahs/:id/hosting-kosks` (barındırma hakkı). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Pano; medrese, nazır ataması, celse takvimi, barındırma hakkı verilerini bir arada ister. Yalnız 'bekleyen başvuru' ve 'ders oluşturma' kısmen mevcut kosk/course uçlarıyla örtüşür; medrese/hak/atama uçları yok → yeni endpoint yazılarak kodlanabilir, üçüncü parti gerekmez.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Medrese başmüderrisi `GET /madrasahs/:id/dashboard` ile 3 kapsam kartı, yaklaşan celseleri (7 gün), bekleyen başvuruları ve hak sahibi köşkleri görür.
2. Karşılama cümlesindeki celse ve başvuru sayıları tablolardaki satır sayısıyla birebir tutar.
3. 'Onayla' çağrısı başarıda satırı kaldırır, 'Reddet' gerekçe penceresini açar; 'Bekleyen başvurular' başlığındaki sayaç güncellenir.
4. Yalnız görevli olunan medrese/dersler listelenir (başka medrese kartı çıkmaz).
5. Telefon (390 px) görünümünde kartlar tek sütun, tablolar kaydırmasız okunur.
6. İzni olmayan kullanıcıya 'Medrese dersi aç' düğmesi gösterilmez.

## 9. Test senaryoları

- Unit: pano görünüm modeli (celse sıralaması, 7 gün penceresi, sayaç türetme); `Onayla` mutation'ı sonrası cache geçersiz kılma.
- Playwright (gerçek API): nazır olarak giriş → `/medrese/{id}` → 3 kapsam kartı + 2 celse + 3 başvuru satırı görünür → ilk 'Onayla' → satır kaybolur, sayaç 2 olur → sayfa yenilenince kalıcı.
- Playwright: görevi olmayan kullanıcı → 02'ye yönlenir.

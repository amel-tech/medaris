# 59 — ders-kayitlari-c10-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Dersin celse ders kayıtlarını haftalara göre listeleme, yeniden adlandırma, herkese açma, gizleme, başarısız yüklemeyi yeniden yükleme (C10). Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/recordings`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Ders kayıtları", açıklama; "Ders kaydı ekle" (60).
- Hata uyarısı "Bir ders kaydı yüklenemedi" (Hafta 4 … "Yeniden yükle").
- Özet "6 ders kaydı·1’i herkese açık·Gizlenen ders kayıtları Arşiv’de".
- Hafta grupları (HAFTA 4…1, hafta başlığı, kayıt sayısı) ve tablo: Ders kaydı (ad, celse tarihi·süre, "Örnek ders", durum notları), Kaynak (Medaris oynatıcısı, Google Drive, YouTube), Durum (Hazır, Başarısız, Hazırlanıyor), Herkese açık (anahtar; YouTube kayıtları her zaman herkese açık), İşlemler: Yeniden adlandır, Gizle, Yeniden yükle.

## 3. Durumlar

- Hazırlanıyor (Medaris videoyu hazırlıyor) — işleme durumu, anahtar etkin.
- Başarısız — "Yeniden yükle", "Yalnız ders kadrosu görür".
- Boş/yükleniyor/hata: tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- Herkese açık anahtarı kaydın görünürlüğünü değiştirir (YouTube'da kilitli).
- Yeniden adlandır: satır içi; Gizle: Arşiv'e taşır; Yeniden yükle: dosya seçtirir ve yüklemeyi yeniden başlatır.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Ders kaydı varlığı/listesi | YOK — yeni endpoint | `GET /courses/:id/recordings` ve `PATCH /recordings/:id`, `POST …/hide`. Backend'de ders kaydı modeli yok (`lessons.type` VIDEO var, course.schema.ts:61-69, ama celse kaydı/işleme durumu yok). Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Video depolama/işleme/süreli bağlantı | YOK — dış sistem | Nesne depolama, transcoding ve imzalı süreli oynatma bağlantısı altyapısı repo'da bulunamadı (doğrulanamadı). |
| YouTube / Google Drive kaynakları | YOK — dış sistem | Google/YouTube API ve OAuth yapılandırması gerekir. |

## 6. Sınıf

**C** — Ders kaydı akışı üçüncü parti (YouTube/Google Drive API + OAuth) ve video depolama/işleme altyapısı gerektirir; liste/yeniden adlandırma tek başına anlamsız. İnsan tarafından altyapı ve OAuth kararı gerekli.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Kayıtlar haftalara göre gruplanır; sayaçlar tutarlı.
2. Durum rozetleri (Hazır/Başarısız/Hazırlanıyor) doğru.
3. Herkese açık değişimi girişsiz ziyaretçi görünürlüğünü değiştirir; YouTube kaydında anahtar kilitli.
4. Yeniden adlandır ve Gizle kalıcıdır; gizlenen Arşiv'de görünür.
5. Başarısız kayıtta Yeniden yükle çalışır.

## 9. Test senaryoları

- Unit: gruplama, durum eşleme, anahtar kilidi.
- Playwright (altyapı hazır olunca): kayıt listele → yeniden adlandır → herkese açık yap → girişsiz oturumda kaydın göründüğünü doğrula.

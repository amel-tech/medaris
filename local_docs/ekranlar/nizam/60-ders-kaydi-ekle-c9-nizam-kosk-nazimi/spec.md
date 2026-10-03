# 60 — ders-kaydi-ekle-c9-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Bir celseye ders kaydı ekleme formu (C9): Medaris'e video yükleme, YouTube'a yükleme veya bağlantı yapıştırma. Ders kayıtları (59) sayfası üzerinde modal/form. Önerilen rota: modal `…/recordings/new`.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Eyebrow ders adı, başlık "Ders kaydı ekle", "* zorunlu alan".
- Celse* seçici (Hafta 4 · 27 Eyl Paz 20:00 · Hafta sonu müzakeresi … Hafta 1 …) + yardım "Ders kaydı bu celsenin sayfasında görünür."
- Ders kaydının adı* ("Talebeler bu adı görür."), "Herkese açık" anahtarı + açıklama.
- Kaynak seçimi (ChoiceChips): Video yükle / YouTube’a yükle / Bağlantı yapıştır; Video yükle seçiliyken açıklama "Video Medaris’te saklanır ve yalnız izin verilen kişiler için, süreli bir bağlantıyla oynar.", Video dosyası* alanı, yardım "Yükleme bitene kadar bu sayfayı kapatmayın. İnternet bağlantısı kesilirse yükleme kaldığı yerden sürer."
- Vazgeç / Yükle.

## 3. Durumlar

- Yükleniyor: ilerleme çubuğu (Progress), yükleme sürerken sayfa kapatma uyarısı; bağlantı kesilirse devam (kaldığı yerden).
- Hata: yükleme başarısız → 59'daki Başarısız satırı.
- Doğrulama: celse, ad, dosya zorunlu; dosya türü/boyut sınırı doğrulanamadı.
- Yetkisiz: yalnız ders kadrosu.

## 4. Etkileşimler

- Kaynak çipleri alt alanları değiştirir (dosya / YouTube yükleme / bağlantı).
- "Yükle": yüklemeyi başlatır; bitince kayıt Hazırlanıyor→Hazır olur.
- "YouTube’a yükle": ders kadrosunun bağlanmış YouTube hesabına gönderir (bkz. nizam/18 YouTube bağlantısı).

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Resumable video yükleme (tus/S3 multipart) | YOK — dış sistem/yeni altyapı | Depolama + kaldığı yerden devam eden yükleme uç noktası yok; `POST /courses/:id/recordings` + yükleme oturumu önerilir. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| YouTube'a yükleme | YOK — dış sistem | Google OAuth + YouTube Data API v3; tedrisat'ta yok (doğrulanamadı). |
| Bağlantı yapıştırma | YOK — yeni endpoint | `POST /courses/:id/recordings` body `{ lessonId, title, isPublic, sourceUrl }` (yalnız bu kol üçüncü parti istemez; ancak ekran bütünü C). |

## 6. Sınıf

**C** — Video yükleme (depolama, resumable), YouTube'a yükleme (Google OAuth/YouTube API) ve süreli oynatma bağlantısı üçüncü parti/altyapı kararı ve yapılandırması gerektirir.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Form celse listesini dersin celselerinden (yeniden eskiye) doldurur.
2. Zorunlu alan eksikken Yükle disabled.
3. Kaynak çipi alt alanı doğru değiştirir.
4. Yükleme ilerlemesi gösterilir; kesintide kaldığı yerden sürer.
5. Başarıda kayıt 59'da Hazırlanıyor/Hazır görünür.

## 9. Test senaryoları

- Unit: form şeması, kaynak çipi koşullu alanları, dosya doğrulama.
- Playwright (depolama/Google erişimi hazır olunca): kayıt ekle → yükle → 59'da kayıt görünür; ağ kesintisi simülasyonuyla devam doğrula.

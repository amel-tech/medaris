# 56 — celseler-c7-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Dersin bütün celselerini tarihe göre listeleyen, toplantı bağlantısını güncelleyen, tarihi değiştiren, iptal eden sayfa (C7). Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/sessions`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Celseler", açıklama (saatler İstanbul saatiyle); "Celse planla".
- "Yaklaşan celseler" (8 celse · 1 iptal edildi · Hafta 5–8) tablosu: Celse (başlık + Hafta N), Zaman (tarih·süre), Toplantı bağlantısı (platform / "Eklenmedi" / "Bağlantı gösterilmez"), Durum (Şu an canlı + "14 dakikadır sürüyor", Planlandı, İptal edildi), İşlemler (Bağlantıyı güncelle, Bağlantı ekle, Tarihi değiştir, İptal et, İşlem yok).
- Satır içi form "11 Ekim Pazar celsesinin toplantı bağlantısı" (platform algılanır) + Vazgeç/Kaydet.
- "Geçmiş celseler" (8): Durum Sona erdi + "N ders kaydı", işlemler "Ders kaydı ekle" (60), "Ders kayıtları" (59).

## 3. Durumlar

- Boş (celse yok), yükleniyor, hata: metin tuvalde yok — doğrulanamadı.
- İptal edilen celse: bağlantı gösterilmez, işlem yok.
- Doğrulama: bağlantı yalnız https.

## 4. Etkileşimler

- "Bağlantıyı güncelle/ekle": satır içi form açılır, Kaydet bağlantıyı yazar.
- "Tarihi değiştir": tarih/saat düzenler (pencere tuvalde yok — doğrulanamadı).
- "İptal et": celseyi iptal eder (onay metni doğrulanamadı).
- Canlı durum: şu anki zamana göre hesaplanır.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Celse listesi | VAR (dolaylı) | `apps/tedrisat/src/course/course.controller.ts:92` — `GET courses/:id` weeks[].lessons[] — `scheduledAt`, `meetingUrl`, `type=LIVE` |
| Bağlantı/tarih güncelle | kısmen | `apps/tedrisat/src/course/course.controller.ts:123` — PUT tüm müfredatı değiştirir; tek celse için `PATCH /courses/:courseId/lessons/:lessonId` önerilir (YOK — yeni endpoint). |
| İptal etme / iptal zamanı | YOK — yeni alan | lessons şemasında iptal alanı yok (course.schema.ts:61-79). |
| Canlı durum / süre | İSTEMCİ | scheduledAt + duration üzerinden hesaplanır; sunucu uçu gerekmez. |

## 6. Sınıf

**B** — Okuma hazır; tek celse güncelleme ve iptal için yeni uç + şema alanı gerekir. Üçüncü parti yok (toplantı bağlantısı yalnız metin; platform algılama istemci).

## 7. Mevcut durum

Kısmi: celse bağlantısı/tarihi düzenleyicisi `apps/nizam/features/kosks/components/live-lesson-editor.tsx` (satır 21-135); celse listesi sayfası ve iptal yok.

## 8. Kabul kriterleri

1. Celseler Yaklaşan/Geçmiş olarak gruplanır, tarihe göre sıralanır; başlıktaki sayılar listeyle uyumlu.
2. "Bağlantıyı güncelle" kaydedince satır yeni platformu gösterir; http:// bağlantı reddedilir.
3. "İptal et" sonrası satır İptal edildi olur, bağlantı gizlenir, işlemler "İşlem yok".
4. Şu an süren celse "Şu an canlı" ve geçen dakikayı gösterir.
5. Geçmiş celsede ders kaydı sayısı ve bağlantılar görünür.

## 9. Test senaryoları

- Unit: durum hesabı (canlı/planlandı/sona erdi), gruplama, https doğrulaması.
- Backend e2e: PATCH lesson bağlantı; iptal sonrası talebe GET'inde bağlantı yok.
- Playwright: Celseler → "Bağlantı ekle" → https bağlantı yapıştır → Kaydet → platform görünür; "İptal et" → durum İptal edildi.

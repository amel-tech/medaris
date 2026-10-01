# 53 — genel-bakis-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Köşk nazımının bir dersin (Emsile ve Bina) genel bakışını gördüğü sekme: yaklaşan celseler, bekleyen başvurular, ders kadrosu, ders kayıtları, YouTube ve ders ayarları özeti. Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]`. Mevcut: `apps/nizam/app/[locale]/kosks/[id]/courses/` (alt yapı var, içeriği tuvalle uyumsuz).
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık (ders adı) + "Yayında" rozeti; alt satır: köşk·hafta sayısı·celse sayısı·ders günleri/saatleri; "Müfredatı düzenle" ve "Celse planla" düğmeleri.
- Uyarı: "Cumartesi celsesinin toplantı bağlantısı eksik" + açıklama.
- Sayılar: Kayıtlı talebe 28, Bekleyen başvuru 2, Devam eden hafta 5 (Toplam 8 hafta), Ders kaydı 4 (Hazır olanlar).
- "Sıradaki celseler" tablosu (Celse, Zaman, Süre, Platform, Durum, İşlemler: "Toplantı bağlantısı ekle", "Düzenle").
- "Bekleyen başvurular" (Talebe, Başvuru, Onayla/Reddet).
- "Ders kadrosu": Ders nazırları, Dersin imamı (ad, rol, izin sayısı, bitiş).
- "Ders kayıtları" listesi (hafta, tarih, süre), YouTube (Herkese açık), "Ders ayarları" (Durum, Kayıt: Onaylı, Kapalı ders, Örnek ders, Saat dilimi).

## 3. Durumlar

- Yükleniyor: kart iskeletleri. Hata: Alert. Boş: celse yoksa "Yaklaşan celse yok" (doğrulanamadı).
- Yetkisiz: kadro dışı kullanıcı 403/404.
- Taslak ders: "Yayında" yerine taslak rozeti (CourseStatus.DRAFT).

## 4. Etkileşimler

- Onayla/Reddet bekleyen başvuruyu karara bağlar (mevcut uçlar).
- "Toplantı bağlantısı ekle"/"Düzenle": 56'daki satır içi form.
- "Müfredatı düzenle" → 54; "Celse planla" → 55.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Ders ayrıntısı (başlık, haftalar, ders-celse, müderris, kaynaklar) | VAR | `apps/tedrisat/src/course/course.controller.ts:92` — `GET courses/:id` → `CourseDetailResponse` (weeks/lessons: `scheduledAt`, `meetingUrl`; müderris; durum; `requiresApproval`) |
| Bekleyen başvurular | VAR | `apps/tedrisat/src/course/course.controller.ts:175` — `GET kosks/:koskId/enrollments/pending`; onay `apps/tedrisat/src/course/course.controller.ts:196` — approve; ret `apps/tedrisat/src/course/course.controller.ts:211` — reject (yalnız PENDING, course.service.ts:154) |
| Kayıtlı talebe sayısı | YOK — yeni endpoint | Ders özetinde sayaç yok; `GET /courses/:id/stats` önerilir (enrollments tablosu: course.schema.ts:121). |
| Ders kayıtları sayısı / YouTube | YOK — yeni endpoint | Ders kaydı modeli backend'de yok (bkz. 59/60). |
| Ders nazırları (izin, bitiş) | YOK | Ders nazırı ataması/izin modeli yok; `courseMuderris` yalnız müderris (course.schema.ts:82) — doğrulandı. |

## 6. Sınıf

**B** — Çekirdek veri (ders, hafta, celse bağlantısı, bekleyen başvuru) hazır; sayaç ve kadro özeti için yeni uç gerekir; ders kaydı ve ders nazırı bölümleri bağımlı özelliklere ertelenir.

## 7. Mevcut durum

Kısmi: `apps/nizam/features/kosks/components/kosk-detail-page.tsx`, `pending-requests.tsx`, `new-course-page.tsx`, `live-lesson-editor.tsx`; köşk ayrıntısı ve kayıt onayı çalışıyor, ders genel bakış sayfası tuvaldeki bölümlerle yok.

## 8. Kabul kriterleri

1. Sayfa ders verisini `GET courses/:id` ile çizer; başlık, durum rozeti, hafta/celse sayıları doğru.
2. Bağlantısı eksik celse için uyarı ve satırda "Bağlantı eksik" rozeti görünür.
3. "Sıradaki celseler" en yakın 4 celseyi tarih sırasıyla listeler.
4. Onayla → başvuru listeden düşer ve Kayıtlı talebe +1; Reddet → listeden düşer.
5. "Müfredatı düzenle" ve "Celse planla" doğru sayfaya gider.
6. Ders kadrosu bölümünde müderris(ler) listelenir.

## 9. Test senaryoları

- Unit: celse sıralama/eksik bağlantı uyarısı, sayaç hesapları.
- Backend e2e: mevcut course.e2e.spec.ts + stats ucu.
- Playwright: köşk nazımı → Dersler → Emsile ve Bina → Genel → bekleyen başvuruyu Onayla → Kayıtlı talebe sayısı artar.

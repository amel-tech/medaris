# 58 — dersten-cikar-dialog-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Talebeler/Kayıtlı sekmesinde ilerlemeyi izleme, "Tamamladı say" ve gerekçeli "Dersten çıkar" penceresi. Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/students?tab=enrolled` (modal).
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Kayıtlı talebelerde ara alanı; yardım: "İlerlemeyi talebe kendisi girer; dersi tamamladığını ders kadrosu onaylar."
- Tablo: Talebe, E-posta, Kayıt tarihi, İlerleme (Progress %45 + aria "talebenin girdiği ilerleme"), İşlemler: Tamamladı say, Dersten çıkar, Yasakla (41). "28 talebeden 6’sı gösteriliyor" + "Daha fazla göster".
- Pencere: eyebrow ders adı, başlık "Dersten çıkar", açıklama (celse/bağlantı/kayıt/deste erişimi kalkar, celse takviminden düşer, kopyalanan kartlar kalır), "Talebe yeniden başvurabilir. Yeniden başvurmasını da engellemek gerekiyorsa “Yasakla”yı kullanın.", Textarea "Çıkarma gerekçesi*" (yardım: Erişimi kaldırılanlar sekmesinde ders kadrosuna görünür), Vazgeç/Dersten çıkar.

## 3. Durumlar

- Yükleniyor/boş/hata: tuvalde yok — doğrulanamadı. Arama sonuçsuz: boş durum (metin doğrulanamadı).
- Doğrulama: gerekçe zorunlu; boşken disabled.
- Yetkisiz: yalnız ders kadrosu.

## 4. Etkileşimler

- "Tamamladı say": kaydı COMPLETED yapar (satır Tamamlayanlar'a geçer).
- "Dersten çıkar": kaydı kaldırır, Erişimi kaldırılanlar'a gerekçeyle yazar.
- "Daha fazla göster": sonraki sayfa. Arama: ad/e-posta süzgeci.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Kayıtlı talebe listesi + ilerleme | YOK — yeni endpoint | `GET /courses/:id/enrollments?status=ENROLLED&q=&cursor=`; veri `enrollments` tablosunda var (course.schema.ts:121-136: progress, status, studentName, studentEmail) ama listeleyen uç yok (doğrulandı: course.controller.ts yalnız pending listesi). |
| Tamamladı say | kısmen | `apps/tedrisat/src/course/course.controller.ts:225` — `PUT courses/:id/progress` yalnız talebenin kendi ilerlemesi; kadro onayı için `POST /courses/:id/enrollments/:userId/complete` YOK — yeni endpoint. |
| Dersten çıkar | YOK — yeni endpoint | `DELETE …/enrollments/:userId` yalnız PENDING siler ve aktif kaydın silinmesinin "ayrı bir unenroll akışı" olması gerektiğini söyler (apps/tedrisat/src/course/course.service.ts:154-155); `POST /courses/:id/enrollments/:userId/remove` body `{reason}` önerilir (+ kaldırma kaydı tablosu). |

## 6. Sınıf

**B** — Listeleme, tamamlama ve gerekçeli çıkarma uçları yeni yazılır; üçüncü parti yok.

## 7. Mevcut durum

Yok (Talebeler sayfası, ilerleme tablosu, pencere yok; yalnız `apps/nizam/features/kosks/components/pending-requests.tsx`).

## 8. Kabul kriterleri

1. Kayıtlı talebeler ilk 6 satırla ve toplam sayıyla ("28 talebeden 6’sı gösteriliyor") listelenir; "Daha fazla göster" kalanı getirir.
2. Arama ad/e-postaya göre süzer.
3. İlerleme çubuğu API'deki `progress` değerini gösterir.
4. "Dersten çıkar" gerekçe boşken disabled; onayda talebe listeden düşer, Erişimi kaldırılanlar +1, gerekçe orada görünür.
5. Çıkarılan talebe aynı derse yeniden başvurabilir (`POST courses/:id/enroll`).
6. "Tamamladı say" talebeyi Tamamlayanlar'a taşır.

## 9. Test senaryoları

- Unit: ilerleme render, sayfalama, gerekçe doğrulaması.
- Backend e2e: ENROLLED→remove (gerekçeli), yeniden enroll, complete.
- Playwright: Talebeler → Kayıtlı → bir talebede Dersten çıkar → gerekçe → onay → satır düşer; Erişimi kaldırılanlar sekmesinde gerekçe görünür.

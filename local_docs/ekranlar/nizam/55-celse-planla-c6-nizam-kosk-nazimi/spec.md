# 55 — celse-planla-c6-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Tek celse ya da haftalık tekrarlı celseleri toplu oluşturan form (C6). Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/sessions/new`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Breadcrumb Celseler / Celse planla; başlık, açıklama; "* zorunlu alan".
- Planlama biçimi: Tek seferlik / Haftalık tekrar. Tekrar: Günler* (Pzt…Paz), Başlangıç saati*, Süre (dk)*, Saat dilimi (varsayılan dersin saat dilimi; "Diğer…"), Başlangıç tarihi*, Ne zaman bitsin (Bir tarihte / Belirli sayıda celseden sonra), Bitiş tarihi* ("Bu tarihteki celse de oluşturulur.").
- Celseler: Celse başlığı; Toplantı bağlantıları: "Boş bırak" / "Yalnız ilk celseye ekle" + açıklama (her celsenin kendi bağlantısı vardır).
- Önizleme: "3 celse" + satırlar (9 Ekim 2026 Cuma 21:00 — Hafta 6 · 30 dk · Bağlantı boş…); "Henüz hiçbir şey kaydedilmedi…".
- Vazgeç / "3 celse oluştur".

## 3. Durumlar

- Önizleme boşsa "0 celse" ve düğme disabled (doğrulanamadı).
- Doğrulama: gün, saat, süre, tarih zorunlu; bitiş tarihi başlangıçtan önce olamaz.
- Yükleniyor/hata/yetkisiz: standart.

## 4. Etkileşimler

- Alanlar değişince önizleme anında yeniden hesaplanır (istemci).
- "N celse oluştur": celseleri tarihlerinin haftasına yerleştirerek kaydeder; Celseler sayfasına döner.
- Vazgeç: Celseler sayfasına döner.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Celse oluşturma | kısmen | `apps/tedrisat/src/course/course.controller.ts:123` — `PUT courses/:id` ile tüm müfredat yeniden yazılarak yapılabilir; toplu ekleme için `POST /courses/:id/sessions/bulk` önerilir (YOK — yeni endpoint). |
| Ders saat dilimi | YOK — yeni alan | courses'ta timezone alanı yok. |

## 6. Sınıf

**B** — Tekrar üretimi istemcide hesaplanabilir; kalıcılık için toplu uç/PUT, hafta eşlemesi ve saat dilimi alanı gerekir. Üçüncü parti yok.

## 7. Mevcut durum

Yok (kısmi altyapı: `apps/nizam/features/kosks/components/live-lesson-editor.tsx` tek celse düzenleyicisi).

## 8. Kabul kriterleri

1. Haftalık tekrar seçilen günlerde, başlangıç–bitiş arasında doğru sayıda celse önizler (tuval örneği: Cuma 21:00, 3 hafta → 3 celse).
2. "Belirli sayıda celseden sonra" seçilince önizleme o sayıda durur.
3. Oluştur celseleri tarihlerinin haftasına yerleştirir ve kalıcı yapar.
4. "Yalnız ilk celseye ekle" yalnız ilk celsenin bağlantısını doldurur.
5. Zorunlu alan eksikken oluştur disabled.

## 9. Test senaryoları

- Unit: tekrar üretici (gün/bitiş modları, saat dilimi, DST), hafta eşleme.
- Backend e2e: toplu oluştur → GET courses/:id celse sayısı.
- Playwright: Celse planla → Haftalık, Cuma, 21:00, 30 dk, 3 celse → önizleme 3 → Oluştur → Celseler listesinde 3 yeni satır.

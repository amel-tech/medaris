# 54 — mufredat-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Ders bilgilerini, haftaları ve celseleri düzenlediği Müfredat sekmesi. Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/curriculum`. Mevcut: `new-course-page.tsx` (842 satır) haftaları/celseleri düzenliyor; tuvalle birebir değil.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Müfredat", açıklama; "Kaydedilmemiş değişiklikler var" şeridi + Vazgeç/Kaydet.
- Ders bilgileri: Ders adı*, Kapak rengi (Lâciverd, Bordo, Zümrüt, Mürekkep), Tanıtım.
- Haftalar: özet "8 hafta·16 celse·Saatler İstanbul saatiyle"; "Saat dilimini değiştir", "Haftalık celse üret", "Hafta ekle".
- Hafta akordeonları: HAFTA N, durum (Sona erdi/Devam ediyor), başlık, tarih aralığı·celse sayısı·süre; açık hafta: Hafta başlığı*, Hafta özeti, celse kartları (Celse başlığı*, Tarih*, Saat*, Süre (dk)*, Toplantı bağlantısı + algılanan platform, "Gizle"; iptal edilmiş celse yalnız bilgi), "Celse ekle", "Haftayı kopyala" (7 gün sonrasına), "Haftayı gizle".
- Hata örneği: "Toplantı bağlantısı https:// ile başlamalı. Bağlantıyı platformdan yeniden kopyalayın."; telafi notu "Telafi celsesi ait olduğu haftada (Hafta 5) kalır."

## 3. Durumlar

- Yükleniyor/hata/yetkisiz: standart; kaydedilmemiş değişiklik şeridi.
- Doğrulama: ad, hafta başlığı, celse başlığı/tarih/saat/süre zorunlu; bağlantı yalnız https.
- Bağlantı eksik rozeti; geçmiş haftalar "Sona erdi".

## 4. Etkileşimler

- Kaydet: tüm müfredatı kaydeder; Vazgeç değişiklikleri atar.
- Hafta ekle/kopyala/gizle, celse ekle/gizle; "Haftalık celse üret" → 55 akışı.
- Kapak rengi → `coverHue`.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Müfredatı oku | VAR | `apps/tedrisat/src/course/course.controller.ts:92` — `GET courses/:id` |
| Müfredatı kaydet (hafta/celse/müderris tam değiştirme) | VAR | `apps/tedrisat/src/course/course.controller.ts:123` — `PUT courses/:id` `CreateCourseDto{weeks[],muderris[],resources[]}`; kısmi: `apps/tedrisat/src/course/course.controller.ts:106` — PATCH |
| Kapak rengi / tanıtım | VAR | `coverHue`, `description`, `subtitle` alanları (course.schema.ts:39,35,34). |
| Celse gizleme / iptal / hafta gizleme | YOK — yeni alan | `lessons` ve `course_weeks` şemasında hidden/cancelled alanı yok (course.schema.ts:48-79); migration + DTO alanı gerekir. |
| Saat dilimi (ders) | YOK — yeni alan | courses tablosunda timezone alanı yok (doğrulandı). |

## 6. Sınıf

**B** — Kaydetme için PUT mevcut; gizle/iptal ve saat dilimi için şema+DTO değişikliği gerekir; üçüncü parti yok. Platform algılama istemci tarafı (`resolveMeetingPlatform`, live-lesson-editor.tsx:53).

## 7. Mevcut durum

Kısmi: `apps/nizam/features/kosks/components/new-course-page.tsx` ve `live-lesson-editor.tsx` (hafta/celse düzenleme, toplantı platformu algılama, `actions/courses.ts` kaydetme); tuvaldeki akordeon, kopyala/gizle, "Haftalık celse üret" ve kaydedilmemiş değişiklik şeridi yok.

## 8. Kabul kriterleri

1. Sayfa mevcut ders verisini yükler; değişiklikte şerit görünür, Vazgeç geri alır.
2. Kaydet `PUT courses/:id` ile hafta/celse sayısını ve alanları kalıcı yapar (yenileyince aynı).
3. Zorunlu alan boşken Kaydet engellenir; http:// bağlantı reddedilir.
4. Hafta kopyala celseleri 7 gün sonrasına kopyalar.
5. Gizlenen celse talebe tarafında görünmez.
6. Telafi celsesi tarihine ait haftada kalır.

## 9. Test senaryoları

- Unit: https doğrulaması, hafta kopyalama tarih ötelemesi, platform algılama.
- Backend e2e: PUT ile haftalar replace (mevcut course.e2e.spec.ts) + gizli alan.
- Playwright: Müfredat → bir celse başlığını değiştir → Kaydet → yenile → değişiklik kalıcı; geçersiz bağlantıda hata metni.

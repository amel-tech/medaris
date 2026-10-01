# 34 — Ders ayarları — köşk nazımı

Kaynak: `34-ders-ayarlari-kosk-nazimi/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı bir dersin yayın durumu, erişim (kapalı ders, örnek ders), kayıt onayı, saat dilimi ayarlarını yönetir; dersi taslağa çeker ya da gizler; köşk politikasını görür.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/dersler/[courseId]/ayarlar``
- Mevcut rota/dosya: Kısmi: apps/nizam/app/[locale]/kosks/[id]/courses/[courseId]/edit/page.tsx (müfredat düzenleme; ayar sayfası değil).

## 2. Gösterim
- Breadcrumb 'Dersler / Emsile ve Bina / Ders ayarları', 'Tanıtım sayfasını gör (Tedris tuvalinde, yeni sekmede)'.
- 'Erişim, kayıt ve saat dilimi': Kapalı ders, Örnek ders seçici (Örnek ders yok / Hafta N · celse), Kayıt onayı gereksin, Saat dilimi.
- 'Köşk politikası: ders kayıtları' (Ders kayıtları herkese açılamaz anahtarı; köşk geneli).
- 'Vazgeç', 'Kaydet'.
- 'Yayın': durum (Yayında, 1 Eylül 2026'dan beri), 'Taslağa çek' (28 talebe etkilenir).
- 'Müderrisler' (imam rozeti, 'Müderrisleri düzenle'); 'Dersi gizle' (Arşiv'den geri alınır).
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Taslak durumunda 'Yayında' kutusu 'Yayımla' olur (tuvalde yok — doğrulanamadı).
- Kapalı ders açıkken kayıt zorunluluğu/örnek ders kuralları (metne göre) uygulanır.
- Köşk politikası açıkken ders düzeyinde gevşetme yapılamaz (disabled — tuvalde görünüm yok, doğrulanamadı).

## 4. Etkileşimler
- 'Kaydet' ayarları günceller.
- 'Taslağa çek' onay penceresi → ders yalnız kadro/nazım/yönetime görünür.
- 'Dersi gizle' → onay → Arşiv.
- 'Müderrisleri düzenle' → nizam/33 Dialog'u.

## 5. API
- `PATCH /courses/:id` — VAR, apps/tedrisat/src/course/course.controller.ts:106; UpdateCourseDto: status (DRAFT/PUBLISHED), requiresApproval, language… (course/dto/create-course.dto.ts:261,274).
- `GET /courses/:id` — VAR, :92 (hafta/celse listesi örnek ders seçimi için).
- Eksik — YOK (DTO/şema değişikliği): saat dilimi, kapalı ders, örnek ders (celse `isPreview` var: create-course.dto.ts:98, course.schema.ts:76 ama ders düzeyi tek örnek kuralı yok), köşk politikasının okunması; `POST /courses/:id/hide|restore` (23).
- Talebe sayısı için kayıt sayımı: `GET /courses/:id` yanıtında yok (EnrollmentResponse yalnız çağıranın kaydı) — YOK.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — PATCH ile yayın/kayıt onayı hazır; saat dilimi, kapalı ders, örnek ders ve gizleme yeni alanlar/endpoint ister. Üçüncü parti yok.

## 7. Mevcut durum
Kısmi: edit/page.tsx müfredat düzenler; ayar sayfası yok.

## 8. Kabul kriterleri
1. Sayfa mevcut ayarları dolu açar.
2. 'Kayıt onayı gereksin' kaydedilince yeni başvurular PENDING olur.
3. 'Taslağa çek' ders durumunu DRAFT yapar; talebe celselere erişemez.
4. 'Dersi gizle' dersi Arşiv'e taşır.
5. Saat dilimi kaydedilir ve celse saatleri ona göre gösterilir.
6. Köşk politikası açıkken ders kayıtları herkese açık yapılamaz.

## 9. Test senaryoları
**Unit (Vitest)**
- Ayar formu şeması.
- Yayın durumu kutusu dalları (Yayında/Taslak).
- Örnek ders seçici seçenek üretimi.

**Playwright e2e (gerçek API'ye karşı)**
- Dersler → Düzenle → Ders ayarları.
- Kayıt onayı aç → talebe başvurusu PENDING.
- Taslağa çek → talebe 404/yetkisiz.
- Dersi gizle → Arşiv.

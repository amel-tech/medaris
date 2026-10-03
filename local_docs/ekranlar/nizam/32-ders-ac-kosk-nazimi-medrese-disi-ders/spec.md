# 32 — Ders aç (köşk nazımı, medrese dışı ders)

Kaynak: `32-ders-ac-kosk-nazimi-medrese-disi-ders/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı, köşkün kendi dersini (medrese dışı) açar: ad, kapak, müderrisler, zaman çizelgesi ve ders ayarları. Medrese dersi buradan açılmaz.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/dersler/yeni``
- Mevcut rota/dosya: Kısmi: apps/nizam/app/[locale]/kosks/[id]/courses/new/page.tsx → features/kosks/components/new-course-page.tsx (842 satır).

## 2. Gösterim
- Breadcrumb 'Dersler / Ders aç', başlık, açıklama.
- Bölüm 'Ders': Ders adı*, Kısa açıklama, Arapça başlık önizlemesi (örn. النحو), Kapak rengi (Lâciverd/Bordo/Zümrüt/Mürekkep), Kapak ibaresi (Sarf…Tecvid).
- Bölüm 'Müderrisler': e-posta seçici; 'Seçilen müderrisler*' (en az bir; tek ise imam, çoksa imam seçilir).
- Bölüm 'Zaman': Başlangıç tarihi*, Süre (hafta)*, Haftalık celse günü* (Pzt…Paz), Başlangıç saati*, Celse süresi* (dk), Saat dilimi (İstanbul, Berlin…); özet '8 celse planlanacak, 12 Ekim – 30 Kasım 2026, her Pazartesi 21:00, 60 dk'.
- Bölüm 'Ders ayarları': Kapalı ders, Kayıt onayı gereksin, Görünürlük (Taslak olarak aç / Hemen yayımla).
- 'Vazgeç', 'Dersi aç'.
- i18n mevcut: libs/i18n tr/nizam.json `NewCoursePage.*` (başlık, hafta, canlı ders, müderris…); tuvaldeki etiketler farklı, güncellenmeli.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Doğrulama: zorunlu alanlar, en az bir müderris, saat/gün/süre; hata yardımın yerini alır.
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Kaydediliyor ('Kaydediliyor…' mevcut anahtar `NewCoursePage.publishing`).
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Planlanan celse sayısı canlı hesaplanır.

## 4. Etkileşimler
- Müderris e-posta seçimi (C12); imam radyosu.
- Zaman alanları değişince özet ve celse sayısı güncellenir.
- 'Dersi aç' → ders ve haftalar/celseler oluşur; taslak ya da yayında; Dersler sayfasına döner.
- 'Vazgeç' → Dersler.

## 5. API
- `POST /kosks/:koskId/courses` — VAR, apps/tedrisat/src/course/course.controller.ts:64; `CreateCourseDto` (course/dto/create-course.dto.ts:207-295): title, subtitle, description, category, level, language, coverHue, durationWeeks, status (DRAFT/PUBLISHED), grantsCertificate, requiresApproval, weeks[], muderris[], resources[].
- Eksik alanlar (değişen endpoint): başlangıç tarihi + haftalık gün + saat + süre ile otomatik celse üretimi, saat dilimi, 'kapalı ders' bayrağı, kapak ibaresi, imam; ders başına `scheduledAt` var (create-course.dto.ts:73) ama otomatik üretim YOK.
- Müderris seçimi `userId` (CreateMuderrisDto.userId, create-course.dto.ts:146) alır; e-postadan kullanıcı bulma — YOK (21'deki `GET /users/lookup`).
- Kısıt: yalnız sahip köşkte (`assertCourseOwner`: course.service.ts:63; köşk sahibi: kosk.service.ts:45-53).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Temel oluşturma endpoint'i ve büyük form hazır; zaman çizelgesinden celse üretimi, saat dilimi, kapalı ders, imam ve kullanıcı arama için DTO/şema değişikliği ve yeni endpoint gerekir.

## 7. Mevcut durum
Kısmi: new-course-page.tsx mevcut alanlarla (kurs adı, kategori, seviye, hafta, müderris, kaynak, canlı ders) çalışır; tuvaldeki zaman/ayar bölümü, kapak ibaresi, kapalı ders yok.

## 8. Kabul kriterleri
1. Zorunlu alanlar boşken 'Dersi aç' istek atmaz, hata gösterir.
2. En az bir müderris seçilmeden gönderilemez; tek müderris imam olur.
3. Zaman alanları girildiğinde özet satırı doğru celse sayısını gösterir (8 hafta Pzt → 8 celse).
4. 'Taslak olarak aç' ders durumunu DRAFT, 'Hemen yayımla' PUBLISHED yapar.
5. Oluşan ders Dersler listesinde görünür.
6. Sahip olmayan köşkte 403.

## 9. Test senaryoları
**Unit (Vitest)**
- Celse sayısı/özet hesaplayıcı (tarih+gün+hafta).
- Form doğrulama şeması.
- İmam seçimi mantığı.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → Dersler → Ders aç → formu doldur → 'Dersi aç'.
- API'den `GET /courses/:id` ile alanları doğrula.
- Taslak/yayın varyantları.
- Eksik alan hata durumu.

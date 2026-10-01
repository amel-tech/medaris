# 23 — Dersler (C4)

Kaynak: `23-dersler-c4/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımının köşkündeki derslerin (köşkün kendi dersleri + barındırma hakkı olan medreselerin bu köşkteki dersleri) yönetim listesi; köşk özeti kartları ve durum süzgeçleri.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/dersler``
- Mevcut rota/dosya: Köşk detayı: apps/nizam/app/[locale]/kosks/[id]/page.tsx → features/kosks/components/kosk-detail-page.tsx (150 satır, ders kartları + 'Köşkü Düzenle' + bekleyen talepler).

## 2. Gösterim
- Başlık 'Dersler', üst satır 'Nûruosmaniye Köşkü·Arapça dil ilimleri·Başlangıç seviyesi·Listelerde görünür'; 'Köşk sayfasını gör (yeni sekmede açılır)' ve 'Ders aç'.
- 'Köşkün özeti' dört kart: Bekleyen başvuru 5, Köşk destesi 1, Barındırma hakkı olan medrese 1, Köşk nazımı 1 (her birinde ilgili sayfaya bağlantı).
- 'Bütün dersler' / 'Arşiv' sekmeleri; süzgeç Tümü 7, Yayında 3, Taslak 2, Gizli 2.
- Tablo: Ders (ad, hafta, medrese), Müderrisler (imam etiketi), Talebe, Kayıt durumu ('2 onay bekliyor', '5 yasaklı'), Durum rozeti, İşlemler (Düzenle, Müderrisleri düzenle, Gizle, Dersi gör, Geri al).
- Gizli satırda 'Gizli' rozeti + 'Geri al'; 'Gizli dersler Arşiv'de de listelenir.'
- Mevcut kod seviyeleri: libs/i18n `Levels.*`; yeni anahtar grubu gerekir.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Henüz ders yok' + 'Ders aç' (metin tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Medrese dersinde 'Düzenle' yok, 'Dersi gör' var (medrese açar, müderrislerini medrese seçer).
- Talebe yok satırı: '—'/'Talebe yok'.

## 4. Etkileşimler
- 'Ders aç' → nizam/32 formu.
- Satır 'Düzenle' → ders ayarları (nizam/34); 'Müderrisleri düzenle' → Dialog (nizam/33); 'Dersi gör' → ders sayfası (Nazır uygulaması; hedef belirsiz).
- 'Gizle' → AlertDialog? (madde 23: karar sahibinde; tablo ile ekran çelişirse tablo) ve ders arşive gider; 'Geri al' → listeye döner.
- Özet kartları ilgili sayfalara götürür; süzgeç sekmeleri listeyi süzer.

## 5. API
- `GET /kosks/:koskId/courses` — VAR, apps/tedrisat/src/course/course.controller.ts:50; dönen `CourseSummaryResponse` (course/dto/course-response.dto.ts) başlık, durum DRAFT/PUBLISHED, hafta sayısı, müderrisler içerir.
- `GET /kosks/:id` — VAR, kosk.controller.ts:66; `courseCount`, `studentCount`, `muderrisCount` (kosk/dto/kosk-response.dto.ts) var; bekleyen başvuru sayısı için `GET /kosks/:koskId/enrollments/pending` VAR course.controller.ts:175.
- Eksikler — YOK, yeni/değişen endpoint: ders başına talebe sayısı, bekleyen/yasaklı sayısı, 'imam' alanı, 'gizli' durum (CourseStatus yalnız DRAFT/PUBLISHED: course/domain/course-status.enum.ts:1-4), medrese adı, `POST /courses/:id/hide`, `POST /courses/:id/restore`.
- Tek ders görünürlük işareti: `isPrivate` yalnız köşkte var, derste yok.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Liste endpoint'i hazır ama imam, gizli durum, sayaçlar ve gizle/geri al yeni yazılmalı; medrese dersleri medrese modeli gerektirir (ilk aşamada yalnız köşkün kendi dersleri).

## 7. Mevcut durum
Kısmi: kosk-detail-page.tsx ders kartlarını `getCoursesByKosk` ile listeler; tablo, süzgeç sekmeleri, özet kartları, gizle/geri al yok.

## 8. Kabul kriterleri
1. Sayfa köşkün derslerini tablo olarak listeler; sekme sayıları listeyle tutarlıdır.
2. Süzgeç Yayında/Taslak/Gizli listeyi doğru daraltır.
3. 'Gizle' sonrası ders Dersler'de Gizli görünür ve Arşiv'de listelenir; 'Geri al' eski yerine döndürür.
4. Özet kartı sayıları API ile eşleşir.
5. Köşk nazımı olmayan 403 sayfası görür.

## 9. Test senaryoları
**Unit (Vitest)**
- Süzgeç/sekme sayısı hesaplayıcı.
- Satır eylem görünürlüğü (kendi ders / medrese dersi).
- Durum rozeti eşlemesi.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı girişi → Dersler.
- 7 satır ve sayılar; 'Yayında' süzgeci.
- Bir dersi Gizle → Arşiv'de görünür → Geri al.
- 'Ders aç' bağlantısı formu açar.

# 33 — Müderrisleri düzenle (köşk dersi, dialog)

Kaynak: `33-muderrisleri-duzenle-kosk-dersi-dialog/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı, köşkün kendi (medrese dışı) dersinin müderris listesini düzenler: müderris ekle/çıkar, imamı seç. Dersler tablosundaki satırdan açılan `Dialog`'dur.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/dersler` + `Dialog``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Etiket 'KÂFİYE'YE GİRİŞ', başlık 'Müderrisleri düzenle', açıklama (en az bir müderris; imamı siz seçersiniz).
- 'Müderrisler' listesi: avatar, 'Dersin imamı:' radyosu, ad, e-posta, imam rozeti, 'Çıkar' düğmesi.
- Alt: 'Müderris' e-posta seçici; not 'İşaretlediğiniz müderris dersin imamıdır. … çıkardığınızda onun verdiği izinler için ayrıca karar verirsiniz.'
- 'Değişiklikler denetim kaydına yazılır.'; 'Vazgeç', 'Kaydet'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Son müderris 'Çıkar'ılamaz / kaydet devre dışı (en az bir müderris; kuralın tam davranışı tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Medrese dersinde bu dialog yok (medrese seçer; satırda 'Dersi gör').

## 4. Etkileşimler
- Radyo ile imam seçilir.
- 'Çıkar' müderrisi listeden çıkarır (izin kararı ayrı akış).
- E-posta ile yeni müderris eklenir.
- 'Kaydet' listeyi uygular; denetim kaydı; dialog kapanır.

## 5. API
- `PUT /courses/:id` — VAR, apps/tedrisat/src/course/course.controller.ts:123; CreateCourseDto.muderris[] (course/dto/create-course.dto.ts:288) ile tüm ders gövdesi yeniden yazılır (tam gövde şart, kısmi değil).
- `PATCH /courses/:id` müderris güncellemez (UpdateCourseDto weeks/muderris/resources hariç: course/dto/update-course.dto.ts:5).
- `PUT /courses/:id/muderris` {muderris:[{userId, imam}]} — YOK — yeni endpoint önerilir (kısmi güncelleme + imam + denetim).
- İmam kavramı şemada yok (`MuderrisResponse` alanları id, userId, name, title, bio, avatarHue, orderIndex: course-response.dto.ts); e-postadan kullanıcı bulma YOK (`GET /users/lookup`).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Güncelleme için kaba endpoint var ama imam alanı, kısmi güncelleme ve kullanıcı arama yeni yazılmalı; üçüncü parti yok.

## 7. Mevcut durum
Yok. new-course-page.tsx müderris ekleme bölümü (ad girişi) içerir, dialog yok.

## 8. Kabul kriterleri
1. Dialog dersin mevcut müderrislerini ve imamı gösterir.
2. İmam radyosu tek seçilidir.
3. Müderris eklenip çıkarılabilir; sonuç `GET /courses/:id`'de görünür.
4. Müderris listesi boş kaydedilemez.
5. Değişiklik denetim kaydına yazılır.

## 9. Test senaryoları
**Unit (Vitest)**
- İmam seçimi/son müderris kuralı.
- Liste değişikliği farkı (diff) hesabı.

**Playwright e2e (gerçek API'ye karşı)**
- Dersler → Kâfiye'ye giriş → Müderrisleri düzenle.
- Birini çıkar, imamı değiştir → Kaydet.
- Tabloda müderris sütunu güncellenir.

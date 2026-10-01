# 31 — Başvurular

Kaynak: `31-basvurular/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşkünün derslerine gelen onay bekleyen kayıt başvurularını görür, onaylar ya da reddeder.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/basvurular``
- Mevcut rota/dosya: Kısmi: apps/nizam/features/kosks/components/pending-requests.tsx (köşk detayında bildirim dialog'u); actions/courses.ts onay/ret eylemleri.

## 2. Gösterim
- Başlık 'Başvurular', açıklama; 'Onay bekleyen başvurular' bölümü, ders süzgeci (Tümü, ders adları), '5 başvuru bekliyor'.
- Tablo: Talebe (avatar, ad, e-posta), Ders (medrese·imam), Başvuru tarihi, İşlemler 'Onayla', 'Reddet' (erişilebilir ad 'Onayla: ad, ders').
- Not: medrese derslerinin başvurularını müderrisler ve başmüderris de karara bağlayabilir; karar verilen herkesin listesinden düşer.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Bekleyen başvuru yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Başka kişi karar verdiyse: satır düşer; çakışma metni tuvalde yok — doğrulanamadı.
- İşlem sürerken yalnız o satırın düğmeleri devre dışı (mevcut kod örüntüsü).

## 4. Etkileşimler
- 'Onayla' → talebe derse kaydolur, satır düşer.
- 'Reddet' → kayıt silinir, talebe yeniden başvurabilir.
- Ders süzgeci listeyi daraltır.

## 5. API
- `GET /kosks/:koskId/enrollments/pending` — VAR, apps/tedrisat/src/course/course.controller.ts:175; yanıt `PendingEnrollmentResponse` = `studentName`, `studentEmail`, `courseTitle`, `createdAt`, `courseId`, `userId` (course/dto/course-response.dto.ts:58-82).
- `POST /courses/:id/enrollments/:userId/approve` — VAR, course.controller.ts:196 (201 döner, yorum :187-193).
- `DELETE /courses/:id/enrollments/:userId` — VAR, course.controller.ts:211 (yalnız PENDING siler: course.service.ts:154-161).
- Yetki: yalnız köşk sahibi (`assertCourseOwner`, course.service.ts:63 tanım, :153 kullanım). Medrese dersleri, medrese adı ve imam adı YOK (medrese modeli yok) — bu sütunlar ilk aşamada boş kalır.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**A** — Liste, onay ve ret endpoint'leri hazır ve e2e'li (course.controller.ts yorumu test/e2e/course.e2e.spec.ts:516,608); yalnız frontend sayfası gerekir. Medrese sütunları medrese gelince eklenir.

## 7. Mevcut durum
Kısmi: pending-requests.tsx (131 satır) bildirim dialog'u olarak onay/ret yapar; tam sayfa, tablo, ders süzgeci, erişilebilir satır adları yok.

## 8. Kabul kriterleri
1. Sayfa köşkün bekleyen başvurularını talebe adı, e-posta, ders ve tarihle listeler.
2. 'Onayla' sonrası satır düşer ve talebe durumu ENROLLED olur.
3. 'Reddet' sonrası satır düşer ve kayıt silinir.
4. Ders süzgeci yalnız seçilen dersin başvurularını gösterir.
5. Sayaç ('5 başvuru bekliyor') listeyle tutarlıdır.
6. Başka köşkün nazımı 403/404 alır.

## 9. Test senaryoları
**Unit (Vitest)**
- Süzgeç + sayaç hesabı.
- Satır eylemi aria-label metni.
- approve/reject server action hata dalları.

**Playwright e2e (gerçek API'ye karşı)**
- Talebe hesabıyla ders başvurusu yap (requiresApproval ders).
- Köşk nazımı → Başvurular → satır görünür.
- Onayla → talebe 'ENROLLED'.
- İkinci başvuru → Reddet → talebe tekrar başvurabilir.

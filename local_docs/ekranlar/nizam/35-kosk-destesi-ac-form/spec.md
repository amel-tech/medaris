# 35 — Köşk destesi aç (form)

Kaynak: `35-kosk-destesi-ac-form/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşk destesi açar (kartlar sonra eklenir); müderris önerisinden geliyorsa alanlar dolu açılır ve deste açılınca öneri kabul edilir.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/desteler/yeni?oneri=<id>``
- Mevcut rota/dosya: Kısmi: deste oluşturma dialog'u apps/nizam/features/decks/components/decks.tsx (kişisel deste: başlık, açıklama, herkese açık).

## 2. Gösterim
- Breadcrumb, başlık, açıklama; banner 'Müderris önerisinden açılıyor' (öneri, öneren, ders, tarih).
- Alanlar: Deste adı*, Açıklama (isteğe bağlı), Kart türü* (Kelime / Hadis; açıklamalı seçenekler), 'Kimler görür' bilgisi (köşk derslerine kayıtlı 74 talebe; çalışır, kendi destesine kopyalar; düzenleyemez).
- 'Vazgeç', 'Desteyi aç'.
- Yan panel 'Kartlar sonra eklenir' (CSV/Excel içe-dışa aktarma notları) ve kart önizlemesi (ÖN YÜZ/ARKA YÜZ).
- i18n: DecksPage.Dialog.* mevcut (başlık, açıklama etiketleri); köşk için yeni anahtarlar gerekir.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Doğrulama: deste adı zorunlu (mevcut toast `DecksPage.Toast.titleRequired`).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Oluşturuluyor ('Oluşturuluyor…' mevcut anahtar).
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Öneri yoksa banner gizli.

## 4. Etkileşimler
- Kart türü seçimi önizlemeyi değiştirir.
- 'Desteyi aç' → deste oluşur, öneri kabul edilir, Köşk desteleri'ne ya da kart tablosuna yönlenir (hedef tuvalde belirsiz).
- 'Vazgeç' → Köşk desteleri.

## 5. API
- Kişisel deste: `POST /flashcard/decks` — VAR, apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:134 (title, isPublic, description: flashcard/dto/create-flashcard-deck.dto.ts).
- Kart içe/dışa aktarma: `POST /flashcard/decks/:deckId/cards/bulk/import` flashcard.controller.ts:437, export :396, örnek :375 (kullanıcı-sahipli deste).
- `POST /kosks/:id/decks` {title, description, cardType, proposalId?} — YOK — yeni endpoint; `kart türü` (Kelime/Hadis) deste şemasında yok — doğrulanamadı (flashcard-deck.schema.ts köşk/tür alanı yok).
- Okuyabilen talebe sayısı ('74 talebe'): `GET /kosks/:id` `studentCount` VAR (kosk.controller.ts:66; kosk-response.dto.ts).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Deste altyapısı ve toplu içe aktarma hazır; köşk sahipliği, kart türü ve öneri bağlantısı yeni endpoint/şema ister.

## 7. Mevcut durum
Kısmi: decks.tsx kişisel deste oluşturma; köşk formu, kart türü, öneri banner'ı yok.

## 8. Kabul kriterleri
1. Form öneriden gelindiğinde ad ve açıklama dolu açılır.
2. Ad boşken 'Desteyi aç' hata gösterir.
3. Başarılı oluşturma sonrası deste köşk desteleri listesinde görünür.
4. Öneriden açılan deste öneriyi kabul edilmiş yapar.
5. Kart türü seçimi kaydedilir.
6. Köşk nazımı olmayan 403.

## 9. Test senaryoları
**Unit (Vitest)**
- Form şeması ve öneri ön doldurma.
- Kart türü önizleme eşlemesi.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk desteleri → Kabul et → form dolu → Desteyi aç.
- Listede yeni deste; öneri listeden düşer.
- Sıfırdan 'Köşk destesi aç' yolu.

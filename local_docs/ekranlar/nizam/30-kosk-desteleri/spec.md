# 30 — Köşk desteleri

Kaynak: `30-kosk-desteleri/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşke ait ortak ezber destelerini listeler, müderrislerin önerdiği desteleri kabul/reddeder ve deste açar.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/desteler``
- Mevcut rota/dosya: Karşılık yok; kişisel deste sayfası var: apps/nizam/app/[locale]/decks/page.tsx → features/decks/components/decks.tsx.

## 2. Gösterim
- Başlık, açıklama, 'Köşk destesi aç' düğmesi.
- 'Müderris önerileri' — '2 öneri kararınızı bekliyor': kartlarda ad, açıklama, 'Kabul et', 'Reddet', 'Öneren … ·ders·tarih'.
- Tablo 'Desteler': Deste (ad+açıklama, Arapça başlık), Ezber kartı sayısı, Son değişiklik, İşlemler 'Kartları düzenle', 'Gizle'.
- Not: 'Kabul ettiğinizde … Köşk destesi aç formu açılır'; 'Reddettiğinizde öneren gerekçeyi bildirimde görür.'
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Öneri yok: bölüm gizlenir (tuvalde yok — doğrulanamadı).
- Boş deste: metin tuvalde yok — doğrulanamadı.
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).

## 4. Etkileşimler
- 'Kabul et' → 35 formu, öneriden dolu açılır.
- 'Reddet' → gerekçeli Dialog (tuvalde ayrı ekran yok; gerekçe alanı madde 17'ye göre 'Ret gerekçesi*' olabilir — doğrulanamadı).
- 'Kartları düzenle' → kart tablosu (mevcut apps/nizam/app/[locale]/decks/[id]/cards/page.tsx).
- 'Gizle' → AlertDialog (yıkıcı değil, madde 13); deste Arşiv'e gider.

## 5. API
- Kişisel deste CRUD VAR: `GET /flashcard/decks` apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:112, `POST` :134, `PUT :id` :185, `PATCH :id` :219, `DELETE :id` :249; kartlar `POST /flashcard/decks/:deckId/cards` flashcard.controller.ts:178. Bunlar kullanıcı-sahipli (köşk bağı yok).
- `GET /kosks/:id/decks`, `POST /kosks/:id/decks`, `POST /decks/:id/hide` — YOK — yeni endpoint (köşk-deste ilişkisi şemada yok: apps/tedrisat/src/database/schema/flashcard-deck.schema.ts içinde köşk alanı geçmiyor, grep ile doğrulandı).
- `GET /kosks/:id/deck-proposals`, `POST …/:id/accept`, `POST …/:id/reject {reason}` — YOK — yeni endpoint (müderris önerisi modeli yok).
- Talebelerin köşk destelerini kopyalaması (kendi destelerine) — YOK, kapsam dışı bu ekran için.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Deste çekirdeği hazır ama köşk-deste ilişkisi, öneri akışı ve görünürlük yeni yazılır; üçüncü parti yok.

## 7. Mevcut durum
Yok (köşk desteleri). Kişisel deste yönetimi var: features/decks/components/decks.tsx.

## 8. Kabul kriterleri
1. Köşkün desteleri kart sayısı ve son değişiklikle listelenir.
2. Bekleyen öneri sayısı başlıkta doğru görünür.
3. 'Kabul et' öneriyle dolu formu açar.
4. 'Reddet' öneriyi kapatır ve öneren bilgilendirilir.
5. 'Gizle' desteyi Arşiv'e taşır.
6. Köşk nazımı olmayan 403 görür.

## 9. Test senaryoları
**Unit (Vitest)**
- Öneri kartı eylem etiketleri.
- Tablo sıralama/biçimleyici.
- Önerisiz durumda bölümün gizlenmesi.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → Köşk desteleri.
- Bir öneriyi Kabul et → form açılır → Deste aç.
- Reddet → öneri listeden düşer.
- Gizle → Arşiv'de.

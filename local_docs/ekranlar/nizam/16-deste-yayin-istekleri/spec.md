# 16 - Deste yayın istekleri

Kaynak: local_docs/ekranlar/nizam/16-deste-yayin-istekleri/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Üyelerin kendi flashcard destelerini herkese açma isteklerini karara bağlama (yayımla/reddet); örnek kartları görme denetime yazılır.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/deste-yayin-istekleri`; izin "Desteyi herkese yayımla".
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama; uyarı "Yayımlanan deste herkese açılır" (ziyaretçi dahil, hazırlayanın adı gösterilmez, sahibi dilediğinde özele çeker).
- Sekmeler Bekleyen 2 / Karara bağlanan 7; sol liste (deste, sahip · kart sayısı, tarih).
- Ayrıntı: "YAYIN İSTEĞİ", durum, Sahibi, Kart ("18 ezber kartı"), Kart türü, İstendi, açıklama; "Örnek kartlar" (Ön yüz Arapça/Arka yüz anlam, "Bütün kartlar: 18 ezber kartı"); not "kartlarını görmeniz denetim kaydına yazılır"; Yayımla, Reddet.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Yayımla -> deste herkese açılır, istek karara bağlanır.
- Reddet -> gerekçeli pencere (gerekçe etiketi "Ret gerekçesi*", _kurallar.md 17).
- Bütün kartlar -> kart listesi (görüntüleme denetime yazılır).

## 5. API
- Mevcut: deste `isPublic` bayrağı var (apps/tedrisat/src/database/schema/flashcard-deck.schema.ts:18); desteler `GET flashcard/decks` (apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:112) çağıranın görebildikleri; deste güncelleme `PUT/PATCH flashcard/decks/:id` (apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:185, apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:219) sahibine açık. Karar bekleyen istek varlığı, başkasının özel destesini okuma ve yayın isteği YOK.
- YOK — yeni endpoint: `POST /flashcard/decks/:id/publish-request` (sahip); `GET /nizam/deck-publish-requests?status=` ; `GET /nizam/deck-publish-requests/:id/cards` (denetime yazar); `POST .../approve` (isPublic=true); `POST .../reject` `{reason}`. Denetim kaydı için backend'de tablo/servis YOK (apps/tedrisat/src altında audit karşılığı bulunamadı).

## 6. Sınıf
**B** - Üçüncü parti yok; mevcut `isPublic` kullanılır, istek tablosu ve karar uçları yazılır.

## 7. Mevcut durum
Kısmi (ilgili ekran): `apps/nizam/features/decks/components/decks.tsx`, `cards.tsx` — deste/kart yönetimi var, yayın isteği ekranı YOK.

## 8. Kabul kriterleri
1. Bekleyen/Karara bağlanan sayıları API ile aynı.
2. Yayımla sonrası deste `isPublic=true` olur ve ziyaretçiye açık keşfette görünür.
3. Reddet gerekçesiz gönderilemez.
4. Örnek kartlar gösterilirken ve "Bütün kartlar" açılırken denetim satırı oluşur.
5. Yayında hazırlayanın adı herkese açık yanıtlarda bulunmaz.

## 9. Test senaryoları
**Unit (Vitest)**
- istek listesi/seçim.
- ret formu doğrulama.
- kart önizleme render'ı.

**Playwright e2e (gerçek API'ye karşı)**
1. Üye deste isteği gönderir (API); Nizam'da görünür.
2. Yayımla -> deste herkese açık listede (oturumsuz çağrı).
3. Reddet -> sahibine durum "reddedildi".
4. Denetim kaydında "Özel deste okuma".

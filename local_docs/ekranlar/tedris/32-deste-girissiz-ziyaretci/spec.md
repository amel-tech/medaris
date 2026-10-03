# 32 — Deste — girişsiz ziyaretçi

Kaynak: `local_docs/ekranlar/tedris/32-deste-girissiz-ziyaretci/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/decks/[id]` herkese açık (giriş gerektirmeyen) — middleware.ts yalnız `/`, `/home`, `/api/auth/signin` açık (apps/tedris/middleware.ts), deste sayfası bugün korumalı.

## 2. Gösterim

- Üst bar girişsiz: Keşfet, Giriş yap, Kayıt ol (Derslerim/Programım/Desteler yok).
- Breadcrumb Keşfet / <ad>; başlık, rozet 'Herkese açık', '40 ezber kartı · Hadis', açıklama; 'Çalış'.
- Bilgi: 'Giriş yapmadan çalışırsan ilerlemen kaydedilmez. Kaydetmek için giriş yap' (bağlantı).
- Kartlar (40): Ön/Arka tablo (işlem sütunu yok); '40 karttan 6'sı gösteriliyor' + 'Daha fazla göster'; 'Deste hakkında' metni.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor/hata/404 diğer deste ekranlarındaki gibi.
- Özel deste: girişsiz → giriş yönlendirmesi (ya da 404; karar doğrulanamadı).
- Çalışma ilerlemesi yalnız bellekte tutulur (kalıcı yok).

## 4. Etkileşimler

- 'Çalış': ilerleme kaydetmeden çalışma ekranı (ekran 30 girişsiz).
- 'Kaydetmek için giriş yap': giriş akışı, dönüşte aynı desteye.
- 'Daha fazla göster': 6'şar kart.

## 5. API

- YOK — yeni endpoint: `GET /public/flashcard/decks/:id` ve `GET /public/flashcard/decks/:id/cards` (yalnız isPublic=true; aksi 404). Mevcut tüm uçlar AuthGuard arkasında: `AuthGuard` sınıf düzeyinde: apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:46 (kosk.controller.ts:37, course.controller.ts:39) — girişsiz çağrı çalışmaz.
- Kayıt/giriş: Keycloak akışı apps/tedris/app/api/auth/[...nextauth]/route.ts (mevcut).

## 6. Sınıf

**B** — B: herkese açık okuma için kimlik doğrulamasız yeni endpoint (AuthGuard'ı atlayan) gerekir; üçüncü parti gerekmez.

## 7. Mevcut durum

Yok: girişsiz deste sayfası bulunmuyor; mevcut /decks/** rotaları middleware ile korumalı.

## 8. Kabul kriterleri

1. Girişsiz kullanıcı herkese açık desteyi ve kartlarını görür; özel destede veri sızmaz.
2. Üst barda Giriş yap/Kayıt ol görünür, Desteler/Derslerim görünmez.
3. Çalışma ilerlemesi sunucuya yazılmaz (ağ isteği yok).
4. 'Giriş yap' sonrası kullanıcı aynı deste sayfasına döner.
5. Özel deste id'si için sayfa veri döndürmez.

## 9. Test senaryoları

- Unit: girişsiz kabuk menüsü; sayfalama.
- E2E (oturumsuz): PUBLIC deste URL → kartlar görünür → 'Çalış' → PUT isteği atılmadığı doğrulanır; özel deste URL → giriş/404.

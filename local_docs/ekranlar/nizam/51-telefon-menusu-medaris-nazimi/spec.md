# 51 — telefon-menusu-medaris-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- 390 px telefon genişliğinde AppBar'daki menü düğmesiyle açılan ana menü çekmecesi (Medaris nazımı). Ayrı rota değil, kabuk bileşeni; ana sayfa üzerinde açık halde gösterilir. Önerilen yer: `apps/nizam/components/layout/` altında yeni `mobile-menu` bileşeni.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Çekmece (Dialog, `Popup.mds-sheet aria-label="Ana menu"`, genişlik `min(320px,85vw)`): head (logo + kapat; odak burada) > kapsam seçici yok > `<nav aria-label="Ana menu">` > foot kullanıcı satırı (`a.mds-nav-user`, Hesap'a gider).
- Gruplar (izinli olanlar): GENEL (Ana sayfa, Bildirimler 2), PLATFORM (Medreseler, Köşkler), TALEPLER (Köşk başvuruları 3, Deste yayın istekleri 2, Kalıcı yasak talepleri 2), DENETİM (Yasaklamalar). Foot: Hasan Basri Gündoğdu, Medaris nazımı. Başnazımdan farkı: izin verilmeyen girişler (Medaris nazımları, İzin grupları, Pasif kapsamlar, İtirazlar, Denetim kaydı, Arşiv, AYARLAR) yok.
- "Çıkış yap" çekmecede YOK (_kurallar.md madde 18).
- Arkadaki ana sayfa içeriği ekran.txt'te görünür (selamlama, sayaçlar) ama bu spec'in konusu çekmecedir.

## 3. Durumlar

- Kapalı/açık; ≥768 px'te kontrollu `open` ile otomatik kapanır (madde 18).
- Uzun menüde çekmece kayar.
- Rozet sayaçları yüklenemezse rozetsiz çizilir (doğrulanamadı).
- Yetkisiz: menü öğeleri role göre süzülür.

## 4. Etkileşimler

- Menü düğmesi çekmeceyi açar; X/Esc/perde/öğe tıklaması kapatır.
- Her NavItem ilgili rotaya gider ve çekmeceyi kapatır.
- Kullanıcı satırı Hesap sayfasına (47) gider.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Menü yapısı | yok gerekmez | Menü statik, role göre süzülür; rol bilgisi oturumdan (NextAuth, `apps/nizam/lib/auth_options.ts`) gelir. |
| Rozet sayaçları (bildirim, başvuru, bekleyen vb.) | YOK — yeni endpoint | Sayaçlar 46/47'deki bildirim ve bekleyen-talep uçlarına bağlıdır; ilk teslimde rozetsiz çizilebilir. Mevcut: `GET kosks/:koskId/enrollments/pending` (apps/tedrisat/src/course/course.controller.ts:175) yalnız başvuru sayısı için kullanılabilir. |

## 6. Sınıf

**A** — Salt istemci kabuk bileşeni; backend gerekmez (rozetler isteğe bağlı sonraki iyileştirme).

## 7. Mevcut durum

Kısmi: masaüstü kenar çubuğu `apps/nizam/components/layout/app-sidebar.tsx`, `nav-main.tsx`, `nav-routes.ts` (yalnız Decks/Köşkler), `nav-user.tsx`; telefon çekmecesi, kapsam seçici ve rozetler yok.

## 8. Kabul kriterleri

1. 390 px'te AppBar'da menü düğmesi görünür; tıklayınca "Ana menu" çekmecesi açılır.
2. Odak açılışta kapat/logo satırındadır; Esc kapatır.
3. Menü grupları ve öğeleri bu rolün tuvalindeki sırayla görünür.
4. Çekmecede "Çıkış yap" yoktur.
5. 768 px'e genişletilince çekmece kapanır.
6. Öğe tıklaması rotaya götürür ve çekmeceyi kapatır.

## 9. Test senaryoları

- Unit: rol→menü öğesi süzgeci, kontrollu open ve 768 px kapanışı.
- Playwright (390x844 viewport, gerçek oturum): ana sayfa → menü düğmesi → öğeleri say → bir öğeye tıkla → URL ve kapanış doğrula; viewport 1024'e büyüt → çekmece kapalı.

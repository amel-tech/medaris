# 45 — Telefon menüsü — Tedris, girişsiz ziyaretçi

Kaynak: `local_docs/ekranlar/tedris/45-telefon-menusu-tedris-girissiz-ziyaretci/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: aynı çekmece (ekran 44) girişsiz biçimde; Keşfet sayfası (apps/tedris/app/[locale]/home veya kosks) arka planda.

## 2. Gösterim

- Telefon menüsü (390 px): kural 18 — Dialog tabanlı çekmece; Popup.mds-sheet aria-label='Ana menu', gövde/başlık/ayak; 'Çıkış yap' çekmecede yok.
- Çekmece menüsü: Ana sayfa, Keşfet, Giriş yap, Kayıt ol (Derslerim/Programım/Desteler yok); kapsam seçici yok.
- Arka plan Keşfet listesi: seviye/medrese/alan süzgeçleri, '3 köşk ve 1 medrese', köşk kartı (Nûruosmaniye Köşkü, Arapça dil ilimleri, açıklama, 'Başlangıç seviyesi · 3 ders').


## 3. Durumlar

- Giriş yapınca çekmece oturumlu biçime döner.
- Köşk listesi boş/yükleniyor/hata: ekran 09 ile ortak.

## 4. Etkileşimler

- 'Giriş yap'/'Kayıt ol': Keycloak akışı (apps/tedris/app/api/auth/[...nextauth]/route.ts).
- Menü öğesi: gider ve kapatır.

## 5. API

- Köşk listesi: `GET kosks` — apps/tedrisat/src/kosk/kosk.controller.ts:49 AuthGuard arkasında (`AuthGuard` sınıf düzeyinde: apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:46 (kosk.controller.ts:37, course.controller.ts:39) — girişsiz çağrı çalışmaz); girişsiz çağrı çalışmaz.
- YOK — yeni endpoint (09 ile ortak): `GET /public/kosks?level=&field=&medrese=` herkese açık. 'Medrese' kavramı backend'de bulunamadı (kosk.schema.ts'te medrese alanı yok) — doğrulanamadı.
- Giriş/kayıt: Keycloak, mevcut.

## 6. Sınıf

**B** — B: Keşfet arka planı için herkese açık köşk listesi endpoint'i gerekir (ekran 09 ile ortak). Çekmece kendisi frontend.

## 7. Mevcut durum

Kısmen: header.tsx + `middleware.ts` public sayfalar (`/`, `/home`); girişsiz çekmece ve Keşfet listesi doğrulanamadı.

## 8. Kabul kriterleri

1. Girişsiz çekmece Giriş yap ve Kayıt ol'u içerir, Derslerim/Programım/Desteler içermez.
2. 'Giriş yap' Keycloak giriş sayfasına yönlendirir.
3. Keşfet listesi oturum olmadan köşk kartlarını gösterir.
4. Çekmece kuralları ekran 44 ile aynıdır (odak, kapanış, ≥768 px).

## 9. Test senaryoları

- Unit: girişsiz menü öğeleri.
- E2E (390 px, oturumsuz): ana sayfa → hamburger → menü öğeleri → 'Giriş yap' Keycloak URL'sine yönlenir.

# 34 — Hesap

Kaynak: `local_docs/ekranlar/tedris/34-hesap/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/account` (apps/tedris/app/[locale]/ altında bulunmuyor). Üst menüde `UserHeaderMenu.accountSettings` öğesi var (apps/tedris/components/header/user-header-menu.tsx:66).

## 2. Gösterim

- Başlık 'Hesap' + alt metin.
- Kişisel bilgiler: Ad*, Soyad* (yardım: kadroya görünür), E-posta (salt okunur, kilit), 'Kaydet'.
- Saat ve dil: Saat dilimi seçimi (İstanbul, Berlin, Amsterdam, Brüksel, Paris, Viyana, Londra, New York, Diğer…), 'seçtiğin an kaydedilir'; Dil: salt okunur (yalnız Türkçe).
- Takvim: 'Takvim aboneliği' + 'Takvim bağlantını yönet' (→ ekran 23).
- Çıkış: açıklama + 'Çıkış yap'.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: form iskeleti.
- Doğrulama: ad/soyad boş → hata (metin doğrulanamadı).
- Saat dilimi anında kaydedilir: başarı Toast, hata geri alır.
- 'Diğer…': tam IANA listesi/arama (tuvalde yok — doğrulanamadı).
- Oturumsuz: giriş yönlendirmesi.

## 4. Etkileşimler

- 'Kaydet': ad/soyadı yazar.
- Saat dilimi seçimi: değişiklikle birlikte PATCH.
- 'Takvim bağlantını yönet': ekran 23.
- 'Çıkış yap': Keycloak oturumunu kapatır (mevcut `keycloakSignOut`, apps/tedris/lib/keycloak-logout.ts).

## 5. API

- YOK — Medaris'in kullanıcı profili/tercihi için hiçbir endpoint yok: tedrisat yalnız kosk/course/flashcard controller'ları içerir; teskilat'ta yalnız health/root (apps/teskilat/src/app.controller.ts:11,26).
- Önerilen: `GET /me` → {firstName, lastName, email, timezone}; `PATCH /me` {firstName, lastName, timezone}. Ad/soyadın kaynağı (Keycloak profili mi Medaris tablosu mu) doğrulanamadı; Keycloak'a yazmak admin/hesap API'si ve sunucu yapılandırması gerektirir → o seçenek C olurdu. Öneri: Medaris tablosu `user_profiles` (sub → alanlar), e-posta token'dan.
- Çıkış: mevcut istemci kodu (Keycloak end-session).

## 6. Sınıf

**B** — B: Medaris tarafında profil tablosu + 2 endpoint ile kodlanabilir. Ad/soyadı Keycloak'a yazma seçilirse C'ye dönüşür (Keycloak yapılandırması gerekir); bu karar bekliyor.

## 7. Mevcut durum

Yok: hesap sayfası ve profil formu bulunmuyor; yalnız header menüsünde çıkış var.

## 8. Kabul kriterleri

1. Sayfa mevcut ad, soyad, e-postayı gösterir; e-posta düzenlenemez.
2. Boş ad/soyadla Kaydet istek atmaz ve hata gösterir.
3. Saat dilimi seçimi sayfa yenilenince korunur.
4. Dil alanı salt okunurdur ve 'Türkçe' görünür.
5. 'Çıkış yap' oturumu kapatır ve herkese açık sayfaya döner.

## 9. Test senaryoları

- Unit: form şeması; saat dilimi seçeneği listesi.
- E2E: giriş → Hesabım → adı değiştir → Kaydet → yenile → değer kalıcı; saat dilimini değiştir → Programım'da saatlerin kaydığı (21 ile birlikte).

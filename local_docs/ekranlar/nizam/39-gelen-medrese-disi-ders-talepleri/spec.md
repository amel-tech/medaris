# 39 — Gelen medrese dışı ders talepleri

Kaynak: `39-gelen-medrese-disi-ders-talepleri/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı, medrese başmüderrislerinin köşkte medrese dışı ders açılması için gönderdiği talepleri görür; kabul (Ders aç formu açılır) ya da reddeder (gerekçe bildirilir).

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/ders-talepleri``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık 'Ders talepleri', açıklama; sekmeler 'Bekleyen 1' / 'Karara bağlanan'.
- Liste (sol): talep adı, medrese·başmüderris, zaman; detay (sağ): 'MEDRESE DIŞI DERS TALEBİ' başlığı, 'Karar bekliyor', Açılması istenen köşk, Medrese, Gönderildi, Gerekçe, Talebi gönderen.
- Not: 'Kabul ettiğinizde … Ders aç formu açılır … Reddettiğinizde … gerekçeyi bildirimde görür.'; 'Kabul et', 'Reddet'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: bekleyen talep yok (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Karara bağlanmış talepte düğmeler yok (tuvalde yok — doğrulanamadı).

## 4. Etkileşimler
- 'Kabul et' → 32 formu talebin adıyla dolu açılır; ders açılınca talep kabul sayılır.
- 'Reddet' → gerekçe Dialog'u (madde 17 'Ret gerekçesi*') → talep reddedilir, başmüderris bildirim alır.
- Sekme değişimi listeyi süzer.

## 5. API
- `GET /kosks/:id/course-requests?status=` — YOK — yeni endpoint.
- `POST /course-requests/:id/accept`, `POST /course-requests/:id/reject {reason}` — YOK — yeni endpoint.
- Medrese ve başmüderris kavramı yok (bkz. 22); talep tablosu şemada yok.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Medrese modeline bağlı yeni talep akışı; üçüncü parti yok. Medrese gelmeden test edilemez.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Bekleyen talepler listede ve detayda tüm alanlarla görünür.
2. 'Kabul et' Ders aç formunu önceden dolu açar.
3. 'Reddet' gerekçe ister; gerekçesiz gönderilemez.
4. Karara bağlanan talep 'Karara bağlanan' sekmesine geçer.
5. Köşk nazımı olmayan 403.

## 9. Test senaryoları
**Unit (Vitest)**
- Liste/detay seçim durumu.
- Ret formu doğrulaması.
- Sekme sayacı.

**Playwright e2e (gerçek API'ye karşı)**
- Başmüderris talep gönderir (API ile).
- Köşk nazımı → Ders talepleri → Kabul et → form açılır.
- Reddet → gerekçe → talep karara bağlanır.

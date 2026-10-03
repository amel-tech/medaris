# 37 — Bildirimler — köşk nazımı

Kaynak: `37-bildirimler-kosk-nazimi/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşkündeki yasakları, yasaklı cihazdan gelen hesapları, medrese işlerini, itirazları ve deste önerilerini bildirim listesinde görür, okundu sayar.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/bildirimler``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık, açıklama, 'Tümünü okundu say'; sekmeler Tümü 9 / Okunmamış 3; 'Bildirim türü' süzgeci (Yasaklar, Yasaklı cihazlar, Dersler, İtirazlar, Deste önerileri).
- Gün grupları (BUGÜN, DÜN, DAHA ÖNCE); her öğe: başlık, 'Yeni' rozeti, metin, bağlam·saat, 'Okundu say'.
- Üst çubuk zili: `aria-label="Bildirimler, N okunmamış"` (madde 10).
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Bildirim yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Okunmamış 0: zil yalnız 'Bildirimler'.

## 4. Etkileşimler
- 'Okundu say' tek öğe; 'Tümünü okundu say' hepsi.
- Tür süzgeci listeyi daraltır.
- Öğeye tıklama ilgili sayfaya götürür (yasaklar → 40, deste önerisi → 30; hedef eşlemesi tuvalde yazılı değil — doğrulanamadı).

## 5. API
- `GET /notifications?type=&unread=` — YOK — yeni endpoint.
- `POST /notifications/:id/read`, `POST /notifications/read-all` — YOK — yeni endpoint.
- Bildirim üreten olaylar (yasak, cihaz, ders açma, itiraz, deste önerisi) backend'de yok. Bildirim tablosu şemada yok (apps/tedrisat/src/database/schema/ içinde yok).
- E-posta kanalı (SMTP) bu ekranın kapsamında değil; yalnız uygulama içi liste.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Uygulama içi bildirim deposu, okuma uçları ve olay üreticileri yeni yazılır; SMTP/push gerekmez. Üretici olaylar yasak/itiraz/deste modellerine bağlı.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Liste köşke ait bildirimleri günlere göre gruplayarak gösterir.
2. 'Okunmamış' sekmesi yalnız okunmamışları gösterir; sayılar tutarlıdır.
3. 'Okundu say' öğeyi okunmuş yapar ve sayaçları azaltır.
4. 'Tümünü okundu say' tüm öğeleri okunmuş yapar.
5. Tür süzgeci doğru öğeleri gösterir.

## 9. Test senaryoları
**Unit (Vitest)**
- Gün gruplama.
- Sayaç ve aria-label üretimi.
- Süzgeç + sekme birleşimi.

**Playwright e2e (gerçek API'ye karşı)**
- Olay üret (ör. ders yasağı) → bildirim listesinde görünür.
- Okundu say → sayaç düşer.
- Tümünü okundu say.

# 48 — yasaklamalar-medaris-yonetimi-gorunumu

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Medaris yönetiminin (başnazım/nazım) ders, medrese, köşk ve platform düzeyindeki bütün yasakları gördüğü, kaldırdığı ve genişlettiği sayfa. Köşk nazımı görünümü 42'dir. Önerilen rota: `/[locale]/bans`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Yasaklamalar" + açıklama; başlık satırında "Platformdan yasakla" düğmesi (49).
- Özet: Yasaklar (3 yeni yasak·2 yeni olay), Etkin 12, Kaldırılan 3, Cihaz olayları 3; Kapsam filtresi: Tümü, Ders, Medrese, Köşk, Platform; "12 etkin yasak".
- Tablo "Etkin yasaklar": Kişi (+Yeni, Hesap kapalı, Kalıcı yasak talebi bekliyor, İtiraz edildi rozetleri), Kapsam (Ders/Medrese/Köşk/Platform + ders·köşk·medrese adları), Gerekçe, Yasaklayan (rol), Zaman, İşlemler: "Yasağı kaldır", "Yasağı genişlet" (platform satırında yalnız kaldır).

## 3. Durumlar

- Yükleniyor/boş/hata: tuvalde metin yok — doğrulanamadı.
- Yetkisiz: Medaris nazımı yalnız izinli işlemleri görür.
- Kapsam filtresi sonuç boşsa boş durum (metin doğrulanamadı).

## 4. Etkileşimler

- Kapsam çipleri listeyi süzer.
- "Yasağı kaldır": 42'deki gerekçeli pencere.
- "Yasağı genişlet": yasağı üst kapsama çıkarır (pencere tuvalde yok — doğrulanamadı).
- "Platformdan yasakla": 49.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Tüm yasak listesi | YOK — yeni endpoint | `GET /bans?scope=COURSE/MEDRESE/KOSK/PLATFORM&status=ACTIVE` → sayfalı. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Kaldır / genişlet | YOK — yeni endpoint | `POST /bans/:id/lift`, `POST /bans/:id/extend` body `{ scope, reason }`. |
| Medrese kapsamı | YOK | Medrese varlığı backend'de yok (tedrisat'ta kosk ve course var); medrese yasakları medrese modeli gelene kadar kodlanamaz (doğrulandı: kosk.schema.ts / course.schema.ts). |

## 6. Sınıf

**B** — Liste/kaldır/genişlet uçları yazılabilir (üçüncü parti yok). Platform yasağı satırı ve medrese kapsamı bağımlılıkları 49 ve medrese modeli; bu ekran onlarsız ders/köşk kapsamıyla kodlanır.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Tabloda tüm kapsamlar tuvaldeki etiketlerle görünür; Kapsam filtresi çalışır.
2. "Etkin 12" sayacı filtresiz liste uzunluğuyla eşittir.
3. Kaldır pencere akışı 42'deki kriterlere uyar.
4. "Yasağı genişlet" yasağı seçilen üst kapsama taşır ve olay kaydına yazar.
5. Platform satırında "Yasağı genişlet" gösterilmez.
6. Yetkisiz kullanıcı uçlara 403 alır.

## 9. Test senaryoları

- Unit: kapsam filtresi, satır rozetleri, işlem görünürlük matrisi.
- Backend e2e: ders yasağı → genişlet köşk → listede kapsam KOSK.
- Playwright: Medaris nazımı → Yasaklamalar → Kapsam: Köşk → liste süzülür → bir yasağı kaldır.

# 42 — yasagi-kaldir-dialog

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Köşk nazımının Yasaklamalar (C13) sayfasında etkin bir yasağı gerekçe yazarak kaldırdığı modal. Aynı sayfa "Etkin yasaklar" tablosunu, "Köşkten de yasakla" kısayolunu ve Kaldırılan/Cihaz olayları sekmelerini içerir.
Önerilen rota: `/[locale]/kosks/[koskId]/bans` (+ modal). Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Sayfa başlığı "Yasaklamalar" + açıklama (köşk ve derslerinde konan yasaklar, gerekçeleriyle; yalnız koyan kademe ya da üstü kaldırır).
- Sekmeler/özet: "Yasaklar 3 yeni yasak·2 yeni olay", Etkin 9, Kaldırılan 2, Cihaz olayları 3.
- Tablo "Etkin yasaklar": Kişi (ad, e-posta, "Yeni" rozeti, "Kalıcı yasak talebi bekliyor"/"İtiraz edildi · karar bekliyor" rozetleri), Kapsam (Ders/Köşk + ders adı, "Medrese" bilgisi, "Emsile ve Bina’dan genişletildi"), Gerekçe, Yasaklayan (ad + rol: Müderris, Müderris (siz), Medrese nazırı, Başmüderris, Ders nazırı, Medaris nazımı), Zaman, İşlemler.
- İşlemler: "Yasağı kaldır", "Köşkten de yasakla"; kaldıramayan satırda metin "Bu yasağı yalnız Medaris yönetimi kaldırabilir." (Medaris nazımı koymuş).
- Pencere: eyebrow ders adı, başlık "Yasağı kaldır", kişi kartı, Kapsam/Yasaklayan/Gerekçe özeti, bilgi paragrafı ("Bu yasağı dersin müderrisi koydu; köşk nazımı olarak kaldırabilirsiniz. Yasak kalkınca … yeniden başvurabilir."), "Yasakla birlikte kurulan cihaz kısıtlaması da kalkar; olay kayıtta kalır.", Textarea "Kaldırma gerekçesi*" + yardım "Kaldırma, bu gerekçe ve adınızla kaydedilir.", "Vazgeç" / "Yasağı kaldır".

## 3. Durumlar

- Yükleniyor: tablo iskeleti (Skeleton).
- Boş: "Etkin yasak yok" (metin tuvalde yok — doğrulanamadı).
- Hata: liste yüklenemezse Alert + "Yeniden dene" (metin doğrulanamadı).
- Yetkisiz: kaldıramayan satırlarda düğme yerine açıklama metni; sayfaya yetkisiz erişimde "Yönetim yetkiniz yok" ekranı (nizam/03).
- Form: gerekçe zorunlu; boşken "Yasağı kaldır" disabled.

## 4. Etkileşimler

- "Yasağı kaldır": pencereyi açar; onayda yasak kaldırılır, satır Etkin'den Kaldırılan'a geçer, Toast.
- "Köşkten de yasakla": ders yasağını köşke genişletir (pencere akışı tuvalde ayrı gösterilmemiş — doğrulanamadı).
- Sekme geçişi Etkin / Kaldırılan / Cihaz olayları.
- Vazgeç/X/Esc kapatır; perde kapatmaz.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Etkin/kaldırılan yasak listesi | YOK — yeni endpoint | `GET /kosks/:koskId/bans?status=ACTIVE/LIFTED` → `BanResponse[]`. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Yasağı kaldır | YOK — yeni endpoint | `POST /bans/:banId/lift` body `{ reason: string }` → 200 `BanResponse`; kaldırma yetkisi: koyan kademe veya üstü (sunucuda zorunlu). |
| Cihaz olayları | YOK — yeni endpoint | `GET /kosks/:koskId/ban-device-events` — cihaz izi altyapısı backend'de yok; bu sekme sonraki aşamaya bırakılabilir (doğrulanamadı). |

## 6. Sınıf

**B** — Tüm uçlar yeni yazılacak; üçüncü parti gerekmiyor. Cihaz olayları sekmesi için cihaz izi tasarımı belirsiz; ilk teslimde yalnız Etkin/Kaldırılan.

## 7. Mevcut durum

Yok (ekran, rota, bileşen ve istemci yok). nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Etkin yasaklar tablosu API'den gelen kayıtlarla, tuvaldeki kolonlarla çizilir.
2. Kaldırma yetkisi olmayan satırda "Yasağı kaldır" yoktur; açıklama metni vardır.
3. "Yasağı kaldır" gerekçe boşken disabled.
4. Başarılı kaldırmada yasak Etkin listeden kalkar, Kaldırılan sayısı 1 artar, talebe derse yeniden başvurabilir.
5. Kaldırma kaydında gerekçe ve kaldıran kişi adı saklanır.
6. Sunucu, yetkisiz kademenin kaldırma isteğini 403 ile reddeder.
7. Sayaç "Etkin 9" liste uzunluğuyla tutarlıdır.

## 9. Test senaryoları

- Unit: tablo satır eşlemesi (rozet/kapsam etiketi), kaldırma yetkisi görünürlük mantığı, form şeması.
- Backend e2e: ban oluştur → farklı kademe kaldırmayı dene (403) → koyan kaldırır (200) → kayıt `lifted_by/reason` dolu.
- Playwright: köşk nazımı → Yasaklamalar → bir ders yasağında "Yasağı kaldır" → gerekçe → onay → satırın Etkin'den düştüğü ve Kaldırılan sekmesinde göründüğü doğrulanır; Medaris nazımı yasağında düğmenin bulunmadığı doğrulanır.

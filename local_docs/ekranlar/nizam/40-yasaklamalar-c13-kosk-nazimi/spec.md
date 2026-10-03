# 40 — Yasaklamalar (C13) — köşk nazımı

Kaynak: `40-yasaklamalar-c13-kosk-nazimi/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşkünde ve derslerinde konan yasakları gerekçeleriyle görür; yasağı kaldırır ya da ders yasağını köşke genişletir. Bir yasağı yalnız onu koyan kademe veya üstü kaldırır.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/yasaklamalar``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık, açıklama; 'Yasaklar — 3 yeni yasak·2 yeni olay'; özet sekmeleri Etkin 9, Kaldırılan 2, Cihaz olayları 3.
- Tablo 'Etkin yasaklar': Kişi (ad, e-posta, 'Yeni' / 'Kalıcı yasak talebi bekliyor' / 'İtiraz edildi' rozetleri), Kapsam (Ders/Köşk + ad, 'Emsile ve Bina'dan genişletildi'), Gerekçe, Yasaklayan (ad+rol, '(siz)'), Zaman, İşlemler 'Yasağı kaldır', 'Köşkten de yasakla'.
- Medaris nazımı yasağında satırda 'Bu yasağı yalnız Medaris yönetimi kaldırabilir.' ve yalnız 'Köşkten de yasakla'; itirazlı köşk yasağında yalnız 'Yasağı kaldır'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Yasak yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Kaldırılan ve Cihaz olayları sekmelerinin içeriği tuvalde yok — doğrulanamadı.
- Kaldırma yetkisi yoksa düğme yok (kademe kuralı).

## 4. Etkileşimler
- 'Yasağı kaldır' → nizam/42 Dialog'u (gerekçe zorunlu).
- 'Köşkten de yasakla' → ders yasağını köşke genişletir (41 ile benzer gerekçeli Dialog; ayrı ekran tuvalde yok — doğrulanamadı).
- Sekmeler listeyi değiştirir.

## 5. API
- Hiçbir yasak endpoint'i yok. Yakın: kayıt reddi `DELETE /courses/:id/enrollments/:userId` yalnız PENDING siler (apps/tedrisat/src/course/course.controller.ts:211; course.service.ts:154-161) — yasak değil.
- `GET /kosks/:id/bans?status=` — YOK — yeni endpoint; `POST /bans/:id/lift {reason}`, `POST /bans/:id/extend-to-kosk` — YOK — yeni endpoint (yasak, kademe, itiraz, cihaz olayı tabloları yok).
- Cihaz olayları: cihaz tanıma/yasaklı cihaz tespiti — YOK; gereksinimi doğrulanamadı (üçüncü parti cihaz parmak izi servisi gerekebilir; tuvalde yok).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Yasak modeli, kademe kuralı, itiraz durumu yeni yazılır. Cihaz olayları bu ekranda yalnız sekme olarak geçiyor; cihaz tanıma gerektiriyorsa o parça ayrı karar ister (doğrulanamadı), liste/kaldırma/genişletme B olarak kodlanabilir.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Etkin yasaklar kişi, kapsam, gerekçe, yasaklayan ve zamanla listelenir.
2. Sekme sayıları (Etkin/Kaldırılan/Cihaz olayları) listeyle tutarlıdır.
3. Yasağı koyan kademenin altındaki kullanıcı 'Yasağı kaldır'ı görmez; sunucu 403 döner.
4. 'Yasağı kaldır' gerekçe ile kaldırır; yasak 'Kaldırılan'a geçer.
5. 'Köşkten de yasakla' ders yasağını köşk yasağına genişletir.
6. Her işlem denetim kaydına yazılır.

## 9. Test senaryoları
**Unit (Vitest)**
- Kademe-yetki karşılaştırma fonksiyonu.
- Rozet/etiket eşlemesi (Yeni, itiraz, talep).
- Satır eylem kümesi hesabı.

**Playwright e2e (gerçek API'ye karşı)**
- Müderris ders yasağı koyar (API).
- Köşk nazımı → Yasaklamalar → satır görünür.
- Yasağı kaldır → gerekçe → Kaldırılan sekmesinde.
- Medaris nazımı yasağında kaldırma düğmesi yok.

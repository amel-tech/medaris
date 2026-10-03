# 27 — Barındırma hakkını geri al (dialog)

Kaynak: `27-barindirma-hakkini-geri-al-dialog/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı bir medresenin barındırma hakkını geri alırken, medresenin bu köşkteki açık derslerinin akıbetini seçer. Ekran 26'daki satırdan açılan `Dialog`'dur (gerekçe/karar formu; madde 11).

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/ayarlar/barindirma` + `Dialog``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Etiket 'SÜLEYMANİYE MEDRESESİ', başlık 'Barındırma hakkını geri al', açıklama 'yeni ders açamayacak … iki açık dersi kapanmaz'.
- Açık ders listesi: ders adı, talebe sayısı·imam, durum rozeti (Yayında/Taslak).
- 'Açık dersler' RadioGroup: 'Dersler sürsün' (talebeler değişiklik görmez) / 'Dersleri gizle' (listelerden çıkar, 35 talebe erişemez, silinmez, Arşiv'den geri alınır).
- Not 'Seçiminiz denetim kaydına yazılır.'; 'Vazgeç', 'Barındırma hakkını geri al' (seçim yapılana dek devre dışı; varsayılan seçenek yok, madde 16 örüntüsü).
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Seçim yokken onay düğmesi devre dışı.
- Açık ders yoksa soru gizlenir (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).

## 4. Etkileşimler
- Radyo seçimi → düğme etkinleşir.
- Onay: hak geri alınır; 'Dersleri gizle' seçildiyse dersler gizlenir; denetim kaydı; Dialog kapanır, satır listeden kalkar.

## 5. API
- `DELETE /kosks/:id/barindirma-haklari/:medreseId` — YOK — yeni endpoint; gövde/sorgu `{coursesAction:'KEEP'|'HIDE'}`.
- Dersleri gizleme için 23'teki `POST /courses/:id/hide` — YOK.
- Mevcut yakın: `DELETE /courses/:id` yalnız kalıcı siler (apps/tedrisat/src/course/course.controller.ts:139), seçenek değil.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — 26'ya ve ders gizleme modeline bağımlı yeni endpoint; üçüncü parti yok.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Dialog açık dersleri ve iki seçeneği gösterir; varsayılan seçim yoktur.
2. Seçim yapılmadan onay düğmesi devre dışıdır.
3. 'Dersler sürsün' ile hak kalkar, dersler değişmez.
4. 'Dersleri gizle' ile dersler Gizli olur ve Arşiv'de görünür.
5. İşlem denetim kaydına yazılır.

## 9. Test senaryoları
**Unit (Vitest)**
- RadioGroup: seçim yokken disabled.
- Özet metni talebe toplamı hesabı.

**Playwright e2e (gerçek API'ye karşı)**
- Barındırma hakları → 'Barındırma hakkını geri al'.
- 'Dersler sürsün' → onay → satır kalkar, dersler Dersler'de durur.
- 'Dersleri gizle' varyantı → Arşiv'de.

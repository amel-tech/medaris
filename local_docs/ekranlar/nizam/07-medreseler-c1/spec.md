# 07 - Medreseler (C1)

Kaynak: local_docs/ekranlar/nizam/07-medreseler-c1/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Platformdaki medreselerin listesi, durum sekmeleri ve pasif/gizli medrese yönetimi (başmüderris ata, gizlenen medreseyi geri al, yeni medrese aç).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `apps/nizam/app/[locale]/medreseler/page.tsx` (`/medreseler`). İzin: "Medrese aç ve başmüderrisini seç" / başnazım.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık "Medreseler", açıklama "Bir medrese, başmüderrisiyle birlikte açılır..."; buton "Medrese aç" (08).
- Uyarı: "Zeyrek Medresesi pasif" + neden (görev süresi doldu, ziyaretçiye kapalı).
- Sekmeler "Arşiv" bağlantısı + durum süzgeci: Tümü 3, Etkin 1, Pasif 1, Gizli 1.
- Tablo: Medrese (kısa ad rozeti, ad, @kısa ad), Başmüderris, Ders sayısı, Barındırma hakkı (köşk adları / "Yok"), Durum (Etkin/Pasif/Gizli + "{tarih}'den beri" ya da "Atanmamış · Görev süresi ... doldu"), İşlemler ("Geri al" gizliler için, "Başmüderris ata" pasifler için).
- Dipnot: gizlenen medresenin etkisi.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Medrese aç -> 08 diyaloğu.
- Sekme/süzgeç -> liste yeniden sorgulanır (URL `?durum=`).
- Geri al -> medrese etkin olur, toast, satır durum değiştirir (AlertDialog yok; geri alma zararsız).
- Başmüderris ata -> 22'deki atama diyaloğu.
- Satır adı -> medrese ayrıntısı (kapsam dışı; doğrulanamadı).

## 5. API
- Mevcut: `GET /kosks` (apps/tedrisat/src/kosk/kosk.controller.ts:49) yalnız köşk. `madrasah` yalnız yetki matrisinde adı geçer (libs/common/src/authz/auth-matrix.ts:121) ve rol çözücüde geçici `PUBLIC` döner; tablo ve controller YOK.
- Model YOK: madrasahs, madrasah_head_muderris, durum (active/inactive/hidden), hiddenAt (apps/tedrisat/src/database/schema altında karşılığı yok; mevcut tablolar: kosks, kosk_followers, courses, enrollments, course_muderris, flashcard*).
- YOK — yeni endpoint: `GET /madrasahs?status=&page=` ; `POST /madrasahs/:id/restore` ; `PUT /madrasahs/:id/head-muderris`.

## 6. Sınıf
**B** - Üçüncü parti yok; medrese modeli ve uç noktaları yazılarak kodlanır.

## 7. Mevcut durum
YOK: nizam'da medrese rotası/bileşeni yok (apps/nizam/app/[locale] altında yalnız kosks, decks).

## 8. Kabul kriterleri
1. Liste durum sayıları (Tümü/Etkin/Pasif/Gizli) API toplamıyla eşit.
2. Pasif medrese satırında "Atanmamış" ve "Başmüderris ata" görünür.
3. Gizli medrese satırında "Geri al" görünür, tıklanınca durum Etkin/Pasif olur.
4. Barındırma hakkı olmayan medrese "Yok" yazar.
5. Pasif medrese varsa üstte uyarı vardır, yoksa yoktur.
6. İzni olmayan kullanıcı 06'yı görür.

## 9. Test senaryoları
**Unit (Vitest)**
- durum rozeti eşlemesi.
- süzgeç -> sorgu parametresi.
- "{tarih}'den beri" biçimleme.

**Playwright e2e (gerçek API'ye karşı)**
1. Başnazım ile `/medreseler`; sayıları API ile karşılaştır.
2. Gizli medreseyi "Geri al".
3. "Başmüderris ata" ile pasif medreseye atama yap -> durum Etkin.
4. Medrese nazımı izinsiz -> 06.

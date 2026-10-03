# 10 - Köşk aç (form)

Kaynak: local_docs/ekranlar/nizam/10-kosk-ac-form/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Yeni köşk oluşturma formu: kimlik, alan/seviye, etiket, kapak rengi, listeleme, ilk köşk nazımı (e-postayla).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: 09 üzerinde Dialog/form (`.ekran-form` yerleşimi, _kurallar.md 22); bugünkü diyalog `kosk-form-dialog.tsx`.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık "Köşk aç"; "* zorunlu alan". Alanlar: Ad*, Kısa ad (@), Alan* (Arapça dil ilimleri, Belâgat, Fıkıh, Fıkıh usûlü, Hadis, Kur'an ilimleri, Tefsir, Akaid ve kelâm, Siyer, Mantık, Diğer), Seviye* (Bütün seviyeler, Başlangıç, Orta, İleri), Etiketler (virgülle), Açıklama, Kapak rengi (Lâciverd, Bordo, Zümrüt, Mürekkep), "Listelerde gösterme" anahtarı, Köşk nazımı* (e-posta araması, seçilen nazımlar listesi, çoklu).
- Düğmeler: Vazgeç, Köşk aç. 15'ten gelirse alanlar başvuru verisiyle dolu ve başvuran önerilen nazımdır.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).
- Form doğrulama: Ad*, Alan*, Seviye*, Köşk nazımı* zorunlu; Kısa ad deseni; hata mesajı yardımın yerine geçer.

## 4. Etkileşimler
- E-posta arama -> nazım ekle/çıkar (en az 1 zorunlu). Kapak rengi seçimi önizleme.
- Köşk aç -> POST; başarıda kapanır, listeye düşer; 15'ten ise başvuru "kabul edildi" olur.
- Vazgeç/Esc kapatır.

## 5. API
- Mevcut: `POST /kosks` (apps/tedrisat/src/kosk/kosk.controller.ts:79) `CreateKoskDto` (name, handle, description, coverHue, isPrivate, field, level, tags — apps/tedrisat/src/kosk/dto/create-kosk.dto.ts); `ownerId` = çağıran (satır 87-88), yani tek sahip; çoklu köşk nazımı YOK.
- Kapak rengi adları -> `coverHue` sayısı eşlemesi frontend'de tanımlanır (doğrulanamadı: dört adın hue değerleri).
- YOK — değişen: `POST /kosks` gövdesine `managerUserIds: string[]` (en az 1) ve nazım tablosu `kosk_managers`; alan listesi sabit değerler (enum doğrulaması).
- Kullanıcı arama (e-posta ile tam eşleşme): kullanıcı dizini backend'de YOK (users tablosu yok, kimlik yalnız JWT `sub`: AuthorizedRequest). İki yol: (a) girişte `user_profiles` tablosuna yansıtma (B), (b) Keycloak Admin API servis hesabı (C: sunucu yapılandırması). Önerilen (a); seçim sahibinde, doğrulanamadı.

## 6. Sınıf
**B** - Temel oluşturma var; çoklu nazım ve kullanıcı arama yeni yazılır. Üçüncü parti yok (arama yolu a seçilirse).

## 7. Mevcut durum
Kısmi: `apps/nizam/features/kosks/components/kosk-form-dialog.tsx` (164 satır) — ad/alan alanlarının tam eşlemesi doğrulanamadı; nazım seçimi, kapak rengi, listeleme anahtarı YOK.

## 8. Kabul kriterleri
1. Ad, Alan, Seviye ve en az bir nazım olmadan Köşk aç disabled.
2. Etiketler virgülle ayrılıp diziye çevrilir, boşluklar kırpılır.
3. Listelerde gösterme açıkken köşk Listelenmeyen olarak oluşur.
4. Nazım seçmek aynı kişiyi ikinci kez eklemez.
5. Başarıdan sonra 09 listesinde yeni köşk görünür.
6. Başvurudan açılışta başvuru kabul edilmiş sayılır (15).

## 9. Test senaryoları
**Unit (Vitest)**
- etiket ayrıştırma.
- kapak adı -> hue eşlemesi.
- doğrulama (zorunlu alanlar, kısa ad deseni).
- çoklu nazım seçimi.

**Playwright e2e (gerçek API'ye karşı)**
1. Formu doldur, nazım ekle, Köşk aç -> listede.
2. Boş gönderim -> alan hataları.
3. Aynı kısa ad -> hata.
4. 15'ten açıldığında alanlar önceden dolu.

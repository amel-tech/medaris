# 08 - Medrese aç (dialog)

Kaynak: local_docs/ekranlar/nizam/08-medrese-ac-dialog/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Yeni medrese oluşturma penceresi: ad, kısa ad, açıklama, başmüderris (e-postayla arama).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: 07 üzerinde `Dialog` (Base UI; _kurallar.md 11-13, 17); ayrı rota yok.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık "Medrese aç", gövde "Medrese, başmüderrisiyle birlikte açılır. Ders açabilmesi için bir köşkte barındırma hakkı alması gerekir." "* zorunlu alan".
- Alanlar: Ad* (yardım: Talebeler ve ziyaretçiler bu adı görür), Kısa ad (@ önekli; küçük harf, rakam, tire), Açıklama, Başmüderris* (e-posta ile tam eşleşme; her arama denetim kaydına yazılır).
- Seçilen başmüderris kartı (ad, e-posta, "{ad} seçildi"); açıklama "Medrese açıldığında başmüderris olur...".
- Düğmeler: Vazgeç, Medrese aç.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).
- Form doğrulama: Ad*, Başmüderris* zorunlu; Kısa ad deseni; hata mesajı yardımın yerine geçer (_kurallar.md 9). Gönderirken düğme spinner.

## 4. Etkileşimler
- E-posta girilip arama -> eşleşen hesap kartı (tam eşleşme yoksa "bulunamadı" - metin tuvalde yok, doğrulanamadı).
- Medrese aç -> POST; başarıda pencere kapanır, liste güncellenir, toast.
- Vazgeç / Esc -> kapanır; perdeyle kapanmaz (form penceresi).
- Odak ilk alanda.

## 5. API
- YOK — yeni endpoint: `POST /madrasahs` `{ name, handle?, description?, headMuderrisUserId }` -> 201 MadrasahResponse; `GET /users/lookup?email=` -> `{id,displayName,email}` (her çağrı denetim kaydı yazar, bkz. 17).
- Kullanıcı arama (e-posta ile tam eşleşme): kullanıcı dizini backend'de YOK (users tablosu yok, kimlik yalnız JWT `sub`: AuthorizedRequest). İki yol: (a) girişte `user_profiles` tablosuna yansıtma (B), (b) Keycloak Admin API servis hesabı (C: sunucu yapılandırması). Önerilen (a); seçim sahibinde, doğrulanamadı.
- Kısa ad benzersizlik: 409. Model YOK: madrasahs (apps/tedrisat/src/database/schema altında karşılığı yok; mevcut tablolar: kosks, kosk_followers, courses, enrollments, course_muderris, flashcard*).

## 6. Sınıf
**B** - Kullanıcı dizini için `user_profiles` yaklaşımı seçilirse tamamen yazılabilir (B). Keycloak Admin API yolu seçilirse C'ye döner — karar sahibinde.

## 7. Mevcut durum
YOK. Benzer bir form deseni olarak köşk için `apps/nizam/features/kosks/components/kosk-form-dialog.tsx` var.

## 8. Kabul kriterleri
1. Ad boşken Medrese aç düğmesi disabled'dır.
2. Kısa ad yalnız [a-z0-9-] kabul eder; aksi halde alan hatası.
3. Başmüderris seçilmeden gönderilemez.
4. Başarılı oluşturma sonrası liste yeni medreseyi içerir.
5. Aynı kısa ad 409 -> alan altında hata.
6. Her e-posta araması denetim kaydına bir satır ekler (bkz. 17).

## 9. Test senaryoları
**Unit (Vitest)**
- form doğrulama (ad zorunlu, kısa ad deseni).
- e-posta arama sonucu durumları (bulundu/yok/yükleniyor).
- gönderim yükü eşlemesi.

**Playwright e2e (gerçek API'ye karşı)**
1. Dialog'u aç, boş gönder -> hata.
2. Geçerli e-posta ile başmüderris seç, medrese aç -> listede görünür.
3. Aynı kısa adla tekrar -> 409 hata mesajı.
4. Denetim kaydında arama satırı görünür (17).

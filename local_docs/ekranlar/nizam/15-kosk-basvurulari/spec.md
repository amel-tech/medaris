# 15 - Köşk başvuruları

Kaynak: local_docs/ekranlar/nizam/15-kosk-basvurulari/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Üyelerin Tedris'ten gönderdiği köşk açma başvurularını karara bağlama: köşkü aç ya da gerekçeyle reddet.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/kosk-basvurulari`; izin "Köşk başvurularını karara bağla".
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama; sekmeler Bekleyen 3 / Karara bağlanan 2.
- Sol liste: köşk adı, alan · başvuran, zaman. Sağ ayrıntı ("KÖŞK AÇMA BAŞVURUSU"): ad, durum ("Karar bekliyor"), Alan, Gönderildi (tarih), "Bu alandaki köşkler" ("Henüz yok"), Kısa açıklama, Neden bu köşk, Başvuran (ad, rolleri, e-posta, telefon "Verilmedi"), not "iletişim bilgilerini görmeniz denetim kaydına yazılır", açıklama "Köşk açma formu başvurudaki ... ile açılır".
- Düğmeler: Köşkü aç, Reddet.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Satır seç -> ayrıntı (iletişim bilgisi gösterilince denetim satırı).
- Köşkü aç -> 10 formu başvuru verisiyle; köşk açılınca başvuru kabul edilir.
- Reddet -> `Dialog` "Ret gerekçesi*" zorunlu (_kurallar.md 17); gönderince başvuru Karara bağlanan'a geçer, başvurana bildirim (bildirim sistemi doğrulanamadı).

## 5. API
- YOK — yeni endpoint: `GET /nizam/kosk-applications?status=` ; `GET /nizam/kosk-applications/:id` ; `POST /nizam/kosk-applications/:id/approve` (köşk açar) ; `POST .../reject` `{reason}`; Tedris tarafında `POST /kosk-applications` (gönderim). Köşk başvurusu varlığı backend'de YOK (Model YOK: kosk_applications (apps/tedrisat/src/database/schema altında karşılığı yok; mevcut tablolar: kosks, kosk_followers, courses, enrollments, course_muderris, flashcard*).).
- Mevcut `POST /kosks` (apps/tedrisat/src/kosk/kosk.controller.ts:79) onay akışının köşk oluşturma adımında yeniden kullanılır. Denetim kaydı için backend'de tablo/servis YOK (apps/tedrisat/src altında audit karşılığı bulunamadı).

## 6. Sınıf
**B** - Üçüncü parti yok; başvuru modeli ve Tedris gönderim ucu yazılır. Bildirim e-postası istenirse SMTP gerekir (C kalemi; bu ekranın gereği değil).

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Bekleyen/Karara bağlanan sayıları API ile aynı.
2. Ret gerekçesi boşken Reddet gönderilemez.
3. Köşkü aç tıklanınca 10 formu başvuru değerleriyle dolu açılır.
4. Köşk açıldığında başvuru Kabul edildi olarak karar listesine geçer.
5. İletişim bilgisi görüntülenince denetim satırı yazılır.
6. Karara bağlanan başvuru tekrar karara bağlanamaz (409).

## 9. Test senaryoları
**Unit (Vitest)**
- liste/ayrıntı seçimi.
- ret formu doğrulama.
- telefon yoksa "Verilmedi".

**Playwright e2e (gerçek API'ye karşı)**
1. Başvuru oluştur (API), listede gör.
2. Reddet: gerekçe yaz, gönder -> Karara bağlanan'da.
3. Köşkü aç: formdan oluştur -> başvuru kabul.
4. Denetim kaydında iletişim görüntüleme.

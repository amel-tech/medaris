# 18 - YouTube bağlantısı

Kaynak: local_docs/ekranlar/nizam/18-youtube-baglantisi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Medaris kanalının Google hesabı bağlantısını gösterme/yenileme/kaldırma ve ders kaydı yükleme durumu.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/ayarlar/youtube`; izin "YouTube bağlantısını yönet".
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık; uyarı "YouTube API denetimi için başvuru henüz yapılmadı" (denetimsiz projeyle yüklenen video kalıcı özel kalır; Medaris'ten yükleme kapalı; "Video yükle" ya da "Bağlantı yapıştır" yolu).
- "Medaris kanalı" kartı: Bağlı rozeti, kanal adı/adresi (yer tutucu `youtube.com/@[kanal adı]`), Bağlayan, Bağlandı tarihi, Verilen izin (`youtube.upload`), Kanal kimliği (yer tutucu), Günlük yükleme sınırı (100 video / proje), API denetimi (Başvuru yapılmadı). Düğmeler: Bağlantıyı yenile, Bağlantıyı kaldır.
- "Bu bağlantı ne için" açıklamaları; "Son yüklemeler" (boş: "Henüz YouTube'a yüklenen ders kaydı yok.").

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Bağlantıyı yenile -> Google OAuth izin akışı (tarayıcıda Google'a gider, geri döner).
- Bağlantıyı kaldır -> onay (AlertDialog); token silinir.
- Başka etkileşim yok.

## 5. API
- YOK — yeni endpoint: `GET /nizam/youtube` (durum), `POST /nizam/youtube/connect` (OAuth başlat), `GET /nizam/youtube/callback`, `DELETE /nizam/youtube`; refresh token şifreli saklanır. Backend'de YouTube/Google entegrasyonu YOK (apps/tedrisat/src altında bulunamadı).
- Gerekli dış koşullar: Google Cloud projesi, OAuth istemcisi, `youtube.upload` kapsamı, YouTube API denetim başvurusu (tuvalde "yapılmadı"), kanal yöneticisi hesabı — insan işi.

## 6. Sınıf
**C** - Google/YouTube OAuth istemcisi, Cloud projesi ve API denetimi insan/üçüncü taraf gerektirir; tuvaldeki bile bağlantı "henüz başvuru yapılmadı" diyor. Kod tarafı hazırlanabilir ama uçtan uca doğrulanamaz.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. (Kodlanırsa) Bağlı olmayan durumda "Bağlı değil" ve "Bağla" gösterilir (tuvalde yok, doğrulanamadı).
2. Kanal kimliği ve ad yer tutucu değil gerçek veriden gelir.
3. Token hiçbir yanıtta dönmez.
4. Bağlantıyı kaldır token'ı siler.

## 9. Test senaryoları
**Unit (Vitest)**
- durum rozeti ve tarih biçimleme.
- kaldırma onay akışı.

**Playwright e2e (gerçek API'ye karşı)**
1. Kodlanmaz (C sınıfı); manuel: Google OAuth ile bağla/yenile/kaldır.

# 01 - Ana sayfa — Medaris başnazımı

Kaynak: local_docs/ekranlar/nizam/01-ana-sayfa-medaris-basnazimi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Medaris başnazımının açılış panosu: karar bekleyen talepler, pasif kapsam uyarısı, platform sayıları ve son yasaklar. Kenar menü başnazıma tüm bölümleri açar (GENEL, PLATFORM, TALEPLER, DENETİM, AYARLAR).
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/` altında `apps/nizam/app/[locale]/page.tsx` (bugün hoş geldin metni) ve `/home` (`apps/nizam/app/home/page.tsx`); rol çözümüne göre 01/02/05/03/04 ekranından biri render edilir.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- AppBar/kenar menü: Logo "Medaris NİZAM"; bölümler GENEL (Ana sayfa, Bildirimler + okunmamış sayısı), PLATFORM (Medreseler, Köşkler, Medaris nazımları, İzin grupları, Pasif kapsamlar + "2 yöneticisiz" rozeti), TALEPLER (Köşk başvuruları 3, Deste yayın istekleri 2, İtirazlar 2, Kalıcı yasak talepleri 2 — her biri "bekleyen"), DENETİM (Yasaklamalar, Denetim kaydı, Arşiv), AYARLAR (YouTube bağlantısı, Platform ayarları). Altta kullanıcı satırı "Yusuf Ziya Ertuğrul · Medaris başnazımı".
- Başlık "Ana sayfa"; selam: "Selâmün aleyküm, {Ad} Bey. Karar bekleyen {n} talep var." (n = dört bekleyen sayının toplamı: 3+2+2+2=9). Birincil buton "Köşk aç".
- Uyarı (Alert): "İki kapsamın yöneticisi yok" + açıklama; yalnız pasif kapsam > 0 iken.
- "Platform sayıları" Stat'ları: Köşk 4 ("Biri listelenmeyen", link "Köşklere git"), Medrese 2 ("Biri pasif", "Medreselere git"), Ders 10 ("Biri pasif"), Kayıtlı talebe 241.
- Kartlar (Card, her biri "Tümünü gör" + satır başına "İncele"): Köşk başvuruları (ad · alan · başvuran · zaman), Deste yayın istekleri (deste · sahip · kart sayısı · zaman), Pasif kapsamlar (ad · tür · neden · tarih; eylem "Başmüderris ata"/"Müderris ata"), Yeni yasaklar (kişi, ders yasağı, koyan, gerekçe; "İncele"; alt link "Yasaklamalar'a git").
- i18n: libs/i18n'de nizam ad alanı yalnız `HomePage.greeting` taşıyor (apps/nizam/app/home/page.tsx); diğer anahtarlar doğrulanamadı / yeni eklenecek.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Köşk aç -> 10 (köşk aç formu). Köşklere git -> 09. Medreselere git -> 07.
- Kenar menü öğeleri ilgili ekrana gider; rozet sayıları canlı sayaç uç noktasından gelir.
- Köşk başvurusu "İncele" -> 15 (seçili başvuru). Deste isteği "İncele" -> 16. "Başmüderris ata" / "Müderris ata" -> 14'teki atama akışı. Yasak "İncele" -> Yasaklamalar ekranı (bu kapsamda değil; doğrulanamadı).
- Zil/Bildirimler -> Bildirimler ekranı (kapsam dışı).

## 5. API
- Bugün hiçbiri bu panoyu besleyemez. Var olan: `GET /kosks` (apps/tedrisat/src/kosk/kosk.controller.ts:49) yalnız çağıran kullanıcının görebildiği köşkleri sayfalı döner; platform geneli sayı yok.
- YOK — yeni endpoint: `GET /nizam/dashboard` -> `{ greetingName, pendingTotals:{koskApplications,deckPublishRequests,appeals,permanentBanRequests}, platformCounts:{kosk,unlistedKosk,madrasah,inactiveMadrasah,course,inactiveCourse,enrolledStudents}, inactiveScopes:[...], latestApplications:[...], latestDeckRequests:[...], latestBans:[...] }` (başnazım izniyle).
- Bağımlı kavramlar (köşk başvurusu, deste yayın isteği, itiraz, yasak, pasif kapsam, medrese) backend'de yok; bkz. 07, 14, 15, 16. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**B** - Üçüncü parti gerekmez; ancak panonun veri kaynakları (medrese, başvuru, yasak, rol) henüz yok; birleşik okuma uç noktası ve alt modeller yazılarak kodlanır.

## 7. Mevcut durum
Kısmi: kabuk ve karşılama metni var — `apps/nizam/app/home/page.tsx`, `apps/nizam/components/layout/app-sidebar.tsx`, `nav-routes.ts` (yalnız Decks/Köşkler). Pano kartları, Stat bileşenleri ve rol bazlı menü YOK.

## 8. Kabul kriterleri
1. Başnazım oturumunda `/` açıldığında 5 bölümlü menü ve ekrandaki 4 kart görünür.
2. Selam metnindeki n, bekleyen dört talep sayısının toplamına eşittir.
3. Pasif kapsam sayısı 0 ise uyarı kutusu ve menüdeki "yöneticisiz" rozeti gösterilmez.
4. Her "Tümünü gör" ve "İncele" bağlantısı doğru ekrana, doğru kayıtla gider.
5. Boş listede ilgili kart EmptyState gösterir; kart gizlenmez.
6. Medaris nazımı bu ekranı göremez, 05 görür (rol bazlı render).
7. Sayılar uç noktadaki değerle birebir aynıdır (talebe sayısı gizli dersleri hariç tutma kuralı 20'deki gibi).
8. 390 px'te menü çekmeceye döner (_kurallar.md madde 18).

## 9. Test senaryoları
**Unit (Vitest)**
- rol -> hangi ana sayfa bileşeni seçildiği (başnazım/nazım/köşk nazımı/yetkisiz/nazır).
- toplam bekleyen sayısı hesabı ve çoğul/tekil metin.
- pasif kapsam uyarı metni (1 ve 2 kapsam).
- Stat ve kart bileşenlerinin boş/dolu render'ı.

**Playwright e2e (gerçek API'ye karşı)**
1. Başnazım hesabıyla giriş yap, `/` aç; menü bölümlerini ve selam metnini doğrula.
2. API'yi doğrudan çağır, dönen sayıları ekrandakilerle karşılaştır.
3. "Köşk aç" tıkla -> köşk aç formu açılır.
4. Başvuru kartında "İncele" -> 15'e gider.
5. Pasif kapsam yokken uyarının görünmediğini doğrula (test verisiyle).
6. Köşk nazımı hesabıyla giriş -> 02 görünür, PLATFORM menüsü yok.

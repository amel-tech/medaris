# 11 - Medaris nazımları

Kaynak: local_docs/ekranlar/nizam/11-medaris-nazimlari/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Başnazımın Medaris nazımlarını görmesi, atama, izinlerini düzenlemesi ve görevden alması.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/medaris-nazimlari`; yalnız Medaris başnazımı.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık, açıklama ("yalnız sizin verdiğiniz izinlerle çalışır..."), buton "Medaris nazımı ata".
- Sekme "Görevde · 3 kişi".
- Tablo: Medaris nazımı (kısa ad, ad, e-posta), İzinler ve gruplar (grup adı + "grubu", "her ders" ve tek izinler), Bitiş (tarih / "Süresiz" / "14 gün kaldı"), Veren + tarih, İşlemler ("İzinleri düzenle", "Görevden al").

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Medaris nazımı ata -> 12 (izin ver). İzinleri düzenle -> 12 (düzenleme kipi). Görevden al -> `Dialog` (satır başına Devral/Düşür seçimleri, _kurallar.md 15; 4 Ekim 2026'ya kadar pencere açılmaz = sürüm kapısı).
- Bitiş yaklaşınca "N gün kaldı" uyarısı.

## 5. API
- Mevcut: yok. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).
- YOK — yeni endpoint: `GET /nizam/medaris-nazims` ; `POST /nizam/medaris-nazims` ; `PUT /nizam/medaris-nazims/:userId/grants` ; `DELETE /nizam/medaris-nazims/:userId` (gövde: devral/düşür kararları).
- Denetim: her verme/geri alma denetim kaydına (17).

## 6. Sınıf
**B** - Üçüncü parti yok; izin/atama modeli yazılır. Kapı koşulu (4 Ekim 2026) görevden alma penceresini şimdilik kapalı tutar.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Liste yalnız görevde olanları, API sırasıyla gösterir.
2. Süresiz izin "Süresiz", süreli izin tarih ve (≤30 gün) kalan gün yazar.
3. Süresi dolan kişi listeden düşer.
4. Yalnız başnazım bu sayfayı açar; nazım 06 görür.
5. Görevden al sonrası kişi listeden çıkar ve denetim satırı oluşur.

## 9. Test senaryoları
**Unit (Vitest)**
- kalan gün hesabı.
- izin özetleme (grup + ek izin).
- görevden alma karar formu doğrulama (hepsi seçilmeden onay yok).

**Playwright e2e (gerçek API'ye karşı)**
1. Başnazım ile sayfayı aç, 3 satır.
2. İzinleri düzenle -> 12 açılır, değer yüklü.
3. Görevden al (sürüm kapısı açıksa) -> satır kalkar.
4. Nazım hesabıyla erişim -> 06.

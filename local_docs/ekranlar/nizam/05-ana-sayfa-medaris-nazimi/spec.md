# 05 - Ana sayfa — Medaris nazımı

Kaynak: local_docs/ekranlar/nizam/05-ana-sayfa-medaris-nazimi/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Başnazımın verdiği izinlerle çalışan Medaris nazımının panosu; menü ve kartlar yalnız izinli bölümleri gösterir; kendi izinlerini özetler.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `/` (rol = Medaris nazımı). Menü ve kartlar izne göre süzülür.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Menü (bu hesapta): GENEL (Ana sayfa, Bildirimler 2), PLATFORM (Medreseler, Köşkler), TALEPLER (Köşk başvuruları 3, Deste yayın istekleri 2, Kalıcı yasak talepleri 2), DENETİM (Yasaklamalar). İzni olmayan bölümler (İzin grupları, Denetim kaydı, YouTube, Platform ayarları...) görünmez.
- Selam: "Selâmün aleyküm, Hasan Basri Bey. Karar bekleyen 7 talep var." (3+2+2). Buton "Köşk aç" (izin: köşk aç).
- Platform sayıları: Köşk 4, Medrese 2 (Ders ve Kayıtlı talebe YOK, 01'den farkı).
- Kartlar: Köşk başvuruları, Deste yayın istekleri, Kalıcı yasak talepleri (talep eden, zaman), "İzinleriniz", Yeni yasaklar.
- "İzinleriniz": grup kartları ("Köşk işleri · Hazır grup · 4 izin · 31 Aralık 2026'ya kadar" + izin cümleleri; "Ders denetimi · Her ders · 3 izin"), tek izinler ("Medrese aç ve başmüderrisini seç", "Desteyi herkese yayımla", "Platformdan yasakla, yasağı kaldır" + not "Kalıcı yasak talebini karara bağlamayı kapsar"), dipnot "İzinleri Medaris başnazımı {ad} verdi; ... verildi."

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).


## 4. Etkileşimler
- Köşk aç -> 10; kartlardaki İncele ve Tümünü gör -> 15/16/Kalıcı yasak/Yasaklamalar.
- İzin bölümü salt okunur; izin süresi dolunca anında kalkar (sonraki yüklemede menü daralır).

## 5. API
- YOK — yeni endpoint: `GET /nizam/dashboard` (01'dekiyle aynı, kapsam izne göre kırpılır) ve `GET /me/grants` -> `[{kind:'group'|'permission',name,scope,permissionCount,expiresAt,grantedBy,grantedAt,permissions[]}]`.
- İtiraz/kalıcı yasak modelleri YOK. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**B** - Kimlik/izin modeli ve pano uç noktaları sıfırdan yazılmalı; üçüncü parti yok.

## 7. Mevcut durum
Kısmi: yalnız karşılama stub'ı (`apps/nizam/app/home/page.tsx`); izin bazlı menü ve pano YOK.

## 8. Kabul kriterleri
1. İzni olmayan menü öğeleri DOM'da bulunmaz.
2. Selam toplamı yalnız görünür kartların sayıları toplamıdır.
3. "İzinleriniz" kartı grup adı, izin sayısı ve bitiş tarihini API ile aynı gösterir.
4. Süresiz izinde "süresiz" yazar, tarih yazmaz.
5. Süresi dolan izin sonraki yüklemede listede görünmez.
6. Köşk aç izni yoksa "Köşk aç" butonu görünmez.

## 9. Test senaryoları
**Unit (Vitest)**
- izin -> menü öğesi görünürlüğü eşlemesi.
- tarih biçimleme (Eylül, "'ne kadar").
- toplam bekleyen sayısı.

**Playwright e2e (gerçek API'ye karşı)**
1. Medaris nazımı hesabıyla giriş, menüde yalnız izinli bölümler.
2. İzinler kartı API'deki verilenlerle uyuşur.
3. Başnazım bir izni kaldırır -> yenilemede menü öğesi kaybolur.
4. İzinsiz rota (`/izin-gruplari`) -> 06.

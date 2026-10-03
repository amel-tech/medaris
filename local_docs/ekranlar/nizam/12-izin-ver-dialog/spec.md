# 12 - İzin ver (dialog)

Kaynak: local_docs/ekranlar/nizam/12-izin-ver-dialog/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Bir Medaris nazımına izin verme/izinlerini düzenleme penceresi: hazır grup + tek tek izinler + bitiş tarihi.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: 11 üzerinde `Dialog`+`Form` (_kurallar.md 11, 15, 17).
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- Başlık "İzinleri düzenle"; kişi kartı (ad, e-posta, "Medaris nazımı · Veren: ... · tarih").
- "Hazır izin grubu" seçimi (Grup yok, Köşk işleri, Denetim, Yayın ve bağlantılar, Ders denetimi); "İzin gruplarını düzenle" bağlantısı (13). Not: grubun izinleri işaretli ve kaldırılamaz, ek izin seçilebilir. Ders denetimi grubu ayrıca verilmişse bilgi notu.
- İzinler: Köşkler (4), Medreseler (3), Talepler ve desteler (3), Yasak ve cihaz (2), Denetim ve ayarlar (4) — her izin için başlık, yardım metni, "Gruptan gelir." rozeti; "Platformdan yasakla" izni için verilme zamanı.
- Cihaz kısıtlaması notu. "Bitiş tarihi (isteğe bağlı)" + uyarı (atama bitişinden sonrasına izin verilmez). Alt not: "Aldığı izni başkasına veremez..."; özet "Gruptan 4 izin ve 3 ek izin"; Vazgeç/Kaydet.

## 3. Durumlar
- Yükleniyor: iskelet (Skeleton) satırları/kartları.
- Boş: ilgili EmptyState (kısa metin, uydurma yok).
- Hata: Alert + Tekrar dene; 5xx'de toast (uyarı/hata timeout 0, _kurallar.md madde 21).
- Yetkisiz: 403 -> 06 ekranı ("Bu bölüm için izniniz yok"); oturum yok -> middleware girişe yönlendirir (apps/nizam/middleware.ts).
- Form doğrulama: bitiş tarihi gelecekte ve atama bitişinden önce/eşit; seçimsiz kaydetmede "en az bir izin" kuralı doğrulanamadı (tuvalde yok).

## 4. Etkileşimler
- Grup seç -> grubun izinleri işaretlenir ve kilitlenir.
- Tek izin işaretle/kaldır (gruptan gelenler kaldırılamaz).
- Kaydet -> PUT, pencere kapanır, 11 satırı güncellenir. Vazgeç kapatır.
- İzin gruplarını düzenle -> 13.

## 5. API
- YOK — yeni endpoint: `PUT /nizam/medaris-nazims/:userId/grants` `{ groupId?, permissions[], expiresAt? }`; `GET /nizam/permissions` (izin kataloğu: kod, ad, yardım, kapsam); `GET /nizam/permission-groups` (13).
- Doğrulama: bitiş ≤ vericinin atama bitişi; veren izni olmayanı veremez. Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**B** - İzin kataloğu, atama ve doğrulama sıfırdan yazılır; üçüncü parti yok.

## 7. Mevcut durum
YOK.

## 8. Kabul kriterleri
1. Grup seçimi grubun izinlerini işaretleyip kilitler; "Grup yok" kilidi kaldırır.
2. Özet satırı (Gruptan N izin ve M ek izin) sayıları doğru verir.
3. Bitiş tarihi atama bitişinden sonra olamaz; hata gösterilir.
4. Kaydedilen izinler 11'de ve veren/tarih alanlarında görünür.
5. Kaydetme denetim kaydına yazılır.
6. Perdeyle kapanmaz.

## 9. Test senaryoları
**Unit (Vitest)**
- grup izinleri birleştirme (gruptan + ek).
- özet metin sayıları.
- bitiş tarihi doğrulaması.

**Playwright e2e (gerçek API'ye karşı)**
1. Medaris nazımı ata: grup + ek izin + bitiş -> 11'de görünür.
2. Kayıtlı kişiyi yeniden aç -> değerler yüklenir.
3. Geçersiz bitiş -> hata.
4. Denetim kaydında "İzin verme" satırı (17).

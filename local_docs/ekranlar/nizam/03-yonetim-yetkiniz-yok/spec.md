# 03 - Yönetim yetkiniz yok

Kaynak: local_docs/ekranlar/nizam/03-yonetim-yetkiniz-yok/ekran.txt + ekran.png (Faz 2 şartname, salt okuma).

## 1. Amaç ve rota
Nizam'a giren ancak hiçbir yönetim görevi olmayan hesap (örn. talebe) için tam sayfa bilgi ekranı; menü yok.
- Nx projesi: `nizam-web` (apps/nizam).
- Rota: öneri `apps/nizam/app/[locale]/yetki-yok/page.tsx`; rol çözümü "görev yok" ise `/` buraya yönlendirir.
- Mevcut kabuk: apps/nizam/components/layout/app-sidebar.tsx (kenar menüde yalnız Decks ve Köşkler var, nav-routes.ts), apps/nizam/app/home/page.tsx (yalnız selamlama metni)

## 2. Gösterim
- AppBar: Logo "Medaris NİZAM", sağda kullanıcı ("Zeynep Betül Karahanlı · Talebe") ve ayarlar. Kenar menü yok.
- Başlık "Yönetim yetkiniz yok"; metin: "Nizam, Medaris'i ve köşkleri yönetenlerin uygulamasıdır. Bu hesaba bir yönetim görevi verilmemiş."
- "Giriş yaptığınız hesap: {e-posta}"; buton "Tedris'e dön".

## 3. Durumlar
- Yükleniyor: rol çözülürken tam sayfa iskelet (kısa).
- Hata: rol çözümü başarısızsa Alert + Tekrar dene.
- Yetkisiz: bu ekranın kendisi.
- Form yok.


## 4. Etkileşimler
- Tedris'e dön -> Tedris uygulamasının kök adresi (`apps/tedris`; adres ortam değişkeninden, doğrulanamadı).
- Kullanıcı menüsünden çıkış yapılabilir.

## 5. API
- Yeni veri gerekmez: e-posta ve ad oturumdan (`useSession`, apps/nizam/components/layout/app-sidebar.tsx) gelir.
- Görev yok kararı için `GET /me/roles` YOK (yeni endpoint) — bkz. 01/04; bugün yalnız `isSystemAdmin` JWT rolünden okunur (libs/common/src/authz/authz.service.ts:73). Rol/izin modeli backend'de yok: auth-matrix.ts yalnız SYSTEM_ADMIN realm rolünü ve kosk/course/madrasah varlık rollerini bilir (libs/common/src/authz/scopes.ts:77, auth-matrix.ts:102-139); 'Medaris başnazımı', 'Medaris nazımı', izin grubu, bitiş tarihi kavramları YOK (doğrulandı: apps/tedrisat/src/database/schema altında yalnız course, kosk, flashcard* tabloları).

## 6. Sınıf
**A** - Statik ekran; yalnız oturum bilgisi ve yönlendirme gerekir. Görev tespiti 01'in rol endpoint'ine bağlıdır, bu ekranın kendi API'si yoktur.

## 7. Mevcut durum
YOK: sayfa ve yönlendirme yok; oturum bileşenleri (`nav-user.tsx`, `login.tsx`) mevcut.

## 8. Kabul kriterleri
1. Hiçbir görevi olmayan hesap `/` açınca bu ekranı görür, menü görünmez.
2. Gösterilen e-posta oturumdaki e-postadır.
3. "Tedris'e dön" Tedris köküne gider.
4. Başlık sayfa <title>'ında ve h1'de aynıdır; odak h1'e düşer.
5. Oturumsuz erişimde girişe yönlendirilir.

## 9. Test senaryoları
**Unit (Vitest)**
- rol listesi boş -> bu bileşen seçilir.
- e-posta ve rol etiketi render'ı.

**Playwright e2e (gerçek API'ye karşı)**
1. Talebe hesabıyla giriş, Nizam'a git -> ekran ve e-posta doğrulanır.
2. "Tedris'e dön" tıklanır, URL Tedris'e değişir.
3. Çıkış yapıp tekrar `/` -> girişe yönlenir.

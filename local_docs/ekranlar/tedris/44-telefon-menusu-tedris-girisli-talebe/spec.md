# 44 — Telefon menüsü — Tedris, girişli talebe

Kaynak: `local_docs/ekranlar/tedris/44-telefon-menusu-tedris-girisli-talebe/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `libs/ui` Sheet/Dialog bileşeni + `apps/tedris/components/header/header.tsx` (mevcut: header.tsx, user-header-menu.tsx; mobil çekmece doğrulanamadı).

## 2. Gösterim

- Telefon menüsü (390 px): kural 18 — Dialog tabanlı çekmece; Popup.mds-sheet aria-label='Ana menu', gövde/başlık/ayak; 'Çıkış yap' çekmecede yok.
- Karşılama: 'Selâmün aleyküm, Zeynep'; 'Sıradaki celsen öbür gün, Cumartesi 21:00'de.'
- 'Sıradaki celse' kartı: 'CANLI DERS' rozeti, 'Öbür gün', ders adı·Hafta·Köşk, celse başlığı, tarih/saat/süre, 'Toplantı bağlantısı henüz eklenmedi.', 'Celse sayfası', 'Takvime ekle'.
- 'Sonraki celseler' listesi (+'Programım' bağlantısı) satırları.
- Menü: Ana sayfa, Keşfet, Derslerim, Programım, Desteler; ayak: kullanıcı satırı (avatar ZK, 'Zeynep Betül Karahanlı · Talebe', Hesabım).


## 3. Durumlar

- Celse yok: karşılama metni değişir (tuvalde yok — doğrulanamadı).
- Yükleniyor: kart iskeleti.
- ≥768 px'te çekmece kapanır (kontrollü open).

## 4. Etkileşimler

- Menü öğesi: sayfaya gider ve çekmeceyi kapatır.
- 'Celse sayfası': ekran 15 (celse sayfası); 'Takvime ekle': ekran 22 menüsü.
- Kullanıcı satırı: Hesap (ekran 34/43).

## 5. API

- Sıradaki/sonraki celseler: `GET courses/enrolled` — apps/tedrisat/src/course/course.controller.ts:79 yalnız ders özeti döner (haftalar/celseler YOK, EnrolledCourseResponse: weekCount/lessonCount); celse tarihleri `GET courses/:id` — apps/tedrisat/src/course/course.controller.ts:92 içinde (lessons.scheduledAt). Bu yüzden ders başına çağrı gerekir.
- YOK — yeni endpoint (21/15 ekranlarıyla ortak, orada tanımlıysa yeniden yazılmaz): `GET /me/upcoming-lessons?limit=` → {lessonId, courseId, courseTitle, koskName, weekNumber, scheduledAt, durationMin, meetingUrl|null}. Kullanıcı adı/rol rozeti: oturum token'ı (apps/tedris/lib/auth_options.ts).

## 6. Sınıf

**B** — Çekmece iskeleti frontend; 'Sıradaki celse' için toplu uç yok (`courses/enrolled` celse döndürmez) → ekran 15/21 ile ortak `GET /me/upcoming-lessons` yazılarak kodlanır. Üçüncü parti yok.

## 7. Mevcut durum

Kısmen: header.tsx/user-header-menu.tsx masaüstü dropdown menüsü var; mobil çekmece, celse kartı, 'Sonraki celseler' yok.

## 8. Kabul kriterleri

1. 390 px'te hamburger tıklanınca çekmece açılır, odak başlıktaki kapat düğmesine gider.
2. Çekmece: logo+kapat, nav (5 öğe), ayak kullanıcı satırı sırasıyla; 'Çıkış yap' yok.
3. Sıradaki celse kartı en yakın gelecek celseyi gösterir; link yoksa 'Toplantı bağlantısı henüz eklenmedi.'
4. Menü öğesine tıklayınca çekmece kapanır.
5. ≥768 px'e geçilince çekmece kapanır.

## 9. Test senaryoları

- Unit: çekmece open/kapanış; sıradaki celse seçimi (en yakın gelecek); karşılama metni.
- E2E (viewport 390x844): giriş → hamburger → çekmece öğeleri → 'Programım' → /programim ve çekmece kapalı; 1024 px'e genişlet → çekmece yok.

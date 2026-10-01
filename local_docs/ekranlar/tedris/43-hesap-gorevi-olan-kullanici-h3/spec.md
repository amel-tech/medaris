# 43 — Hesap — görevi olan kullanıcı (H3)

Kaynak: `local_docs/ekranlar/tedris/43-hesap-gorevi-olan-kullanici-h3/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/account` (ekran 34 ile aynı sayfa; görevleri varsa üstte 'Görevlerin ve izinlerin' bölümü). Mevcut sayfa yok.

## 2. Gösterim

- Ekran 34'ün tamamı + 'Görevlerin ve izinlerin' bölümü: bilgi metni (köşk nazımı Nizam'da, müderris Nazır'da yapılır).
- 'Görevlerin' tablosu: Görev | Kapsam (köşk/ders; rozet Yayında/Taslak/Gizli) | Atayan (ad + tarih; 'Kendin') | Süre (Süresiz) | İşlemler ('Nizam'da aç' / 'Nazır'da aç', aria açıklamalı).
- 'Etkin izinlerin' bölümü: kapsama göre (ör. 'Nûruosmaniye Köşkü · köşk nazımı', 'Müderris') izin cümleleri listesi, ek notlar (denetim kaydı vb.), 'varsayılan izinleri' açıklaması.
- Takvim bölümü metni görev kapsamını da içerir ('öğrettiğin ve yönettiğin').
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Görevi olmayan kullanıcı: bölüm hiç gösterilmez (ekran 34).
- Yükleniyor/hata: bölüm içi iskelet/SystemState.
- Boş izin: bölüm gizlenir.

## 4. Etkileşimler

- 'Nizam'da aç' / 'Nazır'da aç': ilgili uygulamada köşk/ders yönetimi sayfasına yeni sekme (hedef URL'ler env'den; doğrulanamadı).
- Diğer eylemler ekran 34 ile aynı.

## 5. API

- YOK — yeni endpoint: `GET /me/assignments` (görev, kapsam türü/id, atayan, tarih, süre) ve `GET /me/effective-permissions` (kapsama göre izin kodları → metin eşlemesi istemcide). Backend'de görev/izin modeli yok: teskilat'ta yalnız health/root (apps/teskilat/src/app.controller.ts:11,26); tedrisat yalnız `TedrisatRoleResolver` içeriyor (apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts; içeriği doğrulanamadı).
- Profil uçları ekran 34 ile ortak (YOK, bkz. 34).

## 6. Sınıf

**B** — B: görev/izin okuma uçları teskilat'ta yazılarak kodlanabilir; ancak izin kataloğu, görev atama modeli ve diğer ekranların bağımlılığı büyük — kapsam doğrulanmadı (MDRS-43 authz çalışmasıyla örtüşebilir).

## 7. Mevcut durum

Yok.

## 8. Kabul kriterleri

1. Görevi olan kullanıcıda 'Görevlerin ve izinlerin' bölümü görünür, olmayanda görünmez.
2. Görev tablosu kapsam, atayan, tarih, süre ve rozetleri sunucudan gelen veriyle gösterir.
3. 'Nizam'da aç' doğru köşk kapsamıyla yeni sekmede açılır.
4. İzin cümleleri yalnız kullanıcının gerçek izinlerinden üretilir.
5. Ekran 34 işlevleri aynen çalışır.

## 9. Test senaryoları

- Unit: izin kodu→cümle eşlemesi; görev satırı bileşeni.
- E2E: köşk nazımı/müderris seed'li kullanıcı → Hesabım → görev tablosu satır sayısı = atama sayısı → 'Nizam'da aç' yeni sekme URL'si köşk id'sini içerir.

# 05 — Medrese nazırları

Kaynak: `local_docs/ekranlar/nazir/05-medrese-nazirlari/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/nazirlar/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Medrese nazırları' + açıklama ('...yalnız sizin ya da izinli bir Medaris nazımının verdiği izinlerle çalışır ve aldıkları izni başkasına veremez.'); birincil düğme 'Medrese nazırı ata'.
- Uyarı bandı: 'Abdullah Talha Erzurumluoğlu henüz izin almadı — Fatma Zehra Çelebioğlu 30 Eylül’de atadı. Siz izin verene kadar hiçbir işlem yapamaz.'
- Tablo 'Süleymaniye Medresesi nazırları': Nazır (monogram, ad, e-posta), İzinler ve gruplar (grup çipleri + 'Ayrıca N izin: …' ya da 'İzin yok / Atayan: … · tarih'), Bitiş ('Süresiz' / tarih / '—'), Veren (ad + tarih), İşlemler: 'İzinleri düzenle' (izni olmayanda 'İzin ver') ve 'Görevden al'.
- 'İzin grupları' bölümü: 'Grup tanımla' düğmesi; grup kartları (ad, izin özeti, '{n} izin · {m} nazıra verildi', 'Düzenle'); not 'Gruplar yalnız bu medresede ve medrese derslerinde geçerlidir.'

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.
- 'Henüz izin almamış nazır' uyarısı yalnız böyle bir nazır varsa görünür.
- Atama diyaloğu doğrulaması: kullanıcı e-postayla tam eşleşmeli (kural 22: Combobox, tam eşleşme); bulunamayınca mesaj tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- 'Medrese nazırı ata' → e-postayla kullanıcı seç (arama denetim kaydına yazılır) → nazır izinsiz atanır (uyarı bandı çıkar).
- 'İzinleri düzenle' / 'İzin ver' → 06.
- 'Görevden al' → 15.
- 'Grup tanımla' → 16 (oluştur); 'Düzenle' → 16 (düzenle).

## 5. API

- YOK — yeni endpoint: `GET /madrasahs/:id/nazirs`, `POST /madrasahs/:id/nazirs` {email}, `DELETE /madrasahs/:id/nazirs/:userId` (15), `GET|POST|PATCH|DELETE /madrasahs/:id/permission-groups`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Kapsam sabitleri yalnız yetki vokabülerini taşır: `INVITE_NAZIR`, `REMOVE_NAZIR` — `libs/common/src/authz/scopes.ts:71-72`; matris `libs/common/src/authz/auth-matrix.ts:125-137`. Bunlar izin-grubu modelinin yerine geçmez.
- Kullanıcı arama: backend'de kullanıcı dizini/tablosu YOK (sürücü yalnız `userId` uuid ve enrollments içinde `studentName/studentEmail` saklıyor — `apps/tedrisat/src/database/schema/course.schema.ts` enrollments). E-postayla arama için ya (a) girişte doldurulan yeni `users` tablosu ya da (b) Keycloak admin API (realm/servis hesabı yapılandırması, insan işi) gerekir; hangisi seçilecek DOĞRULANAMADI. (a) ile kodlanırsa B kalır.

## 6. Sınıf

**B** — Nazır, izin ve izin grubu modeli backend'de yok; yeni tablolar (nazır ataması, izin, grup, denetim) ve uçlar gerekir. E-posta ile kullanıcı arama için kullanıcı dizini yok (aşağıda). Yazılabilir → B; arama kaynağı kararı açık risk.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Liste nazırları, verilen izin gruplarını, ek izin sayısını, bitiş tarihini ve vereni doğru gösterir.
2. 'İzin yok' nazırda satır 'İzin ver' düğmesi taşır.
3. Atama yeni nazırı 'izinsiz' ekler; uyarı bandı görünür.
4. Bitiş tarihi geçen izin sunucuda düşer ve satır yenilenince yansır.
5. Nazır, kendi izninin dışında/aldığı izni başkasına veremez (sunucu 403).

## 9. Test senaryoları

- Unit: izin özeti üretimi ('Ayrıca N izin').
- Playwright: başmüderris → nazır ata (e-posta) → satır görünür + uyarı bandı → 'İzin ver' ile grup seç → satırda grup çipi.
- Playwright: izinsiz nazır liste uçlarını 403 alır.

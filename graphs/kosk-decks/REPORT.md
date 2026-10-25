# kosk-decks: yakalama raporu (ce47fce8)

## Akışlar ve alan
Hepsi `delurio page --strict` ile temiz; `delurio check graphs/kosk-decks --strict` çıkış 0.
- `kosk-apply` (tedris/37): 6 durum, 59 yapılandırma, 4/4
- `kosk-application-review` (nizam/15 ve 10): 12, 2064, 5/5
- `kosk-lifecycle` (nizam/20, 24, 09, 21): 13, 2435, 5/5
- `kosk-grants` (nizam/38): 10, 2482, 5/5
- `kosk-decks` (nizam/30, 35, kart tablosu): 14, 3814, 5/5
- `deck-authoring` (tedris/27, 29): 15, 1792, 5/5
- `deck-publish` (tedris/28): 9, 720, 4/4
- `deck-publish-review` (nizam/16): 14, 2952, 5/5
- `deck-browse` (tedris/31, 32): 12, 284, 5/5
- `flashcard-study` (tedris/30, 32): 10, 19548, 6/6
- `course-decks` (nazar deste, tedris ders sekmesi; #355–357 yeni): 18, 2576, 5/5
- `domain/domain.yaml`: 9 varlık, 82 eylem (12 denetleyicinin her rotası), 16 politika, 11 değişmez.

## Okumamın en zayıf olduğu yerler
- initialFocus vermeyen diyaloglarda odağı Base UI'ın "ilk sekmeli öğe" kuralından (kapat düğmesi) çıkardım. Toast rollerini (Base UI dialog/alertdialog, Sonner canlı bölge) tiplerden okudum, çalıştırmadım.
- Yasağın kayıt satırını değiştirmediğini yalnız ban modülünde aradım; başka bir modül değiştiriyorsa KD-1 zayıflar.
- Köşkü gizlemenin dersleri arşivlemediğini `kosk-admin.repository.ts:452`'den okudum. Pasif köşkün destelere etkisini modellemedim.
- Rolleri sayfa kodundan okudum, nizam menüsünden değil.

## Bulgular
- **KOSK-DECKS-1 [yüksek]** Yasaklı talebe dersin ve köşkün destelerini okumaya, Keşfet'te görmeye, çalışıp ilerleme yazmaya devam ediyor; `deckSharedWith` yasağa bakmıyor (`deck-sharing.ts:35`). Yol: shared, barred; REVEAL, RATE_HARD, DONE.
- **KOSK-DECKS-2 [orta]** Gizli köşkün (ve derslerinin) desteleri talebeye açık kalıyor; kapanış yalnız COURSE varlığında var (`tedrisat-role-resolver.service.ts:102`). Yol: koskHidden → front.
- **KOSK-DECKS-3 [orta]** Desteyi açmayan ders kadrosu kart ekleyebiliyor ama düzenleyemiyor ve silemiyor (404 CARD_NOT_FOUND, `flashcard.service.ts:86`); nazar düğmeleri herkese çiziyor. Yol: otherStaff; OPEN_DECK, EDIT_CARD, SAVE, FAIL.notFound.
- **KOSK-DECKS-4 [orta]** `DELETE /flashcard/decks/:id` yayındaki ders destesini siliyor; yalnız-taslak kuralı yalnız ders rotasında (`course-deck.service.ts:136`). Yol: kind=course; DELETE, CONFIRM, DONE.
- **KOSK-DECKS-5 [orta]** Taslak ders destesi yayın isteğiyle herkese açılabiliyor; inceleyen destenin türünü görmüyor. Yol: courseDraft; REQUEST, DONE, APPROVED.
- **KOSK-DECKS-6 [orta]** tedris köşk sayfası yalnız yayımlanmış köşk destelerini listeliyor (`kosk.repository.ts:295`). nizam'da açılan desteler özel doğduğu için sayfa "Bu köşkün henüz destesi yok" yazıyor.
- **KOSK-DECKS-7 [orta]** nizam/16 ilk isteği kendiliğinden seçiyor ve özel deste okumasını tıklamadan denetim kaydına yazıyor (`deck-requests-view.tsx:84,166`). Yol: DONE.
- **KOSK-DECKS-8 [orta]** Köşkte `course_nazir.assign_kosk` izni verilen ama nazım olmayan kişi rotayı geçiyor, serviste 403 alıyor (`kosk-grants.service.ts:76`). `deck.manage_kosk` ve `deck.propose_kosk` hiçbir rotada sorulmuyor. Yol: grantee → forbidden.
- **KOSK-DECKS-9 [düşük]** Köşk başvurudan açılınca başvurudaki alan aktarılmıyor; sayfadaki not "ad, alan ve açıklamayla" diyor (`present.ts:75`).
- **KOSK-DECKS-10 [düşük]** nizam/20 "Köşk nazımı ekle"yi `platform.kosk_nazim_manage` tutmayana da gösteriyor (`kosk-manage-page.tsx:555`). Yol: editor; ADD_NAZIM.
- **KOSK-DECKS-11 [düşük]** İlk 12'den sonraki öneride "Kabul et" boş form açıyor; öneri beklemede kalıyor (`yeni/page.tsx:54`). Yol: laterPage; ACCEPT, SUBMIT, DONE.
- **KOSK-DECKS-12 [düşük]** Medaris nazımının kendi isteğinde "Yayımla" görünüyor, API 403 dönüyor (`deck-review.service.ts:343`). Yol: publisher, ownDeck; DONE, PUBLISH.
- **KOSK-DECKS-13 [düşük]** Dört küçük açık:
  - Kabul edilen öneri önerene bildirilmiyor.
  - Köşk tablosunda "Köşk aç" yalnız başnazıma görünüyor; API `platform.kosk_create` tutana da izin veriyor.
  - Köşk ayarları gizli köşkte de "Köşkü gizle" gösteriyor.
  - Başnazımın kart tablosu düzenlenebilir görünüyor ama her yazım reddediliyor.
- **KOSK-DECKS-14 [düşük]** `flashcard_progress` kartlara yabancı anahtarla bağlı değil: silinen kart ve destenin ilerleme satırları kalıyor. Arayüz metni ise "ilerlemen silinecek" diyor.
- **KOSK-DECKS-15 [düşük]** Metin sorunları:
  - tedris deste diyaloglarında "Kapat" ve "Vazgeç" her dilde Türkçe.
  - nizam kart tablosunda "Kartvizit" ve "İthal Kartlar" gibi çeviri hataları var, hata bildirimleri ham sunucu mesajını gösteriyor.
  - Paylaşılan (herkese açık olmayan) desteye "herkese açık" deniyor.
  - `actions/index.ts:18` yorumu #348'den sonra eskimiş.

## Eski bulgular
- F06, F10, F14 (iki parçasıyla), F23, F24, F25 ve F34 aynen duruyor. Yollar:
  - F06: DONE, OPEN, SUBMIT, DONE, FAIL.answered
  - F10: DONE
  - F14: canCreate=false; DONE, OPEN
  - F23: otherNazim; EDIT_CARDS
  - F25: nazimOnly → forbidden
- F07 duruyor ve artık kart yazımını ve karta kopyalamayı da kapsıyor. Yol: published; EDIT, SAVE, DONE.
- F33 kısmen duruyor: reddedilen deste önce "Özele çek" ile özele dönüyor, sonra yeniden istenebiliyor; ret gerekçesi deste sayfasında görünmüyor.
- Eski "rol varsayılanı" riski çözüldü: köşk nazımı tüm ders kataloğunu verebiliyor, GRANT_EXCEEDS_GIVER ona hiç düşmüyor. Bu bir hata değil.

## delurio-graph/0'ın anlatamadıkları
- Aritmetik yok; tekrar takvimi 14 ayrı dal olarak yazıldı.
- `disabledIn` bir korumaya bağlanamıyor; devre dışı düğme için kopya düğüm gerekti.
- Toast bileşeni yok.
- Koruma tanımları `source` taşıyamıyor; kaynaklar yorum olarak yazıldı.
- Yalnız veri gösteren düğüm için katalogda çıplak `{name}` mesajı gerekti.
- İki uygulama tek akışta (`course-decks`: nazar ve tedris).
- Sayfalama ancak bağlam değişkeniyle anlatılabildi.
- "Bu izin bu sayfaya ulaşır" yalnız `never` ile söylenebiliyor.

## Kapsam
- **Kapsanan denetleyiciler:** kosk-application, nizam-kosk-applications, kosk (yaşam döngüsü ve deste bloğu), kosk-admin, kosk-grants, kosk-decks, nizam-deck-requests, flashcard-deck, flashcard, course-decks.
- **Kapsanan sayfalar:** tedris kosk-applications, decks/* ve study; nizam talepler, kosks/[id] (ayarlar, nazımlar, izinler, desteler) ve decks/[id]/cards; nazar ders/deste.
- **Yalnız alan dosyasında:** dizin, pano, ders listesi, takip rotaları ve etiket rotaları (etiket rotalarını hiçbir uygulama çağırmıyor).
- **Dışarıda bırakılan:** arşivden geri alma ve barındırma hakları (platform-admin alanı).
- **Cinsiyet:** alanda yüz yüze buluşma adımı yok; açık bulunmadı.

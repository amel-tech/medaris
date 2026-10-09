# Changelog

## [0.2.2](https://github.com/amel-tech/medaris/compare/nizam-web-v0.2.1...nizam-web-v0.2.2) (2026-10-09)


### Features

* **nazar-web, nizam-web, i18n:** let the başnazım run a medrese from nazar ([#266](https://github.com/amel-tech/medaris/issues/266)) ([848b58a](https://github.com/amel-tech/medaris/commit/848b58a9b6700b572fc7b517d33ba38894a85c6e))
* **nazar-web, tedrisat, i18n:** MDRS-270 appoint a ders nazırı, edit course settings ([#258](https://github.com/amel-tech/medaris/issues/258)) ([679f91a](https://github.com/amel-tech/medaris/commit/679f91ad8891d2001ca3aae703f4c239cb7dc242))
* **nizam-web:** MDRS-279 edit session kaynak and course resource links, show them in tedris ([#256](https://github.com/amel-tech/medaris/issues/256)) ([7ba47ca](https://github.com/amel-tech/medaris/commit/7ba47ca196d7ce5c8d8ff476b81d97f150273e43))
* **tedris-web:** MDRS-275 add a language menu to tedris and nizam, remembered in this browser ([#255](https://github.com/amel-tech/medaris/issues/255)) ([1775327](https://github.com/amel-tech/medaris/commit/17753275d556d13a222d4eeb790542d178623536))


### Bug Fixes

* **nizam-web:** MDRS-274 keep the app's language through Keycloak's login and register forms ([#253](https://github.com/amel-tech/medaris/issues/253)) ([de2c8b3](https://github.com/amel-tech/medaris/commit/de2c8b3130a5f777f22689e0a62d31350e9fb69f))
* **nizam-web:** MDRS-276 scroll an opened week into view and keep weeks open while editing ([#252](https://github.com/amel-tech/medaris/issues/252)) ([3829eec](https://github.com/amel-tech/medaris/commit/3829eec714925654dda099baf63b173b1d488f43))

## [0.2.1](https://github.com/amel-tech/medaris/compare/nizam-web-v0.2.0...nizam-web-v0.2.1) (2026-10-05)


### Features

* **common, tedrisat:** MDRS-135 permission catalogue, scope nesting and the permission engine ([#177](https://github.com/amel-tech/medaris/issues/177)) ([f2650b5](https://github.com/amel-tech/medaris/commit/f2650b5eef3d5cd99b6371191f07641caec53ac2))
* **landing-web, i18n:** MDRS-245 rewrite the landing home page around one story ([#200](https://github.com/amel-tech/medaris/issues/200)) ([84cf76d](https://github.com/amel-tech/medaris/commit/84cf76df53f4076c72b7dbcb9d3cd307098032dd))
* **nizam-web, landing-web, i18n:** MDRS-101 launch wave 2 in nizam, landing and the shared libs ([#120](https://github.com/amel-tech/medaris/issues/120)) ([5f0f694](https://github.com/amel-tech/medaris/commit/5f0f694c0251c7924492b7c4441958ab711ec030))
* **nizam-web, tedrisat:** MDRS-170 Medreseler, Medrese aç and hosting rights ([#146](https://github.com/amel-tech/medaris/issues/146)) ([8edb314](https://github.com/amel-tech/medaris/commit/8edb31419bac776486f87ec13304fa719fd14029))
* **nizam-web, tedrisat:** MDRS-171 Medaris nazims, grant permissions and permission groups ([#149](https://github.com/amel-tech/medaris/issues/149)) ([f6c5844](https://github.com/amel-tech/medaris/commit/f6c5844d7d2e388de480094c9bd5044bd4cdf7c5))
* **nizam-web, tedrisat:** MDRS-172 koesk grants, inactive scopes and head muderris hand-over ([#155](https://github.com/amel-tech/medaris/issues/155)) ([707e36c](https://github.com/amel-tech/medaris/commit/707e36c60252f3d859906ec6404a49e20e5b0979))
* **nizam-web, tedrisat:** MDRS-174 kosk management screens and admin endpoints ([#150](https://github.com/amel-tech/medaris/issues/150)) ([e8bd949](https://github.com/amel-tech/medaris/commit/e8bd949cc1348920b770ec877b1a9547534916c4))
* **nizam-web, tedrisat:** MDRS-175 köşk view, Dersler and the course overview ([#165](https://github.com/amel-tech/medaris/issues/165)) ([321eb7a](https://github.com/amel-tech/medaris/commit/321eb7a1465b117572972cd9e07319cef532e4df))
* **nizam-web, tedrisat:** MDRS-176 course, curriculum and session screens for nizam ([#169](https://github.com/amel-tech/medaris/issues/169)) ([a99bba6](https://github.com/amel-tech/medaris/commit/a99bba684db60374da56057ae8d476a292d9bbe3))
* **nizam-web, tedrisat:** MDRS-178 Yasaklamalar for Medaris administration and Talebeler Kayıtlı ([#161](https://github.com/amel-tech/medaris/issues/161)) ([1366bcf](https://github.com/amel-tech/medaris/commit/1366bcf972e49dbf2698f476f1ecc34fb0e3b3c8))
* **nizam-web, tedrisat:** MDRS-180 deck publish requests, köşk decks and open-a-deck ([#172](https://github.com/amel-tech/medaris/issues/172)) ([fdcad98](https://github.com/amel-tech/medaris/commit/fdcad989a0b2baea2c81bb9d1fd29a35d3db9b24))
* **nizam-web, tedrisat:** MDRS-181 kosk applications, platform policies, audit log, course requests ([#173](https://github.com/amel-tech/medaris/issues/173)) ([7217ea4](https://github.com/amel-tech/medaris/commit/7217ea4a81b3a0298bded8c1259c52105efb1e03))
* **nizam-web, tedrisat:** MDRS-182 chief nazim, kosk nazim and Medaris nazim dashboards ([#176](https://github.com/amel-tech/medaris/issues/176)) ([86de75e](https://github.com/amel-tech/medaris/commit/86de75ed653316f5572bdde8e3a296aad618b675))
* **nizam-web:** MDRS-168 Nizam shell, role menus, applications and students tabs ([#144](https://github.com/amel-tech/medaris/issues/144)) ([79f92c5](https://github.com/amel-tech/medaris/commit/79f92c558a137efc7f4eefc3c5a12448ab2db61a))
* **nizam-web:** MDRS-177 add the ban foundation: Yasaklamalar page and ban and lift dialogs ([#142](https://github.com/amel-tech/medaris/issues/142)) ([21827ef](https://github.com/amel-tech/medaris/commit/21827ef9463478d4e2035bbe2a6db568c535fb2e))
* **nizam-web:** MDRS-179 notifications and account pages with the unread bell ([#166](https://github.com/amel-tech/medaris/issues/166)) ([b7deaa0](https://github.com/amel-tech/medaris/commit/b7deaa0217b1263c6c8088491d0488fad49687e6))
* **tedris-web, tedrisat, ui:** bring tedris in line with the Tedris screens design ([#179](https://github.com/amel-tech/medaris/issues/179)) ([c1ebc07](https://github.com/amel-tech/medaris/commit/c1ebc077d1aeb0d38430a313b667c4079a94f454))
* **tedris-web:** MDRS-161 draw the course page in its five states ([#154](https://github.com/amel-tech/medaris/issues/154)) ([228a15b](https://github.com/amel-tech/medaris/commit/228a15bbbcb32ad24cebb27cf560f281550df80b))
* **tedrisat, common, nizam-web, tedris-web:** MDRS-134 role model v2 on top of launch wave 3 ([#129](https://github.com/amel-tech/medaris/issues/129)) ([d07d26d](https://github.com/amel-tech/medaris/commit/d07d26d0c375e0404cec8f96f55e4482942f4d8c))
* **tedrisat, common, tedris-web:** MDRS-122 open köşk, medrese and course pages to guests ([#127](https://github.com/amel-tech/medaris/issues/127)) ([28e68e5](https://github.com/amel-tech/medaris/commit/28e68e5eb701a91336702f7e9b28f6491b644613))
* **tedrisat, nizam-web, i18n:** MDRS-143 wire week.hide and the hidden-scope visibility ([#222](https://github.com/amel-tech/medaris/issues/222)) ([b98fbbe](https://github.com/amel-tech/medaris/commit/b98fbbe4c5a59b5b33756156e32ee66c36a129b6))
* **tedrisat, nizam-web, i18n:** MDRS-148 publish decks only through the basnazim ([#216](https://github.com/amel-tech/medaris/issues/216)) ([12c859a](https://github.com/amel-tech/medaris/commit/12c859aa1154d4b0d89dd8d2571fcbcddbfdeae0))
* **tedrisat, nizam-web, i18n:** MDRS-227 show what a passivation takes with it and ask first ([#229](https://github.com/amel-tech/medaris/issues/229)) ([58f608f](https://github.com/amel-tech/medaris/commit/58f608f002a126672f636ed57ce383c30ff40d0f))
* **tedrisat, nizam-web, tedris-web:** MDRS-105 course team on the matrix, müderris as accounts ([#125](https://github.com/amel-tech/medaris/issues/125)) ([5ceb93a](https://github.com/amel-tech/medaris/commit/5ceb93a73039c936743d83a939d89fb3f8eceb7b))
* **tedrisat, nizam-web, utils:** MDRS-111 validate and normalise meeting links ([#115](https://github.com/amel-tech/medaris/issues/115)) ([b5b56a3](https://github.com/amel-tech/medaris/commit/b5b56a3b1566c0fb339eef2724a5e236d9949a08))
* **tedrisat, nizam-web, utils:** MDRS-228 set a session's live stream link in nizam ([#190](https://github.com/amel-tech/medaris/issues/190)) ([b9d3ea5](https://github.com/amel-tech/medaris/commit/b9d3ea5cbe0d51c7d3806db525100fad3f383449))
* **tedrisat, nizam-web:** MDRS-108 list the köşks you manage, show only buttons you may press ([#126](https://github.com/amel-tech/medaris/issues/126)) ([2a8e53a](https://github.com/amel-tech/medaris/commit/2a8e53aee9b32c8a05d08c2a9036926baf872e0a))
* **tedrisat, nizam-web:** MDRS-173 add the archive foundation and the archive screens ([#140](https://github.com/amel-tech/medaris/issues/140)) ([28d998f](https://github.com/amel-tech/medaris/commit/28d998faaa8631104f1bc10ffdcbc86fc57b96a3))
* **tedrisat, tedris-web, nizam-web:** MDRS-110 lesson minutes and viewer time zones ([#114](https://github.com/amel-tech/medaris/issues/114)) ([d0a791a](https://github.com/amel-tech/medaris/commit/d0a791a4c63ae637dee53afa44657e0105630490))
* **tedrisat, tedris-web, nizam-web:** MDRS-169 assignment foundation and Nazir access screens ([#138](https://github.com/amel-tech/medaris/issues/138)) ([efd93c5](https://github.com/amel-tech/medaris/commit/efd93c5d18269df946835d3a5007c98166ba1fd8))
* **tedrisat, tedris-web, services, i18n:** MDRS-150 questions to the course staff and their answers ([#199](https://github.com/amel-tech/medaris/issues/199)) ([a93c90a](https://github.com/amel-tech/medaris/commit/a93c90a7a8790caa7e57753fb4e8ff5aa19029bb))
* **tedrisat:** MDRS-142 return effective permissions per scope on /me ([#217](https://github.com/amel-tech/medaris/issues/217)) ([3ce4840](https://github.com/amel-tech/medaris/commit/3ce48407388e429dcea762e42f2592dc0e6da5a5))


### Bug Fixes

* **nazir-web, nizam-web:** MDRS-215 drop the 4 Ekim permission gate ([#191](https://github.com/amel-tech/medaris/issues/191)) ([a507de7](https://github.com/amel-tech/medaris/commit/a507de7b49f44a3353c8bde5054a2923665a513e))
* **nizam-web, nazir-web, i18n:** MDRS-254 take an end date and time and compare the same instant ([#225](https://github.com/amel-tech/medaris/issues/225)) ([ca76a40](https://github.com/amel-tech/medaris/commit/ca76a4028768724fa96df366a1bbf9f219ad674e))
* **nizam-web, tedrisat:** MDRS-135 do not offer Onayla and Reddet in a passive medrese ([#227](https://github.com/amel-tech/medaris/issues/227)) ([46bed90](https://github.com/amel-tech/medaris/commit/46bed90c565f1e3230bb84c645a05fd46a8da07c))
* **nizam-web, tedrisat:** MDRS-137 enter the kosk page by hosting rights, and prove the revoke flow ([#214](https://github.com/amel-tech/medaris/issues/214)) ([ada42d6](https://github.com/amel-tech/medaris/commit/ada42d6506b3594d3aed8156021770e0188c4054))
* **nizam-web:** MDRS-211 hide unbuilt köşk pages and tell a missing page from no permission ([#181](https://github.com/amel-tech/medaris/issues/181)) ([e74e044](https://github.com/amel-tech/medaris/commit/e74e044d39c7271a1042b6f4081ee02ee3862715))
* **nizam-web:** MDRS-230 mark each route's html with its own lang and dir ([#193](https://github.com/amel-tech/medaris/issues/193)) ([5dd1001](https://github.com/amel-tech/medaris/commit/5dd10018add195d529e4213252c14fc56b1ed48f))
* **tedris-web, landing-web, ui:** MDRS-248 launch-flow test fixes ([#234](https://github.com/amel-tech/medaris/issues/234)) ([90a99bd](https://github.com/amel-tech/medaris/commit/90a99bd80bf7f5f8ce7fa0db8126709366840338))
* **tedris-web, nizam-web, nazir-web, services:** MDRS-210 sign out of every app at once ([#183](https://github.com/amel-tech/medaris/issues/183)) ([54700f2](https://github.com/amel-tech/medaris/commit/54700f2fef07fbfcd7327b04deef2469c3d344e6))
* **tedris-web, nizam-web, nazir-web, services:** MDRS-231 log a failed token refresh as a summary ([#194](https://github.com/amel-tech/medaris/issues/194)) ([901e515](https://github.com/amel-tech/medaris/commit/901e515e93b44297a2c051f311eed50c542d976f))
* **tedris-web, nizam-web, utils:** MDRS-248 link the privacy notice to the deployment's own landing ([#219](https://github.com/amel-tech/medaris/issues/219)) ([af14c0a](https://github.com/amel-tech/medaris/commit/af14c0ac0f02862370f326213d356d55f4385bc0))
* **tedris-web, nizam-web:** open tedris and nizam in Turkish, not by the browser's language ([#221](https://github.com/amel-tech/medaris/issues/221)) ([11081c4](https://github.com/amel-tech/medaris/commit/11081c45e4c9fe0cf23c6503d133dcd3a6773bf8))
* **tedrisat, nizam-web:** MDRS-95 keep lesson ids stable and refuse stale course saves ([#110](https://github.com/amel-tech/medaris/issues/110)) ([1488acd](https://github.com/amel-tech/medaris/commit/1488acd9bd19ee1ee7ca70e321a66dc708204a6c))
* **ui, tedris-web, nizam-web, nazir-web:** MDRS-214 close stale toasts on navigation ([#188](https://github.com/amel-tech/medaris/issues/188)) ([593acab](https://github.com/amel-tech/medaris/commit/593acab26431f82c953d1e6a6f4b1689a36f6381))
* **ui, tedris-web, nizam-web:** MDRS-242 give Base UI the route's direction ([#196](https://github.com/amel-tech/medaris/issues/196)) ([6946138](https://github.com/amel-tech/medaris/commit/694613854713fd8f4f28a1aa28974b5b20a9915f))

## [0.2.0](https://github.com/amel-tech/medaris/compare/nizam-web-v0.1.12...nizam-web-v0.2.0) (2026-09-28)


### ⚠ BREAKING CHANGES

* **repo:** the root check-types script is renamed to typecheck, and every package's check-types/type-check script is renamed with it. Use pnpm typecheck.
* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9))
* **repo:** merge madrasah-frontend history into medaris

### Features

* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9)) ([4eb2784](https://github.com/amel-tech/medaris/commit/4eb2784e70e852d9dc5e76693ba1bc0cedda9ad2))
* **repo:** MDRS-11 adopt Nx 23 for task orchestration and wire TS project references ([#11](https://github.com/amel-tech/medaris/issues/11)) ([68fcfe3](https://github.com/amel-tech/medaris/commit/68fcfe3826ab7f08ee5990078769f5ec6aba7fae))
* **repo:** MDRS-12 — adopt Biome, reduce ESLint to a boundaries-only shell ([#12](https://github.com/amel-tech/medaris/issues/12)) ([6bc1296](https://github.com/amel-tech/medaris/commit/6bc12966234dd44e50b79a6d236b005c5106e395))


### Bug Fixes

* **nizam-web:** MDRS-24 give NextAuth cookies an app-specific name ([bdc2dae](https://github.com/amel-tech/medaris/commit/bdc2daefa3554ba5c31662c410e64a50592372a6))
* **repo:** restore import ordering in the two auth_options files ([68faa44](https://github.com/amel-tech/medaris/commit/68faa4481f9b1b6a8256d92c90e259cccd739625))
* **repo:** restore import ordering in the two auth_options files ([ad3d05d](https://github.com/amel-tech/medaris/commit/ad3d05d4d426d56e1eca6643fdecdb0aa7795779))
* **tedris-web, nizam-web:** MDRS-28 let sign-out reach Keycloak and a failed refresh reach sign-in ([#72](https://github.com/amel-tech/medaris/issues/72)) ([4e97033](https://github.com/amel-tech/medaris/commit/4e970333bbe42ebdb0d29de2d17cb347bdd6c8ac))
* **tedris-web, nizam-web:** MDRS-28 rebuild the single PR on main, one commit per task ([#69](https://github.com/amel-tech/medaris/issues/69)) ([9cf36a8](https://github.com/amel-tech/medaris/commit/9cf36a8b2e44fd33169e668a8fe5892b53e36b5c))


### Miscellaneous Chores

* **repo:** merge madrasah-frontend history into medaris ([196ff8c](https://github.com/amel-tech/medaris/commit/196ff8c713dd6160f348d94d0a2baf06088faa06))

## [0.1.12](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.11...nizam-web-v0.1.12) (2026-06-18)


### Features

* **keycloak:** enable i18n on keycloak theme & small adjustments ([99a2fda](https://github.com/amel-tech/madrasah-frontend/commit/99a2fda911ad5e1863845a2a9d3bfb475c82b7c7))
* **nizam:** kurs formu doğrulamaları, türetilen süre ve haftayı kopyalama ([e210ae6](https://github.com/amel-tech/madrasah-frontend/commit/e210ae664abf62787dffcebddb24724cfd56ed4a))


### Bug Fixes

* **nizam:** yapısal değişikliklerde açık ders düzenleyiciyi sıfırla ([35aabab](https://github.com/amel-tech/madrasah-frontend/commit/35aababe4cea9a4ecc3cc0a49babe622ad04bb67))

## [0.1.11](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.10...nizam-web-v0.1.11) (2026-06-17)


### Features

* **card-memorization:** integrate flashcard progress to backend ([02e147c](https://github.com/amel-tech/madrasah-frontend/commit/02e147c5dbff7d621c466a47afc5e6f2ce95c9b2))
* **card-memorization:** integrate flashcard progress to backend ([8f601c5](https://github.com/amel-tech/madrasah-frontend/commit/8f601c5f3bfed4ab6cca60dcccf5ff22be4d02d5))
* **card-memorization:** make response return in standart data: [] structure ([7c57e28](https://github.com/amel-tech/madrasah-frontend/commit/7c57e281251c736dd1e28d6b5be4ce5dd6d94a05))
* **card-memorization:** remove a forgotten console.log ([45ff28f](https://github.com/amel-tech/madrasah-frontend/commit/45ff28f97af14557e2816d48be5b4de34e5f2c5b))
* **learning:** köşk & course learning surfaces + course management ([71cb203](https://github.com/amel-tech/madrasah-frontend/commit/71cb20309617a5b5b4976647dc2a8a48ec49aeb8))
* **learning:** köşk & course learning surfaces and course management ([6f8cdec](https://github.com/amel-tech/madrasah-frontend/commit/6f8cdec03412e7308ac096b598f317ca0fa1b118))
* **tedris,nizam:** continue-learning, my-courses, and enrollment approval UI ([3acab42](https://github.com/amel-tech/madrasah-frontend/commit/3acab42abfeff1d3f9ee250007dd9599f2320a57))
* **tedris,nizam:** live-session lesson pages and editor ([c2a4104](https://github.com/amel-tech/madrasah-frontend/commit/c2a4104d9363accf5bd6b0a3d41271efe1c136a7))

## [0.1.10](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.9...nizam-web-v0.1.10) (2026-05-13)


### Bug Fixes

* **deck-cards:** refresh router after successful file import ([6cbb564](https://github.com/amel-tech/madrasah-frontend/commit/6cbb564a9491651c70f6fa3475fb10a48c867d53))
* **deck-isPublic:** set isPublic=false and disable button via isLoading ([970e387](https://github.com/amel-tech/madrasah-frontend/commit/970e387d45c27736639122a9f23051ac6f1c61e5))

## [0.1.9](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.8...nizam-web-v0.1.9) (2026-03-02)


### Features

* **bulk-flashcard:** add import error dialog and improve error handling ([27e5fc9](https://github.com/amel-tech/madrasah-frontend/commit/27e5fc972edf77da29887fc42b68633aeb734446))
* **bulk-flashcard:** adding export cards ([4e41552](https://github.com/amel-tech/madrasah-frontend/commit/4e41552f078d31e404991937ef8dae03c655d0c8))
* **bulk-flashcard:** Refactor code structure for improved readability and maintainability ([80a1de7](https://github.com/amel-tech/madrasah-frontend/commit/80a1de7ca33c3a1bbfb7ddc0ee4754df284efc7e))


### Bug Fixes

* **bulk-flashcard:** fix deckId param and sync models with API spec ([90ee83d](https://github.com/amel-tech/madrasah-frontend/commit/90ee83dfe48526dd7d7d13c647e37ae609138a27))
* **deck-cards:** correct function name for fetching sample file ([b2947ab](https://github.com/amel-tech/madrasah-frontend/commit/b2947abca08591df5f24e52a6de8e45fe9d7545d))
* **deck-cards:** improve success message for card import and update i18n keys ([8fa12a6](https://github.com/amel-tech/madrasah-frontend/commit/8fa12a66b7f4179f36c85ebb17dfbdac34f31ff0))
* **errorBody:** authenticatedAction was used in the action ([c7e90e2](https://github.com/amel-tech/madrasah-frontend/commit/c7e90e2f1bd939029b661ce9edba249300cb9b71))

## [0.1.8](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.7...nizam-web-v0.1.8) (2026-01-23)


### Features

* **i18n:** add translations for nizam and tedris apps ([fa46adb](https://github.com/amel-tech/madrasah-frontend/commit/fa46adbd01dc13abbfdfe92a406d6957d67ac378))
* **i18n:** translated strings for all hard-coded strings ([7822a7a](https://github.com/amel-tech/madrasah-frontend/commit/7822a7a685cab1518e9ba9cefb8f9f110fd82b4b))
* **nizam:** implement course creation wizard ([d952ffd](https://github.com/amel-tech/madrasah-frontend/commit/d952ffda79c6e28754a67253dc4259593fcaf9e1))
* **nizam:** implement course creation wizard ([a5ce1d7](https://github.com/amel-tech/madrasah-frontend/commit/a5ce1d73968d855b79eb10f255592c4416e03bd5))

## [0.1.7](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.6...nizam-web-v0.1.7) (2025-12-06)


### Features

* added uthman font ([091232b](https://github.com/amel-tech/madrasah-frontend/commit/091232b88ac0ebf2a4ba9d7996a50aa573acd516))
* added uthman font ([fb7488e](https://github.com/amel-tech/madrasah-frontend/commit/fb7488e3291ca25b9b74260f77523a7a9d71d36f))
* **authentication:** add refresh token rotation ([efd21b6](https://github.com/amel-tech/madrasah-frontend/commit/efd21b6f53860bbb038e9fe5f4cf486d600e950d))
* **authentication:** add route protection and redirect if not authenticated ([5d08bea](https://github.com/amel-tech/madrasah-frontend/commit/5d08bea98f5edb588db7babbdc9358e8e68bf38a))
* **authentication:** simplify, session obtaining by a helper func ([71bc996](https://github.com/amel-tech/madrasah-frontend/commit/71bc996ad32c3e639599ab117f027d6d4d993d26))
* creating i18n package ([8664c1d](https://github.com/amel-tech/madrasah-frontend/commit/8664c1dba4bc9b691304696891a9c5eba1850d68))
* **i18n:** integrate NextIntlClientProvider into layout components ([17df792](https://github.com/amel-tech/madrasah-frontend/commit/17df7924e15a8803f7b5c9498791a261cac34f81))
* implementing next-intl package on nizam ([ebe3922](https://github.com/amel-tech/madrasah-frontend/commit/ebe392294eb9b51de3f07cf410d1630ff546347d))
* **nizam:** adding i18n local switcher ([cf8f72c](https://github.com/amel-tech/madrasah-frontend/commit/cf8f72cfa0efff66011fc716fcaae572c3f18e1c))


### Bug Fixes

* **authentication:** use session.accesToken instead of session-token, which was jwe token ([5d7d556](https://github.com/amel-tech/madrasah-frontend/commit/5d7d556b601793f51b5cc12e2c9d6e9aad0cbd74))
* **authentication:** use session.accesToken instead of session-token,… ([7d40a3f](https://github.com/amel-tech/madrasah-frontend/commit/7d40a3f1d55accd1e30dc963c26add318faaf58d))
* update local urls and expose new ports for nazar, nizam, and ted… ([5f6b16f](https://github.com/amel-tech/madrasah-frontend/commit/5f6b16f414151d72455e2be935cf64ec811e449a))
* update local urls and expose new ports for nazar, nizam, and tedris applications ([cd87b5f](https://github.com/amel-tech/madrasah-frontend/commit/cd87b5ff5e1a1491a1486324e20b2a8af89a0869))

## [0.1.6](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.5...nizam-web-v0.1.6) (2025-10-30)


### Features

* **flashcards:** change tedris flashcards edit screen to table ([ca15f63](https://github.com/amel-tech/madrasah-frontend/commit/ca15f6376dd4b8daf9c2532a2e24c7f4bf1a6dff))
* **flashcard:** turn create-deck action into dialog ([f383604](https://github.com/amel-tech/madrasah-frontend/commit/f383604588952240bb59870eadb5c0cb5ea34dbd))
* **nizam:** using the new editable columns ([0562fbc](https://github.com/amel-tech/madrasah-frontend/commit/0562fbc73df46812061d67b496de92327d916299))

## [0.1.5](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.4...nizam-web-v0.1.5) (2025-10-21)


### Bug Fixes

* revert-nizam-port-change ([ebc6af5](https://github.com/amel-tech/madrasah-frontend/commit/ebc6af5b396f59235396efbeb52cd825d6a2631a))
* revert-nizam-port-change ([0fb493d](https://github.com/amel-tech/madrasah-frontend/commit/0fb493de6d7203939b11ab5a69983a97a9021deb))

## [0.1.4](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.3...nizam-web-v0.1.4) (2025-10-16)


### Features

* **deck-cards:** implement deck cards management ([a75c6ff](https://github.com/amel-tech/madrasah-frontend/commit/a75c6ffecd0d84d45e1bd18d1eabe1a3cf654f64))
* **service:** replaced all the service functions ([671c781](https://github.com/amel-tech/madrasah-frontend/commit/671c78187b200088a6dbf9a17fdbfa75374ba3c2))

## [0.1.3](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.2...nizam-web-v0.1.3) (2025-09-24)


### Features

* openTelemetry integration completed ([1f4cd4e](https://github.com/amel-tech/madrasah-frontend/commit/1f4cd4eccb4df78ed262c88e397f2b6d272e62a9))
* openTelemetry integration completed ([04fb452](https://github.com/amel-tech/madrasah-frontend/commit/04fb45231c23969464e51960a8b45534a73a769c))
* pr updated ([e11123f](https://github.com/amel-tech/madrasah-frontend/commit/e11123fdbd15f2d63eb85fc28151d22180aee521))

## [0.1.2](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.1...nizam-web-v0.1.2) (2025-09-18)


### Features

* **flashcard:** use msw on dashboard, and card pages ([4379ca3](https://github.com/amel-tech/madrasah-frontend/commit/4379ca39e730c27e806bbca0f80f376ce8a8474e))

## [0.1.1](https://github.com/amel-tech/madrasah-frontend/compare/nizam-web-v0.1.0...nizam-web-v0.1.1) (2025-08-23)


### Features

* initialize Nizam app with Next.js and Tailwind CSS ([8feba26](https://github.com/amel-tech/madrasah-frontend/commit/8feba267238c45dd4285ed62ef32ba522fe1f251))
* **nazir:** initialize nazir Next.js application ([fbadb9c](https://github.com/amel-tech/madrasah-frontend/commit/fbadb9c5ff40498fbd7cb91c0c3d35161105e545))
* **nizam:** add global styles and configure Tailwind CSS ([b085552](https://github.com/amel-tech/madrasah-frontend/commit/b085552af027115e0861ccb92059bb9a26358dec))

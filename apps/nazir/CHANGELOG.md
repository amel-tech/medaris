# Changelog

## [0.2.1](https://github.com/amel-tech/medaris/compare/nazir-web-v0.2.0...nazir-web-v0.2.1) (2026-10-05)


### Features

* **common, tedrisat:** MDRS-135 permission catalogue, scope nesting and the permission engine ([#177](https://github.com/amel-tech/medaris/issues/177)) ([f2650b5](https://github.com/amel-tech/medaris/commit/f2650b5eef3d5cd99b6371191f07641caec53ac2))
* **landing-web, i18n:** MDRS-245 rewrite the landing home page around one story ([#200](https://github.com/amel-tech/medaris/issues/200)) ([84cf76d](https://github.com/amel-tech/medaris/commit/84cf76df53f4076c72b7dbcb9d3cd307098032dd))
* **nazir-web, i18n:** MDRS-247 build the Celseler and Talebeler screens of the course scope ([#201](https://github.com/amel-tech/medaris/issues/201)) ([952d82c](https://github.com/amel-tech/medaris/commit/952d82c16703dd34b827831f23491ad71e733c54))
* **nazir-web, i18n:** MDRS-247 gate the course pages and buttons by what the caller holds ([#204](https://github.com/amel-tech/medaris/issues/204)) ([04588e0](https://github.com/amel-tech/medaris/commit/04588e0e8e629891a0fe01137fb7b58660497bc0))
* **nazir-web, tedrisat, services, i18n:** MDRS-247 build the Müfredat and Ders kayıtları screens ([#202](https://github.com/amel-tech/medaris/issues/202)) ([8f31186](https://github.com/amel-tech/medaris/commit/8f31186ba2a0170b29cc35c50f28d54bf08c781b))
* **nazir-web:** MDRS-183 ship the Nazır shell with access gate, scope picker and account page (2/2) ([#153](https://github.com/amel-tech/medaris/issues/153)) ([9befe90](https://github.com/amel-tech/medaris/commit/9befe90e49fce1c9c8e6d7ebe0a7a3b7c99d67c6))
* **nazir-web:** MDRS-184 ship the Nazır medrese settings and nazır management screens ([#160](https://github.com/amel-tech/medaris/issues/160)) ([7f51a9c](https://github.com/amel-tech/medaris/commit/7f51a9c8fe5bbd3ddb2f360f4e57cc3ec161476d))
* **nazir-web:** MDRS-185 ship the Nazır permission editing, permission group and archive screens ([#167](https://github.com/amel-tech/medaris/issues/167)) ([7f3471c](https://github.com/amel-tech/medaris/commit/7f3471c62247fd01ca9146a4d723fddbd3c98d3b))
* **nazir-web:** MDRS-186 ship the Nazır courses, open-course and müderris screens ([#168](https://github.com/amel-tech/medaris/issues/168)) ([342cbb6](https://github.com/amel-tech/medaris/commit/342cbb63be3d4bf43527b0a84e85b08051ce7af2))
* **nazir-web:** MDRS-187 ship the Nazır students, bans, offsite request and dashboard screens (2/2) ([#171](https://github.com/amel-tech/medaris/issues/171)) ([cd36d70](https://github.com/amel-tech/medaris/commit/cd36d70687fcfa08b09535f05a4d344de8915d26))
* **tedrisat, nizam-web, i18n:** MDRS-143 wire week.hide and the hidden-scope visibility ([#222](https://github.com/amel-tech/medaris/issues/222)) ([b98fbbe](https://github.com/amel-tech/medaris/commit/b98fbbe4c5a59b5b33756156e32ee66c36a129b6))
* **tedrisat, tedris-web, services, i18n:** MDRS-150 questions to the course staff and their answers ([#199](https://github.com/amel-tech/medaris/issues/199)) ([a93c90a](https://github.com/amel-tech/medaris/commit/a93c90a7a8790caa7e57753fb4e8ff5aa19029bb))


### Bug Fixes

* **nazir-web, nizam-web:** MDRS-215 drop the 4 Ekim permission gate ([#191](https://github.com/amel-tech/medaris/issues/191)) ([a507de7](https://github.com/amel-tech/medaris/commit/a507de7b49f44a3353c8bde5054a2923665a513e))
* **nizam-web, nazir-web, i18n:** MDRS-254 take an end date and time and compare the same instant ([#225](https://github.com/amel-tech/medaris/issues/225)) ([ca76a40](https://github.com/amel-tech/medaris/commit/ca76a4028768724fa96df366a1bbf9f219ad674e))
* **tedris-web, landing-web, ui:** MDRS-248 launch-flow test fixes ([#234](https://github.com/amel-tech/medaris/issues/234)) ([90a99bd](https://github.com/amel-tech/medaris/commit/90a99bd80bf7f5f8ce7fa0db8126709366840338))
* **tedris-web, nizam-web, nazir-web, services:** MDRS-210 sign out of every app at once ([#183](https://github.com/amel-tech/medaris/issues/183)) ([54700f2](https://github.com/amel-tech/medaris/commit/54700f2fef07fbfcd7327b04deef2469c3d344e6))
* **tedris-web, nizam-web, nazir-web, services:** MDRS-231 log a failed token refresh as a summary ([#194](https://github.com/amel-tech/medaris/issues/194)) ([901e515](https://github.com/amel-tech/medaris/commit/901e515e93b44297a2c051f311eed50c542d976f))
* **ui, tedris-web, nizam-web, nazir-web:** MDRS-214 close stale toasts on navigation ([#188](https://github.com/amel-tech/medaris/issues/188)) ([593acab](https://github.com/amel-tech/medaris/commit/593acab26431f82c953d1e6a6f4b1689a36f6381))

## [0.2.0](https://github.com/amel-tech/medaris/compare/nazir-web-v0.1.6...nazir-web-v0.2.0) (2026-09-28)


### ⚠ BREAKING CHANGES

* **repo:** the root check-types script is renamed to typecheck, and every package's check-types/type-check script is renamed with it. Use pnpm typecheck.
* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9))
* **repo:** merge madrasah-frontend history into medaris

### Features

* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9)) ([4eb2784](https://github.com/amel-tech/medaris/commit/4eb2784e70e852d9dc5e76693ba1bc0cedda9ad2))
* **repo:** MDRS-11 adopt Nx 23 for task orchestration and wire TS project references ([#11](https://github.com/amel-tech/medaris/issues/11)) ([68fcfe3](https://github.com/amel-tech/medaris/commit/68fcfe3826ab7f08ee5990078769f5ec6aba7fae))
* **repo:** MDRS-12 — adopt Biome, reduce ESLint to a boundaries-only shell ([#12](https://github.com/amel-tech/medaris/issues/12)) ([6bc1296](https://github.com/amel-tech/medaris/commit/6bc12966234dd44e50b79a6d236b005c5106e395))


### Miscellaneous Chores

* **repo:** merge madrasah-frontend history into medaris ([196ff8c](https://github.com/amel-tech/medaris/commit/196ff8c713dd6160f348d94d0a2baf06088faa06))

## [0.1.6](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.5...nazir-web-v0.1.6) (2026-06-18)


### Features

* **card-memorization:** integrate flashcard progress to backend ([8f601c5](https://github.com/amel-tech/madrasah-frontend/commit/8f601c5f3bfed4ab6cca60dcccf5ff22be4d02d5))
* **card-memorization:** make response return in standart data: [] structure ([7c57e28](https://github.com/amel-tech/madrasah-frontend/commit/7c57e281251c736dd1e28d6b5be4ce5dd6d94a05))

## [0.1.5](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.4...nazir-web-v0.1.5) (2026-02-05)


### Features

* **i18n:** add translations for nizam and tedris apps ([fa46adb](https://github.com/amel-tech/madrasah-frontend/commit/fa46adbd01dc13abbfdfe92a406d6957d67ac378))

## [0.1.4](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.3...nazir-web-v0.1.4) (2025-12-06)


### Features

* added uthman font ([091232b](https://github.com/amel-tech/madrasah-frontend/commit/091232b88ac0ebf2a4ba9d7996a50aa573acd516))
* added uthman font ([fb7488e](https://github.com/amel-tech/madrasah-frontend/commit/fb7488e3291ca25b9b74260f77523a7a9d71d36f))


### Bug Fixes

* update local urls and expose new ports for nazar, nizam, and ted… ([5f6b16f](https://github.com/amel-tech/madrasah-frontend/commit/5f6b16f414151d72455e2be935cf64ec811e449a))
* update local urls and expose new ports for nazar, nizam, and tedris applications ([cd87b5f](https://github.com/amel-tech/madrasah-frontend/commit/cd87b5ff5e1a1491a1486324e20b2a8af89a0869))

## [0.1.3](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.2...nazir-web-v0.1.3) (2025-10-16)


### Features

* openTelemetry integration completed ([1f4cd4e](https://github.com/amel-tech/madrasah-frontend/commit/1f4cd4eccb4df78ed262c88e397f2b6d272e62a9))
* openTelemetry integration completed ([04fb452](https://github.com/amel-tech/madrasah-frontend/commit/04fb45231c23969464e51960a8b45534a73a769c))
* pr updated ([e11123f](https://github.com/amel-tech/madrasah-frontend/commit/e11123fdbd15f2d63eb85fc28151d22180aee521))

## [0.1.2](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.1...nazir-web-v0.1.2) (2025-09-18)


### Features

* **flashcard:** use msw on dashboard, and card pages ([4379ca3](https://github.com/amel-tech/madrasah-frontend/commit/4379ca39e730c27e806bbca0f80f376ce8a8474e))

## [0.1.1](https://github.com/amel-tech/madrasah-frontend/compare/nazir-web-v0.1.0...nazir-web-v0.1.1) (2025-08-22)


### Features

* **nazir:** initialize nazir Next.js application ([fbadb9c](https://github.com/amel-tech/madrasah-frontend/commit/fbadb9c5ff40498fbd7cb91c0c3d35161105e545))

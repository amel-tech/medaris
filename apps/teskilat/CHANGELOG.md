# Changelog

## [0.2.0](https://github.com/amel-tech/medaris/compare/teskilat-v0.1.1...teskilat-v0.2.0) (2026-09-23)


### ⚠ BREAKING CHANGES

* **repo:** the root check-types script is renamed to typecheck, and every package's check-types/type-check script is renamed with it. Use pnpm typecheck.
* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9))
* **repo:** merge madrasah-backend history into medaris

### Features

* **auth-guard:** use config service to inject keycloak jwks url ([6838bec](https://github.com/amel-tech/medaris/commit/6838bec3ca76f07c7b77c56cd80d5c7112b2395d))
* **repo:** MDRS-10 — convert two npm workspaces into a single pnpm workspace ([#9](https://github.com/amel-tech/medaris/issues/9)) ([4eb2784](https://github.com/amel-tech/medaris/commit/4eb2784e70e852d9dc5e76693ba1bc0cedda9ad2))
* **repo:** MDRS-11 adopt Nx 23 for task orchestration and wire TS project references ([#11](https://github.com/amel-tech/medaris/issues/11)) ([68fcfe3](https://github.com/amel-tech/medaris/commit/68fcfe3826ab7f08ee5990078769f5ec6aba7fae))
* **repo:** MDRS-12 — adopt Biome, reduce ESLint to a boundaries-only shell ([#12](https://github.com/amel-tech/medaris/issues/12)) ([6bc1296](https://github.com/amel-tech/medaris/commit/6bc12966234dd44e50b79a6d236b005c5106e395))
* **tedrisat, common:** MDRS-31 add rate limiting, starting with the bulk routes ([#59](https://github.com/amel-tech/medaris/issues/59)) ([79f24a8](https://github.com/amel-tech/medaris/commit/79f24a8d8a1582183df2c3f4ca0dcdca99916526))
* update health check response to use dynamic version from config… ([cb3cc07](https://github.com/amel-tech/medaris/commit/cb3cc07528a84e5dad57c13f509e128e22fb3a0e))
* update health check response to use dynamic version from configuration ([c6f71e4](https://github.com/amel-tech/medaris/commit/c6f71e49148a224caef375be675381d57ec75a9c))


### Bug Fixes

* **teskilat:** MDRS-69 — drop the dead DB config and refuse Swagger in production ([#54](https://github.com/amel-tech/medaris/issues/54)) ([1ef6627](https://github.com/amel-tech/medaris/commit/1ef66278d0bdd59bb3c55f0efbf52cd4eb8b8aa7))


### Miscellaneous Chores

* **repo:** merge madrasah-backend history into medaris ([7da5455](https://github.com/amel-tech/medaris/commit/7da545574eef84f2280d0f74ac05aeb17a136ffc))

## [0.1.1](https://github.com/amel-tech/madrasah-backend/compare/teskilat-v0.1.0...teskilat-v0.1.1) (2025-08-21)


### Features

* add security audit tools and workflows ([fdae3db](https://github.com/amel-tech/madrasah-backend/commit/fdae3db2bd25a54f3b8c002b71f2dab1363735d6))
* add security audit tools and workflows ([4d58fd0](https://github.com/amel-tech/madrasah-backend/commit/4d58fd04e28d85855dafc1d3a56489d552f137aa))
* common logger and global middleware implementation ([fa2c30b](https://github.com/amel-tech/madrasah-backend/commit/fa2c30bbf9989b6c655732b2fc69a5ccfcda48b9))
* common logger and global middleware implementation ([f8fcc7e](https://github.com/amel-tech/madrasah-backend/commit/f8fcc7e0affa55fd3267d94930b84d57768a00cd))
* env examples added ([fe13162](https://github.com/amel-tech/madrasah-backend/commit/fe13162e80177bb31ffaa555df66ab5191415c4d))
* implement drizzle orm with postgresql and example crud operations ([2bb8d4f](https://github.com/amel-tech/madrasah-backend/commit/2bb8d4fdd85a4a6eca86c845009032d84c935d60))
* implement global exception handling mechanism ([863eb1f](https://github.com/amel-tech/madrasah-backend/commit/863eb1f3044a4fdf35ecfdbc6096349f38f3d39c))
* npm dependencies and depcheck config updated ([8a66d56](https://github.com/amel-tech/madrasah-backend/commit/8a66d56a84b46998ea6861fcb1d71140717978f5))
* npm dependencies and depcheck config updated ([c80bdc7](https://github.com/amel-tech/madrasah-backend/commit/c80bdc793baba536f1e42f573d1b29b8b1a76d78))
* sync package.json versions with release-please-manifest ([f56ecd2](https://github.com/amel-tech/madrasah-backend/commit/f56ecd20b016020e3b45000eb64f9534e1c85454))


### Bug Fixes

* correct service ports and update service names in documentation ([71e0e5e](https://github.com/amel-tech/madrasah-backend/commit/71e0e5ec49aef6ead588cca6d2357ca3be66fe59))
* otel logs fix and some small updates ([909c808](https://github.com/amel-tech/madrasah-backend/commit/909c80872a2dc7b3d105976970795805260d03a9))
* otel logs fix and some small updates ([6467bcb](https://github.com/amel-tech/madrasah-backend/commit/6467bcb30f71058972c12f7ab2ce8a5834b76706))
* refine deployment workflows for Tedrisat and Teskilat, enhancing… ([abec291](https://github.com/amel-tech/madrasah-backend/commit/abec29120f989022fc7ba3447617aa8da8578068))
* update Dockerfiles for tedrisat and teskilat applications ([468d5c6](https://github.com/amel-tech/madrasah-backend/commit/468d5c62d44a115beb1f035d8ef751792f3e7f1c))
* update Dockerfiles for tedrisat and teskilat applications ([1ccbd58](https://github.com/amel-tech/madrasah-backend/commit/1ccbd580205da2a371d952729b3e7f1a21182834))
* update package.json scripts to leverage turborepo with hotreload dev scripts ([380521c](https://github.com/amel-tech/madrasah-backend/commit/380521c71d4512aca5102381a482961088709806))
* use version number instead of workspace:* for workspace referencing ([5931315](https://github.com/amel-tech/madrasah-backend/commit/59313155d1a598dfa7f61b275ffb028198425373))

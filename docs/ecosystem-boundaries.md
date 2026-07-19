# Amel Tech Ecosystem — Domain Boundaries Charter

| | |
|---|---|
| **Version** | 0.1 (draft for cross-project review) |
| **Date** | 2026-07-05 |
| **Status** | Draft — needs sign-off from each project owner |
| **Scope** | Defines who owns what across ecosystem projects (Sidre, Medaris, and future projects), and how they interact |
| **Home** | `amel-tech/medaris` `docs/` (graduated from `madrasah-backend/docs/`); org-level home pending an Amel Tech org repo |

Companion to the Medaris PRD (`docs/PRD.md`, esp. §9). Where the two disagree, this charter wins on *ownership and governance*; the PRD wins on *Medaris product scope*.

---

## 1. Mission context

Every project in this ecosystem serves one mission: **technological sovereignty for Muslims** (*Müslüman teknolojik egemenliği*).

The threat model is articulated in ["Güvenilir Truva Atları — Sömürü 4.0"](https://www.linkedin.com/pulse/g%C3%BCvenilir-truva-atlar%C4%B1-s%C3%B6m%C3%BCr%C3%BC-40-amel-tech-zj93f/) (Amel Tech): *Sömürü 4.0* is digital-age colonialism operating through **trusted Trojan horses** — ostensibly helpful technologies that function as surveillance, control, and dependency mechanisms: operating systems with privileged data access, hardware management engines with out-of-band control (Intel ME / AMD PSP), kernel-level "security" tooling built by adversarial intelligence alumni, choke-point internet infrastructure (Cloudflare-scale traffic concentration), open-source capture through platform ownership and funding dependency, and cloud-tethered critical systems. The prescribed response is building **indigenous, open, self-hostable alternatives** — framed as obligation, not preference.

Two consequences for this charter:

1. **Dependency selection is a sovereignty decision.** The community's *Açık Kaynak Yazılım Değerlendirme Formu* — which weighs *Müslümanların hassasiyetlerine uygunluk* at **50%** — applies ecosystem-wide, not just to Medaris.
2. **Sovereignty applies *inside* the ecosystem too.** No project may become a Trojan horse for another: no hidden coupling, no shared databases, no single project whose outage or governance change can take down a sibling. Independence between projects is a feature, not friction.

---

## 2. Ownership & governance model

The ecosystem is **not a holding company with subsidiaries**. It is independently owned projects connected by a bridge community.

| Entity | Role | Owns |
|---|---|---|
| **Sidre team** | Project owner | **Sidre** — Islamic digital library & research platform |
| **Hadis ve Siyer Medresesi** | Project owner | **Medaris** — Online Medrese Sistemi |
| **Amel Tech** | **Bridge community** (amel-tech.org) | No product. Owns the *connective tissue*: mission & manifesto, community, cross-project standards (e.g. the dependency evaluation form), convening istişare between projects, talent & events, communications (Dijital Hicret / Sömürü 4.0 series), GitHub org hosting |
| *(future projects)* | Project owner each | Their own scope, chartered per §7 |

Rules that follow:

- **Each owner decides its own roadmap, releases, scholarly governance, legal/financial identity, and infrastructure.** Amel Tech convenes and recommends; it does not command.
- **Contributors flow through the community** — the same people may commit to several projects — but *authority* stays with each project's owner and core team.
- **Cross-project alignment happens by contract and istişare**, never by reaching into another project's database, config, or deployment.
- The GitHub `amel-tech` org is a **hosting convenience**, not an ownership claim; repo admin rights follow the project owner.

---

## 3. Project roles (the boundary, stated plainly)

### Sidre — *the library*
Owner: Sidre team. Canonical home of **Islamic texts and everything anchored to them**:
- Corpus: books, authors, categories, chapters, full text, translations (meal)
- The reader experience; Arabic full-text search (Elasticsearch); collections/personal libraries; reading history; offline packages; PDF export
- Annotations **on canonical texts** (the text's coordinate system belongs to Sidre)
- Content-intelligence pipeline (AI segmentation/classification/translation drafts under scholarly editorial review)
- **Hakemli yayın** (peer-reviewed publication pipeline) — on Sidre's roadmap, not yet built
- Contributor/editorial workflows for corpus quality (submissions, OCR, fix-requests, reviewer roles)

### Medaris — *the medrese*
Owner: Hadis ve Siyer Medresesi. Canonical home of **teaching and institutional learning**:
- Institutions: medrese → köşk → ders hierarchy; nazır/müderris/talebe roles and the authorization matrix
- Curriculum & delivery: syllabus, enrollment, mütalaa, canlı ders, müzakere, ödev, imtihan
- Ezber (flashcards, spaced repetition)
- **İcazet** (chain-authorized credentialing, silsile) — the credential of *teaching*, distinct from Sidre's editorial roles
- Learning progress, dashboards, gamification, education-scoped tasadduk
- Haşiye **in ders context** (lesson-anchored annotation layers — may *reference* Sidre text coordinates, stored Medaris-side)

### Amel Tech — *the bridge*
- Mission, manifesto, communications; community & events; cross-project standards (dependency evaluation form, this charter); convening cross-project istişare; incubating new project charters (§7)
- **Candidate operator** for genuinely shared services (e.g. Amel One identity, §5) — pending the OQ-A decision below

### Explicit non-overlaps (each side stays out)
- Sidre's roadmap item "Medrese Integration" (curriculum mapping, progress tracking, institutional accounts) is **ceded to Medaris**. Sidre exposes APIs; it does not build curriculum/enrollment features.
- Medaris does **not** host book corpus, build a reader, or index texts for search. It links/embeds Sidre.
- Neither project speaks for the mission; that's Amel Tech's voice.

---

## 4. Boundary rules — deciding where a capability lives

For any capability, apply in order:

1. **OWN** it if it is your domain's core (texts → Sidre; teaching → Medaris).
2. **CONSUME** it if a sibling owns it: integrate via their **published, versioned API contract** (OpenAPI). Never via their database, internal queues, or code imports.
3. **FEDERATE** it if everyone needs it but coupling would violate sovereignty: agree on a **shared standard, implemented locally** (identity claims, design language, scholarly-review pattern, error envelope conventions).
4. **DUPLICATE DELIBERATELY** if it's cheap, generic plumbing where sharing would create dependency without proportional value (notifications, dashboards, CI setups). Duplication between sovereign projects is acceptable; hidden coupling is not.

Litmus test: *if project X disappeared tomorrow, would project Y still run?* The answer must always be **yes** (degraded features are fine; downtime is not).

---

## 5. Capability assignment (resolves the shared-features audit)

| Capability | Owner | Others' mode | Notes |
|---|---|---|---|
| Book corpus, reader, Arabic search, translations | **Sidre** | Medaris **consumes** (public read API — live today) | PRD M17 |
| Curriculum, enrollment, institutions, mütalaa/müzakere/ödev/imtihan | **Medaris** | Sidre stays out (cedes "Medrese Integration") | PRD M2–M10 |
| Annotations on canonical texts | **Sidre** | — | Sidre owns text coordinates |
| Haşiye in ders context | **Medaris** | May reference Sidre coordinates | PRD M11-3; anchor-format is a shared standard (federate) |
| İcazet / silsile (teaching credential) | **Medaris** | Sidre may display scholar credentials later | Scholarly governance gate first (PRD M12-1) |
| Hakemli yayın | **Sidre** (greenfield, their timeline) | Medaris **consumes** publish/display flows | PRD M18; no Medaris hard dependency |
| Editorial roles for corpus (contributor/reviewer) | **Sidre** | — | Distinct from Medaris teaching roles — do not merge role models |
| **Identity ("Amel One")** | **Federated standard** — operator TBD (OQ-A) | Each project keeps its own realm/IdP; SSO via brokering against the shared standard | Today: two Keycloaks (`amel-one`, `amel-tech-dev`); QAuth is the indigenous-IdP candidate (early-stage) |
| Keycloak login themes | Per-project today | Candidate **shared package** under Amel One branding — low-risk consolidation | Both projects hand-built one |
| Donations/tasadduk rails (PSP, receipts) | **Per-owner** (separate legal entities → separate merchant accounts) | **Shared evaluation** of halal PSP via Amel Tech (one research effort, N contracts) | Supersedes the earlier "one donations decision" idea — ownership separation forbids one shared rail |
| Scholarly review governance | **Per-owner panels** (Sidre's panel ≠ Medaris's istişare council) | **Shared pattern** via Amel Tech convening | A single panel would concentrate religious authority — against the federation principle |
| AI on Islamic texts (summaries, kök-harf dictionary, transcripts of text) | **Sidre** (content pipeline) | Medaris consumes text-anchored AI; owns AI on *its own* artifacts (ders recordings, transcripts) | Provider must pass the hassasiyet form |
| Notifications, dashboards, gamification | Per-project | **Duplicate deliberately** | Generic plumbing |
| Engineering conventions (NestJS+Drizzle patterns, OpenAPI-first, migration gating, release-please) | — | **Federate as shared practice**, optionally shared docs/templates under Amel Tech | Conventions, not runtime coupling |
| Mission communications, dependency evaluation form, this charter | **Amel Tech** | All projects adopt | The bridge's actual product |

---

## 6. Interaction contracts

1. **OpenAPI-first**: every cross-project integration consumes a published, versioned spec (as Medaris frontends already consume `tedrisat.json`). Breaking changes require a deprecation window agreed between owners.
2. **No shared databases, queues, or code-level imports** across project boundaries. Ever.
3. **Service-to-service auth**: user-token flows via Amel One SSO; machine flows need client-credentials — **Sidre currently lacks this** (flagged; Medaris P4 depends on it only for private features, public reads are unauthenticated).
4. **Data residency & exit**: each project can export its cross-references (e.g. Medaris's `course_resources` → Sidre IDs are plain data, re-pointable). No integration may create un-exportable state.
5. **SLA-lite**: siblings communicate planned downtime; consumers degrade gracefully (Medaris course pages render without Sidre embeds).
6. **Security disclosures** affecting a sibling's integration surface are shared privately before public release.

---

## 7. Adding a new ecosystem project

A new project joins by publishing a **one-page scope charter**: owner (who), mission fit (which sovereignty gap it closes), scope (owns / consumes / federates / explicitly-not), integration surfaces (APIs offered/consumed), dependency posture (hassasiyet form applied), and governance (how decisions are made, who speaks for it). Amel Tech convenes review with existing owners — checking for boundary collisions like Sidre/Medaris "Medrese Integration" — then registers it in this charter's §2 table.

Known candidates from the community pipeline (each needs its own charter before claiming scope): identity (QAuth/"Amel One"), and others as the community incubates them.

---

## 8. Open questions (ecosystem-level)

| ID | Question | Recommendation |
|---|---|---|
| OQ-A | **Who operates Amel One?** A shared IdP is the one service that tempts centralization — it must be governed neutrally (Amel Tech?) or federated (per-project IdPs + brokering standard) | Start with **brokering standard** (each project keeps its realm; agree claim schema + `amel_one_id` semantics). Revisit single-operator only when a neutral entity with legal form exists |
| OQ-B | **Legal entities**: which owners have tüzel kişilik for donations, app-store accounts, trademarks? | Per-owner entities; Amel Tech pursues its own for community functions; shared PSP *research*, separate contracts |
| OQ-C | **Trademark/branding**: who holds "Medaris", "Sidre", "Amel One" marks? | Each owner registers its product mark; Amel Tech holds mission/community marks |
| OQ-D | **Charter governance**: how is this document amended? | Change proposals via PR + sign-off from every registered owner; Amel Tech moderates |

---

## 9. Cross-references

- Medaris PRD: `docs/PRD.md` — §3 (personas/operator), §9 (Sidre boundary mechanics), §13 OQ-5/OQ-6 (now governed by this charter's OQ-A/OQ-B)
- Sömürü 4.0 article (mission): linked in §1
- Amel Tech dependency evaluation: *Açık Kaynak Yazılım Değerlendirme Formu* (Linear, both workspaces)

*Bu şart taslağı; her proje sahibinin onayına sunulmak üzere hazırlanmıştır.*

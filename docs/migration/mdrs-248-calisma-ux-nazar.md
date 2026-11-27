# Çalışma soruları: a UX pass over the hoca's screens in nazar (MDRS-248)

Date: 27 November 2026. Scope: `apps/nazar` (the `kind: PRACTICE` branches
of `features/online-exams`) and `libs/i18n` (`nazar.json` only). Builds on
Faz 2 (`mdrs-248-calisma-sorulari-nazar.md`). Tedris and the API are
untouched.

## What changed

- **The list is a table** (`practice-sets-table.tsx`, `@medaris/ui` `Table`):
  Set · Durum · Soru · Talebe · Çözülme · Ortalama. The set's name is the
  row's link (`rowHeader` + `primaryAction`), the figures are right-aligned,
  the average is a whole percentage (`%76`, rounded half up on the API's
  decimal text), and a draft or a set nobody finished shows "—" (read out as
  "Yok"). Drafts come first, with their "Taslak" badge. Below 768 px the
  table is the kit's stacked card (`responsive="stack"`), compacted so each
  figure follows its column name on one or two lines; the page does not
  scroll sideways at 390 px. When the stats read fails, a sentence above the
  table says so and the table stays.
- **Empty list**: the kit's `EmptyState` with a sentence that says how to
  open the first set. The name field has a placeholder and a wider input.
- **Editor**: each question card names its topics ("Konular: 11. Tefsir",
  not "11") and, when it is "Eksik", lists what it lacks with the exam
  publish panel's own sentences. The question and topic lists lost their
  browser indent and the "1." marker that repeated the card's "1. soru"
  (exams get the same layout fix). "Talimatlar" in a set explains where the
  talebe reads it (under the set's name in tedris), not the exam's
  "Bilmeniz gerekenler". The topics intro and "Konu numaraları" help now
  say how the two connect.
- **Yayınla panel** (draft): its own sentence, "Set henüz yayınlanamaz"
  instead of the exam's title, and a note when some questions are
  incomplete, since the API never gives those to the talebe
  (`isCompleteCounted`).
- **Published set**: headed "Durum" (not the imperative "Yayınla") with its
  "Yayında" badge, shows "N talebe M kez çözdü · ortalama %X", and once a
  talebe finished it, says it can no longer be unpublished instead of
  offering a button the API refuses (EXAM_LOCKED). The stats are a side read
  in `ExamPage`, as on the list. A set started but not finished still shows
  the button; the API's refusal toast covers that case as before. Correct
  options are a "Doğru" badge, as in the editor, not "· Doğru".
- **Loading**: the list skeleton follows the page (title, intro, form,
  table rows) instead of three bars.

## What was verified

- `nazar-web` test: new cases for the table (headers, order, `%73` from
  `"72.50"`, dashes, failed stats, empty list) and for the editor and
  published panel (topic names, lacks, incomplete note, lock).
- Screenshots before and after on the local stack (API + nazar on a
  `tedrisat_calisma` copy, local Keycloak), 1440 px and 390 px: list, a
  draft set and a published set. No horizontal overflow at 390 px.
- The gate: typecheck, lint, module-boundaries and build green on every
  project. `-t test`: every project green except `tedrisat` (e2e suites,
  404s and a 403 from `setup-realm.sh`) and `keycloak-theme` (401 from the
  admin API), both on a machine where another worktree's Keycloak held
  port 8080. Neither project is in `nx show projects --affected`
  (nazar-web, i18n, tedris-web, nizam-web, landing-web), and this change
  touches neither.

## Review

`/code-review` (medium) on the diff, five findings:

- The lock is read from finished attempts only: a set started but not
  finished still offers "Yayından kaldır". Deferred (needs a started-attempt
  figure from the API, see Later); the API's EXAM_LOCKED toast covers it as
  before this change.
- "Çözülme sayıları okunamadı" above an empty list: fixed, it shows only
  when there are sets.
- Topic names joined into one string without bidi isolation: fixed, each
  topic is its own `<bdi>` after a "Konular:" label
  (`OnlineExams.topicsOfQuestionLabel`; `topicsOfQuestion` is gone).
- Tests that swap a stubbed read put it back in `finally`: fixed.
- A set's page reads the whole course's stats for one row, drafts included:
  not changed; the read runs in parallel with the draft's, and a per-set
  endpoint is an API change.

## What was not verified

- English and Arabic: nazar serves Turkish only (`LOCALES = ["tr"]`), so the
  new `en`/`ar` strings and the table under `dir="rtl"` were not seen
  rendered. The table uses logical properties (`is-end`, `me-*`, `ps-*`).

## Later

- Breadcrumb: the back link above a set's title could be the kit's
  `Breadcrumb` (Ders › Çalışma Soruları › set).
- Ayarlar/Konular take the top of the editor although a set's work is its
  questions; folding them (or moving Konular next to the question form)
  needs a decision shared with the exam editor.
- A draft set's page title carries no "Taslak" badge; the header is server
  drawn and the workspace turns draft ↔ published client-side.
- The lock is known only from finished attempts; an "attempts started"
  figure from the API would let the page hide "Yayından kaldır" in every
  locked case.

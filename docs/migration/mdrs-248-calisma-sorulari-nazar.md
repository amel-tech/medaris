# Çalışma soruları, Faz 2: the hoca's screens in nazar (MDRS-248)

Date: 27 November 2026. Scope: `apps/nazar` and `libs/i18n` (`nazar.json`
only). Builds on Faz 1 (`mdrs-248-calisma-sorulari.md`, PR #458). Faz 3
(tedris, the talebe's screens) is separate and untouched here.

## What changed

- **Menu.** A course's menu gains "Çalışma Soruları" under "Sınavlar"
  (`features/shell/nav.ts`: id `practice`, segment `calisma-sorulari`, icon
  `check`, drawn only for a holder of `exam.prepare`, as "Sınavlar" is).
- **Pages.** `app/ders/[dersId]/calisma-sorulari/page.tsx` (the list) and
  `.../[setId]/page.tsx` (one set), each with its `loading.tsx`. They win over
  the shared placeholder's `[bolum]`.
- **No copy of the exam screens.** The existing components take a `kind`
  (`EXAM` by default, so "Sınavlar" is unchanged):
  - `ExamsPage`: with `PRACTICE` it lists `GET courses/:id/online-exams?kind=PRACTICE`
    (title, Taslak/Yayında, "{count} soru"), offers "Yeni çalışma seti", and
    draws no results link and no zeroth-question section; the zeroth question
    is not even read.
  - `NewExamForm`: sends `kind` and opens the new set under
    `calisma-sorulari`.
  - `ExamPage`: back link and titles of its kind, no results link for a set;
    an id of the other kind redirects to the page of its own kind.
  - `ExamEditor`: for a set, no "Süre" field (the settings write leaves
    `durationMinutes` out entirely, since the API refuses any length on a
    set, a null one included), no own-points field and no points line on a
    question, and the set's publish condition (one complete question) instead
    of the exam's.
  - `PublishSection` / `PublishedExam`: for a set, one dateless "Yayınla",
    then "Yayında" with "Yayından kaldır"; EXAM_LOCKED on that (a talebe has
    started the set) is worded for a set.
- `createOnlineExam(courseId, title, kind = "EXAM")`; `ExamSettings.durationMinutes`
  is optional; `segmentOf(kind)` in `online-exams.ts` gives the page segment.
- **i18n.** `Nav.ders.practice` and a `Practice` namespace in
  `locales/{tr,en,ar}/nazar.json`.

## What was verified

- `apps/nazar/test/exam-practice.spec.tsx`: the menu item (position, permission,
  href), "Yeni çalışma seti" sends `PRACTICE` and "Yeni sınav" still sends
  `EXAM`, the editor shows no length / points / date fields, the settings
  write carries no `durationMinutes`, publish sends only the version, an
  incomplete question alone blocks publishing, "Yayından kaldır" and its
  EXAM_LOCKED message.
- `apps/nazar/test/exam-practice-page.spec.tsx`: the server-rendered list asks
  with `kind: PRACTICE`, shows state and question count, links under
  `calisma-sorulari`, and draws no results link or zeroth read; "Sınavlar"
  still asks without `kind`.
- `nav.spec.ts` lists the new segment. The gate's results are in the pull
  request.

## What was not verified

- Nothing was tried in a browser against a running tedrisat; the screens were
  checked through the specs above only.
- The Arabic and English strings were written here and not reviewed by a
  native speaker.

## Follow-ups

- None opened. The instructions field stays on a set's settings; whether the
  talebe's screens (Faz 3) show it is Faz 3's call.

# MDRS-248: the "Dokümanlar" tab of the Tedris course page

## Why

Talebe asked for every document of a course in one place, instead of opening
each week and each celse to find what to download (support line,
2026-11-26). They meant the documents, not the recordings: recordings are not
downloadable and stay that way.

## What it does

- The course page has a new tab, **Dokümanlar**, right after **Ders
  kayıtları**. Its label carries the number of documents, as the recordings
  tab does.
- The tab lists the course's own documents under **Ders geneli** first, then
  every celse's documents, week by week in programme order (`Hafta N` › celse
  title). Weeks and celses without a document are left out. Each celse title
  opens that celse's page.
- Each row is the celse page's `ResourceList`: a file downloads through the
  tedris route `/api/files/courses|lessons/:id/resources/:rid`, a link opens in
  a new tab.
- An empty course says "Bu derste henüz doküman yok."

## Visibility: no new rule

No endpoint was added. `GET /courses/:id` already returns the course's
resources and every lesson's resources in one call, and strips their
addresses and files for a caller without `course.view_details`
(`apps/tedrisat/src/course/domain/course-content.ts`). That is the same rule
the celse page uses. The tab is drawn only when the answer is not
`contentLocked`, so a viewer who may not read the content does not see it.
The download routes keep their own `COURSE_VIEW_DETAILS` check.

## Follow-up, not in this change

- **Download all (zip).** A "Tümünü indir" button needs the server to build an
  archive from Bunny Storage (streaming, size limits, the same per-file
  authorization). That is separate work. One-by-one download from a single
  page answers the request for now.

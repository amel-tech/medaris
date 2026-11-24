-- Reverses migrations/0081_emsile_teacher_material.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0081's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost, and each table is the only copy:
--   - every note a müderris wrote for a session ("lesson_teacher_notes"). The
--     talebe's own notes ("lesson_notes") are not touched;
--   - every session's board (the scene the müderris drew) and the record of
--     its images. The images themselves stay in the storage zone under the
--     environment's key prefix
--     (`<prefix>/courses/<course>/lessons/<lesson>/board/...`): list
--     "lesson_board_files"."storage_key" before running this if they are to be
--     removed by hand;
--   - every course's glossary (each term, its Arabic spelling, its two
--     meanings and its example);
--   - which roots each course's müderris put on its sarf page (the root, its
--     bâb, the Turkish mastar and the masdar's vezin). The tables themselves
--     are derived in the browser and the cards already drafted into a deck are
--     untouched.
DROP TABLE "lesson_teacher_notes";
DROP TABLE "lesson_board_files";
DROP TABLE "lesson_boards";
DROP TABLE "course_terms";
DROP TABLE "course_sarf_roots";

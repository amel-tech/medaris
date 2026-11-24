-- Reverses migrations/0070_lesson_boards.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0070's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every session's board (the scene the müderris drew) and the record of
-- its images. The images themselves stay in the storage zone under the
-- environment's key prefix
-- (`<prefix>/courses/<course>/lessons/<lesson>/board/...`): list
-- "lesson_board_files"."storage_key" before running this if they are to be
-- removed by hand.
DROP TABLE "lesson_board_files";
DROP TABLE "lesson_boards";

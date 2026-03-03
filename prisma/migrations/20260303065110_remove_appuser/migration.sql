/*
  Warnings:

  - You are about to drop the `app_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "engram_topics" DROP CONSTRAINT "engram_topics_owner_id_fkey";

-- DropTable
DROP TABLE "app_users";

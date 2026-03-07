-- AlterTable
ALTER TABLE "app_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "engram_topics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

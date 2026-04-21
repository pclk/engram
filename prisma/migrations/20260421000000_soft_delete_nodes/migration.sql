-- AlterTable
ALTER TABLE "engram_nodes" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "engram_nodes_owner_id_deleted_at_idx" ON "engram_nodes"("owner_id", "deleted_at");

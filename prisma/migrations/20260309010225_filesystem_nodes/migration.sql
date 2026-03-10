DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'EngramNodeType'
    ) THEN
        CREATE TYPE "EngramNodeType" AS ENUM ('file', 'folder');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "engram_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" "EngramNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "topic" JSONB,
    "is_root" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engram_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "engram_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "engram_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "engram_nodes_type_topic_check" CHECK (
        ("type" = 'file' AND "topic" IS NOT NULL AND "is_root" = false)
        OR ("type" = 'folder' AND "topic" IS NULL)
    ),
    CONSTRAINT "engram_nodes_root_shape_check" CHECK (
        ("is_root" = false)
        OR ("is_root" = true AND "type" = 'folder' AND "parent_id" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "engram_nodes_owner_id_idx" ON "engram_nodes"("owner_id");
CREATE INDEX IF NOT EXISTS "engram_nodes_owner_id_parent_id_idx" ON "engram_nodes"("owner_id", "parent_id");
CREATE INDEX IF NOT EXISTS "engram_nodes_owner_id_type_idx" ON "engram_nodes"("owner_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "engram_nodes_owner_id_root_key" ON "engram_nodes"("owner_id") WHERE "is_root" = true;

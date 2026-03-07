CREATE TABLE IF NOT EXISTS "app_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_users_email_key" ON "app_users"("email");

CREATE TABLE IF NOT EXISTS "app_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_sessions_token_hash_key" ON "app_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "app_sessions_user_id_idx" ON "app_sessions"("user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'app_sessions_user_id_fkey'
    ) THEN
        ALTER TABLE "app_sessions"
            ADD CONSTRAINT "app_sessions_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

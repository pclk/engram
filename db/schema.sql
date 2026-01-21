-- Example schema for Engram documents (Neon/PostgreSQL)
-- Review and approve before applying.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- App users (auth-owned identities)
CREATE TABLE IF NOT EXISTS app_users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email TEXT UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Engram topics: each topic stores a topic tree in JSONB
CREATE TABLE IF NOT EXISTS engram_topics (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	topic JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engram_topics_owner_id_idx ON engram_topics(owner_id);
CREATE INDEX IF NOT EXISTS engram_topics_topic_gin_idx ON engram_topics USING GIN (topic jsonb_path_ops);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS engram_topics_updated_at ON engram_topics;
CREATE TRIGGER engram_topics_updated_at
BEFORE UPDATE ON engram_topics
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Optional: Row-level security example (enable once auth context is defined)
-- ALTER TABLE engram_topics ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY engram_topics_owner_policy
-- ON engram_topics
-- USING (owner_id::text = current_setting('app.user_id', true));

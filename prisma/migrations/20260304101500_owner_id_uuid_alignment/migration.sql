-- Align engram_topics.owner_id with canonical Neon Auth subject type (UUID).
-- Backward compatible for deployments where owner_id was created as text/varchar.
DO $$
DECLARE
  current_data_type text;
BEGIN
  SELECT c.data_type
  INTO current_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'engram_topics'
    AND c.column_name = 'owner_id';

  IF current_data_type IN ('text', 'character varying') THEN
    ALTER TABLE "engram_topics"
      ALTER COLUMN "owner_id" TYPE UUID USING "owner_id"::uuid;
  END IF;
END
$$;

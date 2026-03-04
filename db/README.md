# Engram Schema

This document explains the example Neon/PostgreSQL schema in schema.sql and the purpose of each field.

## Prisma + Neon environment variables

- `DATABASE_URL`: pooled Neon/Postgres URL used by Prisma Client for runtime queries.
- `DIRECT_URL`: direct Neon/Postgres URL used by Prisma migrations (`prisma migrate dev`).

Both are required when running authenticated persistence with Prisma.

## Overview
The schema stores Engram documents as a JSONB topic tree and records the authenticated owner_id from Neon Auth. The canonical owner identifier is a UUID (mirrors JWT `sub`) so auth parsing and database typing stay aligned. It includes timestamps, indexes, and an auto-updated updated_at field.


## Backward compatibility notes
- Canonical type: `owner_id` is `UUID` and auth rejects non-UUID JWT `sub` values.
- Migration `20260304101500_owner_id_uuid_alignment` is safe for environments where `owner_id` may still be `TEXT`/`VARCHAR`: it casts existing values using `owner_id::uuid` and then enforces `UUID`.
- Before running the migration on older databases, check for non-UUID owner ids (for example: `SELECT owner_id FROM engram_topics WHERE owner_id !~* '^[0-9a-f-]{36}$';`) and remediate invalid rows.

## Extensions
- pgcrypto: provides gen_random_uuid() for UUID primary keys.

## Tables

### engram_documents
Stores each Engram document and its topic tree as JSONB.

Fields:
- id (UUID): Primary key. Generated with gen_random_uuid().
- owner_id (UUID): Neon Auth user id for the document owner. Enforce access using application checks and/or row-level security policies.
- title (TEXT): Human-readable document title.
- topic (JSONB): Full topic tree (topic, concepts, derivatives). Flexible for future schema evolution.
- created_at (TIMESTAMPTZ): Document creation time. Defaults to now().
- updated_at (TIMESTAMPTZ): Last update time. Auto-updated via trigger.

## Indexes
- engram_documents_owner_id_idx: Speeds up queries by owner_id.
- engram_documents_topic_gin_idx: GIN index on topic JSONB for structured queries.

## Triggers
- engram_documents_updated_at: Updates updated_at on every row update.

## Optional Row-Level Security
Commented-out policy template allows per-user access control using current_setting('app.user_id'). Enable after defining auth session settings.

# Engram Schema

This document explains the example Neon/PostgreSQL schema in schema.sql and the purpose of each field.

## Overview
The schema stores Engram documents as a JSONB topic tree and links each document to an authenticated user. It includes timestamps, indexes, and an auto-updated updated_at field.

## Extensions
- pgcrypto: provides gen_random_uuid() for UUID primary keys.

## Tables

### app_users
Stores application users (auth-owned identities).

Fields:
- id (UUID): Primary key. Generated with gen_random_uuid().
- email (TEXT): Unique email address. Nullable to support external auth providers without email.
- created_at (TIMESTAMPTZ): Record creation time. Defaults to now().

### engram_documents
Stores each Engram document and its topic tree as JSONB.

Fields:
- id (UUID): Primary key. Generated with gen_random_uuid().
- owner_id (UUID): Foreign key to app_users.id. Identifies document owner. On user delete, documents cascade delete.
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

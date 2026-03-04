Engram is a vim-inspired study notetaking editor.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies (canonical package manager: **npm**):
   `npm install`
2. Create `.env.local`.
3. Configure environment variables:

   **Required for authenticated mode:**
   - `NEXT_PUBLIC_NEON_AUTH_URL` **(required)**: browser auth client URL (`src/lib/auth.ts`).
   - `NEXT_PUBLIC_NEON_DATA_API_URL` **(required)**: browser data API URL (`src/lib/auth.ts`).
   - `NEON_AUTH_URL` **(required)**: server auth client URL (`src/server/api/neon.ts`).
   - `NEON_DATA_API_URL` **(required)**: server data API URL (`src/server/api/neon.ts`).

   **Required for Prisma workflows:**
   - `DATABASE_URL` **(required)**: pooled Neon/Postgres URL used by Prisma Client at runtime.
   - `DIRECT_URL` **(required for migrations)**: direct database URL used by Prisma migrate workflows.

   **Optional:**
   - `GEMINI_API_KEY`: only needed when running live Gemini API calls.

   **Guest/offline mode (no auth required):**
   - Leave auth vars unset.
   - Run `npm run dev` and open `/guest`.

4. Generate Prisma client (also runs automatically in `postinstall`):
   `npm run prisma:generate`

5. Run migrations in development when schema changes:
   `npm run prisma:migrate:dev`

6. Run the app:
   `npm run dev`

## Current architecture (post-refactor)

- **Authoritative API routes** are implemented under `app/api/*`:
  - `app/api/auth/route.ts` (`/api/auth`) for auth-backed session cookie lifecycle + auth check.
  - `app/api/session/route.ts` (`/api/session`) for current authenticated user session info.
  - `app/api/content/route.ts` (`/api/content`) for authenticated CRUD on `engram_topics` via server Neon client.
- **Storage/auth path:**
  - Auth and content API access in active routes use Neon client configuration from `NEON_AUTH_URL` / `NEON_DATA_API_URL` (server) and `NEXT_PUBLIC_NEON_*` (browser).
  - Prisma (`DATABASE_URL`, `DIRECT_URL`) is used for schema/migration workflows; runtime content API traffic should use `/api/content`.

## Testing

### Unit tests (Vitest + React Testing Library)

- Run unit suites: `npm run test:unit`
- Watch mode: `npx vitest`

### Testing style guide (route-to-test mapping)

- `app/api/**/route.ts` → `tests/unit/app/api/**/*-route.test.ts`
- `src/lib/**` helpers → `tests/unit/lib/**/*.test.ts`
- `src/components/**` React components → `tests/unit/components/**/*.test.tsx`

Keep unit test folders aligned with runtime code location so API ownership and refactors are easy to track.

### End-to-end tests (Playwright)

- Install Playwright browsers once: `npx playwright install --with-deps chromium`
- Run E2E suites: `npm run test:e2e`

### CI command matrix

> Lockfile policy: this repository uses **npm** and the canonical lockfile is `package-lock.json`. Do not commit `pnpm-lock.yaml`.


- Lint: `npm run ci:lint`
- Typecheck: `npm run ci:typecheck`
- Unit tests: `npm run ci:unit`
- E2E tests: `npm run ci:e2e`
- Security audit: `npm run ci:audit` (runs `npm audit`)
- Lockfile guard: `npm run ci:lockfile`
- Full CI sequence: `npm run ci`

## Codex container setup

When you start a fresh Codex container, run:

```bash
./setup.sh
```

This installs Linux Chromium runtime packages (when `apt-get` is available), runs `npm ci`, creates a `.env.local` template if needed, and installs Playwright Chromium browser dependencies when available.

After running it, you can write code, run `npm run dev`, and run `npm run test:e2e` (Playwright). Populate Neon and database variables in `.env.local`, and set `GEMINI_API_KEY` only if you need live Gemini API calls.

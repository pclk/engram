<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your app

Engram is a modal-based study editor and Anki flashcard factory.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local`.
3. Configure environment variables:

   **Required for authenticated mode + Prisma runtime:**
   - `NEXT_PUBLIC_NEON_AUTH_URL` **(required)**
   - `NEXT_PUBLIC_NEON_DATA_API_URL` **(required)**
   - `DATABASE_URL` **(required)**: pooled Neon/Postgres URL used by Prisma Client at runtime.
   - `DIRECT_URL` **(required for migrations)**: direct database URL used by Prisma migrate workflows.

   **Guest/offline mode (no auth required):**
   - Leave auth vars unset.
   - Run `npm run dev` and open `/guest`.

4. Generate Prisma client (also runs automatically in `postinstall`):
   `npm run prisma:generate`

5. Run migrations in development when schema changes:
   `npm run prisma:migrate:dev`

6. Run the app:
   `npm run dev`

## Testing

### Unit tests (Vitest + React Testing Library)

- Run unit suites: `npm run test:unit`
- Watch mode: `npx vitest`

### End-to-end tests (Playwright)

- Install Playwright browsers once: `npx playwright install --with-deps chromium`
- Run E2E suites: `npm run test:e2e`

### CI command matrix

- Lint: `npm run ci:lint`
- Typecheck: `npm run ci:typecheck`
- Unit tests: `npm run ci:unit`
- E2E tests: `npm run ci:e2e`
- Security audit: `npm run ci:audit` (runs `pnpm audit`)
- Full CI sequence: `npm run ci`

## Codex container setup

When you start a fresh Codex container, run:

```bash
./setup.sh
```

This installs Linux Chromium runtime packages (when `apt-get` is available), runs `npm ci`, creates a `.env.local` template if needed, and installs Playwright Chromium browser dependencies when available.

After running it, you can write code, run `npm run dev`, and run `npm run test:e2e` (Playwright). The only manual step is setting `GEMINI_API_KEY` in `.env.local` when you want real Gemini API calls.


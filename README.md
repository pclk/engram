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
3. Choose a mode:

   **Authenticated mode (requires Neon):**
   - `VITE_NEON_AUTH_URL` **(required)**
   - `VITE_NEON_DATA_API_URL` **(required)**
   - `VITE_NEON_SCHEMA` *(optional, defaults to `public`)*

   **Guest/offline mode (no Neon env vars required):**
   - Leave Neon vars unset.
   - Run `npm run dev` and open `/guest`.

4. Run the app:
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


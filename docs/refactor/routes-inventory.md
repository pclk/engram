# Route inventory (legacy to Next App Router)

## Legacy routes (from `src/pages`)

> Note: the Vite `src/pages` directory has already been migrated in this branch. This inventory reflects the legacy route intent from `home`, `account`, and `auth/*` pages.

- `/` → home experience (`home.tsx`)
- `/account` and `/account/:section` → account settings shell (`account.tsx`)
- `/auth` (default sign-in)
- `/auth/sign-in`
- `/auth/sign-up`
- `/auth/forgot-password`
- `/auth/magic-link`
- `/auth/callback`
- `/auth/recover-account`
- `/auth/reset-password`
- `/auth/sign-out`
- `/auth/two-factor`

## Next App Router equivalents

- `/` → `app/page.tsx`
- `/account` → `app/account/page.tsx`
- `/account/*` → `app/account/[...slug]/page.tsx`
- `/auth` → `app/auth/page.tsx`
- `/auth/*` (legacy-style deep links) → `app/auth/[...slug]/page.tsx`
- `/auth/basic/:view` → `app/auth/basic/[view]/page.tsx`
- `/auth/advanced/:view` → `app/auth/advanced/[view]/page.tsx`

## Current API authority (post-refactor)

- Canonical content endpoint: `/api/content` (`app/api/content/route.ts`) for authenticated CRUD against Neon-backed `engram_topics`.
- Canonical auth/session endpoints: `/api/auth` and `/api/session` (`app/api/auth/route.ts`, `app/api/session/route.ts`).
- Deprecated compatibility endpoints: `/api/content/topics` and `/api/content/topics/:topicId` now return `410 Deprecated` migration guidance that points clients to `/api/content` and authenticated owner scoping.

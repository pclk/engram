# Vite to Next.js App Router migration map

| Legacy file | Next.js destination | Notes |
| --- | --- | --- |
| `src/main.tsx` | `app/layout.tsx`, `app/providers.tsx` | Root render tree, global styles, and auth provider wiring moved into App Router root layout and provider component. |
| `src/App.tsx` | `app/page.tsx`, `app/guest/page.tsx`, `app/auth/[[...slug]]/page.tsx`, `app/__e2e/page.tsx` | Route branching moved to file-system routes. |
| `src/views/home.tsx` | `src/views/home.tsx` (reused by `app/page.tsx`) | Home content preserved, now rendered from App Router root route. |
| `src/views/auth/shell.tsx` | `src/views/auth/shell.tsx` (reused by `app/auth/[[...slug]]/page.tsx`) | Auth shell still powers auth route tree. |
| `src/views/account.tsx` | `src/views/account.tsx` (reused by `app/account/[[...slug]]/page.tsx`) | Account view retained under App Router account route. |
| `src/engram.tsx` | `src/engram.tsx` (reused by `app/page.tsx`, `app/guest/page.tsx`, `app/__e2e/page.tsx`) | Main app surface retained and mounted by App Router pages. |
| `index.html` | `app/layout.tsx` | Document shell now managed by Next.js layout. |
| `vite.config.ts` | `next.config.mjs` | Build/runtime config migrated to Next.js config. |
| `src/vite-env.d.ts` | `next-env.d.ts` + Next.js env conventions | Vite typings removed; Next typings now generated/maintained for App Router. |

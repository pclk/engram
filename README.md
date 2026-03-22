# Engram

<p align="center">
  <strong>A modal, keyboard-first knowledge workspace for building study notes, probing questions, cloze prompts, and structured idea trees.</strong>
</p>

<p align="center">
  Built with Next.js, TypeScript, Prisma, PostgreSQL, and Playwright.
</p>

---

## Why Engram

Engram is a text editor for turning rough ideas into study material through a vim-inspired editing model, a lightweight filesystem, and persistence that can run either locally in the browser or in PostgreSQL for authenticated users.

At a glance, Engram gives you:

- A modal editor with `BLOCK`, `NORMAL`, and `INSERT` modes
- Topic documents made of concepts plus derivative prompts
- Derivative types for probing questions, cloze deletions, and elaborations
- A file-and-folder explorer for organizing topics into nested workspaces
- Guest mode with browser-local persistence
- Authenticated mode with server-backed persistence via Prisma + Postgres
- Markdown rendering and one-shot Markdown export
- Wallpaper customization loaded from `/public`

## Feature Highlights

### Editor experience

- Modal editing inspired by vim, adapted for structured study content
- Fast keyboard navigation across concepts and derivatives
- Search, yank, paste, delete, change, undo, and redo flows
- Markdown rendering for concept and derivative bodies when viewed in block mode
- Clipboard export for the active topic as Markdown

### Study-oriented document model

Each topic is a structured document:

- A topic has a title and path
- A topic contains one or more concepts
- Each concept can contain derivative items
- Derivatives are typed as:
  - `PROBING`
  - `CLOZE`
  - `ELABORATION`

This makes Engram useful for note-taking that is meant to be reviewed, questioned, and refined rather than just stored.

### Filesystem-backed organization

- Topics live inside a per-user tree of folders and files
- Nodes are auto-sanitized and deduplicated when names collide
- Nested folders are supported
- Topic deletion removes full subtrees
- Legacy topic records are migrated into the new filesystem model on demand

### Local-first and authenticated workflows

- `/guest` runs without sign-in and persists to `localStorage`
- Signed-in users work against `/api/content` and persist into Postgres
- Session state is maintained with an HTTP-only cookie
- Expired sessions are detected and the client redirects users back to `/login`

### UI polish

- Dark, terminal-like workspace styling
- Personal account panel for profile updates and password changes
- Background wallpaper selection from `/public`
- Adjustable wallpaper opacity per browser

## Routes

| Route                   | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `/`                     | Main authenticated workspace                       |
| `/login`                | Email/password sign-in                             |
| `/register`             | Account creation                                   |
| `/guest`                | Local-only guest workspace                         |
| `/account/[...slug]`    | Account shell / placeholder route                  |
| `/api/content`          | Filesystem and topic CRUD                          |
| `/api/login`            | Start a session                                    |
| `/api/register`         | Create a user and session                          |
| `/api/session`          | Return current session details                     |
| `/api/auth`             | Session inspection / cookie lifecycle              |
| `/api/account`          | Profile updates                                    |
| `/api/account/password` | Password update                                    |
| `/api/wallpapers`       | Enumerate supported wallpaper files from `/public` |

## Keyboard Model

The editor exposes three main modes:

- `BLOCK`: move between concepts and derivatives as structured blocks
- `NORMAL`: move inside text with vim-style motions
- `INSERT`: edit text directly

Some useful shortcuts:

| Shortcut           | Action                             |
| ------------------ | ---------------------------------- |
| `i`, `a`           | Enter insert mode                  |
| `h`, `j`, `k`, `l` | Navigate                           |
| `w`, `b`, `e`      | Word motions in normal mode        |
| `o`, `O`           | Insert new content below / above   |
| `d`, `c`, `y`, `p` | Delete, change, yank, paste flows  |
| `/`                | Search within the current topic    |
| `u`, `r`           | Undo / redo                        |
| `Space + a`        | Open the filesystem switcher       |
| `Space + c`        | Copy the current topic as Markdown |

## Architecture

```mermaid
flowchart LR
  UI[Next.js App Router UI] --> Editor[Engram client workspace]
  Editor --> Guest[localStorage guest persistence]
  Editor --> API[/api/content and auth routes]
  API --> Prisma[Prisma Client]
  Prisma --> Postgres[(PostgreSQL / Neon)]
  API --> Session[HTTP-only session cookie]
  Public[/public wallpapers] --> Editor
```

### Current stack

- Next.js 14 App Router
- React 18
- TypeScript
- Prisma ORM
- PostgreSQL / Neon
- Zod for request and schema validation
- Tailwind CSS
- Vitest + React Testing Library
- Playwright

### Persistence modes

#### Guest mode

- Route: `/guest`
- Storage: `localStorage`
- Useful for quick demos, editor development, and test flows
- No database or auth setup required

#### Authenticated mode

- Routes: `/`, `/login`, `/register`
- Storage: PostgreSQL through Prisma
- Sessions stored in `app_sessions`
- Passwords hashed with `scrypt`

### Data model

The Prisma schema currently includes:

- `User` mapped to `app_users`
- `Session` mapped to `app_sessions`
- `EngramNode` mapped to `engram_nodes`
- `LegacyEngramTopic` mapped to `engram_topics`

`EngramNode` is the primary content model now. It stores both folders and files:

- `type`: `file` or `folder`
- `owner_id`: authenticated owner UUID
- `parent_id`: nullable parent pointer
- `is_root`: marks the per-user root folder
- `topic`: JSON content for file nodes

Legacy records in `engram_topics` are migrated into `engram_nodes` when a user filesystem is first loaded.

## Quick Start

### Prerequisites

- Node.js 20+ recommended
- npm
- PostgreSQL-compatible database if you want authenticated persistence

This repository is intentionally **npm-only**:

- `preinstall` rejects non-npm installs
- `ci:lockfile` rejects `pnpm-lock.yaml`

### 1. Install dependencies

```bash
npm ci
```

Or use the bootstrap script:

```bash
./setup.sh
```

`setup.sh` installs Node dependencies, tries to install Chromium runtime packages when `apt-get` is available, and creates a `.env.local` template if one does not exist.

### 2. Choose a runtime mode

#### Option A: Guest mode only

If you just want to explore the editor locally:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000/guest
```

You can work without signing in, and the app will persist data in the browser.

#### Option B: Full authenticated mode

Create `.env.local` with at least:

```bash
DATABASE_URL="postgresql://..."
```

You can also keep a `DIRECT_URL="postgresql://..."` entry for direct migration workflows if your local setup uses one.

Then generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

Finally start the app:

```bash
npm run dev
```

Visit:

```text
http://localhost:3000/register
```

Create an account, then work from the authenticated workspace at `/`.

## Environment Variables

### Required for authenticated persistence

| Variable       | Required | Purpose                                                                                                                        |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | Yes      | Runtime database connection used by Prisma client                                                                              |
| `DIRECT_URL`   | Optional | Present in local templates and database notes for direct migration connections; the current Prisma schema reads `DATABASE_URL` |

### Optional

| Variable          | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_E2E` | Enables the `/__e2e` route and E2E-specific local mode behavior |
| `E2E_PORT`        | Overrides Playwright dev server port                            |
| `E2E_BASE_URL`    | Overrides Playwright base URL                                   |

### Note on older Neon variables

You may see variables such as `NEXT_PUBLIC_NEON_AUTH_URL`, `NEXT_PUBLIC_NEON_DATA_API_URL`, `NEON_AUTH_URL`, or `GEMINI_API_KEY` in older setup notes or generated templates. They are not part of the current local-auth plus Prisma runtime path reflected in this repository’s active routes.

## Available Scripts

| Command                      | What it does                          |
| ---------------------------- | ------------------------------------- |
| `npm run dev`                | Start Next.js in development          |
| `npm run build`              | Create a production build             |
| `npm run start`              | Start the production server           |
| `npm run lint`               | Run Next.js linting                   |
| `npm run typecheck`          | Run TypeScript without emitting files |
| `npm run format`             | Check Prettier formatting             |
| `npm run format:write`       | Rewrite files with Prettier           |
| `npm run test`               | Run the Vitest suite                  |
| `npm run test:unit`          | Run unit tests                        |
| `npm run test:e2e`           | Run Playwright end-to-end tests       |
| `npm run test:e2e:ui`        | Run Playwright in UI mode             |
| `npm run prisma:generate`    | Generate Prisma client                |
| `npm run prisma:migrate:dev` | Run Prisma development migrations     |
| `npm run ci`                 | Run the repository CI command chain   |

## Testing

### Unit tests

Vitest covers utility and API-layer behavior, including:

- auth helpers
- content schema validation
- topic schema validation
- text utilities

Run them with:

```bash
npm run test:unit
```

### End-to-end tests

Playwright covers core browser flows such as:

- auth page rendering
- guest-mode topic creation
- nested folder and note creation
- rename and delete flows in the filesystem switcher
- markdown rendering behavior

Run them with:

```bash
npm run test:e2e
```

For interactive debugging:

```bash
npm run test:e2e:ui
```

### Full CI sequence

```bash
npm run ci
```

This runs:

- lockfile policy checks
- linting
- Prisma generation + typecheck
- unit tests
- end-to-end tests
- `npm audit`

## API Overview

### Authentication

- `POST /api/register`: create a user, create a session, set the session cookie
- `POST /api/login`: authenticate with email/password and set the session cookie
- `GET /api/session`: return current user + session metadata
- `GET /api/auth`: inspect the current authenticated session
- `POST /api/auth`: attach an existing session token to the cookie
- `DELETE /api/auth`: sign out and clear the session

### Account management

- `PATCH /api/account`: update `name`, `email`, or `image`
- `POST /api/account/password`: change password and optionally revoke other sessions

### Content management

- `GET /api/content`: list the current user filesystem
- `POST /api/content`: create a folder or file node
- `PUT /api/content`: rename, move, or update a node
- `DELETE /api/content?id=<uuid>`: delete a node subtree

## Project Structure

```text
app/                  Next.js routes, layouts, server actions, and API handlers
lib/                  Shared helpers, Prisma access, schemas, and server utilities
prisma/               Prisma schema and migrations
src/                  Main client workspace, views, auth theme, and wallpaper helpers
tests/                Vitest and Playwright coverage
public/               Static assets and wallpaper images
docs/                 Internal notes and refactor documentation
db/                   SQL schema notes and database documentation
```

## Deployment Notes

- `vercel.json` is configured for Next.js deployment
- The repository expects a PostgreSQL-compatible backend for authenticated mode
- Security headers are added in `next.config.js`, including CSP, `X-Frame-Options`, and `X-Content-Type-Options`
- Session cookies are marked `httpOnly`, `sameSite=lax`, and become `secure` in production

## Development Notes

- The app uses a debounced save pipeline for filesystem nodes
- Root folders are created lazily per authenticated user
- Wallpaper discovery only accepts supported image files from `/public`
- Guest mode and E2E mode intentionally use local persistence to keep tests isolated

## Repo Status Notes

The previous README content in the repository referenced an older Neon-auth and server-client split. This README reflects the current code path in the workspace:

- local email/password auth
- Prisma-backed persistence
- filesystem-based content storage
- `/login` and `/register` routes instead of the older auth route naming

## License

No license file is currently present in this repository.

## TODO

- Add ability to adjust font size of both topic and derivatives using `Ctrl +` and `Ctrl -`, and via display settings.

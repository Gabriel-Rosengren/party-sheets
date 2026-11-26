# Development log

A running record of everything done on this project: what was built, why, what went wrong
and how it was verified. Newest session at the top. Each session lists its branch and commits.

Conventions: work happens on feature branches, never directly on `main`; commits are small
and use conventional-commit prefixes (`feat`, `fix`, `chore`, `ci`, `docs`).

---

## 2026-11-26: Session 1, scaffold to MVP

**Branch:** `feat/mvp-scaffold` (off `main`, not pushed: no remote configured yet)
**Pairing:** Gabriel + Claude Code (Claude Opus 5.5)

### Goal

MVP of a realtime D&D sheet-sharing app: a user registers and logs in, then creates or joins a
campaign (or reopens one). Players edit their own sheet. The DM sees every player's sheet
update live over WebSockets.

### Decisions

| Decision | Why |
| --- | --- |
| TypeScript monorepo with npm workspaces (`shared`, `server`, `client`) | One language across the stack. The sheet schema and socket event types are defined once and imported by both sides, so the contract can't drift. |
| Express 5 + Socket.IO | Mainstream and widely used in industry. Socket.IO gives rooms, reconnection and acks out of the box. Express 5 forwards async errors natively. |
| Prisma 7 + SQLite (dev) | Zero-setup local DB; Prisma keeps a later switch to Postgres to a one-line provider change plus a migration. Prisma 7 is the current major (6.x pulled in a CLI dependency with a high-severity advisory). |
| Sheet contents stored as validated JSON on the `Sheet` row | The sheet shape will grow a lot (spells, skills…). JSON + a zod schema with defaults means new fields don't need a migration, and old rows are back-filled when they're read. |
| Session = JWT in an `httpOnly`, `SameSite=Lax` cookie | Not readable by page JS (XSS can't steal it). The same cookie authenticates the Socket.IO handshake, so there's one auth path. |
| Writes via REST, realtime is fan-out only | Validation and authorisation live in exactly one place. Sockets only carry results to people allowed to see them. |
| Permission-scoped rooms (`user:<id>`, `campaign:<id>`, `campaign:<id>:dm`) | A sheet update goes to its owner's sockets plus the DM room, never the whole campaign, so players can't see each other's sheets. |
| 404 (not 403) for resources in campaigns you're not in | Doesn't reveal whether a campaign or sheet id exists. |
| `version` counter on sheets | Lets clients ignore stale or out-of-order socket events and REST responses. It's also groundwork for optimistic concurrency later. |
| Routes depend on a `RealtimeNotifier` interface | Keeps HTTP handlers independent of Socket.IO, which makes them easier to test and to swap. |
| Invite codes: 6 chars, no `0/O/1/I/L` | Can be read aloud at the table without confusion. |

### What was built (in commit order)

1. `chore: initialize repository`: empty root commit on `main` so feature branches have a base.
2. `chore: scaffold npm workspaces monorepo with shared schemas`: root workspace, base tsconfig,
   prettier/editorconfig. `shared/` contains the zod sheet schema (every field defaulted, so
   `parse({})` is a blank sheet), request schemas, response types and the typed socket contract.
3. `feat(server): add auth and campaign API`
   - register / login / logout / me; bcrypt (12 rounds); credential endpoints rate-limited
   - login compares against a dummy hash for unknown emails, so response timing doesn't leak
     which emails are registered
   - create campaign (creator becomes DM, collision-retrying invite codes), join by code
     (idempotent, creates the player's blank sheet in a transaction), campaign detail with the
     invite code visible to the DM only
   - `effect` overridden to a patched version (GHSA-7589-6fvf-x4pw, pulled in by the Prisma CLI)
4. `feat(server): add sheet API and realtime fan-out over Socket.IO`
   - `GET/PUT /api/sheets/:id`: owner or DM may read; only the owner may write
   - Socket.IO cookie auth, membership-checked `campaign:join`, presence broadcast on
     join/leave/disconnect, `member:joined` to the DM when someone joins by code
   - 10 integration tests (Vitest + Supertest + socket.io-client) on a throwaway DB
5. `feat(client): add React app with live DM party board and autosaving sheets`
   - auth pages with field-level server validation messages; dashboard (list/create/join)
   - player view: full sheet editor, 500 ms debounced autosave that never overlaps saves,
     flushes on navigation, warns before closing with unsaved edits
   - DM view: invite code with copy, live party cards (HP bar, AC, speed, conditions,
     presence dot, highlight on update), click for the full read-only sheet
   - socket hook rejoins the campaign room after reconnects and triggers a refetch
6. `fix(client): top-align party card content`: found during browser testing (see below).
7. `chore(server): add demo seed, fix dev watcher and build config`
8. `ci: typecheck, test and build on pull requests`: GitHub Actions workflow.
9. `style: format codebase with prettier`: formatting only. Generated Prisma client and
   Markdown are excluded.
10. `docs: add README, development log and screenshots`

### Problems hit and how they were solved

- **New workspace installs silently skipped.** `npm install <pkgs> -w server` didn't save
  anything the first time, because npm tried to fetch `@party-sheets/shared` from the registry.
  Fix: install third-party packages first, then reference the local package as `"*"` and run
  a plain `npm install` to link it.
- **`postinstall: prisma generate` ran before Prisma was installed.** The script was added back
  after the first install. A clean `npm ci` now generates the client correctly.
- **Prisma CLI advisory.** Every Prisma release since 6.13 pins `effect@3.20.0` (high-severity
  ReDoS, CLI-only). Moved to Prisma 7 and added a root `overrides` to `effect@^3.22.5`.
  `npm audit` is clean. `npm ls` flags the override as "invalid", which is expected.
- **Prisma refused `migrate reset` from an AI agent.** Prisma 7 detects AI agents and blocks
  destructive commands without explicit human consent. Rather than bypass that, the test setup
  now deletes its own throwaway `test.db` and runs the non-destructive `migrate deploy`. It never
  touches `dev.db`.
- **`tsx watch` never reached `listen()` under the IDE's process runner** (no output, no port),
  although it worked in a normal shell. Switched the dev script to Node's built-in
  `node --watch --import tsx`, which works in both.
- **tsup 9 dropped `--noExternal` from the CLI.** Build options moved to `tsup.config.ts`.
- **Tailwind 4 can't `@apply` a custom component class inside another one.** Buttons compose
  `btn btn-primary` in markup instead.
- **Party cards misaligned:** `<button>` vertically centers its content, so shorter cards
  sat lower in the grid. Fixed with `flex flex-col h-full`.

### Verification

- `npm run typecheck`: clean across all three workspaces.
- `npm test`: **10/10 passing**. Covers auth (register/login/logout, wrong password, duplicate
  email, field errors), campaign join/visibility rules, sheet read/write permissions, validation,
  socket auth rejection, DM receives updates, **other players and non-members receive nothing**,
  presence on connect/disconnect.
- Mutation check on the privacy test: temporarily changed fan-out to broadcast to the whole
  campaign and confirmed the test **fails**. Then reverted.
- `npm run build`: server bundle + client bundle succeed; the built server starts.
- Clean `npm ci` from an empty `node_modules`, then typecheck + tests: pass. `npm audit`: 0.
- **Manual end-to-end in the browser:**
  - unauthenticated visit redirects to `/login`
  - DM signs in and opens the seeded campaign; the party board shows "Live"
  - a scripted player connects and edits HP 19 → 5 and adds *Frightened*. The DM's card turns
    red, shows the condition, shows the player online and highlights, all without a reload.
    Presence goes offline when the player disconnects.
  - signing in as that player returns them to the page they were on. Editing level 3 → 4
    shows "Editing…" then "All changes saved", and the value persists across a reload.
- Not yet verified: the CI workflow on GitHub (no remote yet), and production deployment.

### Known limitations / next steps

- Last write wins if the same player edits from two tabs at once (the version counter is in
  place for optimistic concurrency later).
- DM can view but not edit sheets.
- No production deployment story yet (serve client from the API, Postgres, Docker).
- No client-side automated tests yet.
- The prior job-market research referenced at kickoff wasn't available in this session, so the
  stack was chosen as a mainstream, job-relevant default (TS/React/Node/Postgres-ready Prisma).

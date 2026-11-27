# Development log

A running record of everything done on this project: what was built, why, what went wrong
and how it was verified. Newest session at the top. Each session lists its branch and commits.

Conventions: work happens on feature branches, never directly on `main`; commits are small
and use conventional-commit prefixes (`feat`, `fix`, `chore`, `ci`, `docs`).

---

## 2026-11-27: Session 2, DM can edit party sheets

**Branch:** `feat/dm-edit-sheets` (off `main` after PR #1 was merged)
**Pairing:** Gabriel + Claude Code (Claude Opus 5.5)

### Goal

The DM can edit every sheet in a campaign they run (apply damage, add conditions), and the
player sees it live. Now that two people can write the same sheet, neither may silently lose
an edit.

### Decisions

| Decision | Why |
| --- | --- |
| Reuse the existing access rule: owner **or** the campaign's DM may read *and* write | One check (`loadAccessibleSheet`) for both. Anyone else, including a DM of another campaign, still gets 404. |
| Optimistic concurrency: `PUT` requires `baseVersion`; a stale one gets `409` + the current sheet | The `version` counter from session 1 made this cheap. Rejecting is safer than last-write-wins, and returning the current copy saves the client a round trip. |
| Conditional `updateMany` + read-back in one transaction | The write and the "did it land?" check are atomic, and the returned row is the one this write produced even if another save follows immediately. |
| Client-side three-way merge (`mergeThreeWay` in `shared`) | On a 409 or a realtime update, the client's unsaved edits are rebased onto the newer copy: fields it changed keep its value, everything else takes the server value. Objects such as `hp` merge per key, so "DM lowers current HP" and "player raises max HP" both survive. When both changed the same field, the person saving now wins, and they see the result. |
| Autosave tracks a dirty flag, and the save reads the latest draft | A queued save must send the *merged* draft, not a snapshot taken before a remote edit arrived. Otherwise it would overwrite the change it was just merged with. |
| One `EditableSheet` component for the player and the DM | Same autosave, merge and status UI in both places. The DM's copy is keyed by sheet id, so switching players starts a fresh draft. |
| Required `baseVersion` rather than an optional one or an `If-Match` header | Old clients can't keep blindly overwriting, and the contract stays in the shared zod schema. |

### What was built (in commit order)

1. `feat(shared): add three-way merge for concurrent sheet edits`: `mergeThreeWay` plus 4
   unit tests; `shared` now has its own Vitest suite and root `npm test` runs every workspace.
   `updateSheetSchema` gains `baseVersion`, and there is a new `SheetConflict` 409 body type.
2. `feat(server): let the DM edit sheets in their campaign`: PUT allows owner or DM, with a
   version-guarded write. New tests: DM edits a player's sheet, a DM of another campaign gets
   404, a stale save gets 409 and doesn't overwrite, a retry on the current version succeeds,
   and the DM's edit is streamed to the owner's socket.
3. `feat(client): let the DM edit party sheets live`: `useSheetDraft` hook (draft, base
   version, rebase on newer copies, retry on 409 up to 3 times), `EditableSheet` component, DM
   view uses it for the selected sheet.
4. `docs: log DM sheet editing`

### Problems hit and how they were solved

- **Autosave used to queue a value snapshot.** With merging, a queued snapshot could predate a
  remote edit and overwrite it on save. Changed `useAutosave` to a dirty flag, with the save
  function reading the current draft from a ref.
- **Out-of-order responses.** A realtime event for a *later* version can arrive before the PUT
  response for an earlier one. The client only moves its base version forward, never back.
- **My own mistake during the mutation check:** I restored the route file with `git checkout`,
  which brought back the committed version and wiped the uncommitted new route. I had taken a
  backup first and restored from it. Lesson: mutate a copy, or commit before mutation testing.
- **Dev servers already running** (from Gabriel's own `npm run dev`) held ports 3001/5173. I
  used them as they were, since both reload on file changes, rather than stopping them.

### Verification

- `npm test`: **17/17 passing** (4 shared unit + 13 server integration).
- Mutation check: removing the `version: baseVersion` guard makes the stale-save test fail.
- `npm run typecheck` clean. `npm run build` succeeds.
- **Manual end-to-end in the browser** (DM in the browser, Aria driven by a script):
  - DM sets Aria's current HP 19 → 12; Aria's next read returns 12.
  - Aria adds *Poisoned*; it appears in the DM's open editor without a reload.
  - Aria saves a note just before the DM's debounced save fires: the DM's draft is rebased
    from the realtime event and the save goes out on the new version, no conflict.
  - Forced race: the DM's save was held in flight (15 s delay patched into `fetch`) while Aria
    saved her background. The DM's save got **409**, merged and retried, then got **200**. The
    final sheet has the DM's speed *and* Aria's background, alignment and note.

### Known limitations / next steps

- Same-field conflicts resolve to "whoever saves last wins", with no prompt.
- Players aren't told *who* changed their sheet. A `lastEditedBy` field would allow a
  "Your DM set HP to 7" notice.
- Still no client-side automated tests; the merge logic is unit-tested in `shared`.

---

## 2026-11-26: Session 1, scaffold to MVP

**Branch:** `feat/mvp-scaffold` (off `main`) → [PR #1](https://github.com/Gabriel-Rosengren/party-sheets/pull/1)
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
- Not yet verified: production deployment.

### GitHub setup (2026-11-27)

- Installed the GitHub CLI (`winget install GitHub.cli`); Gabriel signed in with `gh auth login`.
- Created the public repo
  [Gabriel-Rosengren/party-sheets](https://github.com/Gabriel-Rosengren/party-sheets) and pushed
  `feat/mvp-scaffold`.
- Remote `main` was created via the GitHub API, pointing at the empty `chore: initialize
  repository` commit, and set as the default branch. Nothing with code was pushed to `main`;
  all work lands through pull requests.
- Opened [PR #1](https://github.com/Gabriel-Rosengren/party-sheets/pull/1) into `main`. CI
  (typecheck, test, build) runs on every PR. Merging is left to Gabriel.
- First CI run passed (31s), with a warning that `actions/checkout@v4` and
  `actions/setup-node@v4` target the deprecated Node 20 runtime. Bumped both to their latest
  major, v7, which runs on Node 24.

### Known limitations / next steps

- Last write wins if the same player edits from two tabs at once (the version counter is in
  place for optimistic concurrency later).
- DM can view but not edit sheets.
- No production deployment story yet (serve client from the API, Postgres, Docker).
- No client-side automated tests yet.
- The prior job-market research referenced at kickoff wasn't available in this session, so the
  stack was chosen as a mainstream, job-relevant default (TS/React/Node/Postgres-ready Prisma).

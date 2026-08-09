# Onboarding plan

## Context

Spindle's value lives almost entirely in configuration only the user can
provide: who they are (`global/memory.md`), where their information lives
(`global/routing.md`), and a real engine wired up (opencode + Graph MCP). An
empty install produces generic output until those exist. The demo mode we
shipped answers *"why should I care"* — a new user sees Spindle in full
motion — but it leaves *"how do I make this mine"* wide open. Today that
bridge is prose in the README's "First hour checklist": read docs, hand-edit
markdown files you've never seen, and trust it matters before any payoff.

This plan closes that gap with three layers that degrade gracefully, gated by
a readiness check so the interactive experience never cold-starts into a dead
end:

1. **Scripted first-run wizard** — engine-free, always works. Captures the
   two things nothing can infer and writes the files for the user.
2. **Staged readiness check ("doctor")** — detects opencode presence, then
   verifies the engine runs, then probes the Graph MCP per-capability with a
   read-only round-trip. Turns the mock→real cliff into a labeled, actionable
   status.
3. **Agent-backed enrichment** — unlocks only when the check is green. The
   getting-started agent *proposes* routing entries and *drafts* the first
   thread from a real task; the user ratifies before anything is written.

Target arc: **demo (see it) → wizard (make it mine) → one real task (feel it)
→ learning loop takes over.**

## Design principles

- **Files on disk, no new deps.** Everything the wizard writes is the same
  markdown a user could hand-edit; the wizard just fills it in for them.
  Reuse `createThread()` (`server.js:96`) and the `global/` conventions.
- **Graceful degradation, not gating-before-value.** The engine-free tier
  works from a cold install. The agent tier layers on when the environment
  supports it — the readiness check sequences the two.
- **Propose, then confirm.** Anything an LLM drafts into foundational config
  (especially `routing.md`, where a wrong "where to look" silently poisons
  every future thread) is shown editable and only written on explicit user
  confirmation. The scripted tier writes exactly what the user typed.
- **Read-only, consented probes.** MCP verification makes the least-sensitive
  read possible, once, with explicit UI copy, and caches the result.

---

## Component 1 — Scripted first-run wizard (engine-free)

### First-run detection
Use an explicit marker, not fragile placeholder-string matching. Fresh
install = `global/.onboarded` absent (dotfile → already invisible in tree,
search, inbox, unread counts per existing dotfile handling). The wizard writes
this marker on completion, so returning users are never nagged, and a user who
deliberately skips setup still isn't re-prompted.

Expose in `/api/state` as `firstRun: <bool>` (mirrors how `demo` is exposed).
Suppress entirely in demo mode (`DEMO` data root ships with the marker
present, and `ui/onboarding.js` also exits if `state.demo`).

### Server
- `POST /api/onboarding/complete` — body `{ persona: string[], routing:
  {topic,location}[], firstThread: {title, purpose} }`. Writes
  `global/memory.md` (header + one line per persona fact), `global/routing.md`
  (header + `topic -> location` lines), creates the thread via the existing
  `createThread()`, then writes `global/.onboarded`. Returns the new thread
  name so the UI can open it.
- All writes are literal user input — no engine involved.

### Frontend — `ui/onboarding.js` (new, mirrors `ui/demo.js`)
Self-contained, activates off the `/api/state` `firstRun` flag; renders in
place of the empty-state (`index.html:56`). A 3-step inline panel:

1. **Who are you / what do you work on** — a few fields + free "add a fact"
   rows → `global/memory.md` lines.
2. **Where do you look things up** — repeatable `topic → location` rows (seed
   with 2 examples: "Supplier contracts → SharePoint site", "Spend questions →
   system/Teams bot") → `global/routing.md`.
3. **Name your first thread** — title + purpose → `createThread()`.

Finish step shows the **readiness check** status (Component 2) and, when
green, the agent-backed actions (Component 3). Reuse `#dlg-new` dialog styling
patterns; add wizard styles to `ui/style.css`.

---

## Component 2 — Staged readiness check ("doctor")

Two surfaces: a CLI (`node server.js --check`) for the terminal setup moment,
and a compact health badge in the sidebar (near `#engine-badge`) plus the
wizard's finish step.

### `lib/doctor.js` (new) — escalating stages
- **Stage A · opencode present** — spawn `<engine.command[0]> --version`
  (respect `config.json` `engine.command`, and `shell:true` on win32 exactly
  as `lib/engine.js` already does). Cheap, deterministic. → installed+version
  or missing (with install guidance).
- **Stage B · engine runs** — only if A passes and mode is `opencode`: run a
  trivial prompt through `engine.run()` with a short timeout to confirm the
  command template/flags actually execute and return. Validates the wiring,
  not just presence. In mock mode, report "engine is mock — switch to
  opencode in config.json to go live" and skip C.
- **Stage C · MCP per-capability** — only if B passes: drive the engine with
  a dedicated prompt (`agents/doctor/prompt.md`) that makes ONE read-only MCP
  call per capability (e.g. get profile / list 1 calendar event / list 1
  recent file / list 1 Teams channel) and emits a parseable JSON result line.
  Report mail / calendar / files / teams **individually** — reachability ≠
  authorized, so a real round-trip is the only trustworthy signal.

Cache the last result to `runs/.doctor.json` with a timestamp; do **not**
re-probe on every startup. Re-run on demand (a "Re-check" button / `--check`)
or when the cache is older than a TTL (config `doctor.cacheTtlMs`).

### Server
- `GET /api/doctor` — returns cached staged status, or fresh on `?refresh=1`.
- Add a compact summary to `/api/state` (e.g. `doctor: {opencode, engine,
  mcp:{mail,calendar,files,teams}, checkedAt}`) so the badge renders without
  a heavy call.
- `--check` CLI path: run the stages, print a readable staged report, exit.

### New engine asset
- `agents/doctor/prompt.md` (+ `AGENTS.md`) — instructs the engine to perform
  the read-only probes and return a parseable result block. Contained, mirrors
  the existing `agents/collector/` pattern.

---

## Component 3 — Agent-backed enrichment (unlocks when green)

Surfaced in the wizard's finish step and on the getting-started thread, but
**only enabled when the doctor is green**. Two high-value actions, each
propose-then-confirm:

1. **Suggest routing entries** — agent reads a small sample of mail/Teams via
   MCP and proposes `topic → location` lines. UI renders them as *editable*
   checkboxes; accepted lines append to `global/routing.md` only on confirm.
2. **Draft my first thread from a real task** — user describes a current task
   in one line; agent drafts a full charter (purpose / expectations /
   proactive / escalate); user reviews and edits; `createThread()` runs with
   the ratified charter.

### Server (propose/confirm split — nothing writes on propose)
- `POST /api/onboarding/suggest-routing` — runs the engine with a
  proposal-only prompt; returns structured suggestions. No disk writes.
- `POST /api/onboarding/apply-routing` — appends user-ratified lines to
  `global/routing.md`.
- `POST /api/onboarding/draft-thread` (propose) and reuse
  `POST /api/threads` (confirm/create).

Guardrail: the propose endpoints never touch `global/` or create threads; the
UI makes every proposed value editable before the separate confirm call, so a
hallucinated URL is caught by the human, not committed silently.

---

## Files

**New**
- `lib/doctor.js` — staged checks + caching.
- `agents/doctor/prompt.md` (+ `AGENTS.md`) — read-only MCP probe prompt.
- `ui/onboarding.js` — first-run wizard (activation pattern from `ui/demo.js`).
- `docs/onboarding.md` — user-facing walkthrough.

**Modified**
- `server.js` — `firstRun` detection (marker) + `doctor` summary in
  `/api/state`; `--check` CLI path; endpoints: `/api/onboarding/complete`,
  `/api/onboarding/suggest-routing`, `/api/onboarding/apply-routing`,
  `/api/onboarding/draft-thread`, `/api/doctor`.
- `ui/index.html` — `<script src="/ui/onboarding.js">`; health-badge element.
- `ui/app.js` — expose `firstRun`/`doctor` in `loadState()` (like `demo`);
  render the health badge.
- `ui/style.css` — wizard + health-badge styles.
- `config.json` — `doctor.cacheTtlMs` (and optionally an explicit
  `engine.versionCommand` if `--version` isn't universal).
- `README.md` — replace the prose "First hour checklist" with a pointer to the
  wizard; add a "Setup & readiness check" note.

## Implementation order
1. First-run marker + `firstRun` in `/api/state` (smallest, unblocks the UI).
2. `ui/onboarding.js` wizard + `POST /api/onboarding/complete` (engine-free
   value end-to-end).
3. `lib/doctor.js` Stage A/B + `/api/doctor` + `--check` + health badge.
4. `agents/doctor/prompt.md` + Stage C per-capability MCP probe + caching.
5. Agent-backed enrichment (propose/confirm endpoints + wizard finish UI).
6. `docs/onboarding.md` + README update.

## Edge cases
- **Demo mode:** wizard suppressed (`state.demo` guard + marker present in demo
  data). Demo and onboarding never both show.
- **Mock engine:** doctor reports mock explicitly and skips the MCP probe with
  a "switch to opencode" hint rather than a red failure.
- **Reachable-but-unauthorized MCP:** avoided by requiring a real read-only
  round-trip per capability; report per-capability, not a single green.
- **Probe cost/safety:** least-sensitive read, once, cached, with explicit
  consent copy in the UI.
- **Hallucinated proposals:** never auto-written; editable + explicit confirm.
- **Returning user / deliberate skip:** marker present → no re-prompt.
- **Windows:** `--version` spawn and probes use `shell:true` on win32, exactly
  as `lib/engine.js` already does; no shell string-building.

## Verification
1. **Fresh install:** remove/relocate `global/.onboarded` → start server →
   wizard appears in place of empty-state; complete 3 steps → verify
   `global/memory.md` + `routing.md` written with typed content, first thread
   created, marker written, wizard does not reappear on reload.
2. **Doctor CLI:** `node server.js --check` with opencode absent → Stage A
   fails with install guidance; with `mode:mock` → reports mock and skips C;
   staging/parse logic tested against a stubbed engine command when a real
   opencode+MCP isn't available.
3. **Doctor caching:** second `/api/doctor` returns cached; `?refresh=1`
   re-probes; badge in sidebar reflects status.
4. **Enrichment (mock):** with the mock engine returning a canned proposal
   block, verify propose → render editable → confirm → appends to
   `routing.md`; assert nothing is written before confirm.
5. **Demo unaffected:** `node server.js --demo` shows the tour, no wizard.
6. **Real data safety:** back up `global/` before wizard tests; confirm only
   intended files change; `git status` clean afterward.

## Risks
- **Stage C depends on a live engine + consented Graph scopes**, so it can't be
  fully exercised in a sandbox without real opencode/MCP. Mitigate by testing
  the staging, parsing, and caching against a stubbed engine command and
  gating the UI on the parsed result.
- **Prompt-parse brittleness** for the doctor/enrichment result blocks — keep
  the engine contract to a single JSON line and fail closed (treat unparseable
  as "unknown/needs attention", never as green).

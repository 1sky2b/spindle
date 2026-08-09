# Demo fixtures

Everything under `demo/` is sample data for demo mode (`node server.js --demo`).
At startup `lib/demo.js` copies `threads/`, `global/`, `scout-drops/` and the
expanded `runs/` templates into a temp directory and points the server there.
The repo's real `threads/` and `runs/` are never touched.

## Timestamp tokens

Fixtures stay readable markdown; freshness comes from tokens expanded at seed
time (in file contents AND file names). Offsets are relative to "now", units
`m`/`h`/`d`:

- `{{TS:-26h}}` -> `2026-08-08 07:31:12` (session-log stamp format)
- `{{ISO:-45m}}` -> `2026-08-09T08:46:12.000Z` (run `startedAt`)
- `{{D:-1}}` -> `2026-08-08` (date only; safe in filenames; a bare number means days)

## Authoring rules (the UI depends on these)

1. **Session logs** (`sessions/log.md`): blocks are `## Who - {{TS:...}}` with a
   blank line before the body. The chat parser splits on lines starting with
   `## `, so **no body text may start a line with `## `** — use `###` or bullets
   inside agent replies. Keep each log well under 40k chars.
2. **Run templates** (`runs/*.json`): one JSON per run with the normal run
   record fields plus `output` (split into the `.out.txt` at seed time). The
   run id is derived from `startedAt`, so keep `startedAt` in the past — the
   Runs tab sorts by id (epoch ms) descending and live demo runs must land on top.
3. **Ordering** is mtime-driven and set by the seeder from `manifest.json`
   (`threads.<name>.lastActivity` offset -> sidebar order); inbox items get
   mtimes in filename sort order (later-sorting names appear first).
4. **`.demo-replies.json`** in a thread folder feeds the mock engine canned,
   thread-appropriate replies: first case-insensitive regex `match` against the
   prompt wins, else `default`. Dotfiles are invisible in the UI. Reply text
   follows rule 1 (no `## ` lines).
5. **`AGENTS.md` is generated** at seed time — never add it as a fixture.
6. **`scout-drops/`** are queued items for the simulated "Run Scout now":
   `NN__<target-thread>__<slug>.md`, consumed in filename order.

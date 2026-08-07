# Spindle architecture

Audience: a coding agent (or human) asked to modify Spindle. Read this first;
it explains where everything lives and the three flows that matter.

## Principles

1. **Files are the database.** Threads, memory, skills, inboxes, sessions,
   run records - all plain files. The server never holds state that isn't on
   disk; restart it any time. This makes the GUI replaceable and lets any
   agent read harness state directly.
2. **The engine is a subprocess, not a library.** Spindle shells out to
   `opencode run` inside a thread folder. opencode auto-loads that folder's
   `AGENTS.md`, does its own tool calling / MCP / subagents. Spindle's job is
   context placement + logging + UI, never model calls.
3. **Zero dependencies.** Node stdlib only (`http`, `fs`, `path`,
   `child_process`, `crypto`, `url`). No npm install behind corporate proxies,
   nothing to audit but this folder.

## Components

```
browser (ui/app.js)
   |  fetch JSON + chunked text streams
   v
server.js (http.createServer, port 4321, localhost only)
   |-- static:   /            -> ui/index.html, /ui/* -> ui/*
   |-- files:    /files/<root-relative path>   (threads/... or global/...)
   |-- api:      /api/...     (see routes below)
   |-- scheduler: setInterval -> runCollectorDetached() at collectorTime
   v
lib/engine.js  -> spawn(opencode|mock) with cwd = thread or agent folder
lib/agentsmd.js -> charter.md + harness rules => AGENTS.md
```

## API routes (all in server.js)

| Route | Method | Purpose |
|---|---|---|
| /api/state | GET | threads list (name, title, unread, color), engine mode, scheduler, roster |
| /api/threads | POST | create thread from template (title, purpose) |
| /api/thread/:name/history | GET | sessions/log.md (tail-truncated at 40k chars) |
| /api/thread/:name/message | POST | run engine with the user message; **streams** chunked text; logs session + run |
| /api/thread/:name/reflect | POST | run the Librarian reflection prompt; streams |
| /api/thread/:name/sync | POST | rebuild AGENTS.md from charter.md |
| /api/thread/:name/inbox | GET | unprocessed inbox items with previews |
| /api/thread/:name/inbox-read | POST | move item to inbox/read/ |
| /api/thread/:name/files | GET | file tree (depth 4), ROOT-relative paths |
| /api/runs | GET | latest 60 run records |
| /api/runs/:id | GET | full output of one run (truncated at 60k chars) |
| /api/collector/run | POST | fire the Scout now (fire-and-forget; poll Runs) |
| /api/search?q= | GET | substring search across threads/ + global/ (md, txt, html, csv, json) |
| /api/global | GET | global/ file tree |

## The three flows

### 1. Message flow
UI POSTs `{text}` -> server composes prompt (`composeMessagePrompt`: the raw
message + a two-line wrapper pointing at AGENTS.md conventions) -> appends the
user turn to `sessions/log.md` -> `engine.run` with `cwd=threads/<name>` ->
stdout/stderr chunks stream straight to the HTTP response (chunked encoding;
the browser reads them with `response.body.getReader()`) -> on close, the full
output is appended to the session log and a run record is written to `runs/`.

Why chunked HTTP instead of SSE/websockets: POST bodies don't work with
EventSource, and fetch-stream reading is ~10 lines client-side with zero
server framework.

### 2. Collector (Scout) flow
Scheduler (or the UI button) calls `runCollectorDetached` -> `engine.run` with
`cwd=agents/collector` and the prompt from `agents/collector/prompt.md`. The
Scout's own AGENTS.md tells it to read every thread charter, scan mail/Teams
via the Graph MCP since its `state.md` timestamp, and write distilled notes
into each relevant thread's `inbox/`. The unread badge in the sidebar is just
a count of top-level files in each inbox.

The scheduler fires once per day: it compares HH:MM every `checkEveryMs` and
uses `runs/.collector-last-day` as the once-per-day guard. It only runs while
the server is running; docs/extending.md covers Windows Task Scheduler for
server-independent runs.

### 3. Learning loop (Librarian)
"Reflect & learn" runs `composeReflectPrompt` in the thread folder: update
memory.md with durable facts, write/improve skills in skills/ for anything
that took multiple attempts, move processed inbox items to read/. The same
behavior is also a standing rule (rule 3) in every AGENTS.md, so it happens
opportunistically at the end of tasks too - the button is the explicit,
batched version.

## Data model (per thread)

```
threads/<name>/
  charter.md      human-owned: purpose, expectations, proactivity, escalation
  AGENTS.md       GENERATED from charter + harness rules (lib/agentsmd.js)
  memory.md       agent-maintained durable facts (distilled)
  skills/         agent-maintained procedures (the learning loop's output)
  inbox/          Scout drops distilled updates; read/ = processed
  artifacts/      everything produced for the user; the UI previews this
  sessions/log.md append-only conversation record ("## Who - timestamp" blocks)
```

Run records: `runs/<id>.json` (metadata) + `runs/<id>.out.txt` (full output).

## Security posture

- Server binds 127.0.0.1 only - never exposed on the network.
- `/files/` paths resolve through `safeJoin` (path traversal rejected) and
  must start with `threads/` or `global/`.
- HTML previews render in a sandboxed iframe (`sandbox="allow-same-origin"`,
  scripts disabled); "Open in tab" is the escape hatch when a report needs JS.
- Agent-side hygiene is contractual: AGENTS.md rule 7 (distill, don't hoard)
  and the Scout's "never paste full bodies" rule.

## What Spindle deliberately does NOT do

- No model API calls (opencode's job), no MCP config (opencode's job), no
  auth (localhost, single user), no database (files), no build step (vanilla
  UI). If a change request pushes toward any of these, check
  docs/decisions.md first - it's probably a decision, not an omission.

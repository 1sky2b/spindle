# Spindle

A personal work harness: threads with their own memory, skills, and inboxes; a
collector agent that keeps them current; a learning loop that turns experience
into skills; and a three-pane GUI to drive it all. Built on **opencode** as the
engine and designed for the **Microsoft Graph MCP** (mail, calendar, Teams,
files).

Zero npm dependencies. Node standard library only. All state is plain files -
delete the server and every thread, memory, and artifact is still readable.

## Quickstart (Windows, 3 minutes)

1. You need Node.js (opencode already requires it, so you likely have it).
   Check: `node --version` (v18+ is fine).
2. Unzip this folder anywhere, e.g. `C:\Users\you\spindle`.
3. In a terminal in that folder: `node server.js`
4. Open **http://localhost:4321** in your browser.
5. It starts in **mock engine mode** so you can test the whole UI with no
   opencode wired up. Click the `getting-started` thread and send a message -
   you should get a mock reply, and the run should appear in the Runs tab.

## Wiring the real engine (opencode)

1. On your work machine run `opencode run --help` and confirm how a
   non-interactive prompt is passed.
2. Edit `config.json`:
   - set `engine.mode` to `"opencode"`
   - adjust `engine.command` if your flags differ. `{prompt}` and `{cwd}` are
     replaced at run time. Example with a model flag:
     `["opencode", "run", "--model", "your-model", "{prompt}"]`
3. Make sure your Graph MCP is configured in opencode itself (opencode's own
   config) - Spindle doesn't touch MCP config; it just runs opencode inside
   the right folder, and opencode picks up that folder's `AGENTS.md`
   automatically.
4. Restart `node server.js`.

## The five ideas (and where they came from)

| Idea | Borrowed from | In Spindle |
|---|---|---|
| Thread-scoped memory, skills, files, crons | QM (yc-software/qm) | Each `threads/<name>/` folder is a self-contained scope with charter, memory, skills, inbox, artifacts |
| Learning loop: skills from experience | Hermes (NousResearch) | The Librarian ("Reflect & learn") + standing rule 3 in every thread's AGENTS.md |
| Agents as named members with audit trails | Buzz (block/buzz) | The roster (`agents/roster.md`) + every run logged in `runs/` |
| Proactive background work | QM crons / Hermes cron / OpenClaw | The Scout collector, scheduled daily in `config.json` |
| GUI: thread list, files, artifact preview | QM web UI | The three-pane UI: threads / conversation / workspace |

## Daily use

- **Talk to a thread**: click it, type, Ctrl+Enter. The resident agent reads
  its charter, memory, skills, and inbox automatically (via AGENTS.md).
- **Inbox**: the Scout files distilled updates from mail/Teams into each
  thread's inbox. The badge shows unprocessed items. The thread agent also
  reads them at the start of each session; "Mark read" moves them to
  `inbox/read/`.
- **Reflect & learn**: run after a meaty session. The Librarian updates
  memory.md and writes/improves skills so the same struggle never happens
  twice.
- **Sync contract**: after you edit a thread's `charter.md`, press this to
  rebuild its AGENTS.md.
- **Runs tab**: the audit trail. Every engine invocation - yours, the
  Librarian's, the Scout's - with status, duration, and full output.
- **Search**: top-left box searches every thread and global file.
- **Themes**: the picker at the bottom of the sidebar carries all of
  opencode's TUI themes (tokyonight, gruvbox, catppuccin, nord, dracula...)
  plus the default Spindle navy, each with a light/dark toggle.

## Folder map

```
spindle/
  server.js          the whole backend (Node stdlib only)
  config.json        port, engine command, scheduler
  lib/engine.js      the only place that invokes opencode (or mock)
  lib/agentsmd.js    builds each thread's AGENTS.md from charter + rules
  ui/                the GUI (vanilla HTML/CSS/JS, no build step)
  global/            routing map, acronyms, global memory, shared skills
  agents/            roster + the Scout's workspace and instructions
  threads/<name>/    charter, AGENTS.md, memory, skills/, inbox/, artifacts/, sessions/
  runs/              audit log of every engine run
  docs/              architecture, decisions (ADRs), extending, troubleshooting
```

## First hour checklist

1. Fill in `global/routing.md` with your real go-to sources - this is the
   highest-leverage file in the harness.
2. Fill in `global/acronyms.md`.
3. Create threads for your top 3-5 active topics; give each a real charter
   (Purpose / Expectations / Be proactive when / Escalate when).
4. Wire opencode (above), send each thread one real task.
5. Set `scheduler.collectorTime` to when you want the morning sweep.

## A note on data hygiene

Spindle's standing rules tell every agent to **distill, never copy**: memory
and inbox notes are summaries; originals stay in Outlook/Teams/SharePoint.
Keep it that way - it keeps this harness consistent with a governed-AI story
(scoped access, auditable runs, no sensitive dumps on disk).

## If the zip gets blocked by email filters

Some mail filters dislike `.js` files inside zips. If yours does: rename the
zip to `.zip.txt` before sending and back after, or rename the three `.js`
files to `.js.txt` and restore the names after unzipping. Nothing else needs
to change.

## Docs

- `docs/architecture.md` - how the pieces fit, request flows, data model
- `docs/decisions.md` - every design decision and why (ADR style)
- `docs/extending.md` - recipes: new agents, Task Scheduler, new preview types
- `docs/troubleshooting.md` - the failure modes and their fixes

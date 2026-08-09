# Onboarding

Getting from a fresh unzip to a Spindle that's actually yours. The path has
five stops:

**demo (see it) -> first-run wizard (make it mine) -> readiness check (is it
wired?) -> one real task (feel it) -> the learning loop takes over.**

You don't have to do all of it at once. The demo and the wizard both work from
a cold install with no engine wired up; the agent-backed steps light up later,
once opencode and the Graph MCP are live.

## 1. Demo - see it in motion

If you've never used Spindle, start with the tour:

```
node server.js --demo        (or set SPINDLE_DEMO=1)
```

It runs on sample procurement data in a temp folder - your real `threads/` are
never touched - and answers "why should I care" before you invest a minute of
setup. Details are in the README's "Demo mode" section. The first-run wizard
below is suppressed in demo mode, so the two never collide.

## 2. First-run wizard - make it mine

On a normal start (`node server.js`, no `--demo`), if Spindle has never been
set up it opens a short wizard in place of the empty thread list. It captures
the two things nothing can infer for you and writes the real files, so you're
not hand-editing markdown you've never seen.

Three steps:

1. **Who are you / what you work on** - a few facts about your role and remit.
   These become `global/memory.md`, the standing context every agent reads.
2. **Where you look things up** - repeatable `topic -> location` rows (it seeds
   a couple of examples). These become `global/routing.md`, the highest-leverage
   file in the harness: it tells every agent where your real information lives.
3. **Name your first thread** - a title and a one-line purpose. This creates a
   real thread folder, the same as the "New thread" button would.

The wizard is engine-free - it writes exactly what you type, no model
involved - so it works from a cold install with no opencode wired up. When you
finish, it writes a marker file, `global/.onboarded`, and won't prompt you
again. A finish screen then shows the readiness check (below), and, if your
engine is already live, the optional agent-backed steps.

## 3. Readiness check ("doctor") - is it actually wired?

Spindle runs in **mock engine mode** out of the box so the whole UI works with
nothing installed. Mock replies are canned; going live means a real opencode
plus a configured, consented Graph MCP. The readiness check tells you exactly
how far along that path you are, so you never cold-start into a dead end.

Two places to see it:

- In the terminal: `node server.js --check` runs the checks, prints a staged
  report, and exits.
- In the app: a compact health badge in the sidebar, and the wizard's finish
  screen. Results are cached (a "Re-check" button / `--check` re-runs them), so
  it doesn't re-probe on every startup.

It reports in escalating stages - each only runs if the previous one passed:

- **opencode present** - is the engine command installed? Reports the version,
  or tells you it's missing with install guidance.
- **engine runs** - runs a trivial prompt through opencode to confirm your
  `config.json` command template and flags actually execute and return. This
  validates the wiring, not just that the binary exists. In **mock** mode this
  stage reports "engine is mock - switch to opencode in `config.json` to go
  live" and stops here; the MCP probe is skipped.
- **Graph MCP, per capability** - **mail, calendar, files, teams** are each
  checked *individually* with one read-only round-trip (e.g. read a profile,
  list a single event). This matters: reachable is not the same as authorized,
  so the only trustworthy signal is a real read. Each probe is the
  least-sensitive read possible, made once, with explicit copy in the UI, and
  the result is cached.

A capability can be red simply because that Graph scope was never consented -
that's a "grant access in opencode" fix, not a bug.

## 4. Agent-backed enrichment - only when the engine is green

Two optional, higher-leverage steps appear on the wizard's finish screen and on
the getting-started thread. They use the engine to read a little of your real
data, so they **only unlock when the readiness check is green**. Both follow the
same rule: **propose, then confirm** - nothing lands in `global/` or creates a
thread until you say so.

- **Suggest routing entries** - the agent reads a small sample of your real
  mail/Teams and proposes `topic -> location` lines. They render as editable
  rows; only the lines you keep and confirm are appended to `global/routing.md`.
  A wrong "where to look" would quietly poison every future thread, so you
  review every one before it's written.
- **Draft my first thread from a task** - describe a current task in one line
  and the agent drafts a full charter (purpose / expectations / be proactive
  when / escalate when). You edit it, and only your ratified version creates the
  thread.

Because these read your mailbox and Teams, they require a real opencode and
consented Graph scopes - the same thing stage three of the readiness check
verifies. Until that's green, the buttons stay disabled and the scripted wizard
above is the full experience.

## 5. One real task, then the loop

With a thread created and the engine live, send it one real task (click it,
type, Ctrl+Enter). From here the everyday loop takes over - talking to threads,
the Scout filing inbox updates, "Reflect & learn" turning experience into
skills. See the README's "Daily use" section.

## Re-running setup / resetting

The wizard is gated entirely on the `global/.onboarded` marker. To run it
again from scratch, delete that file and restart:

```
rm global/.onboarded      # Windows: del global\.onboarded
node server.js
```

Note that finishing the wizard **rewrites** `global/memory.md` and
`global/routing.md` from what you enter - it does not merge with the previous
contents - so on a re-run, re-enter anything you want to keep (or copy those
files aside first). Existing threads are never touched, and the wizard creates
an additional first thread. Deliberately skipping setup is fine too: once the
marker exists you won't be nagged again.

(The agent-backed "Suggest routing entries" step is the exception - it
*appends* the lines you confirm to `global/routing.md` rather than replacing
it.)

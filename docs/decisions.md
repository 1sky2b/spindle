# Design decisions (ADR style)

Each entry: the decision, the alternatives, why. If you're about to change
one, read its "why" first - the constraint that produced it may still hold.

## D1. Node stdlib only, zero npm dependencies
Alternatives: Express/Fastify, a React UI with a build step.
Why: this runs on a corporate Windows machine behind a proxy where
`npm install` may fail or require approval. Node itself is already present
(opencode needs it). Everything in this zip is auditable source - nothing
downloaded at install time.

## D2. Engine = subprocess (opencode), never direct model APIs
Alternatives: call a model API from server.js; embed an agent loop.
Why: opencode already owns tool calling, MCP wiring, subagents, and approved
credentials at work. Spindle adds the layer opencode lacks (threads, GUI,
collector, learning loop) instead of duplicating the layer it has. Swapping
engines = editing config.json's command template.

## D3. AGENTS.md as the context mechanism (not prompt stuffing)
Alternatives: concatenate charter+memory+skills into every prompt.
Why: opencode auto-loads AGENTS.md from its working directory - the standard,
documented mechanism. Prompts stay small (the user's words + 2 lines), and
the standing rules live where the engine expects them. AGENTS.md is generated
from charter.md so the human edits one friendly file (Sync contract rebuilds).

## D4. Files are the database
Alternatives: SQLite, Postgres (QM uses Postgres).
Why: single user, one machine. Files survive the server, are greppable by any
agent, diffable, and email-able. QM needs a DB for multi-user concurrency;
Spindle doesn't have that problem, so it doesn't pay that cost.

## D5. Threads as folders; one resident agent per thread
From QM's scope model. A thread = charter + memory + skills + inbox +
artifacts + sessions in one directory. Cross-thread help = reading the other
folder (rule 5), not an inter-agent messaging protocol - a shared filesystem
is the message bus. Revisit only if threads move across machines.

## D6. The learning loop is a prompt contract, not code
From Hermes. Skill creation/improvement is rule 3 of AGENTS.md plus the
Librarian's reflection prompt. No code parses "did it struggle" - the model
judges that. Cheap, and it improves as models improve. The known failure mode
is skill sprawl; the Librarian prompt includes merge/prune instructions.

## D7. Named agents with an audit trail, no cryptographic identity
From Buzz, scaled down. Scout/Librarian/thread agents are personas with
defined jobs (agents/roster.md) and every run recorded in runs/. Buzz's
signed-event identity matters when multiple humans share a relay; for one
user it's cost without benefit. If this ever goes multiplayer, deploy QM or
Buzz rather than growing Spindle into one.

## D8. Chunked-HTTP streaming, not SSE or websockets
POST + fetch-stream reading is the smallest thing that streams. SSE can't
POST; websockets need a protocol layer. ~10 lines client-side.

## D9. Built-in scheduler, Task Scheduler as the always-on option
The in-server scheduler (config.json) only runs while Spindle is open -
acceptable for a personal tool that's open all day. docs/extending.md has the
Windows Task Scheduler recipe for runs when it isn't.

## D10. Mock engine mode ships enabled
So the whole UI can be validated at work before opencode is wired - and so
any future change can be tested without burning model calls.

## D11. GUI over TUI; artifact preview in-pane
Owner requirement: constant task switching, clickable thread list, quick
preview of HTML/PDF artifacts. HTML previews are sandboxed (no scripts);
"Open in tab" is the full-fidelity path.

## D12. Distill-don't-hoard as a standing rule
A folder of copied emails is the shadow-AI pattern the owner argues against
publicly. Memory and inbox notes are summaries with pointers to originals.
This is a governance stance, not a technical limit - don't relax it casually.

## D13. Themes ported from opencode, not invented
User request: the opencode color themes in Spindle. Source of truth:
opencode's packages/tui/src/theme/assets/*.json (33 themes incl. tokyonight,
gruvbox, catppuccin, nord, dracula...). scripts/convert-opencode-themes.py
resolves each theme's defs and keeps the 15 semantic tokens; the generated
ui/themes.js is checked in so the app needs no network. Mapping lives in
applyTheme() (ui/app.js): primary->--ink, accent->--gold, background->--paper,
backgroundPanel->--card, backgroundElement->--elem, borders->--line*, etc.
The sidebar always uses a theme's DARK variant so the rail stays dark in
light mode (Spindle's identity); main area follows the light/dark toggle.
Contrast on primary-colored surfaces is computed (isLightColor -> --on-ink).
Theme choice persists in localStorage (fine here: local app, own origin).
To update after an opencode upgrade: re-run the converter against the new
assets dir (see docs/extending.md).

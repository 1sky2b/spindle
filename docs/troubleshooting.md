# Troubleshooting

## The UI loads but replies say "[mock engine]..."
Expected: engine.mode is "mock" in config.json. Switch to "opencode" and
restart once you've verified the command template (see README).

## "Could not start engine 'opencode'"
opencode isn't on PATH for the terminal that launched `node server.js`.
Test in the same terminal: `opencode --version`. On Windows, opencode is a
.cmd shim - Spindle already spawns with shell:true there; if you renamed the
binary, update engine.command[0].

## Engine starts but returns nothing / wrong behavior
Run the same thing by hand to isolate Spindle from opencode:
`cd threads\<name>` then `opencode run "hello"`. If that misbehaves, the
issue is opencode config (model, MCP, auth) - fix there. If it works by hand
but not via Spindle, compare flags with config.json's command template.

## Engine runs time out
engine.timeoutMs (default 600000 = 10 min). Long research fan-outs may need
more. The run record in runs/ still captures partial output on timeout.

## The Scout runs but inboxes stay empty
1. Check its output: Runs tab -> latest "Scout" entry.
2. Most common cause: Graph MCP not configured/authorized in opencode.
   Test by hand: `cd agents\collector` then
   `opencode run "list my 3 most recent unread emails"`.
3. Check agents/collector/state.md - a future timestamp there makes "since
   last run" find nothing; delete the file to reset.

## Port already in use
Another Spindle is running, or 4321 is taken. `SPINDLE_PORT=4400 node
server.js` or change config.json.

## Unread badges look wrong
The badge counts top-level files in threads/<name>/inbox/. Files the agent
already processed should be in inbox/read/ - run "Reflect & learn" or mark
them read in the UI.

## Sessions/log.md is getting huge
history is served tail-truncated (40k chars), so the UI stays fast, but the
file grows forever by design (it's the record). If it bothers you, archive:
rename log.md to log-2026.md; Spindle starts a fresh one on next message.

## I edited AGENTS.md and my edits vanished
AGENTS.md is generated. Edit charter.md and press "Sync contract"; put
standing rules that should apply to ALL threads into lib/agentsmd.js.

## Something else broke
Every engine invocation is in runs/ (json + full output). Start there, then
/tmp or console output of `node server.js`. The whole backend is one file
(server.js) - searchable in one pass by opencode.

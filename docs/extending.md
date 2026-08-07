# Extending Spindle - recipes

## Add a new named agent (like the Scout)
1. Create `agents/<name>/AGENTS.md` (its standing instructions) and
   `agents/<name>/prompt.md` (what a single run should do).
2. Add a route in server.js modeled on `/api/collector/run` that calls
   `engine.run({ cwd: path.join(ROOT, "agents", "<name>"), prompt: ... })`
   and writes run records (copy `runCollectorDetached`).
3. Add it to `agents/roster.md` and, if wanted, a button in ui/.
Example ideas: a weekly "portfolio digest" agent; a meeting-prep agent that
watches tomorrow's calendar via Graph MCP.

## Run the Scout even when Spindle is closed (Windows Task Scheduler)
The scheduler inside server.js only ticks while the server runs. For a
machine-level schedule:
1. Create `run-scout.cmd` in the Spindle folder:
   `@node -e "require('./lib/engine').run({cwd:'agents/collector',prompt:require('fs').readFileSync('agents/collector/prompt.md','utf8'),config:require('./config.json')}).then(r=>console.log(r.output))"`
2. Task Scheduler -> Create Basic Task -> Daily at your time -> Start a
   program -> that .cmd, "Start in" = the Spindle folder.
(Or simpler: leave Spindle running; it's a localhost server, not a service.)

## Add a per-thread schedule ("be proactive" crons)
Today proactivity is contractual (the charter's "Be proactive when" section is
honored whenever the agent runs). For true per-thread timers: extend
config.json with e.g. `"threadCrons": [{"thread":"x","time":"08:00","prompt":"..."}]`
and mirror the collector logic in `startScheduler()` - fire
`streamEngineRun`-style runs with `cwd` = that thread. Keep the once-per-day
marker pattern.

## Add a new preview type in the UI
`openPreview` in ui/app.js switches on extension. Add the extension to the
right list (iframe / image / text) and, if the server should send a specific
content type, add it to `MIME` in server.js.

## Change ports, times, engine flags
All in config.json. `SPINDLE_PORT` env var overrides the port.

## Point a thread's agent at another engine or model
`engine.command` is global. For per-thread models, add an optional
`engine` block reader in `composeMessagePrompt`'s caller: read
`threads/<name>/engine.json` if present and pass it through to engine.run's
config. (~15 lines; keep the global as fallback.)

## Back up / move machines
Zip the folder. That's the whole state. Consider a nightly zip of
threads/ + global/ to OneDrive (distilled content only, per the hygiene rule).

## Update or add themes
Themes are generated, not hand-written. To refresh from a newer opencode:
1. Get `packages/tui/src/theme/assets/` from the opencode repo (sparse
   checkout is enough).
2. `python scripts/convert-opencode-themes.py <that-dir>` - rewrites
   ui/themes.js (the built-in "spindle" theme is always kept first).
To add a custom theme instead, append an entry to ui/themes.js following the
same shape (dark + light, 15 tokens) - or better, add it to the converter's
SPINDLE dict pattern so regeneration doesn't lose it.

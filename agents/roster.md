# Agent roster

Named, persistent agents with defined jobs and audit trails (runs/). The Buzz
idea - agents as members, not haunted cron jobs - implemented at personal scale.

| Agent | Job | Runs when | Workspace |
|---|---|---|---|
| Thread agents | Resident agent of each thread; does the thread's work | You message a thread | threads/<name>/ |
| Scout | Collector: triages mail/Teams via Graph MCP, drops updates into thread inboxes | Daily at the scheduled time, or "Run Scout now" | agents/collector/ |
| Librarian | Reflection: distills sessions into memory + skills (the Hermes learning loop) | "Reflect & learn" button per thread | the thread being reflected |

Every run by every agent is recorded in runs/ - who ran, when, how long, full output.

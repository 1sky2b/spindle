#!/usr/bin/env node
/**
 * server.js - Spindle's entire backend. Node stdlib only, no npm install.
 *
 * Responsibilities:
 *   - serve the UI (ui/) and thread files (/files/...)
 *   - JSON API for threads, messages, inbox, runs, search
 *   - stream engine output over chunked HTTP
 *   - built-in scheduler for the daily collector
 *
 * State is 100% files on disk. Delete this server, and every thread, memory,
 * skill, and artifact still exists and is readable. That is by design: the
 * GUI is a viewer, not a database. See docs/architecture.md.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const url = require("url");
const engine = require("./lib/engine");
const agentsmd = require("./lib/agentsmd");

const ROOT = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const PORT = process.env.SPINDLE_PORT || CONFIG.port || 4321;
const THREADS = path.join(ROOT, "threads");
const RUNS = path.join(ROOT, "runs");
const MIME = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".csv": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".xlsx": "application/octet-stream", ".docx": "application/octet-stream",
  ".pptx": "application/octet-stream",
};

/* ---------------- small helpers ---------------- */

function send(res, code, body, type) {
  const buf = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8" });
  res.end(buf);
}
function notFound(res, msg) { send(res, 404, { error: msg || "not found" }); }
function bad(res, msg) { send(res, 400, { error: msg }); }

/** Resolve a user-supplied relative path INSIDE a base dir; null if it escapes. */
function safeJoin(base, rel) {
  const p = path.resolve(base, rel || ".");
  return p === base || p.startsWith(base + path.sep) ? p : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "thread";
}
function nowStamp() { return new Date().toISOString().replace("T", " ").slice(0, 19); }

/* ---------------- threads ---------------- */

function listThreads() {
  if (!fs.existsSync(THREADS)) return [];
  const colors = CONFIG.threadColors || ["#C98F1F"];
  return fs.readdirSync(THREADS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d, i) => {
      const tdir = path.join(THREADS, d.name);
      const inboxDir = path.join(tdir, "inbox");
      let unread = 0;
      try {
        unread = fs.readdirSync(inboxDir, { withFileTypes: true })
          .filter((f) => f.isFile() && !f.name.startsWith(".")).length;
      } catch (_) {}
      let last = 0;
      try { last = fs.statSync(path.join(tdir, "sessions", "log.md")).mtimeMs; } catch (_) {}
      let title = d.name;
      try {
        const m = fs.readFileSync(path.join(tdir, "charter.md"), "utf8").match(/^#\s+(.+)$/m);
        if (m) title = m[1].trim();
      } catch (_) {}
      return { name: d.name, title, unread, lastActivity: last, color: colors[i % colors.length] };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

function createThread(name, title, purpose) {
  const slug = slugify(name || title);
  const tdir = path.join(THREADS, slug);
  if (fs.existsSync(tdir)) throw new Error(`Thread "${slug}" already exists`);
  for (const sub of ["skills", "inbox", "inbox/read", "artifacts", "sessions"])
    fs.mkdirSync(path.join(tdir, sub), { recursive: true });
  const charter = `# ${title || slug}\n\n## Purpose\n${purpose || "(describe what this thread is for)"}\n\n## Expectations\n- (what good output looks like; cadence; format preferences)\n\n## Be proactive when\n- (conditions under which the agent should act or flag without being asked)\n\n## Escalate to me when\n- (what must never be decided autonomously)\n`;
  fs.writeFileSync(path.join(tdir, "charter.md"), charter);
  fs.writeFileSync(path.join(tdir, "memory.md"), `# Memory - ${title || slug}\n\n(durable facts and decisions for this thread; one line per fact)\n`);
  fs.writeFileSync(path.join(tdir, "sessions", "log.md"), `# Session log - ${title || slug}\n`);
  fs.writeFileSync(path.join(tdir, "AGENTS.md"), agentsmd.build(ROOT, slug));
  return slug;
}

function appendSession(threadName, who, text) {
  const f = path.join(THREADS, threadName, "sessions", "log.md");
  fs.appendFileSync(f, `\n## ${who} - ${nowStamp()}\n\n${text.trim()}\n`);
}

/* ---------------- runs (the audit trail) ---------------- */

function newRunId() { return Date.now() + "-" + crypto.randomBytes(3).toString("hex"); }

function writeRun(rec, fullOutput) {
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(path.join(RUNS, rec.id + ".json"), JSON.stringify(rec, null, 2));
  if (fullOutput != null) fs.writeFileSync(path.join(RUNS, rec.id + ".out.txt"), fullOutput);
}

function listRuns(limit) {
  if (!fs.existsSync(RUNS)) return [];
  return fs.readdirSync(RUNS).filter((f) => f.endsWith(".json"))
    .sort().reverse().slice(0, limit || 50)
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")); } catch (_) { return null; } })
    .filter(Boolean);
}

/**
 * Run the engine for a thread/agent and stream output to the response.
 * Also appends to the session log and writes a run record.
 */
async function streamEngineRun(res, { threadName, cwd, prompt, kind, agent, logUserText, logReplyAs }) {
  const id = newRunId();
  const started = Date.now();
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked", "X-Run-Id": id });
  const rec = { id, kind, agent, thread: threadName || null, startedAt: new Date(started).toISOString(), status: "running", promptChars: prompt.length };
  writeRun(rec, null);
  if (threadName && logUserText) appendSession(threadName, "You", logUserText);

  const result = await engine.run({ cwd, prompt, config: CONFIG, onData: (c) => { try { res.write(c); } catch (_) {} } });

  rec.status = result.ok ? "done" : "failed";
  rec.durationMs = Date.now() - started;
  rec.exitCode = result.code;
  if (result.error) rec.error = result.error;
  rec.outputChars = result.output.length;
  writeRun(rec, result.output);

  if (result.error) { try { res.write("\n[spindle] " + result.error + "\n"); } catch (_) {} }
  if (threadName) appendSession(threadName, logReplyAs || "Agent", result.output || "(no output)");
  res.end();
}

/* ---------------- file tree & search ---------------- */

function tree(dir, base, depth) {
  if (depth <= 0) return [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (e.isDirectory()) out.push({ type: "dir", name: e.name, path: rel, children: tree(full, base, depth - 1) });
    else {
      let size = 0, mtime = 0;
      try { const st = fs.statSync(full); size = st.size; mtime = st.mtimeMs; } catch (_) {}
      out.push({ type: "file", name: e.name, path: rel, size, mtime });
    }
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return out;
}

function searchAll(q) {
  const needle = q.toLowerCase();
  const hits = [];
  const roots = [["threads", THREADS], ["global", path.join(ROOT, "global")]];
  const walk = (label, dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (hits.length >= 60 || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(label, full); continue; }
      if (!/\.(md|txt|html|csv|json)$/i.test(e.name)) continue;
      let text;
      try { if (fs.statSync(full).size > 2e6) continue; text = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && hits.length < 60; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ scope: label, file: path.relative(ROOT, full).split(path.sep).join("/"), line: i + 1, text: lines[i].trim().slice(0, 200) });
        }
      }
    }
  };
  for (const [label, dir] of roots) walk(label, dir);
  return hits;
}

/* ---------------- scheduler (collector) ---------------- */

function collectorPrompt() {
  const p = path.join(ROOT, "agents", "collector", "prompt.md");
  try { return fs.readFileSync(p, "utf8"); } catch (_) { return "Collect updates for all threads."; }
}

async function runCollectorDetached(trigger) {
  const id = newRunId();
  const started = Date.now();
  const rec = { id, kind: "collector", agent: "Scout", thread: null, trigger, startedAt: new Date(started).toISOString(), status: "running" };
  writeRun(rec, null);
  const result = await engine.run({ cwd: path.join(ROOT, "agents", "collector"), prompt: collectorPrompt(), config: CONFIG, onData: null });
  rec.status = result.ok ? "done" : "failed";
  rec.durationMs = Date.now() - started;
  rec.exitCode = result.code;
  if (result.error) rec.error = result.error;
  writeRun(rec, result.output);
  return rec;
}

function startScheduler() {
  const sch = CONFIG.scheduler || {};
  if (!sch.enabled) return;
  const marker = path.join(RUNS, ".collector-last-day");
  setInterval(async () => {
    try {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      if (hhmm !== (sch.collectorTime || "07:30")) return;
      const today = now.toISOString().slice(0, 10);
      let lastDay = "";
      try { lastDay = fs.readFileSync(marker, "utf8").trim(); } catch (_) {}
      if (lastDay === today) return;
      fs.mkdirSync(RUNS, { recursive: true });
      fs.writeFileSync(marker, today);
      console.log(`[spindle] scheduler: running collector (${hhmm})`);
      await runCollectorDetached("schedule");
    } catch (e) { console.error("[spindle] scheduler error:", e.message); }
  }, sch.checkEveryMs || 60000);
}

/* ---------------- prompt composition ---------------- */

function composeMessagePrompt(threadName, text) {
  // AGENTS.md carries the standing rules; the prompt stays close to the raw
  // user message plus a tiny wrapper for logging/artifact discipline.
  return (
    `${text.trim()}\n\n` +
    `(Spindle wrapper: you are in thread "${threadName}". Follow AGENTS.md in this folder - ` +
    `check inbox/, save any produced files under artifacts/, update memory.md and skills/ per the learning loop.)`
  );
}

function composeReflectPrompt(threadName) {
  return (
    `Reflection pass for thread "${threadName}". Read sessions/log.md (recent sessions) and runs relevant to this thread. ` +
    `1) Update memory.md with any durable facts/decisions not yet captured (distilled, one line each). ` +
    `2) For any task that took multiple attempts or produced a reusable procedure, write or improve a skill in skills/ ` +
    `(WHEN to use -> exact steps that worked -> pitfalls). Merge near-duplicates. ` +
    `3) Move processed inbox items to inbox/read/. ` +
    `Finish with a short summary of what you learned and changed.`
  );
}

/* ---------------- HTTP routing ---------------- */

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const p = decodeURIComponent(parsed.pathname);

    /* ---- static UI ---- */
    if (req.method === "GET" && (p === "/" || p.startsWith("/ui/"))) {
      const rel = p === "/" ? "index.html" : p.slice(4);
      const file = safeJoin(path.join(ROOT, "ui"), rel);
      if (!file || !fs.existsSync(file)) return notFound(res);
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    }

    /* ---- raw files: /files/threads/<t>/... and /files/global/... ---- */
    if (req.method === "GET" && p.startsWith("/files/")) {
      const rel = p.slice("/files/".length);
      const scopeBase = rel.startsWith("global/") ? ROOT : rel.startsWith("threads/") ? ROOT : null;
      if (!scopeBase) return bad(res, "path must start with threads/ or global/");
      const file = safeJoin(ROOT, rel);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return notFound(res);
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        // Serve previews inline; keep HTML sandboxed on the client (iframe sandbox).
        "Content-Disposition": "inline",
      });
      return fs.createReadStream(file).pipe(res);
    }

    /* ---- API ---- */
    if (p === "/api/state" && req.method === "GET") {
      let roster = "";
      try { roster = fs.readFileSync(path.join(ROOT, "agents", "roster.md"), "utf8"); } catch (_) {}
      return send(res, 200, {
        threads: listThreads(),
        engineMode: (CONFIG.engine || {}).mode || "mock",
        scheduler: CONFIG.scheduler || {},
        roster,
      });
    }

    if (p === "/api/threads" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.title && !body.name) return bad(res, "title required");
      const slug = createThread(body.name, body.title, body.purpose);
      return send(res, 200, { ok: true, name: slug });
    }

    const mThread = p.match(/^\/api\/thread\/([a-z0-9-]+)\/([a-z-]+)$/);
    if (mThread) {
      const [, tname, action] = mThread;
      const tdir = path.join(THREADS, tname);
      if (!fs.existsSync(tdir)) return notFound(res, "no such thread");

      if (action === "history" && req.method === "GET") {
        let text = "";
        try { text = fs.readFileSync(path.join(tdir, "sessions", "log.md"), "utf8"); } catch (_) {}
        if (text.length > 40000) text = "(older history truncated)\n\n" + text.slice(-40000);
        return send(res, 200, { text });
      }

      if (action === "message" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.text || !body.text.trim()) return bad(res, "empty message");
        return streamEngineRun(res, {
          threadName: tname, cwd: tdir,
          prompt: composeMessagePrompt(tname, body.text),
          kind: "message", agent: "thread", logUserText: body.text,
        });
      }

      if (action === "reflect" && req.method === "POST") {
        return streamEngineRun(res, {
          threadName: tname, cwd: tdir,
          prompt: composeReflectPrompt(tname),
          kind: "reflect", agent: "Librarian",
          logUserText: "(reflection pass requested)", logReplyAs: "Librarian",
        });
      }

      if (action === "sync" && req.method === "POST") {
        fs.writeFileSync(path.join(tdir, "AGENTS.md"), agentsmd.build(ROOT, tname));
        return send(res, 200, { ok: true });
      }

      if (action === "inbox" && req.method === "GET") {
        const dir = path.join(tdir, "inbox");
        let items = [];
        try {
          items = fs.readdirSync(dir, { withFileTypes: true })
            .filter((f) => f.isFile() && !f.name.startsWith("."))
            .map((f) => {
              const full = path.join(dir, f.name);
              let preview = "";
              try { preview = fs.readFileSync(full, "utf8").slice(0, 400); } catch (_) {}
              return { name: f.name, mtime: fs.statSync(full).mtimeMs, preview };
            }).sort((a, b) => b.mtime - a.mtime);
        } catch (_) {}
        return send(res, 200, { items });
      }

      if (action === "inbox-read" && req.method === "POST") {
        const body = await readBody(req);
        const src = safeJoin(path.join(tdir, "inbox"), body.name || "");
        if (!src || !fs.existsSync(src)) return notFound(res, "no such inbox item");
        const readDir = path.join(tdir, "inbox", "read");
        fs.mkdirSync(readDir, { recursive: true });
        fs.renameSync(src, path.join(readDir, path.basename(src)));
        return send(res, 200, { ok: true });
      }

      if (action === "files" && req.method === "GET") {
        return send(res, 200, { tree: tree(tdir, ROOT, 4) });
      }
      return notFound(res, "unknown thread action");
    }

    if (p === "/api/runs" && req.method === "GET") return send(res, 200, { runs: listRuns(60) });

    const mRun = p.match(/^\/api\/runs\/([0-9a-z-]+)$/);
    if (mRun && req.method === "GET") {
      const out = path.join(RUNS, mRun[1] + ".out.txt");
      let text = "";
      try { text = fs.readFileSync(out, "utf8"); } catch (_) { return notFound(res); }
      if (text.length > 60000) text = text.slice(0, 60000) + "\n...(truncated)";
      return send(res, 200, { text });
    }

    if (p === "/api/collector/run" && req.method === "POST") {
      // Fire and record; UI polls /api/runs for status.
      runCollectorDetached("manual").catch((e) => console.error(e));
      return send(res, 200, { ok: true, note: "Collector started - watch the Runs tab." });
    }

    if (p === "/api/search" && req.method === "GET") {
      const q = (parsed.query.q || "").trim();
      if (q.length < 2) return send(res, 200, { hits: [] });
      return send(res, 200, { hits: searchAll(q) });
    }

    if (p === "/api/global" && req.method === "GET") {
      return send(res, 200, { tree: tree(path.join(ROOT, "global"), ROOT, 3) });
    }

    notFound(res);
  } catch (err) {
    console.error("[spindle] error:", err);
    try { send(res, 500, { error: err.message }); } catch (_) {}
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nSpindle running -> http://localhost:${PORT}`);
  console.log(`Engine mode: ${(CONFIG.engine || {}).mode || "mock"} ` +
    `(edit config.json to switch between "mock" and "opencode")\n`);
  startScheduler();
});

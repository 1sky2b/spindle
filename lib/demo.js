/**
 * lib/demo.js - demo mode: seed a throwaway data root from demo/ fixtures.
 *
 * `node server.js --demo` (or SPINDLE_DEMO=1) calls seed(), which copies
 * demo/{threads,global,runs,scout-drops} into a temp directory and points the
 * server's data root there. The real threads/ and runs/ are never touched,
 * and every restart starts from a pristine copy.
 *
 * Fixtures are plain committed files with timestamp tokens expanded here so
 * the demo always looks freshly used:
 *   {{TS-26h}}  -> "2026-08-08 07:31:12"  (session-log stamp, offset from now)
 *   {{ISO-45m}} -> ISO-8601 string        (run startedAt)
 *   {{D-1}}     -> "2026-08-08"           (date only; also valid in filenames)
 * Offsets accept m/h/d units and always carry an explicit sign ({{D+0}}, not
 * {{D:0}}) - these tokens appear in fixture *filenames*, and ":" is illegal in
 * a Windows path, which would break `git clone` on Windows. See demo/README.md.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const agentsmd = require("./agentsmd");

const TEXT_EXT = /\.(md|txt|html|htm|csv|json|svg)$/i;
const UNIT_MS = { m: 60000, h: 3600000, d: 86400000 };

function offsetDate(spec) { // "-26h" -> now-26h; a bare number means days
  const m = String(spec).match(/^([+-]?\d+)([mhd]?)$/);
  const ms = m ? Number(m[1]) * UNIT_MS[m[2] || "d"] : 0;
  return new Date(Date.now() + ms);
}
function stamp(d) { return d.toISOString().replace("T", " ").slice(0, 19); }

function expandTokens(text) {
  return text.replace(/\{\{(TS|ISO|D)([+-]\d+[mhd]?)\}\}/g, (_, kind, spec) => {
    const d = offsetDate(spec);
    if (kind === "TS") return stamp(d);
    if (kind === "ISO") return d.toISOString();
    return d.toISOString().slice(0, 10);
  });
}

function copyExpand(src, dest) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, expandTokens(e.name));
    if (e.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyExpand(from, to);
    } else if (TEXT_EXT.test(e.name) || e.name.startsWith(".")) {
      fs.writeFileSync(to, expandTokens(fs.readFileSync(from, "utf8")));
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/** Expand demo/runs/*.json templates into runs/<epochId>-<hex>.json + .out.txt. */
function seedRuns(fixDir, runsDir) {
  fs.mkdirSync(runsDir, { recursive: true });
  let templates = [];
  try { templates = fs.readdirSync(fixDir).filter((f) => f.endsWith(".json")); } catch (_) { return; }
  for (const f of templates) {
    const t = JSON.parse(expandTokens(fs.readFileSync(path.join(fixDir, f), "utf8")));
    const started = new Date(t.startedAt).getTime() || Date.now();
    const id = started + "-" + crypto.randomBytes(3).toString("hex");
    const output = t.output;
    delete t.output;
    t.id = id;
    fs.writeFileSync(path.join(runsDir, id + ".json"), JSON.stringify(t, null, 2));
    if (output != null) fs.writeFileSync(path.join(runsDir, id + ".out.txt"), output);
  }
}

/**
 * Copy demo fixtures into a fresh temp data root and return its path.
 * The returned directory mirrors the repo layout (threads/, global/, runs/).
 */
function seed(root) {
  const tmp = os.tmpdir();
  // Best-effort cleanup of data roots left behind by earlier demo runs.
  try {
    for (const d of fs.readdirSync(tmp)) {
      if (d.startsWith("spindle-demo-") && d !== "spindle-demo-" + process.pid)
        try { fs.rmSync(path.join(tmp, d), { recursive: true, force: true }); } catch (_) {}
    }
  } catch (_) {}

  const dest = path.join(tmp, "spindle-demo-" + process.pid);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  const fixtures = path.join(root, "demo");
  for (const sub of ["threads", "global", "scout-drops"]) {
    const src = path.join(fixtures, sub);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.join(dest, sub), { recursive: true });
    copyExpand(src, path.join(dest, sub));
  }
  seedRuns(path.join(fixtures, "runs"), path.join(dest, "runs"));

  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(fixtures, "manifest.json"), "utf8")); } catch (_) {}

  const threadsDir = path.join(dest, "threads");
  for (const name of fs.readdirSync(threadsDir)) {
    const tdir = path.join(threadsDir, name);
    if (!fs.statSync(tdir).isDirectory()) continue;
    // AGENTS.md is generated, never a fixture, so it can't drift from the builder.
    for (const sub of ["skills", "inbox", "inbox/read", "artifacts", "sessions"])
      fs.mkdirSync(path.join(tdir, sub), { recursive: true });
    fs.writeFileSync(path.join(tdir, "AGENTS.md"), agentsmd.build(dest, name));
    // Sidebar order is the session log's mtime; inbox order is item mtime.
    const offsets = (manifest.threads || {})[name] || {};
    const logTime = offsetDate((offsets.lastActivity || "-3d")) ;
    try { fs.utimesSync(path.join(tdir, "sessions", "log.md"), logTime, logTime); } catch (_) {}
    const inboxDir = path.join(tdir, "inbox");
    let i = 0;
    for (const f of fs.readdirSync(inboxDir).sort()) {
      const full = path.join(inboxDir, f);
      if (!fs.statSync(full).isFile()) continue;
      // Later-sorting filenames get fresher mtimes so listing order matches names.
      const t = new Date(logTime.getTime() - 60000 * (30 - i++));
      try { fs.utimesSync(full, t, t); } catch (_) {}
    }
  }
  return dest;
}

/**
 * Simulated Scout for demo mode: file the next prepared scout-drops item into
 * its target thread's inbox and record a collector run, after a short delay so
 * the Runs tab briefly shows it "running". Drop filenames are
 * "NN__<thread>__<slug>.md"; when none remain, log a "nothing new" run.
 */
function scoutDrop(dataRoot) {
  const dropsDir = path.join(dataRoot, "scout-drops");
  let next = null;
  try {
    next = fs.readdirSync(dropsDir).filter((f) => f.endsWith(".md")).sort()[0] || null;
  } catch (_) {}

  const id = Date.now() + "-" + crypto.randomBytes(3).toString("hex");
  const rec = {
    id, kind: "collector", agent: "Scout", thread: null, trigger: "manual",
    startedAt: new Date().toISOString(), status: "running",
  };
  const runsDir = path.join(dataRoot, "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(path.join(runsDir, id + ".json"), JSON.stringify(rec, null, 2));

  return new Promise((resolve) => setTimeout(() => {
    let summary;
    if (next) {
      const [, thread, slug] = next.replace(/\.md$/, "").split("__");
      const inbox = path.join(dataRoot, "threads", thread, "inbox");
      fs.mkdirSync(inbox, { recursive: true });
      const now = new Date();
      const name = now.toISOString().slice(0, 10) + "-" +
        String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0") +
        "-" + slug + ".md";
      fs.writeFileSync(path.join(inbox, name), fs.readFileSync(path.join(dropsDir, next), "utf8"));
      fs.rmSync(path.join(dropsDir, next));
      summary = `Swept mail and Teams. Filed 1 update into ${thread}/inbox: ${name}. Nothing else met the charter thresholds.`;
    } else {
      summary = "Swept mail and Teams. Nothing new met any thread's charter thresholds - no items filed.";
    }
    rec.status = "done";
    rec.durationMs = 2500;
    rec.exitCode = 0;
    rec.outputChars = summary.length;
    fs.writeFileSync(path.join(runsDir, id + ".json"), JSON.stringify(rec, null, 2));
    fs.writeFileSync(path.join(runsDir, id + ".out.txt"), summary);
    resolve(rec);
  }, 2500));
}

module.exports = { seed, scoutDrop };

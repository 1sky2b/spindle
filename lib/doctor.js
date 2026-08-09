/**
 * lib/doctor.js - Spindle's staged readiness check ("doctor").
 *
 * Setup is the hard part: opencode has to be installed, the engine has to
 * actually run, and each Microsoft Graph MCP capability has to be authorized.
 * This module escalates through those three questions and reports a labeled,
 * per-capability status instead of a single mystery green/red.
 *
 * The stages escalate - each only runs if the previous one passed:
 *   A. opencode present  -> spawn `<engine.command[0]> --version`
 *   B. engine runs       -> a trivial prompt through lib/engine.js
 *   C. MCP per-capability-> one read-only probe per capability, parsed from
 *                           a single JSON line the engine emits
 *
 * Everything fails closed: a missing opencode, a mock engine, an unreachable
 * MCP, or an unparseable probe line all resolve to a fullStatus - this module
 * never throws and never reports "ok" for something it could not confirm.
 *
 * Results are cached to runs/.doctor.json so we don't re-probe on every call.
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const engine = require("./engine");

const DEFAULT_TTL_MS = 3600000; // 1h
const VERSION_TIMEOUT_MS = 8000;
const CAPABILITIES = ["mail", "calendar", "files", "teams"];
const INSTALL_HELP =
  "opencode not found. Install it (see https://opencode.ai) and make sure it is on your PATH, " +
  'then re-run the check. To test the UI without opencode, set engine.mode to "mock" in config.json.';

/** Absolute path of the cache file for a given data root. */
function cachePath(root) {
  return path.join(root, "runs", ".doctor.json");
}

/** TTL from config, falling back to the default. */
function ttlOf(config) {
  const d = (config && config.doctor) || {};
  return typeof d.cacheTtlMs === "number" && d.cacheTtlMs > 0 ? d.cacheTtlMs : DEFAULT_TTL_MS;
}

/**
 * Read the cached fullStatus. Returns null if the file is absent, unparseable,
 * or older than the TTL.
 * @param {string} root  data root (the dir that holds runs/)
 * @param {object} [config]  used for the TTL; default 1h if omitted
 * @returns {object|null}
 */
function cached(root, config) {
  let raw;
  try { raw = fs.readFileSync(cachePath(root), "utf8"); } catch (_) { return null; }
  let obj;
  try { obj = JSON.parse(raw); } catch (_) { return null; }
  const at = Date.parse(obj && obj.checkedAt);
  if (!at) return null;
  if (Date.now() - at > ttlOf(config)) return null;
  return obj;
}

/**
 * Run the staged readiness check.
 * @param {object} opts
 * @param {string} opts.root      data root (holds runs/ and agents/)
 * @param {object} opts.config    the loaded config.json
 * @param {boolean} [opts.refresh]  if false and a fresh cache exists, reuse it
 * @returns {Promise<object>} fullStatus (never rejects)
 */
async function run({ root, config, refresh }) {
  if (!refresh) {
    const hit = cached(root, config);
    if (hit) return hit;
  }
  let status;
  try {
    status = await probe(root, config);
  } catch (err) {
    // Belt-and-suspenders: probe() is written not to throw, but the whole
    // point of the doctor is to never blow up the caller.
    status = allFailed(`Doctor errored: ${(err && err.message) || err}`);
  }
  status.checkedAt = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(cachePath(root)), { recursive: true });
    fs.writeFileSync(cachePath(root), JSON.stringify(status, null, 2));
  } catch (_) { /* caching is best-effort; still return the status */ }
  return status;
}

/** The staged probe. Always resolves to a fullStatus (minus checkedAt). */
async function probe(root, config) {
  const eng = (config && config.engine) || {};
  const mode = eng.mode || "mock";
  const status = {
    opencode: { status: "missing", message: INSTALL_HELP },
    engine: { status: "fail" },
    mcp: mcpAll("skip"),
  };

  /* ---- Stage A: opencode present ---- */
  const a = await checkOpencode(eng);
  status.opencode = a;

  /* ---- Stage B: engine runs ---- */
  if (mode === "mock") {
    status.engine = {
      status: "mock",
      message: "engine is mock - set engine.mode to opencode in config.json to go live",
    };
    status.mcp = mcpAll("skip"); // Stage C skipped in mock mode
    return status;
  }
  if (a.status !== "ok") {
    // opencode missing and we're in opencode mode: the engine cannot run.
    status.engine = { status: "fail", message: "opencode not found - engine cannot run" };
    status.mcp = mcpAll("skip", "engine did not run");
    return status;
  }
  const doctorDir = path.join(root, "agents", "doctor");
  const b = await checkEngineRuns(doctorDir, config);
  status.engine = b;
  if (b.status !== "ok") {
    status.mcp = mcpAll("skip", "engine did not run");
    return status;
  }

  /* ---- Stage C: MCP per-capability ---- */
  status.mcp = await checkMcp(doctorDir, config);
  return status;
}

/** Stage A: spawn `<command[0]> --version`. */
function checkOpencode(eng) {
  const template = eng.command || ["opencode", "run", "{prompt}"];
  const cmd = template[0] || "opencode";
  const versionCmd = eng.versionCommand || [cmd, "--version"];
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; clearTimeout(timer); resolve(val); };
    let child;
    // shell:true on Windows because opencode installs as a .cmd shim (see lib/engine.js).
    try {
      child = spawn(versionCmd[0], versionCmd.slice(1), {
        shell: process.platform === "win32",
        env: process.env,
      });
    } catch (err) {
      return resolve({ status: "missing", message: INSTALL_HELP });
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      done({ status: "missing", message: `\`${cmd} --version\` timed out. ${INSTALL_HELP}` });
    }, VERSION_TIMEOUT_MS);
    const capture = (buf) => { out += buf.toString("utf8"); };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", () => done({ status: "missing", message: INSTALL_HELP }));
    child.on("close", (code) => {
      if (code === 0) {
        const version = firstVersion(out) || out.trim().split("\n")[0].trim() || "unknown";
        done({ status: "ok", version });
      } else {
        done({ status: "missing", message: INSTALL_HELP });
      }
    });
  });
}

/** Pull a version-looking token (e.g. 0.3.12) out of `--version` output. */
function firstVersion(text) {
  const m = String(text).match(/\d+\.\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

/** Stage B: run a trivial prompt through the real engine. */
async function checkEngineRuns(cwd, config) {
  let res;
  try {
    res = await engine.run({ cwd, prompt: "reply with the word OK", config, onData: null });
  } catch (err) {
    return { status: "fail", message: `Engine threw: ${(err && err.message) || err}` };
  }
  if (res && res.ok && res.output && res.output.trim()) return { status: "ok" };
  const msg = (res && res.error) ||
    (res && res.output && res.output.trim() ? "engine returned no usable output" : "engine produced no output");
  return { status: "fail", message: msg };
}

/** Stage C: drive the doctor agent's read-only MCP probes, parse the JSON line. */
async function checkMcp(cwd, config) {
  let res;
  try {
    res = await engine.run({ cwd, prompt: doctorPrompt(cwd), config, onData: null });
  } catch (err) {
    return mcpAll("fail", `MCP probe threw: ${(err && err.message) || err}`);
  }
  if (!res || !res.ok) {
    return mcpAll("fail", (res && res.error) || "MCP probe did not complete");
  }
  const parsed = lastJsonObject(res.output || "");
  if (!parsed) {
    return mcpAll("fail", "could not parse a JSON result line from the probe");
  }
  const mcp = {};
  for (const cap of CAPABILITIES) {
    // Fail closed: only an explicit "ok" counts; anything else is a failure.
    const v = parsed[cap];
    mcp[cap] = typeof v === "string" && v.trim().toLowerCase() === "ok"
      ? { status: "ok" }
      : { status: "fail", message: capMessage(v) };
  }
  return mcp;
}

/** The probe instructions for the doctor agent (mirrors agents/collector). */
function doctorPrompt(cwd) {
  try { return fs.readFileSync(path.join(cwd, "prompt.md"), "utf8"); }
  catch (_) {
    return (
      "Make ONE read-only Microsoft Graph MCP call per capability (mail, calendar, files, teams) " +
      "and output, as your final line only, a single JSON object like " +
      '{"mail":"ok","calendar":"ok","files":"fail","teams":"ok"} - "ok" if the call succeeded, ' +
      '"fail" if it did not. No prose after the JSON line.'
    );
  }
}

/** Explain a non-ok capability value without leaking large payloads. */
function capMessage(v) {
  if (v === undefined) return "capability not reported by the probe";
  if (typeof v === "string") return `reported "${v.slice(0, 40)}"`;
  return "capability not reported as ok";
}

/** Every MCP capability set to one status (+ optional message). */
function mcpAll(status, message) {
  const one = message ? { status, message } : { status };
  const out = {};
  for (const cap of CAPABILITIES) out[cap] = Object.assign({}, one);
  return out;
}

/** A whole-status shortcut for the belt-and-suspenders error path. */
function allFailed(message) {
  return {
    opencode: { status: "missing", message },
    engine: { status: "fail", message },
    mcp: mcpAll("fail", message),
  };
}

/**
 * Extract the LAST balanced top-level JSON object from arbitrary text and parse
 * it. The engine may wrap the line in prose; we want the final result block.
 * String contents (including braces) are respected. Returns null if none parse.
 */
function lastJsonObject(text) {
  const objs = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      if (depth > 0 && --depth === 0 && start !== -1) { objs.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = objs.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(objs[i]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* try the next-earlier object */ }
  }
  return null;
}

/**
 * Reduce a fullStatus to the compact shape used by the sidebar badge / state.
 * @param {object} full  a fullStatus (or partial/absent)
 * @returns {object} compactSummary
 */
function summary(full) {
  const f = full || {};
  const mcpIn = f.mcp || {};
  const mcp = {};
  for (const cap of CAPABILITIES) {
    mcp[cap] = pick(mcpIn[cap] && mcpIn[cap].status, ["ok", "fail", "skip"]);
  }
  return {
    opencode: pick(f.opencode && f.opencode.status, ["ok", "missing"]),
    engine: pick(f.engine && f.engine.status, ["ok", "mock", "fail"]),
    mcp,
    checkedAt: f.checkedAt || null,
  };
}

/** Return value if it's in the allowed set, else "unknown". */
function pick(value, allowed) {
  return allowed.indexOf(value) !== -1 ? value : "unknown";
}

module.exports = { run, cached, summary };

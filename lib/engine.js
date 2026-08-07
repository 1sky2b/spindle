/**
 * lib/engine.js - the one place Spindle talks to an AI engine.
 *
 * Spindle never calls a model API directly. It shells out to a CLI agent
 * (opencode by default) running inside a thread's folder, so the engine
 * picks up that folder's AGENTS.md automatically and does its own tool
 * calling, MCP access, and subagent management.
 *
 * To change engines or flags, edit config.json -> "engine". Placeholders:
 *   {prompt}  the composed prompt text
 *   {cwd}     the working directory of the run
 * If your opencode version uses different flags, run `opencode run --help`
 * at work and adjust config.json - no code change needed for flag tweaks.
 *
 * mode "mock" fakes an engine so the UI can be tested without opencode.
 */
"use strict";
const { spawn } = require("child_process");

/**
 * Run the engine once.
 * @param {object} opts
 * @param {string} opts.cwd        working directory for the run
 * @param {string} opts.prompt     full prompt text
 * @param {object} opts.config     the loaded config.json
 * @param {(chunk: string) => void} opts.onData  streaming output callback
 * @returns {Promise<{ok: boolean, output: string, code: number|null, error?: string}>}
 */
function run({ cwd, prompt, config, onData }) {
  const eng = config.engine || {};
  if ((eng.mode || "mock") === "mock") return mockRun({ prompt, onData });

  return new Promise((resolve) => {
    const template = eng.command || ["opencode", "run", "{prompt}"];
    const argv = template.map((part) =>
      part.replace("{prompt}", prompt).replace("{cwd}", cwd)
    );
    const cmd = argv[0];
    const args = argv.slice(1);
    let output = "";
    let settled = false;

    // shell:true on Windows because opencode installs as a .cmd shim.
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === "win32",
      env: process.env,
    });

    const timeoutMs = eng.timeoutMs || 600000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      resolve({ ok: false, output, code: null, error: `Engine timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    const capture = (buf) => {
      const text = buf.toString("utf8");
      output += text;
      if (onData) onData(text);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false, output, code: null,
        error: `Could not start engine "${cmd}": ${err.message}. ` +
               `Is opencode on your PATH? Try engine.mode "mock" to test the UI.`,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, output, code });
    });
  });
}

/** Fake engine: streams a canned reply so the UI works with no opencode. */
function mockRun({ prompt, onData }) {
  return new Promise((resolve) => {
    const reply =
      "[mock engine] Spindle is wired up correctly.\n\n" +
      "I received your prompt (" + prompt.length + " chars). " +
      "To connect the real engine, set engine.mode to \"opencode\" in config.json " +
      "and verify the command template matches `opencode run --help` on this machine.\n";
    let i = 0;
    const step = () => {
      if (i >= reply.length) return resolve({ ok: true, output: reply, code: 0 });
      const chunk = reply.slice(i, i + 24);
      i += 24;
      if (onData) onData(chunk);
      setTimeout(step, 30);
    };
    step();
  });
}

module.exports = { run };

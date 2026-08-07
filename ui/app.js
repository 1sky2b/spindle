/* Spindle UI logic. Vanilla JS, no build step, no dependencies.
   Talks to server.js over fetch; agent replies stream as chunked text. */
"use strict";

const $ = (id) => document.getElementById(id);
const state = { threads: [], current: null, color: "#C98F1F", busy: false, tab: "inbox" };

/* ---------------- bootstrap ---------------- */

async function loadState() {
  const r = await fetch("/api/state").then((x) => x.json());
  state.threads = r.threads;
  $("engine-badge").textContent = "engine: " + r.engineMode;
  $("sched-note").textContent = r.scheduler && r.scheduler.enabled
    ? "Scout scheduled daily at " + (r.scheduler.collectorTime || "07:30")
    : "Scheduler off (config.json)";
  renderThreads();
}

function renderThreads() {
  const list = $("thread-list");
  list.innerHTML = "";
  for (const t of state.threads) {
    const el = document.createElement("div");
    el.className = "thread-item" + (state.current === t.name ? " active" : "");
    el.innerHTML =
      `<span class="strand" style="background:${t.color}"></span>` +
      `<span class="t-title"></span>` +
      (t.unread ? `<span class="badge">${t.unread}</span>` : "");
    el.querySelector(".t-title").textContent = t.title;
    el.addEventListener("click", () => openThread(t.name, t.color));
    list.appendChild(el);
  }
  if (!state.threads.length) {
    list.innerHTML = `<div class="panel-empty" style="color:#9FB0DC">No threads yet - spin one up.</div>`;
  }
}

/* ---------------- thread view ---------------- */

async function openThread(name, color) {
  state.current = name;
  state.color = color || "#C98F1F";
  renderThreads();
  const t = state.threads.find((x) => x.name === name);
  $("thread-title").textContent = t ? t.title : name;
  $("thread-line").style.background = state.color;
  $("thread-header").classList.remove("hidden");
  $("empty-state").classList.add("hidden");
  $("chat").classList.remove("hidden");
  $("composer").classList.remove("hidden");
  $("workspace").classList.remove("hidden");
  await Promise.all([loadHistory(), loadInbox(), loadFiles()]);
  if (state.tab === "runs") loadRuns();
  $("input").focus();
}

async function loadHistory() {
  const r = await fetch(`/api/thread/${state.current}/history`).then((x) => x.json());
  const chat = $("chat");
  chat.innerHTML = "";
  // Parse the session log's "## Who - timestamp" blocks into bubbles.
  const blocks = (r.text || "").split(/^## /m).slice(1);
  for (const b of blocks) {
    const nl = b.indexOf("\n");
    const head = b.slice(0, nl).trim();
    const body = b.slice(nl + 1).trim();
    const who = head.split(" - ")[0].trim();
    addMsg(who === "You" ? "you" : "agent", who, body, false);
  }
  chat.scrollTop = chat.scrollHeight;
}

function addMsg(cls, who, text, streaming) {
  const el = document.createElement("div");
  el.className = `msg ${cls}` + (streaming ? " streaming" : "");
  el.innerHTML = `<div class="who"></div><div class="body"></div>`;
  el.querySelector(".who").textContent = who;
  el.querySelector(".body").textContent = text;
  $("chat").appendChild(el);
  $("chat").scrollTop = $("chat").scrollHeight;
  return el;
}

/* ---------------- send / stream ---------------- */

async function sendMessage() {
  const text = $("input").value.trim();
  if (!text || state.busy || !state.current) return;
  state.busy = true;
  $("send").disabled = true;
  $("input").value = "";
  addMsg("you", "You", text, false);
  const bubble = addMsg("agent", "Agent", "", true);
  const body = bubble.querySelector(".body");
  try {
    const resp = await fetch(`/api/thread/${state.current}/message`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    await streamInto(resp, body);
  } catch (e) {
    body.textContent += "\n[spindle] request failed: " + e.message;
  }
  bubble.classList.remove("streaming");
  state.busy = false;
  $("send").disabled = false;
  loadState(); // refresh unread counts / ordering
  loadFiles(); // new artifacts may exist
}

async function streamInto(resp, el) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    el.textContent += dec.decode(value, { stream: true });
    $("chat").scrollTop = $("chat").scrollHeight;
  }
  if (!el.textContent.trim()) el.textContent = "(no output - check the Runs tab)";
}

async function reflect() {
  if (state.busy || !state.current) return;
  state.busy = true;
  const bubble = addMsg("agent", "Librarian", "Reflection pass\u2026\n", true);
  try {
    const resp = await fetch(`/api/thread/${state.current}/reflect`, { method: "POST" });
    await streamInto(resp, bubble.querySelector(".body"));
  } catch (e) { bubble.querySelector(".body").textContent += "\nfailed: " + e.message; }
  bubble.classList.remove("streaming");
  state.busy = false;
  loadFiles();
}

async function syncContract() {
  await fetch(`/api/thread/${state.current}/sync`, { method: "POST" });
  addMsg("agent", "Spindle", "AGENTS.md rebuilt from charter.md.", false);
}

/* ---------------- workspace: inbox ---------------- */

async function loadInbox() {
  const r = await fetch(`/api/thread/${state.current}/inbox`).then((x) => x.json());
  const panel = $("tab-inbox");
  panel.innerHTML = "";
  $("inbox-count").classList.toggle("hidden", !r.items.length);
  $("inbox-count").textContent = r.items.length;
  if (!r.items.length) {
    panel.innerHTML = `<div class="panel-empty">Inbox is clear. The Scout drops updates here; so can you (any file in this thread's inbox/ folder).</div>`;
    return;
  }
  for (const it of r.items) {
    const el = document.createElement("div");
    el.className = "inbox-item";
    el.innerHTML = `<div class="in-name"></div><div class="in-prev"></div>
      <div class="in-actions"><button class="act-read">Mark read</button><button class="act-view">View</button></div>`;
    el.querySelector(".in-name").textContent = it.name;
    el.querySelector(".in-prev").textContent = it.preview;
    el.querySelector(".act-read").addEventListener("click", async () => {
      await fetch(`/api/thread/${state.current}/inbox-read`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: it.name }),
      });
      loadInbox(); loadState();
    });
    el.querySelector(".act-view").addEventListener("click", () =>
      openPreview(`threads/${state.current}/inbox/${it.name}`, it.name));
    panel.appendChild(el);
  }
}

/* ---------------- workspace: files ---------------- */

async function loadFiles() {
  const r = await fetch(`/api/thread/${state.current}/files`).then((x) => x.json());
  const panel = $("tab-files");
  panel.innerHTML = "";
  const treeEl = document.createElement("div");
  treeEl.className = "file-tree";
  renderTree(r.tree, treeEl);
  panel.appendChild(treeEl);
}

function renderTree(nodes, parent) {
  for (const n of nodes) {
    if (n.type === "dir") {
      const d = document.createElement("div");
      d.className = "file-dir";
      d.innerHTML = `<div class="dir-name"></div><div class="file-children"></div>`;
      d.querySelector(".dir-name").textContent = n.name + "/";
      renderTree(n.children || [], d.querySelector(".file-children"));
      parent.appendChild(d);
    } else {
      const f = document.createElement("div");
      f.className = "file-row";
      f.innerHTML = `<span class="f-name"></span><span class="f-size"></span>`;
      f.querySelector(".f-name").textContent = n.name;
      f.querySelector(".f-size").textContent = fmtSize(n.size);
      f.querySelector(".f-name").addEventListener("click", () => openPreview(n.path, n.name));
      parent.appendChild(f);
    }
  }
}

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

/* ---------------- workspace: runs ---------------- */

async function loadRuns() {
  const r = await fetch("/api/runs").then((x) => x.json());
  const panel = $("tab-runs");
  panel.innerHTML = "";
  if (!r.runs.length) {
    panel.innerHTML = `<div class="panel-empty">No runs yet. Every engine invocation - messages, reflections, the Scout - is logged here for audit.</div>`;
    return;
  }
  for (const run of r.runs) {
    const el = document.createElement("div");
    el.className = "run-item";
    const when = (run.startedAt || "").replace("T", " ").slice(5, 19);
    el.innerHTML = `
      <div class="run-line1"><span class="run-kind"></span><span class="run-status ${run.status}">${run.status}</span></div>
      <div class="run-line2">${when}${run.durationMs ? " \u00b7 " + Math.round(run.durationMs / 1000) + "s" : ""}${run.error ? " \u00b7 error" : ""}</div>`;
    el.querySelector(".run-kind").textContent = `${run.agent || "agent"} \u00b7 ${run.kind}${run.thread ? " \u00b7 " + run.thread : ""}`;
    el.addEventListener("click", async () => {
      const existing = el.querySelector(".run-output");
      if (existing) { existing.remove(); return; }
      const d = await fetch(`/api/runs/${run.id}`).then((x) => x.json()).catch(() => ({ text: "(no output file)" }));
      const out = document.createElement("div");
      out.className = "run-output";
      out.textContent = d.text || "(empty)";
      el.appendChild(out);
    });
    panel.appendChild(el);
  }
}

/* ---------------- preview ---------------- */

function openPreview(relPath, name) {
  const url = "/files/" + relPath.split("/").map(encodeURIComponent).join("/");
  $("preview-name").textContent = name;
  $("preview-open").href = url;
  const body = $("preview-body");
  body.innerHTML = "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["html", "htm", "pdf"].includes(ext)) {
    const fr = document.createElement("iframe");
    if (ext !== "pdf") fr.setAttribute("sandbox", "allow-same-origin"); // scripts stay off in previews
    fr.src = url;
    body.appendChild(fr);
  } else if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) {
    const img = document.createElement("img");
    img.src = url;
    body.appendChild(img);
  } else if (["md", "txt", "csv", "json", "log"].includes(ext)) {
    fetch(url).then((x) => x.text()).then((t) => {
      const pre = document.createElement("pre");
      pre.textContent = t.slice(0, 200000);
      body.appendChild(pre);
    });
  } else {
    const pre = document.createElement("pre");
    pre.textContent = "No inline preview for ." + ext + " - use \u201cOpen in tab\u201d to download.";
    body.appendChild(pre);
  }
  $("preview").classList.remove("hidden");
}

/* ---------------- search ---------------- */

let searchTimer = null;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q.length < 2) { $("search-results").classList.add("hidden"); return; }
  searchTimer = setTimeout(async () => {
    const r = await fetch("/api/search?q=" + encodeURIComponent(q)).then((x) => x.json());
    const box = $("search-results");
    box.innerHTML = "";
    if (!r.hits.length) box.innerHTML = `<div class="sr-item"><span class="sr-text">No matches.</span></div>`;
    for (const h of r.hits.slice(0, 30)) {
      const el = document.createElement("div");
      el.className = "sr-item";
      el.innerHTML = `<div class="sr-file"></div><div class="sr-text"></div>`;
      el.querySelector(".sr-file").textContent = h.file + ":" + h.line;
      el.querySelector(".sr-text").textContent = h.text;
      el.addEventListener("click", () => {
        openPreview(h.file, h.file.split("/").pop());
        box.classList.add("hidden");
      });
      box.appendChild(el);
    }
    box.classList.remove("hidden");
  }, 250);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#search-results") && !e.target.closest(".search-wrap"))
    $("search-results").classList.add("hidden");
});

/* ---------------- wiring ---------------- */

$("send").addEventListener("click", sendMessage);
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
});
$("btn-reflect").addEventListener("click", reflect);
$("btn-sync").addEventListener("click", syncContract);
$("preview-back").addEventListener("click", () => $("preview").classList.add("hidden"));

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    $("tab-" + state.tab).classList.remove("hidden");
    $("preview").classList.add("hidden");
    if (state.tab === "runs") loadRuns();
    if (state.tab === "inbox") loadInbox();
    if (state.tab === "files") loadFiles();
  });
}

$("new-thread").addEventListener("click", () => $("dlg-new").showModal());
$("new-form").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  const title = $("nt-title").value.trim();
  if (!title) return;
  const r = await fetch("/api/threads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, purpose: $("nt-purpose").value.trim() }),
  }).then((x) => x.json());
  $("nt-title").value = ""; $("nt-purpose").value = "";
  await loadState();
  if (r.name) {
    const t = state.threads.find((x) => x.name === r.name);
    openThread(r.name, t && t.color);
  }
});

$("run-collector").addEventListener("click", async () => {
  await fetch("/api/collector/run", { method: "POST" });
  $("run-collector").textContent = "Scout running\u2026 (see Runs)";
  setTimeout(() => { $("run-collector").textContent = "Run Scout now"; loadState(); }, 4000);
});


/* ---------------- themes (ported from opencode's TUI themes) ----------------
   ui/themes.js (generated) defines window.SPINDLE_THEMES: for each theme a
   dark and light set of the 15 opencode semantic tokens. applyTheme() maps
   them onto Spindle's CSS variables. The sidebar always uses the theme's
   DARK variant, so light mode keeps the dark-rail look; main area follows
   the selected mode. Choice persists in localStorage when available. */

const THEME_KEY = "spindle_theme_v1";

function hexShade(hex, amt) { // amt: -1..1 (negative = darken)
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  const c = (v) => Math.round(v + (t - v) * a).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function isLightColor(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}
const pick = (...vals) => vals.find((v) => v) || "#888888";

function applyTheme(name, mode) {
  const T = (window.SPINDLE_THEMES || {})[name] || window.SPINDLE_THEMES.spindle;
  const m = T[mode] || T.dark;
  const d = T.dark || m;
  const r = document.documentElement.style;
  const set = (k, v) => r.setProperty(k, v);

  const primary = pick(m.primary);
  set("--ink", primary);
  set("--ink-2", hexShade(primary, isLightColor(primary) ? -0.15 : 0.15));
  set("--on-ink", isLightColor(primary) ? pick(m.background, "#101418") : "#FFFFFF");
  set("--paper", pick(m.background));
  set("--card", pick(m.backgroundPanel, m.background));
  set("--elem", pick(m.backgroundElement, m.backgroundPanel));
  set("--line", pick(m.borderSubtle, m.border));
  set("--line-strong", pick(m.border, m.borderSubtle));
  set("--text", pick(m.text));
  set("--mut", pick(m.textMuted, m.text));
  set("--gold", pick(m.accent, m.warning, m.primary));
  set("--ok", pick(m.success, "#3E7C59"));
  set("--bad", pick(m.error, "#8C3A2E"));

  const sbBg = mode === "dark" ? pick(d.backgroundPanel, d.background) : pick(d.background);
  set("--sb-bg", sbBg);
  set("--sb-elem", pick(d.backgroundElement, hexShade(sbBg, 0.08)));
  set("--sb-line", pick(d.borderSubtle, d.border, hexShade(sbBg, 0.15)));
  set("--sb-text", pick(d.text));
  set("--sb-mut", pick(d.textMuted, d.text));
  const sbAccent = pick(d.accent, d.primary);
  set("--sb-accent", sbAccent);
  set("--sb-accent-text", isLightColor(sbAccent) ? pick(d.background, "#101418") : "#FFFFFF");
}

function loadThemePref() {
  try { return JSON.parse(localStorage.getItem(THEME_KEY)) || {}; } catch (_) { return {}; }
}
function saveThemePref(p) { try { localStorage.setItem(THEME_KEY, JSON.stringify(p)); } catch (_) {} }

function initThemes() {
  const sel = $("theme-sel");
  const names = Object.keys(window.SPINDLE_THEMES || { spindle: 1 });
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  }
  const pref = loadThemePref();
  let theme = names.includes(pref.theme) ? pref.theme : "spindle";
  let mode = pref.mode === "dark" ? "dark" : "light";
  sel.value = theme;
  $("mode-toggle").textContent = mode === "dark" ? "light" : "dark";
  applyTheme(theme, mode);
  sel.addEventListener("change", () => {
    theme = sel.value; applyTheme(theme, mode); saveThemePref({ theme, mode });
  });
  $("mode-toggle").addEventListener("click", () => {
    mode = mode === "dark" ? "light" : "dark";
    $("mode-toggle").textContent = mode === "dark" ? "light" : "dark";
    applyTheme(theme, mode); saveThemePref({ theme, mode });
  });
}

initThemes();

/* periodic refresh of thread badges */
setInterval(loadState, 45000);
loadState();

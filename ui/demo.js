/* Spindle demo tour. Loaded on every page but inert unless the server was
   started with --demo (/api/state reports demo:true).

   Drives the real UI through app.js's own functions and DOM handlers - the
   typed message goes through the actual mock engine, the Scout drop writes a
   real inbox file - so what plays back is the product, not a video. Any
   trusted user interaction (real click/keypress outside the banner) stops
   the tour and hands over control. */
"use strict";
(() => {
  const TOUR_MSG = "Draft our counter for the CD-100 renewal - use the quotes comparison CSV in artifacts, cap escalation at 3%, and lead with the SLA miss.";
  let running = false;
  let stopped = false;
  let interacted = false;

  /* ---------- helpers ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function pause(ms) { // interruptible wait
    const end = Date.now() + ms;
    while (Date.now() < end && !stopped) await sleep(100);
  }
  function caption(text) { const c = $("demo-caption"); if (c) c.textContent = text; }
  function highlight(el) {
    document.querySelectorAll(".demo-highlight").forEach((e) => e.classList.remove("demo-highlight"));
    if (el) el.classList.add("demo-highlight");
  }
  function threadColor(name) {
    const t = state.threads.find((x) => x.name === name);
    return t && t.color;
  }
  async function typeInto(el, text) {
    el.value = "";
    for (const ch of text) {
      if (stopped) return false;
      el.value += ch;
      el.dispatchEvent(new Event("input"));
      await sleep(28);
    }
    return true;
  }

  /* ---------- tour steps ---------- */

  const steps = [
    async () => {
      caption("Each thread is a workspace with its own agent, memory, and inbox. Opening one mid-negotiation…");
      if (!state.threads.length) await loadState();
      await openThread("tel-cd100-renewal", threadColor("tel-cd100-renewal"));
      await pause(3500);
    },
    async () => {
      caption("You just talk to the thread - it already knows the charter, the numbers, and the files.");
      const input = $("input");
      highlight($("composer"));
      if (!await typeInto(input, TOUR_MSG)) return;
      await pause(600);
      highlight($("send"));
      await sendMessage(); // real request; the reply streams in live
      highlight(null);
      await pause(2500);
    },
    async () => {
      caption("The Scout agent sweeps mail and Teams every morning and files distilled updates into each thread's inbox.");
      document.querySelector('.tab[data-tab="inbox"]').click();
      highlight($("tab-inbox"));
      await pause(3000);
      const view = document.querySelector("#tab-inbox .act-view");
      if (view) { view.click(); highlight($("preview")); await pause(4500); $("preview-back").click(); }
      highlight(null);
    },
    async () => {
      caption("Everything the agent produces lands in the thread's files - briefs, data, ready-to-send one-pagers.");
      document.querySelector('.tab[data-tab="files"]').click();
      await pause(1500);
      const rows = [...document.querySelectorAll("#tab-files .f-name")];
      const brief = rows.find((r) => r.textContent.includes("negotiation-brief"));
      if (brief) { brief.click(); highlight($("preview")); await pause(5000); }
      const csv = rows.find((r) => r.textContent.endsWith(".csv"));
      if (csv && !stopped) { csv.click(); await pause(4000); }
      highlight(null);
      if (!stopped) $("preview-back").click();
    },
    async () => {
      caption("Every engine invocation - messages, reflections, the Scout - is logged for audit.");
      document.querySelector('.tab[data-tab="runs"]').click();
      highlight($("tab-runs"));
      await pause(1200);
      const top = document.querySelector("#tab-runs .run-item");
      if (top) { top.click(); await pause(3500); }
      highlight(null);
    },
    async () => {
      caption("Running the Scout on demand - watch a fresh update land in another thread…");
      const btn = $("run-collector");
      highlight(btn);
      btn.click();
      await pause(4500);
      highlight(null);
      if (stopped) return;
      await loadState();
      await openThread("supplier-risk-watch", threadColor("supplier-risk-watch"));
      document.querySelector('.tab[data-tab="inbox"]').click();
      highlight($("tab-inbox"));
      await pause(4500);
      highlight(null);
    },
  ];

  async function runTour() {
    if (running) return;
    running = true;
    stopped = false;
    $("demo-tour").textContent = "Stop tour";
    try {
      for (const step of steps) {
        if (stopped) break;
        await step();
      }
    } catch (e) { console.error("[demo tour]", e); }
    running = false;
    highlight(null);
    $("demo-tour").textContent = "Replay tour";
    caption(stopped
      ? "Tour stopped - it's all yours. Sample data resets when the server restarts."
      : "Tour finished - it's all yours. Try sending a message or Reflect & learn. Restarting the server resets the data.");
  }

  function stopTour() {
    stopped = true;
    highlight(null);
  }

  /* ---------- banner + activation ---------- */

  function buildBanner() {
    const bar = document.createElement("div");
    bar.id = "demo-banner";
    bar.innerHTML =
      '<span class="demo-dot"></span><b>Demo mode</b>' +
      '<span id="demo-caption">sample data - resets on restart</span>' +
      '<button id="demo-tour">Watch tour</button>';
    document.body.prepend(bar);
    bar.querySelector("#demo-tour").addEventListener("click", () => {
      if (running) stopTour(); else runTour();
    });
  }

  // A trusted interaction anywhere outside the banner means the user wants
  // the controls; scripted .click() calls dispatch untrusted events, so the
  // tour never trips itself.
  function onUserAct(e) {
    if (!e.isTrusted || e.target.closest("#demo-banner")) return;
    interacted = true;
    if (running) stopTour();
  }
  window.addEventListener("pointerdown", onUserAct, true);
  window.addEventListener("keydown", onUserAct, true);

  fetch("/api/state").then((x) => x.json()).then((r) => {
    if (!r.demo) return;
    document.body.classList.add("demo");
    buildBanner();
    setTimeout(() => { if (!interacted && !running) runTour(); }, 1200);
  }).catch(() => {});
})();

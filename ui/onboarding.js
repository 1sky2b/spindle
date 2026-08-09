/* Spindle first-run wizard. Loaded on every page (after app.js/demo.js) but
   inert unless /api/state reports firstRun:true and NOT demo. Modeled on the
   activation pattern in ui/demo.js: a self-contained IIFE that reads a
   /api/state flag and, only when it applies, mounts UI into the existing DOM.

   Three engine-free steps write the two things nothing can infer (who you are,
   where you look things up) plus a first thread, via POST /api/onboarding/
   complete. The finish screen surfaces the readiness check (shared with the
   sidebar health badge via window.spindleDoctor) and, when the engine is live,
   two propose-then-confirm enrichment actions - nothing writes until you
   confirm. Everything renders inside the center pane in place of #empty-state;
   the three-pane grid stays intact. */
"use strict";
(() => {
  let mounted = false, empty = null, wiz = null;
  let step = 1, completing = false, doneName = null, doneColor = null;
  let nextBtn = null, currentValid = () => true;

  const data = {
    persona: ["", ""],
    routing: [
      { topic: "Supplier contracts", location: "SharePoint site" },
      { topic: "Spend questions", location: "system / Teams bot" },
    ],
    firstThread: { title: "", purpose: "" },
  };

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  const step1Valid = () => data.persona.some((s) => s.trim());
  const step2Valid = () => data.routing.some((r) => r.topic.trim() && r.location.trim());
  const step3Valid = () => data.firstThread.title.trim().length > 0;

  function updateNext() { if (nextBtn) nextBtn.disabled = !currentValid(); }
  function focusLast() {
    const inps = wiz.querySelectorAll(".onb-input");
    if (inps.length) inps[inps.length - 1].focus();
  }

  /* ---------- frame ---------- */

  function stepDots() {
    const d = el("div", "onb-steps");
    for (let i = 1; i <= 3; i++) d.appendChild(el("div", "dot" + (i <= step ? " on" : "")));
    return d;
  }

  function navBar(opts) {
    const nav = el("div", "onb-nav");
    if (opts.back) {
      const b = el("button", "onb-btn", "Back");
      b.type = "button";
      b.addEventListener("click", opts.back);
      nav.appendChild(b);
    }
    nav.appendChild(el("div", "spacer"));
    const n = el("button", "onb-btn primary", opts.nextLabel);
    n.type = "button";
    n.addEventListener("click", opts.onNext);
    currentValid = opts.valid || (() => true);
    n.disabled = !currentValid();
    nextBtn = n;
    nav.appendChild(n);
    return nav;
  }

  /* ---------- steps ---------- */

  function buildStep1(c) {
    c.appendChild(el("h2", null, "Who are you, and what do you work on?"));
    c.appendChild(el("div", "onb-lead", "A few plain facts about your role and priorities. These become your global memory - every thread's agent reads them. Add as many as help."));
    const list = el("div");
    data.persona.forEach((v, i) => {
      const row = el("div", "onb-row");
      const inp = el("input", "onb-input");
      inp.type = "text";
      inp.value = v;
      inp.placeholder = i === 0
        ? "e.g. I'm a procurement lead at Acme, focused on telecom suppliers"
        : "e.g. I own renewals for our top 10 vendors";
      inp.addEventListener("input", () => { data.persona[i] = inp.value; updateNext(); });
      row.appendChild(inp);
      if (data.persona.length > 1) {
        const x = el("button", "onb-x", "×");
        x.type = "button"; x.title = "Remove";
        x.addEventListener("click", () => { data.persona.splice(i, 1); render(); });
        row.appendChild(x);
      }
      list.appendChild(row);
    });
    c.appendChild(list);
    const add = el("button", "onb-add", "+ Add another fact");
    add.type = "button";
    add.addEventListener("click", () => { data.persona.push(""); render(); focusLast(); });
    c.appendChild(add);
    c.appendChild(navBar({ nextLabel: "Next", onNext: () => { step = 2; render(); }, valid: step1Valid }));
  }

  function buildStep2(c) {
    c.appendChild(el("h2", null, "Where do you look things up?"));
    c.appendChild(el("div", "onb-lead", "Map a topic to where its answer lives - a SharePoint site, a Teams bot, a folder. This becomes your routing table, so the agent knows where to point before it guesses."));
    const list = el("div");
    data.routing.forEach((r, i) => {
      const row = el("div", "onb-row");
      const t = el("input", "onb-input");
      t.type = "text"; t.value = r.topic; t.placeholder = "Topic (e.g. Supplier contracts)";
      t.addEventListener("input", () => { data.routing[i].topic = t.value; updateNext(); });
      const loc = el("input", "onb-input");
      loc.type = "text"; loc.value = r.location; loc.placeholder = "Location (e.g. SharePoint site)";
      loc.addEventListener("input", () => { data.routing[i].location = loc.value; updateNext(); });
      row.appendChild(t);
      row.appendChild(el("span", "onb-arrow", "→"));
      row.appendChild(loc);
      if (data.routing.length > 1) {
        const x = el("button", "onb-x", "×");
        x.type = "button"; x.title = "Remove";
        x.addEventListener("click", () => { data.routing.splice(i, 1); render(); });
        row.appendChild(x);
      }
      list.appendChild(row);
    });
    c.appendChild(list);
    const add = el("button", "onb-add", "+ Add another route");
    add.type = "button";
    add.addEventListener("click", () => { data.routing.push({ topic: "", location: "" }); render(); focusLast(); });
    c.appendChild(add);
    c.appendChild(el("div", "onb-hint", "The two examples are placeholders - edit or remove them to match how you actually work."));
    c.appendChild(navBar({ back: () => { step = 1; render(); }, nextLabel: "Next", onNext: () => { step = 3; render(); }, valid: step2Valid }));
  }

  function buildStep3(c) {
    c.appendChild(el("h2", null, "Name your first thread"));
    c.appendChild(el("div", "onb-lead", "A thread is a workspace with its own agent, memory, and inbox. Start one for a live piece of work - you can refine its charter later."));
    c.appendChild(el("div", "onb-field-label", "Title"));
    const t = el("input", "onb-input");
    t.type = "text"; t.value = data.firstThread.title; t.placeholder = "e.g. TEL CD-100 renewal";
    t.addEventListener("input", () => { data.firstThread.title = t.value; updateNext(); });
    c.appendChild(t);
    c.appendChild(el("div", "onb-field-label", "Purpose"));
    const p = el("textarea");
    p.rows = 3; p.value = data.firstThread.purpose;
    p.placeholder = "What is this thread for? What should the agent help you drive?";
    p.addEventListener("input", () => { data.firstThread.purpose = p.value; });
    c.appendChild(p);
    const err = el("div", "onb-err");
    err.id = "onb-err";
    c.appendChild(err);
    c.appendChild(navBar({ back: () => { step = 2; render(); }, nextLabel: "Finish setup", onNext: submit, valid: step3Valid }));
  }

  /* ---------- submit ---------- */

  async function submit() {
    if (completing) return;
    completing = true;
    if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = "Saving…"; }
    const payload = {
      persona: data.persona.map((s) => s.trim()).filter(Boolean),
      routing: data.routing.map((r) => ({ topic: r.topic.trim(), location: r.location.trim() })).filter((r) => r.topic && r.location),
      firstThread: { title: data.firstThread.title.trim(), purpose: data.firstThread.purpose.trim() },
    };
    try {
      const r = await fetch("/api/onboarding/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((x) => x.json());
      if (!r || !r.ok) throw new Error((r && r.error) || "server rejected the setup");
      doneName = r.name || payload.firstThread.title;
      if (typeof loadState === "function") await loadState(); // refresh sidebar + state.doctor
      const t = state.threads.find((x) => x.name === doneName);
      doneColor = t && t.color;
      completing = false;
      step = "done";
      render();
    } catch (e) {
      completing = false;
      const errEl = document.getElementById("onb-err");
      if (errEl) errEl.textContent = "Could not save setup: " + e.message;
      if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = "Finish setup"; }
    }
  }

  /* ---------- finish: readiness + enrichment ---------- */

  function statusClass(s) {
    const sc = window.spindleDoctor && window.spindleDoctor.statusClass;
    return sc ? sc(s) : (s === "ok" ? "ok" : (s === "fail" || s === "missing") ? "bad" : "warn");
  }
  function doctorItems() {
    return (window.spindleDoctor && window.spindleDoctor.items(state.doctor)) || [];
  }
  function engineLive() {
    return !!(window.spindleDoctor && window.spindleDoctor.engineLive(state.doctor));
  }

  function buildReadiness() {
    const box = el("div", "onb-ready");
    box.appendChild(el("h3", null, "Engine readiness"));
    const items = doctorItems();
    if (!items.length) {
      box.appendChild(el("div", "onb-hint", "No readiness data yet - run a check to see engine and connector status."));
    } else {
      for (const it of items) {
        const row = el("div", "onb-ritem " + statusClass(it.status));
        row.appendChild(el("span", "onb-ridot"));
        row.appendChild(el("span", "onb-rname", it.label));
        row.appendChild(el("span", "onb-rmsg", it.message));
        box.appendChild(row);
      }
    }
    const bar = el("div", "onb-ready-foot");
    const btn = el("button", "onb-btn", "Re-check");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Checking…";
      if (window.spindleDoctor && window.spindleDoctor.recheck) await window.spindleDoctor.recheck();
      if (step === "done") render(); // spindle:doctor also re-renders, but be explicit
    });
    bar.appendChild(btn);
    box.appendChild(bar);
    return box;
  }

  function buildEnrichment() {
    const box = el("div", "onb-enrich");
    box.appendChild(el("h3", null, "Live enrichment"));
    box.appendChild(el("div", "onb-lead", "Agent-backed, propose-then-confirm. Every value is editable and nothing is written until you confirm."));
    const live = engineLive();
    box.appendChild(buildSuggestRouting(live));
    box.appendChild(buildDraftThread(live));
    return box;
  }

  function disabledAction(labelText, hint, btnText) {
    const a = el("div", "onb-action disabled");
    a.appendChild(el("div", "onb-field-label", labelText));
    a.appendChild(el("div", "onb-hint", hint));
    a.appendChild(el("div", "onb-hint", "Engine not live - see the readiness check above."));
    const b = el("button", "onb-btn", btnText);
    b.type = "button"; b.disabled = true;
    a.appendChild(b);
    return a;
  }

  function buildSuggestRouting(live) {
    if (!live) return disabledAction("Suggest routing entries", "Reads a small sample of your mail / Teams and proposes topic → location lines.", "Suggest");
    const a = el("div", "onb-action");
    a.appendChild(el("div", "onb-field-label", "Suggest routing entries"));
    a.appendChild(el("div", "onb-hint", "Reads a small sample of your mail / Teams and proposes topic → location lines. Nothing is written until you confirm."));
    const out = el("div");
    const b = el("button", "onb-btn", "Suggest routing entries");
    b.type = "button";
    b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Thinking…"; out.innerHTML = "";
      try {
        const r = await fetch("/api/onboarding/suggest-routing", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        }).then((x) => x.json());
        renderSuggestions(out, (r && r.suggestions) || []);
      } catch (e) { out.textContent = "Failed: " + e.message; }
      b.disabled = false; b.textContent = "Suggest again";
    });
    a.appendChild(b);
    a.appendChild(out);
    return a;
  }

  function renderSuggestions(out, suggestions) {
    out.innerHTML = "";
    if (!suggestions.length) { out.appendChild(el("div", "onb-hint", "No suggestions returned.")); return; }
    const rows = [];
    suggestions.forEach((s) => {
      const row = el("div", "onb-suggest-row");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = true;
      const t = el("input", "onb-input"); t.type = "text"; t.value = s.topic || "";
      const loc = el("input", "onb-input"); loc.type = "text"; loc.value = s.location || "";
      row.appendChild(cb);
      row.appendChild(t);
      row.appendChild(el("span", "onb-arrow", "→"));
      row.appendChild(loc);
      out.appendChild(row);
      rows.push({ cb, t, loc });
    });
    const msg = el("div", "onb-hint");
    const confirm = el("button", "onb-btn primary", "Add checked to routing");
    confirm.type = "button";
    confirm.addEventListener("click", async () => {
      const entries = rows.filter((r) => r.cb.checked)
        .map((r) => ({ topic: r.t.value.trim(), location: r.loc.value.trim() }))
        .filter((e) => e.topic && e.location);
      if (!entries.length) { msg.textContent = "Check at least one complete row."; return; }
      confirm.disabled = true; confirm.textContent = "Adding…";
      try {
        const r = await fetch("/api/onboarding/apply-routing", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }),
        }).then((x) => x.json());
        if (!r || !r.ok) throw new Error((r && r.error) || "rejected");
        msg.textContent = "Added " + entries.length + " entr" + (entries.length === 1 ? "y" : "ies") + " to your routing table.";
        confirm.textContent = "Added";
      } catch (e) {
        msg.textContent = "Failed: " + e.message;
        confirm.disabled = false; confirm.textContent = "Add checked to routing";
      }
    });
    out.appendChild(confirm);
    out.appendChild(msg);
  }

  function buildDraftThread(live) {
    if (!live) return disabledAction("Draft my first thread from a task", "Describe a real task in one line; the agent drafts a full charter you can edit before it's created.", "Draft");
    const a = el("div", "onb-action");
    a.appendChild(el("div", "onb-field-label", "Draft my first thread from a task"));
    a.appendChild(el("div", "onb-hint", "Describe a real task in one line; the agent drafts a full charter you can edit before it's created."));
    const inp = el("input", "onb-input");
    inp.type = "text"; inp.placeholder = "e.g. Prepare our counter for the CD-100 renewal";
    const out = el("div");
    const b = el("button", "onb-btn", "Draft charter");
    b.type = "button";
    b.addEventListener("click", async () => {
      const task = inp.value.trim();
      if (!task) return;
      b.disabled = true; b.textContent = "Drafting…"; out.innerHTML = "";
      try {
        const r = await fetch("/api/onboarding/draft-thread", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task }),
        }).then((x) => x.json());
        renderDraft(out, r || {});
      } catch (e) { out.textContent = "Failed: " + e.message; }
      b.disabled = false; b.textContent = "Draft again";
    });
    a.appendChild(inp);
    a.appendChild(b);
    a.appendChild(out);
    return a;
  }

  function renderDraft(out, d) {
    out.innerHTML = "";
    out.appendChild(el("div", "onb-field-label", "Title"));
    const t = el("input", "onb-input"); t.type = "text"; t.value = d.title || "";
    out.appendChild(t);
    out.appendChild(el("div", "onb-field-label", "Purpose"));
    const p = el("textarea"); p.rows = 2; p.value = d.purpose || "";
    out.appendChild(p);
    out.appendChild(el("div", "onb-field-label", "Charter"));
    const ch = el("textarea"); ch.rows = 5; ch.value = d.charter || "";
    out.appendChild(ch);
    const msg = el("div", "onb-hint");
    const confirm = el("button", "onb-btn primary", "Create thread");
    confirm.type = "button";
    confirm.addEventListener("click", async () => {
      const title = t.value.trim();
      if (!title) { msg.textContent = "Title required."; return; }
      confirm.disabled = true; confirm.textContent = "Creating…";
      try {
        const r = await fetch("/api/threads", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, purpose: p.value.trim() }),
        }).then((x) => x.json());
        if (!r || !r.name) throw new Error((r && r.error) || "rejected");
        if (typeof loadState === "function") await loadState();
        msg.textContent = "Created “" + title + "” - open it from the sidebar.";
        confirm.textContent = "Created";
      } catch (e) {
        msg.textContent = "Failed: " + e.message;
        confirm.disabled = false; confirm.textContent = "Create thread";
      }
    });
    out.appendChild(confirm);
    out.appendChild(msg);
    // Contract note: POST /api/threads accepts only {title,purpose}; the drafted
    // charter is shown for review but not persisted through this endpoint.
    out.appendChild(el("div", "onb-hint", "Note: the thread is created with title and purpose; paste the charter into its charter.md to apply the full contract."));
  }

  function renderFinish() {
    wiz.innerHTML = "";
    const c = el("div", "onb-card");
    c.appendChild(el("div", "onb-kicker", "Setup complete"));
    c.appendChild(el("h2", null, "You're set up."));
    c.appendChild(el("div", "onb-lead", "Your memory and routing are written, and “" + (data.firstThread.title.trim() || doneName) + "” is ready. Here's where your engine stands - the live actions below unlock when it's connected."));
    c.appendChild(buildReadiness());
    c.appendChild(buildEnrichment());
    const nav = el("div", "onb-nav");
    nav.appendChild(el("div", "spacer"));
    const open = el("button", "onb-btn primary", "Open my thread →");
    open.type = "button";
    open.addEventListener("click", finishAndOpen);
    nav.appendChild(open);
    c.appendChild(nav);
    wiz.appendChild(c);
  }

  function finishAndOpen() {
    if (wiz && wiz.parentNode) wiz.remove();
    const card = empty && empty.querySelector(".empty-card");
    if (card) card.classList.remove("hidden");
    mounted = false;
    if (doneName && typeof openThread === "function") openThread(doneName, doneColor);
  }

  /* ---------- render dispatch ---------- */

  function render() {
    if (!wiz) return;
    if (step === "done") { renderFinish(); return; }
    wiz.innerHTML = "";
    const card = el("div", "onb-card");
    card.appendChild(stepDots());
    card.appendChild(el("div", "onb-kicker", "First-run setup · Step " + step + " of 3"));
    if (step === 1) buildStep1(card);
    else if (step === 2) buildStep2(card);
    else buildStep3(card);
    wiz.appendChild(card);
  }

  /* ---------- mount + activation ---------- */

  function mount() {
    empty = document.getElementById("empty-state");
    if (!empty) return;
    const card = empty.querySelector(".empty-card");
    if (card) card.classList.add("hidden");
    wiz = el("div", "onb-wizard");
    empty.appendChild(wiz);
    mounted = true;
    render();
  }

  // Keep the finish-step readiness/enrichment in sync when the doctor re-runs.
  document.addEventListener("spindle:doctor", () => { if (mounted && step === "done") render(); });

  fetch("/api/state").then((x) => x.json()).then((r) => {
    if (!r || !r.firstRun || r.demo) return;
    if (document.body.classList.contains("demo")) return; // demo.js may win the race
    if (!state.doctor && r.doctor) state.doctor = r.doctor;
    mount();
  }).catch(() => {});
})();

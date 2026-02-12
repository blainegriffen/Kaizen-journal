/* Daily Kaizen Journal (offline/local) - Vanilla JS
   Storage: localStorage (simple + plug-and-play)
   If you later want IndexedDB, you can swap storage layer.
*/

const APP = {
  version: "v1",
  domains: [
    { key: "Health/Fitness", short: "Health" },
    { key: "Work", short: "Work" },
    { key: "Mental/Emotional Health", short: "Mental/Emotional" },
    { key: "Spiritual/Inner Life", short: "Spiritual" },
  ],
  storageKeys: {
    entries: "kaizen_entries_v1",
    library: "kaizen_library_v1",
  }
};

const STOPWORDS = new Set([
  "the","and","that","this","with","from","were","was","are","but","for","not","you","your","into","then",
  "they","them","have","had","has","just","like","about","what","when","where","why","how","did","didnt",
  "didn’t","work","worked","didn","dont","don’t","very","much","more","less","today","yesterday","tomorrow",
  "also","because","over","under","after","before","during","while","again","really","even","still"
]);

// ---------- Utilities ----------
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toISODate(d) {
  const dt = new Date(d);
  dt.setHours(0,0,0,0);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2,"0");
  const day = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function fromISODate(s) {
  const [y,m,d] = s.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setHours(0,0,0,0);
  return dt;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 Sun, 1 Mon...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function clampText(s) {
  return (s || "").trim();
}

// ---------- Storage ----------
function loadEntries() {
  try { return JSON.parse(localStorage.getItem(APP.storageKeys.entries) || "{}"); }
  catch { return {}; }
}
function saveEntries(obj) {
  localStorage.setItem(APP.storageKeys.entries, JSON.stringify(obj));
}

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(APP.storageKeys.library) || "[]"); }
  catch { return []; }
}
function saveLibrary(arr) {
  localStorage.setItem(APP.storageKeys.library, JSON.stringify(arr));
}

// ---------- Entry creation ----------
function defaultEntryFor(dateISO) {
  const now = Date.now();
  return {
    id: uuid(),
    date: dateISO,
    domainTags: [],
    facts: "",
    worked: "",
    didnt: "",
    improvement: {
      id: uuid(),
      text: "",
      domains: [],
      status: "needsTesting",
      originDate: dateISO
    },
    lensNotes: {}, // domainKey -> text
    quickSignals: {
    sleepQuality: "",
    movementDone: false,
    deepWorkDone: false,
    spiritualPracticeDone: false,
    mentalEmotionalDone: false
    },

    completed: false,
    createdAt: now,
    updatedAt: now
  };
}

function getOrCreateEntry(dateISO) {
  const entries = loadEntries();
  if (!entries[dateISO]) {
    entries[dateISO] = defaultEntryFor(dateISO);
    saveEntries(entries);
  }
  return entries[dateISO];
}

function upsertEntry(entry) {
  const entries = loadEntries();
  entry.updatedAt = Date.now();
  entries[entry.date] = entry;
  saveEntries(entries);
}

// ---------- UI wiring ----------
const els = {};
function bindEls() {
  [
    "btnExport","btnPrevDay","btnNextDay","btnGoToday","btnMakeSmaller","btnUseFromLibrary",
    "btnAddLensNote","btnSave","saveStatus","todayTitle",
    "facts","worked","didnt","improvementText","improvementValidation",
    "sleepQuality","movementDone","deepWorkDone","spiritualPracticeDone","mentalEmotionalDone","completed",
    "domainChips","improvementDomainChips","lensNotes",
    "searchBox","timelineList","timelineDomainFilters",
    "btnPrevWeek","btnNextWeek","btnThisWeek","reviewRange","reviewImprovements","reviewWorked","reviewDidnt","reviewPatterns",
    "libraryList","btnAddToLibrary",
    "btnBackupJSON","btnImportJSON","importFile","btnWipe",
    "modal","modalTitle","modalBody","modalClose"
  ].forEach(id => els[id] = document.getElementById(id));

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  els.modalClose.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));

  if (name === "timeline") renderTimeline();
  if (name === "review") renderWeeklyReview();
  if (name === "library") renderLibrary();
}

let currentDateISO = toISODate(new Date());
let reviewWeekStart = startOfWeekMonday(new Date());

function renderToday() {
  const entry = getOrCreateEntry(currentDateISO);

  els.todayTitle.textContent = `${entry.date}`;
  renderDomainChips(els.domainChips, entry.domainTags, (next) => {
    entry.domainTags = next;
    upsertEntry(entry);
    renderLensNotes(entry);
    debouncedSaved();
  });

  els.facts.value = entry.facts || "";
  els.worked.value = entry.worked || "";
  els.didnt.value = entry.didnt || "";
  els.improvementText.value = entry.improvement?.text || "";

  renderDomainChips(els.improvementDomainChips, entry.improvement?.domains || [], (next) => {
    entry.improvement.domains = next;
    upsertEntry(entry);
    debouncedSaved();
  }, true);

  els.sleepQuality.value = entry.quickSignals?.sleepQuality ?? "";
  els.movementDone.checked = !!entry.quickSignals?.movementDone;
  els.deepWorkDone.checked = !!entry.quickSignals?.deepWorkDone;
  els.spiritualPracticeDone.checked = !!entry.quickSignals?.spiritualPracticeDone;
  els.mentalEmotionalDone.checked = !!entry.quickSignals?.mentalEmotionalDone;

  els.completed.checked = !!entry.completed;

  validateImprovement(entry);
  renderLensNotes(entry);
}

function renderDomainChips(container, selectedArray, onChange, allowEmptyLabel=false) {
  container.innerHTML = "";
  const selected = new Set(selectedArray || []);
  APP.domains.forEach(d => {
    const b = document.createElement("button");
    b.className = "chip" + (selected.has(d.key) ? " on" : "");
    b.textContent = d.short;
    b.addEventListener("click", () => {
      if (selected.has(d.key)) selected.delete(d.key); else selected.add(d.key);
      onChange(Array.from(selected));
      renderDomainChips(container, Array.from(selected), onChange, allowEmptyLabel);
    });
    container.appendChild(b);
  });
}

function lensPrompt(domainKey) {
  if (domainKey === "Mental/Emotional") {
    return "Behavioral: What did you DO when stress showed up? Any pause/boundary/regulating action?";
  }
  if (domainKey === "Spiritual/Inner Life") {
    return "Operational: What practice did you do (if any)? How long/when? Any intentional pause/reflection?";
  }
  return "Optional: Any domain-specific notes (keep it concrete).";
}

function renderLensNotes(entry) {
  els.lensNotes.innerHTML = "";
  const keys = Object.keys(entry.lensNotes || {});
  if (keys.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "No lens notes yet.";
    els.lensNotes.appendChild(div);
    return;
  }

  keys.forEach(domainKey => {
    const wrap = document.createElement("div");
    wrap.className = "lensNote";

    const header = document.createElement("div");
    header.className = "lensHeader";

    const title = document.createElement("div");
    title.className = "lensTitle";
    title.textContent = domainKey;

    const del = document.createElement("button");
    del.className = "btn ghost";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      delete entry.lensNotes[domainKey];
      upsertEntry(entry);
      renderLensNotes(entry);
      debouncedSaved();
    });

    header.appendChild(title);
    header.appendChild(del);

    const prompt = document.createElement("div");
    prompt.className = "lensPrompt";
    prompt.textContent = lensPrompt(domainKey);

    const ta = document.createElement("textarea");
    ta.value = entry.lensNotes[domainKey] || "";
    ta.placeholder = "Keep it observable. Example: '10 min meditation after coffee.'";
    ta.addEventListener("input", () => {
      entry.lensNotes[domainKey] = ta.value;
      upsertEntry(entry);
      debouncedSaved();
    });

    wrap.appendChild(header);
    wrap.appendChild(prompt);
    wrap.appendChild(ta);
    els.lensNotes.appendChild(wrap);
  });
}

function validateImprovement(entry) {
  const txt = clampText(entry.improvement?.text || "");
  let msg = "";
  const vague = /^(be|try|improve|better|more|less|focus|calm|stress|mindful|spiritual)$/i;
  if (!txt) msg = "Tip: Make it an observable action (after X, do Y).";
  else if (txt.length < 12 || vague.test(txt)) msg = "Make it observable: what exactly will you do, and when?";
  els.improvementValidation.textContent = msg;
}

let saveTimer = null;
function debouncedSaved() {
  clearTimeout(saveTimer);
  els.saveStatus.textContent = "Saving…";
  saveTimer = setTimeout(() => {
    els.saveStatus.textContent = "Saved locally.";
    setTimeout(() => { els.saveStatus.textContent = ""; }, 1200);
  }, 250);
}

// ---------- Event listeners ----------
function wireTodayInputs() {
  const autoSave = () => {
    const entry = getOrCreateEntry(currentDateISO);

    entry.facts = els.facts.value;
    entry.worked = els.worked.value;
    entry.didnt = els.didnt.value;

    // Sacred: one improvement per day (single field)
    entry.improvement.text = els.improvementText.value;
    validateImprovement(entry);

    entry.quickSignals.sleepQuality = els.sleepQuality.value;
    entry.quickSignals.movementDone = els.movementDone.checked;
    entry.quickSignals.deepWorkDone = els.deepWorkDone.checked;
    entry.quickSignals.spiritualPracticeDone = els.spiritualPracticeDone.checked;
    entry.quickSignals.mentalEmotionalDone = els.mentalEmotionalDone.checked;

    entry.completed = els.completed.checked;

    upsertEntry(entry);
    debouncedSaved();
  };

  ["input","change"].forEach(evt => {
    els.facts.addEventListener(evt, autoSave);
    els.worked.addEventListener(evt, autoSave);
    els.didnt.addEventListener(evt, autoSave);
    els.improvementText.addEventListener(evt, autoSave);
    els.sleepQuality.addEventListener(evt, autoSave);
    els.movementDone.addEventListener(evt, autoSave);
    els.deepWorkDone.addEventListener(evt, autoSave);
    els.spiritualPracticeDone.addEventListener(evt, autoSave);
    els.mentalEmotionalDone.addEventListener(evt, autoSave);
    els.completed.addEventListener(evt, autoSave);
  });

  els.btnSave.addEventListener("click", () => {
    autoSave();
    els.saveStatus.textContent = "Saved locally.";
    setTimeout(() => { els.saveStatus.textContent = ""; }, 1200);
  });

  els.btnPrevDay.addEventListener("click", () => { currentDateISO = toISODate(addDays(fromISODate(currentDateISO), -1)); renderToday(); });
  els.btnNextDay.addEventListener("click", () => { currentDateISO = toISODate(addDays(fromISODate(currentDateISO), +1)); renderToday(); });
  els.btnGoToday.addEventListener("click", () => { currentDateISO = toISODate(new Date()); renderToday(); });

  els.btnMakeSmaller.addEventListener("click", () => {
    const entry = getOrCreateEntry(currentDateISO);
    const t = clampText(entry.improvement.text);
    const suggestions = [
      "Add a trigger: “After coffee, …”",
      "Reduce scope: 10 min → 2 min",
      "Define done: “Done when X is written / completed.”",
      "Make it a single behavior: “Before opening email, write 1 priority.”"
    ];
    openModal("Make smaller", `
      <div class="hint">Pick one and edit your improvement.</div>
      <div class="pillList">${suggestions.map(s=>`<div class="pill">${escapeHtml(s)}</div>`).join("")}</div>
      <div style="height:10px"></div>
      <div class="hint">Current:</div>
      <div class="item"><div class="itemTitle">${escapeHtml(t || "(empty)")}</div></div>
    `);
  });

  els.btnAddLensNote.addEventListener("click", () => {
    const entry = getOrCreateEntry(currentDateISO);
    const body = `
      <div class="hint">Choose a lens to add a note. Keep it operational.</div>
      <div class="chips" id="lensPick">
        ${APP.domains.map(d => `<button class="chip" data-domain="${escapeHtml(d.key)}">${escapeHtml(d.key)}</button>`).join("")}
      </div>
    `;
    openModal("Add lens note", body);
    document.getElementById("lensPick").querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.domain;
        entry.lensNotes[k] = entry.lensNotes[k] || "";
        upsertEntry(entry);
        closeModal();
        renderLensNotes(entry);
        debouncedSaved();
      });
    });
  });

  els.btnUseFromLibrary.addEventListener("click", () => openLibraryPicker());
}

// ---------- Timeline ----------
let timelineFilterDomains = new Set();

function renderTimeline() {
  const entriesObj = loadEntries();
  const entries = Object.values(entriesObj).sort((a,b) => (a.date < b.date ? 1 : -1));
  const q = (els.searchBox.value || "").toLowerCase().trim();

  // Filters UI
  els.timelineDomainFilters.innerHTML = "";
  APP.domains.forEach(d => {
    const b = document.createElement("button");
    b.className = "chip" + (timelineFilterDomains.has(d.key) ? " on" : "");
    b.textContent = d.short;
    b.addEventListener("click", () => {
      if (timelineFilterDomains.has(d.key)) timelineFilterDomains.delete(d.key);
      else timelineFilterDomains.add(d.key);
      renderTimeline();
    });
    els.timelineDomainFilters.appendChild(b);
  });

  const filtered = entries.filter(e => {
    if (timelineFilterDomains.size > 0) {
      const tags = new Set(e.domainTags || []);
      let ok = false;
      for (const d of timelineFilterDomains) if (tags.has(d)) ok = true;
      if (!ok) return false;
    }
    if (q) {
      const blob = `${e.facts||""}\n${e.worked||""}\n${e.didnt||""}\n${e.improvement?.text||""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  els.timelineList.innerHTML = "";
  if (filtered.length === 0) {
    els.timelineList.innerHTML = `<div class="muted">No matching entries.</div>`;
    return;
  }

  filtered.forEach(e => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row between">
        <div>
          <div class="itemTitle">${escapeHtml(e.date)} ${e.completed ? "✓" : ""}</div>
          <div class="itemMeta">${escapeHtml((e.domainTags||[]).join(" • ") || "No lenses")}</div>
        </div>
        <button class="btn">Open</button>
      </div>
      <div class="hint" style="margin-top:10px">Improvement: ${escapeHtml(e.improvement?.text || "—")}</div>
    `;
    div.querySelector("button").addEventListener("click", () => {
      currentDateISO = e.date;
      switchTab("today");
      renderToday();
    });
    els.timelineList.appendChild(div);
  });
}

function wireTimeline() {
  els.searchBox.addEventListener("input", () => renderTimeline());
}

// ---------- Weekly Review ----------
function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[’']/g,"'")
    .replace(/[^a-z0-9\s-]/g," ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

function topTerms(entries, field, n=10) {
  const counts = new Map();
  entries.forEach(e => {
    tokenize(e[field] || "").forEach(w => counts.set(w, (counts.get(w)||0)+1));
  });
  return Array.from(counts.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0,n)
    .map(([w,c]) => ({ w, c }));
}

function renderWeeklyReview() {
  const weekStart = reviewWeekStart;
  const weekEnd = addDays(weekStart, 6);
  els.reviewRange.textContent = `${toISODate(weekStart)} to ${toISODate(weekEnd)}`;

  const entriesObj = loadEntries();
  const weekEntries = [];
  for (let i=0;i<7;i++){
    const d = toISODate(addDays(weekStart, i));
    if (entriesObj[d]) weekEntries.push(entriesObj[d]);
  }

  // Improvements list
  els.reviewImprovements.innerHTML = "";
  if (weekEntries.length === 0) {
    els.reviewImprovements.innerHTML = `<div class="muted">No entries this week.</div>`;
  } else {
    weekEntries.forEach(e => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTitle">${escapeHtml(e.date)}</div>
        <div class="hint">${escapeHtml(e.improvement?.text || "—")}</div>
        <div class="itemMeta">Status: ${escapeHtml(e.improvement?.status || "needsTesting")}</div>
      `;
      els.reviewImprovements.appendChild(div);
    });
  }

  // Common themes
  const worked = topTerms(weekEntries, "worked", 12);
  const didnt = topTerms(weekEntries, "didnt", 12);

  els.reviewWorked.innerHTML = worked.length
    ? worked.map(t => `<div class="pill">${escapeHtml(t.w)} • ${t.c}</div>`).join("")
    : `<div class="muted">Not enough data yet.</div>`;

  els.reviewDidnt.innerHTML = didnt.length
    ? didnt.map(t => `<div class="pill">${escapeHtml(t.w)} • ${t.c}</div>`).join("")
    : `<div class="muted">Not enough data yet.</div>`;

  // Pattern hints (simple rules)
  const patterns = [];

  const lowSleepDays = weekEntries.filter(e => Number(e.quickSignals?.sleepQuality || 0) > 0 && Number(e.quickSignals.sleepQuality) <= 2);
  const lowSleepWithFocusProblems = lowSleepDays.filter(e => (e.didnt||"").toLowerCase().includes("focus") || (e.didnt||"").toLowerCase().includes("distract"));
  if (lowSleepDays.length >= 2 && lowSleepWithFocusProblems.length >= 1) {
    patterns.push(`Low sleep (≤2) often coincided with focus issues (${lowSleepWithFocusProblems.length}/${lowSleepDays.length} low-sleep days).`);
  }

  const skippedSpiritual = weekEntries.filter(e => e.quickSignals?.spiritualPracticeDone === false);
  const workTagged = weekEntries.filter(e => (e.domainTags||[]).includes("Work"));
  const skippedSpiritualAndWork = weekEntries.filter(e => (e.domainTags||[]).includes("Work") && e.quickSignals?.spiritualPracticeDone === false);
  if (workTagged.length >= 3 && skippedSpiritualAndWork.length >= 2) {
    patterns.push(`Work-tagged days often coincided with skipped spiritual practice (${skippedSpiritualAndWork.length}/${workTagged.length} work days).`);
  }

  const movementDays = weekEntries.filter(e => e.quickSignals?.movementDone === true);
  const movementAndBetterWorked = movementDays.filter(e => (e.worked||"").length >= 20);
  if (movementDays.length >= 3 && movementAndBetterWorked.length >= 2) {
    patterns.push(`Movement days tended to have richer “worked” notes (${movementAndBetterWorked.length}/${movementDays.length}).`);
  }

  els.reviewPatterns.innerHTML = "";
  if (patterns.length === 0) {
    els.reviewPatterns.innerHTML = `<div class="muted">No strong patterns yet. Keep it light—this improves as you log.</div>`;
  } else {
    patterns.forEach(p => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div class="hint">${escapeHtml(p)}</div>`;
      els.reviewPatterns.appendChild(div);
    });
  }
}

function wireWeeklyReview() {
  els.btnPrevWeek.addEventListener("click", () => { reviewWeekStart = addDays(reviewWeekStart, -7); renderWeeklyReview(); });
  els.btnNextWeek.addEventListener("click", () => { reviewWeekStart = addDays(reviewWeekStart, +7); renderWeeklyReview(); });
  els.btnThisWeek.addEventListener("click", () => { reviewWeekStart = startOfWeekMonday(new Date()); renderWeeklyReview(); });
}

// ---------- Kaizen Library ----------
function renderLibrary() {
  const lib = loadLibrary().sort((a,b) => (b.lastUsedAt||0)-(a.lastUsedAt||0));
  els.libraryList.innerHTML = "";
  if (lib.length === 0) {
    els.libraryList.innerHTML = `<div class="muted">Library is empty. Add today’s improvement to start.</div>`;
    return;
  }

  lib.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTitle">${escapeHtml(item.text)}</div>
      <div class="itemMeta">${escapeHtml((item.domains||[]).join(" • ") || "No lenses")} • Status: ${escapeHtml(item.status||"needsTesting")}</div>
      <div class="itemActions">
        <button class="btn">Reuse today</button>
        <button class="btn ghost" data-status="kept">Kept</button>
        <button class="btn ghost" data-status="needsTesting">Needs testing</button>
        <button class="btn ghost" data-status="rejected">Rejected</button>
        <button class="btn danger">Delete</button>
      </div>
    `;
    const [reuseBtn, keptBtn, testBtn, rejBtn, delBtn] = div.querySelectorAll("button");

    reuseBtn.addEventListener("click", () => {
      const entry = getOrCreateEntry(currentDateISO);
      entry.improvement.text = item.text;
      entry.improvement.domains = item.domains || [];
      upsertEntry(entry);

      item.lastUsedAt = Date.now();
      item.useCount = (item.useCount || 0) + 1;
      saveLibrary(lib.map(x => x.id === item.id ? item : x));

      switchTab("today");
      renderToday();
      debouncedSaved();
    });

    [keptBtn, testBtn, rejBtn].forEach(btn => {
      btn.addEventListener("click", () => {
        item.status = btn.dataset.status;
        saveLibrary(lib.map(x => x.id === item.id ? item : x));
        renderLibrary();
      });
    });

    delBtn.addEventListener("click", () => {
      if (!confirm("Delete this improvement from the library?")) return;
      saveLibrary(lib.filter(x => x.id !== item.id));
      renderLibrary();
    });

    els.libraryList.appendChild(div);
  });
}

function wireLibrary() {
  els.btnAddToLibrary.addEventListener("click", () => {
    const entry = getOrCreateEntry(currentDateISO);
    const text = clampText(entry.improvement.text);
    if (!text) {
      alert("Today’s improvement is empty. Add one small improvement first.");
      return;
    }
    const lib = loadLibrary();
    const existing = lib.find(x => (x.text || "").trim().toLowerCase() === text.toLowerCase());
    const now = Date.now();

    if (existing) {
      existing.lastUsedAt = now;
      existing.domains = entry.improvement.domains || existing.domains || [];
      existing.status = entry.improvement.status || existing.status || "needsTesting";
      existing.useCount = (existing.useCount || 0) + 1;
      saveLibrary(lib.map(x => x.id === existing.id ? existing : x));
    } else {
      lib.push({
        id: uuid(),
        text,
        domains: entry.improvement.domains || [],
        status: entry.improvement.status || "needsTesting",
        firstUsedAt: now,
        lastUsedAt: now,
        useCount: 1
      });
      saveLibrary(lib);
    }
    alert("Added to Kaizen Library.");
  });
}

function openLibraryPicker() {
  const lib = loadLibrary().sort((a,b)=> (b.lastUsedAt||0)-(a.lastUsedAt||0));
  if (lib.length === 0) {
    alert("Library is empty. Add a past improvement first (Kaizen Library tab).");
    return;
  }

  const body = `
    <div class="hint">Tap one to use it as today’s ONE improvement (editable afterward).</div>
    <div class="list">
      ${lib.slice(0,50).map(item => `
        <div class="item">
          <div class="itemTitle">${escapeHtml(item.text)}</div>
          <div class="itemMeta">${escapeHtml((item.domains||[]).join(" • ") || "No lenses")} • ${escapeHtml(item.status||"needsTesting")}</div>
          <div class="itemActions">
            <button class="btn" data-id="${escapeHtml(item.id)}">Use this</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  openModal("Kaizen Library", body);

  els.modalBody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const item = lib.find(x => x.id === id);
      if (!item) return;

      const entry = getOrCreateEntry(currentDateISO);
      entry.improvement.text = item.text;
      entry.improvement.domains = item.domains || [];
      upsertEntry(entry);

      item.lastUsedAt = Date.now();
      item.useCount = (item.useCount || 0) + 1;
      saveLibrary(lib.map(x => x.id === item.id ? item : x));

      closeModal();
      renderToday();
      debouncedSaved();
    });
  });
}

// ---------- Export ----------
function exportTXT() {
  const entriesObj = loadEntries();
  const dates = Object.keys(entriesObj).sort();
  let out = "";
  dates.forEach(date => {
    const e = entriesObj[date];
    out += `=== ${date} ${e.completed ? "✓" : ""} ===\n`;
    out += `Lenses: ${(e.domainTags||[]).join(", ") || "—"}\n\n`;
    out += `What happened (facts):\n${e.facts || "—"}\n\n`;
    out += `What worked:\n${e.worked || "—"}\n\n`;
    out += `What didn’t:\n${e.didnt || "—"}\n\n`;
    out += `One small improvement:\n${e.improvement?.text || "—"}\n`;
    out += `Improvement lenses: ${(e.improvement?.domains||[]).join(", ") || "—"}\n`;
    out += `Status: ${e.improvement?.status || "needsTesting"}\n\n`;
    out += `Lens notes:\n`;
    const lnKeys = Object.keys(e.lensNotes || {});
    if (lnKeys.length === 0) out += "—\n\n";
    else {
      lnKeys.forEach(k => out += `- ${k}: ${e.lensNotes[k] || ""}\n`);
      out += "\n";
    }
    out += `Quick signals: sleep=${e.quickSignals?.sleepQuality || "—"}, movement=${!!e.quickSignals?.movementDone}, deepwork=${!!e.quickSignals?.deepWorkDone}, spiritual=${!!e.quickSignals?.spiritualPracticeDone}\n`;
    out += "\n";
  });
  downloadFile(`daily-kaizen-${APP.version}.txt`, out, "text/plain");
}

function exportCSV() {
  const entriesObj = loadEntries();
  const dates = Object.keys(entriesObj).sort();
  const header = [
    "date","completed","domains",
    "facts","worked","didnt",
    "improvement_text","improvement_domains","improvement_status",
    "sleep_quality","movement_done","deep_work_done","spiritual_practice_done"
  ];
  const rows = [header.join(",")];

  dates.forEach(date => {
    const e = entriesObj[date];
    const row = [
      e.date,
      e.completed ? "1":"0",
      quote((e.domainTags||[]).join("|")),
      quote(e.facts||""),
      quote(e.worked||""),
      quote(e.didnt||""),
      quote(e.improvement?.text||""),
      quote((e.improvement?.domains||[]).join("|")),
      e.improvement?.status || "needsTesting",
      e.quickSignals?.sleepQuality || "",
      e.quickSignals?.movementDone ? "1":"0",
      e.quickSignals?.deepWorkDone ? "1":"0",
      e.quickSignals?.spiritualPracticeDone ? "1":"0"
    ];
    rows.push(row.join(","));
  });

  downloadFile(`daily-kaizen-${APP.version}.csv`, rows.join("\n"), "text/csv");
}

function quote(s) {
  const v = (s ?? "").toString().replace(/"/g,'""');
  return `"${v}"`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Settings backup/import ----------
function exportBackupJSON() {
  const payload = {
    version: APP.version,
    exportedAt: new Date().toISOString(),
    entries: loadEntries(),
    library: loadLibrary()
  };
  downloadFile(`daily-kaizen-backup-${APP.version}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function importBackupJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.entries || !data.library) throw new Error("Invalid backup file.");
      localStorage.setItem(APP.storageKeys.entries, JSON.stringify(data.entries));
      localStorage.setItem(APP.storageKeys.library, JSON.stringify(data.library));
      alert("Import complete. Reloading…");
      location.reload();
    } catch (e) {
      alert("Import failed: " + e.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Modal ----------
function openModal(title, html) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = html;
  els.modal.classList.remove("hidden");
}
function closeModal() {
  els.modal.classList.add("hidden");
  els.modalTitle.textContent = "";
  els.modalBody.innerHTML = "";
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---------- Export menu ----------
function openExportMenu() {
  openModal("Export", `
    <div class="hint">Export is your backup strategy for a local/offline app.</div>
    <div class="list">
      <div class="item">
        <div class="itemTitle">Text (TXT)</div>
        <div class="itemMeta">Human readable. One entry per day.</div>
        <div class="itemActions"><button class="btn" id="exTXT">Download TXT</button></div>
      </div>
      <div class="item">
        <div class="itemTitle">Spreadsheet (CSV)</div>
        <div class="itemMeta">Rows = days, good for archival/search.</div>
        <div class="itemActions"><button class="btn" id="exCSV">Download CSV</button></div>
      </div>
    </div>
  `);
  document.getElementById("exTXT").addEventListener("click", () => { exportTXT(); });
  document.getElementById("exCSV").addEventListener("click", () => { exportCSV(); });
}

// ---------- Service worker ----------
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

// ---------- Wiring ----------
function wireSettings() {
  els.btnBackupJSON.addEventListener("click", exportBackupJSON);
  els.btnImportJSON.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => {
    const f = els.importFile.files?.[0];
    if (f) importBackupJSON(f);
  });
  els.btnWipe.addEventListener("click", () => {
    if (!confirm("Wipe ALL local Kaizen data from this device/browser?")) return;
    localStorage.removeItem(APP.storageKeys.entries);
    localStorage.removeItem(APP.storageKeys.library);
    alert("Wiped. Reloading…");
    location.reload();
  });
}

// ---------- Init ----------
function init() {
  bindEls();
  wireTodayInputs();
  wireTimeline();
  wireWeeklyReview();
  wireLibrary();
  wireSettings();

  els.btnExport.addEventListener("click", openExportMenu);

  // Weekly review default
  reviewWeekStart = startOfWeekMonday(new Date());

  renderToday();
  registerSW();
}

document.addEventListener("DOMContentLoaded", init);


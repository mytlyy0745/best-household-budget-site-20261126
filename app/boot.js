/* Nest Egg — hash router and event wiring. Renders the page for the
   current hash, then binds that page's controls. State lives in
   localStorage; every change saves and re-renders in place. */
"use strict";

let nestState = loadState();
const nestUi = { type: "", cat: "", q: "", formKind: "spending", editingId: "" };

/* Offer a text file as a download without any server round-trip. */
function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentRoute() {
  const hash = window.location.hash || "#/";
  return hash.replace(/^#\/?/, "").split("?")[0] || "";
}

function render() {
  const app = document.getElementById("app");
  const route = currentRoute();
  document.querySelectorAll(".nav-link").forEach((a) => {
    const target = a.getAttribute("href").replace(/^#\/?/, "");
    a.classList.toggle("active", target === route);
  });
  if (route === "transactions") app.innerHTML = pageTransactions(nestState, nestUi);
  else if (route === "budgets") app.innerHTML = pageBudgets(nestState);
  else if (route === "goals") app.innerHTML = pageGoals(nestState);
  else if (route === "insights") app.innerHTML = pageInsights(nestState);
  else app.innerHTML = pageDashboard(nestState);
  bindPage(route);
  window.scrollTo(0, 0);
}

function dollarsToCents(value) {
  const n = Math.round(parseFloat(value) * 100);
  return Number.isFinite(n) ? n : NaN;
}

/* Rebuild a note datalist from the notes the household has already
   used for this kind and category, so the suggestions always match
   what the two selects currently say. */
function refreshNoteList(listId, kind, category) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = noteSuggestions(nestState, kind, category)
    .map((n) => `<option value="${esc(n)}">`).join("");
}

function bindPage(route) {
  if (route === "") {
    // Dashboard "Next moves": the one-click rebalance button performs
    // exactly the move the panel suggests, then re-renders — the hero
    // note, the budget snapshot and the panel itself all follow.
    document.querySelectorAll(".move-one").forEach((btn) => {
      btn.addEventListener("click", () => {
        moveLimit(nestState, btn.getAttribute("data-from"), btn.getAttribute("data-to"), Number(btn.getAttribute("data-cents")));
        render();
      });
    });
    // Donut drill-down: tapping a slice or a legend row opens
    // Transactions filtered to that spending category.
    const drillDown = (cat) => {
      if (!cat) return;
      nestUi.type = "spending";
      nestUi.cat = cat;
      nestUi.q = "";
      nestUi.editingId = "";
      window.location.hash = "#/transactions";
    };
    document.querySelectorAll(".donut-seg, .legend-cat").forEach((el) => {
      el.addEventListener("click", () => drillDown(el.getAttribute("data-cat")));
    });
  }

  if (route === "transactions") {
    const typeSel = document.getElementById("tx-type");
    typeSel.value = nestUi.formKind;
    typeSel.addEventListener("change", () => {
      nestUi.formKind = typeSel.value;
      const catSel = document.getElementById("tx-category");
      catSel.innerHTML = categoryOptions(nestUi.formKind, nestState)
        .map((c) => `<option>${esc(c)}</option>`).join("");
      refreshNoteList("tx-note-list", nestUi.formKind, catSel.value);
    });
    document.getElementById("tx-category").addEventListener("change", (ev) => {
      refreshNoteList("tx-note-list", document.getElementById("tx-type").value, ev.target.value);
    });
    // Quick amounts: one tap fills the amount field — a $10 top-up or
    // a $20 shop is a tap, not a typed number. The field stays
    // editable, so a chip is a starting point, not a verdict.
    document.querySelectorAll(".quick-amt").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("tx-amount").value = btn.getAttribute("data-dollars");
        document.getElementById("tx-amount").focus();
      });
    });
    document.getElementById("tx-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const cents = dollarsToCents(document.getElementById("tx-amount").value);
      const msg = document.getElementById("tx-msg");
      if (!Number.isFinite(cents) || cents <= 0) {
        msg.textContent = "Enter an amount above $0.00.";
        return;
      }
      const kind = document.getElementById("tx-type").value;
      const category = document.getElementById("tx-category").value;
      addTransaction(nestState, {
        date: document.getElementById("tx-date").value || "2026-11-26",
        kind,
        category,
        note: document.getElementById("tx-note").value.trim(),
        cents,
      });
      // Say the consequence out loud: a spending entry that pushes its
      // budget over (or close to) its limit says so right here, while
      // the numbers are still fresh — instead of waiting for the
      // household to notice on the Budgets page.
      let text = "Added — the totals below already include it.";
      if (kind === "spending") {
        const line = budgetImpactLine(budgetImpact(nestState, category));
        if (line) text += " " + line;
      }
      render();
      document.getElementById("tx-msg").textContent = text;
    });
    const refilter = () => {
      nestUi.type = document.getElementById("flt-type").value;
      nestUi.cat = document.getElementById("flt-cat").value;
      // The category list follows the type: if the type just changed
      // to one the chosen category cannot belong to, drop the category
      // instead of showing a list that can never match anything.
      if (nestUi.type && nestUi.cat && !categoryOptions(nestUi.type, nestState).includes(nestUi.cat)) {
        nestUi.cat = "";
      }
      nestUi.q = document.getElementById("flt-q").value;
      nestUi.editingId = "";
      render();
      const q = document.getElementById("flt-q");
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    };
    document.getElementById("flt-type").addEventListener("change", refilter);
    document.getElementById("flt-cat").addEventListener("change", refilter);
    document.getElementById("flt-q").addEventListener("input", () => {
      nestUi.type = document.getElementById("flt-type").value;
      nestUi.cat = document.getElementById("flt-cat").value;
      nestUi.q = document.getElementById("flt-q").value;
      nestUi.editingId = "";
      render();
      const q = document.getElementById("flt-q");
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    });
    document.querySelectorAll(".tx-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeTransaction(nestState, btn.getAttribute("data-id"));
        render();
      });
    });
    document.querySelectorAll(".tx-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        nestUi.editingId = btn.getAttribute("data-id");
        render();
      });
    });
    const csvBtn = document.getElementById("tx-csv");
    if (csvBtn) {
      csvBtn.addEventListener("click", () => {
        const rows = filteredTx(nestState, nestUi);
        downloadText("nest-egg-transactions.csv", transactionsCSV(rows), "text/csv;charset=utf-8");
      });
    }
    const importInput = document.getElementById("tx-import");
    if (importInput) {
      importInput.addEventListener("change", () => {
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const parsed = parseTransactionsCSV(String(reader.result || ""), nestState);
          let added = 0;
          for (const row of parsed.rows) { addTransaction(nestState, row); added++; }
          let text = `Imported ${added} transaction${added === 1 ? "" : "s"}.`;
          if (parsed.errors.length) {
            const shown = parsed.errors.slice(0, 2).map((e) => `line ${e.line}: ${e.reason}`).join("; ");
            text += ` ${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} skipped (${shown}${parsed.errors.length > 2 ? ", …" : ""}).`;
          }
          render();
          document.getElementById("tx-import-msg").textContent = text;
        };
        reader.readAsText(file);
      });
    }
    const editForm = document.querySelector(".edit-grid");
    if (editForm) {
      const kindSel = editForm.querySelector('select[name="kind"]');
      const catSel = editForm.querySelector('select[name="category"]');
      kindSel.addEventListener("change", () => {
        catSel.innerHTML = categoryOptions(kindSel.value, nestState)
          .map((c) => `<option>${esc(c)}</option>`).join("");
        refreshNoteList("edit-note-list", kindSel.value, catSel.value);
      });
      catSel.addEventListener("change", () => {
        refreshNoteList("edit-note-list", kindSel.value, catSel.value);
      });
      editForm.querySelector(".edit-cancel").addEventListener("click", () => {
        nestUi.editingId = "";
        render();
      });
      editForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const id = editForm.getAttribute("data-id");
        const cents = dollarsToCents(editForm.querySelector('input[name="amount"]').value);
        if (!Number.isFinite(cents) || cents <= 0) return;
        const note = editForm.querySelector('input[name="note"]').value.trim();
        if (!note) return;
        const kind = kindSel.value;
        const category = editForm.querySelector('select[name="category"]').value;
        updateTransaction(nestState, id, {
          date: editForm.querySelector('input[name="date"]').value || demoDateString(nestState),
          kind,
          category,
          note,
          cents,
        });
        nestUi.editingId = "";
        // Same consequence line as a fresh add: an edit can push a
        // budget over just as easily, so it says so in the same place.
        let text = "Saved — the totals below already include the change.";
        if (kind === "spending") {
          const line = budgetImpactLine(budgetImpact(nestState, category));
          if (line) text += " " + line;
        }
        render();
        document.getElementById("tx-msg").textContent = text;
      });
    }
  }

  if (route === "budgets") {
    const moveForm = document.getElementById("move-form");
    if (moveForm) {
      moveForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fromCat = document.getElementById("move-from").value;
        const toCat = document.getElementById("move-to").value;
        const cents = dollarsToCents(document.getElementById("move-amount").value);
        const msg = document.getElementById("move-msg");
        const res = moveLimit(nestState, fromCat, toCat, cents);
        if (!res.ok) {
          // Leave the form as it is so the amount the household typed
          // is still there to fix; only the message changes.
          msg.textContent = res.error;
          return;
        }
        const text = `Moved ${money(res.moved)} of limit from ${res.fromCat} to ${res.toCat}. The month's total limit is unchanged.`;
        render();
        document.getElementById("move-msg").textContent = text;
      });
    }
    document.querySelectorAll(".limit-save").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-cat");
        const input = document.getElementById("limit-" + cat);
        const cents = dollarsToCents(input.value);
        if (Number.isFinite(cents) && cents >= 0) {
          nestState.limits[cat] = cents;
          saveState(nestState);
          render();
        }
      });
    });
  }

  if (route === "goals") {
    document.querySelectorAll(".fund-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.getAttribute("data-goal");
        const input = document.getElementById("fund-" + goalId);
        const cents = dollarsToCents(input.value);
        if (Number.isFinite(cents) && cents > 0) {
          addToGoal(nestState, goalId, cents);
          render();
        }
      });
    });
    document.getElementById("goal-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = document.getElementById("goal-name").value.trim();
      const target = dollarsToCents(document.getElementById("goal-target").value);
      const start = dollarsToCents(document.getElementById("goal-start").value || "0");
      const msg = document.getElementById("goal-msg");
      if (!name || !Number.isFinite(target) || target <= 0) {
        msg.textContent = "Give the goal a name and a target above $0.";
        return;
      }
      createGoal(nestState, name, target, Number.isFinite(start) && start > 0 ? start : 0);
      msg.textContent = "Goal created.";
      render();
      document.getElementById("goal-msg").textContent = "Goal created.";
    });
  }

  if (route === "insights") {
    const backupBtn = document.getElementById("backup-download");
    if (backupBtn) {
      backupBtn.addEventListener("click", () => {
        const name = `nest-egg-backup-${demoDateString(nestState)}.json`;
        downloadText(name, JSON.stringify(backupData(nestState), null, 2), "application/json;charset=utf-8");
        document.getElementById("backup-msg").textContent = "Backup downloaded — every transaction, limit and goal, as one JSON file.";
      });
    }
    const restoreInput = document.getElementById("backup-restore");
    if (restoreInput) {
      restoreInput.addEventListener("change", () => {
        const file = restoreInput.files && restoreInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const parsed = parseBackup(String(reader.result || ""));
          if (!parsed.ok) {
            // Nothing changes on a bad file: the household keeps
            // exactly what it had, and the message says what was
            // wrong with the file instead of a bare "failed".
            document.getElementById("backup-msg").textContent = `Could not restore: ${parsed.error} Nothing changed.`;
            return;
          }
          nestState = parsed.state;
          saveState(nestState);
          nestUi.type = ""; nestUi.cat = ""; nestUi.q = ""; nestUi.editingId = "";
          const n = parsed.state.transactions.length;
          const g = parsed.state.goals.length;
          render();
          document.getElementById("backup-msg").textContent = `Restored ${n} transaction${n === 1 ? "" : "s"}, ${g} goal${g === 1 ? "" : "s"} and all nine budget limits.`;
        };
        reader.readAsText(file);
      });
    }
    const reportBtn = document.getElementById("report-download");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        downloadText("nest-egg-november-2026-report.txt", monthReport(nestState), "text/plain;charset=utf-8");
        document.getElementById("report-msg").textContent = "Report downloaded — totals, budgets, goals and the savings rate, as one text file.";
      });
    }
    document.getElementById("reset-demo").addEventListener("click", () => {
      nestState = resetState();
      nestUi.type = ""; nestUi.cat = ""; nestUi.q = "";
      render();
      document.getElementById("reset-msg").textContent = "Demo data restored to the November seed.";
    });
  }
}

window.addEventListener("hashchange", render);
render();

/* Keyboard shortcuts, for the household that lives in this site:
   1–5 switch pages, / jumps to the transaction search, n starts a
   new transaction, Esc clears the search and filters (or closes an
   open edit form). They never fire while the household is typing in
   a field — a "1" in the search box stays a "1" — and never with a
   modifier key held, so browser shortcuts are untouched. */
const NEST_PAGES = ["", "transactions", "budgets", "goals", "insights"];

function focusAfterNav(hash, selector) {
  if ((window.location.hash || "#/") !== hash) {
    window.location.hash = hash;
  }
  setTimeout(() => {
    const el = document.querySelector(selector);
    if (el) el.focus();
  }, 60);
}

document.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const t = ev.target;
  const typing = t && (t.tagName === "INPUT" || t.tagName === "SELECT" ||
    t.tagName === "TEXTAREA" || t.isContentEditable);
  if (ev.key === "Escape") {
    if (typing) { t.blur(); return; }
    if (nestUi.editingId) { nestUi.editingId = ""; render(); return; }
    if (nestUi.q || nestUi.type || nestUi.cat) {
      nestUi.q = ""; nestUi.type = ""; nestUi.cat = ""; nestUi.editingId = "";
      render();
    }
    return;
  }
  if (typing) return;
  if (ev.key >= "1" && ev.key <= "5") {
    ev.preventDefault();
    window.location.hash = "#/" + NEST_PAGES[Number(ev.key) - 1];
    return;
  }
  if (ev.key === "/") {
    ev.preventDefault();
    focusAfterNav("#/transactions", "#flt-q");
    return;
  }
  if (ev.key === "n" || ev.key === "N") {
    ev.preventDefault();
    focusAfterNav("#/transactions", "#tx-note");
  }
});

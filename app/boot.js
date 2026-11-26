/* Nest Egg — hash router and event wiring. Renders the page for the
   current hash, then binds that page's controls. State lives in
   localStorage; every change saves and re-renders in place. */
"use strict";

let nestState = loadState();
const nestUi = { type: "", cat: "", q: "", formKind: "spending" };

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

function bindPage(route) {
  if (route === "transactions") {
    const typeSel = document.getElementById("tx-type");
    typeSel.value = nestUi.formKind;
    typeSel.addEventListener("change", () => {
      nestUi.formKind = typeSel.value;
      const catSel = document.getElementById("tx-category");
      catSel.innerHTML = categoryOptions(nestUi.formKind, nestState)
        .map((c) => `<option>${esc(c)}</option>`).join("");
    });
    document.getElementById("tx-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const cents = dollarsToCents(document.getElementById("tx-amount").value);
      const msg = document.getElementById("tx-msg");
      if (!Number.isFinite(cents) || cents <= 0) {
        msg.textContent = "Enter an amount above $0.00.";
        return;
      }
      addTransaction(nestState, {
        date: document.getElementById("tx-date").value || "2026-11-26",
        kind: document.getElementById("tx-type").value,
        category: document.getElementById("tx-category").value,
        note: document.getElementById("tx-note").value.trim(),
        cents,
      });
      msg.textContent = "Added — the totals below already include it.";
      render();
      document.getElementById("tx-msg").textContent = "Added — the totals below already include it.";
    });
    const refilter = () => {
      nestUi.type = document.getElementById("flt-type").value;
      nestUi.cat = document.getElementById("flt-cat").value;
      nestUi.q = document.getElementById("flt-q").value;
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
  }

  if (route === "budgets") {
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

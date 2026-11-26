/* Nest Egg — the five pages. Each renderer takes the household state
   and returns an HTML string; boot.js drops it into #app and wires the
   controls. Nothing here fetches from the network. */
"use strict";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusPill(status) {
  const cls = status.replace(/[^a-z]/gi, "").toLowerCase();
  return `<span class="pill pill-${cls}">${status}</span>`;
}

function progressBar(percent, tone) {
  const p = Math.max(0, Math.min(100, percent));
  return `<div class="bar"><div class="bar-fill ${tone || ""}" style="width:${p.toFixed(1)}%"></div></div>`;
}

function categoryOptions(kind, state) {
  if (kind === "income") return NEST_SEED.incomeCategories;
  if (kind === "saving") return state.goals.map((g) => g.name);
  return NEST_SEED.spendCategories;
}

/* ---------------- Dashboard ---------------- */

function pageDashboard(state) {
  const totals = sumKinds(state.transactions);
  const rows = spendByCategory(state.transactions);
  const overCats = NEST_SEED.spendCategories.filter((cat) => {
    const spent = rows.find((r) => r.category === cat)?.cents || 0;
    return spent > (state.limits[cat] || 0);
  });
  const heroNote = overCats.length
    ? `${overCats.join(", ")} ${overCats.length > 1 ? "are" : "is"} over budget — worth a look before December.`
    : "November is on track.";
  const topBudgets = NEST_SEED.spendCategories.map((cat) => {
    const spent = rows.find((r) => r.category === cat)?.cents || 0;
    return { cat, spent, limit: state.limits[cat] || 0 };
  }).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1))).slice(0, 4);
  const recent = [...state.transactions]
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 5);
  const kindWord = { income: "Income", spending: "Spent", saving: "Saved" };

  return `
  <section class="hero">
    <p class="eyebrow">${esc(NEST_SEED.monthLabel)} · the Chen household</p>
    <h1>Left to spend <span id="hero-remaining">${money(totals.remaining)}</span></h1>
    <p class="hero-sub">Income ${money(totals.income)} − spending ${money(totals.spending)} − savings ${money(totals.saving)} — ${esc(heroNote)}</p>
    <p><a class="btn" href="#/transactions">Add a transaction</a> <a class="btn ghost" href="#/insights">See November in full</a></p>
  </section>
  <section class="cards">
    <div class="stat"><span class="stat-label">Income</span><strong id="stat-income">${money(totals.income)}</strong><span class="muted">5 paydays and extras</span></div>
    <div class="stat"><span class="stat-label">Spending</span><strong id="stat-spending">${money(totals.spending)}</strong><span class="muted">${state.transactions.filter((t) => t.kind === "spending").length} purchases</span></div>
    <div class="stat"><span class="stat-label">Savings</span><strong id="stat-saving">${money(totals.saving)}</strong><span class="muted">into 3 goals</span></div>
    <div class="stat highlight"><span class="stat-label">Remaining</span><strong id="stat-remaining">${money(totals.remaining)}</strong><span class="muted">free to spend or save</span></div>
  </section>
  <div class="two-col">
    <section class="panel">
      <h2>Where the money went</h2>
      ${donutChart(rows, totals.spending)}
    </section>
    <section class="panel">
      <h2>Budget snapshot</h2>
      ${topBudgets.map((b) => `
        <div class="snap-row">
          <div class="snap-head"><span>${esc(b.cat)}</span><span>${money(b.spent)} of ${money(b.limit)}</span></div>
          ${progressBar(100 * b.spent / b.limit, b.spent > b.limit ? "over" : "")}
          <div class="snap-foot"><span>${pctOf(b.spent, b.limit)} used</span>${statusPill(budgetStatus(b.spent, b.limit))}</div>
        </div>`).join("")}
      <p><a href="#/budgets">All nine budgets &rarr;</a></p>
    </section>
  </div>
  <div class="two-col">
    <section class="panel">
      <h2>Recent activity</h2>
      <ul class="activity">
        ${recent.map((tx) => `<li><span class="act-date">${esc(tx.date.slice(5))}</span><span class="act-note">${esc(tx.note)}</span><span class="act-cat">${esc(tx.category)}</span><b class="amt-${tx.kind}">${tx.kind === "income" ? "+" : "−"}${money(tx.cents)}</b></li>`).join("")}
      </ul>
      <p><a href="#/transactions">All ${state.transactions.length} transactions &rarr;</a></p>
    </section>
    <section class="panel">
      <h2>Savings goals</h2>
      ${state.goals.map((g) => `
        <div class="snap-row">
          <div class="snap-head"><span>${esc(g.name)}</span><span>${money(g.saved)} of ${money(g.target)}</span></div>
          ${progressBar(100 * g.saved / g.target, "goal")}
          <div class="snap-foot"><span>${pctOf(g.saved, g.target)} saved</span><span class="muted">${money(g.target - g.saved)} to go</span></div>
        </div>`).join("")}
      <p><a href="#/goals">Manage goals &rarr;</a></p>
    </section>
  </div>`;
}

/* ---------------- Transactions ---------------- */

function filteredTx(state, ui) {
  const q = (ui.q || "").trim().toLowerCase();
  return state.transactions.filter((tx) => {
    if (ui.type && tx.kind !== ui.type) return false;
    if (ui.cat && tx.category !== ui.cat) return false;
    if (q && !(tx.note.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
}

function pageTransactions(state, ui) {
  const list = filteredTx(state, ui);
  const totals = sumKinds(list);
  const cats = ["", ...NEST_SEED.spendCategories, ...NEST_SEED.incomeCategories, ...state.goals.map((g) => g.name)];
  const formCats = categoryOptions(ui.formKind || "spending", state);
  return `
  <section class="panel">
    <h1>Add a transaction</h1>
    <form id="tx-form" class="form-grid">
      <label>Date <input id="tx-date" type="date" value="2026-11-26" required></label>
      <label>Type
        <select id="tx-type">
          <option value="spending">Spending</option>
          <option value="income">Income</option>
          <option value="saving">Saving</option>
        </select>
      </label>
      <label>Category <select id="tx-category">${formCats.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label>Note <input id="tx-note" type="text" placeholder="What was it for?" maxlength="80" required></label>
      <label>Amount ($) <input id="tx-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label>
      <button class="btn" id="tx-submit" type="submit">Add transaction</button>
    </form>
    <p class="muted" id="tx-msg"></p>
  </section>
  <section class="panel">
    <h1>Transactions</h1>
    <div class="filters">
      <label>Type
        <select id="flt-type">
          <option value="">All types</option>
          <option value="income"${ui.type === "income" ? " selected" : ""}>Income</option>
          <option value="spending"${ui.type === "spending" ? " selected" : ""}>Spending</option>
          <option value="saving"${ui.type === "saving" ? " selected" : ""}>Saving</option>
        </select>
      </label>
      <label>Category
        <select id="flt-cat">
          <option value="">All categories</option>
          ${[...new Set(cats)].filter(Boolean).map((c) => `<option${ui.cat === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
      </label>
      <label>Search <input id="flt-q" type="search" placeholder="Search notes…" value="${esc(ui.q || "")}"></label>
    </div>
    <p id="tx-totals">Showing ${list.length} of ${state.transactions.length} — income <b>${money(totals.income)}</b> · spending <b>${money(totals.spending)}</b> · saving <b>${money(totals.saving)}</b></p>
    <ul class="tx-list">
      ${list.map((tx) => `<li>
        <span class="tx-date">${esc(tx.date)}</span>
        <span class="tx-note">${esc(tx.note)} <span class="muted">· ${esc(tx.category)}</span></span>
        <b class="amt-${tx.kind}">${tx.kind === "income" ? "+" : "−"}${money(tx.cents)}</b>
        <button class="tx-del" data-id="${esc(tx.id)}" aria-label="Delete ${esc(tx.note)}">Delete</button>
      </li>`).join("") || `<li class="muted">Nothing matches those filters.</li>`}
    </ul>
  </section>`;
}

/* ---------------- Budgets ---------------- */

function pageBudgets(state) {
  const rows = spendByCategory(state.transactions);
  const spentOf = (cat) => rows.find((r) => r.category === cat)?.cents || 0;
  const saved = sumKinds(state.transactions).saving;
  return `
  <section class="panel">
    <h1>Budgets — ${esc(NEST_SEED.monthLabel)}</h1>
    <p>Monthly limits for the household. Change a limit and it sticks — limits are saved on this device.</p>
    <div class="save-card">
      <div class="snap-head"><span><b>Savings target</b> <span class="muted">— the amount set aside each month</span></span><span>${money(saved)} of ${money(NEST_SEED.savingsTarget)}</span></div>
      ${progressBar(100 * saved / NEST_SEED.savingsTarget, "goal")}
      <div class="snap-foot"><span>${pctOf(saved, NEST_SEED.savingsTarget)} saved</span>${statusPill(budgetStatus(saved, NEST_SEED.savingsTarget))}</div>
    </div>
    ${NEST_SEED.spendCategories.map((cat) => {
      const spent = spentOf(cat);
      const limit = state.limits[cat] || 0;
      return `<div class="budget-row">
        <div class="snap-head"><span><b>${esc(cat)}</b></span><span>${money(spent)} of <span id="limit-label-${esc(cat)}">${money(limit)}</span></span></div>
        ${progressBar(100 * spent / limit, spent > limit ? "over" : "")}
        <div class="snap-foot"><span>${pctOf(spent, limit)} used</span>${statusPill(budgetStatus(spent, limit))}
          <span class="limit-edit">Limit $ <input id="limit-${esc(cat)}" type="number" min="0" step="1" value="${(limit / 100).toFixed(0)}" aria-label="${esc(cat)} limit in dollars">
          <button class="btn small limit-save" data-cat="${esc(cat)}">Save limit</button></span>
        </div>
      </div>`;
    }).join("")}
  </section>`;
}

/* ---------------- Goals ---------------- */

function pageGoals(state) {
  return `
  <section class="panel">
    <h1>Savings goals</h1>
    <p>Every dollar has a job. Add funds to a goal and the ledger records it as a saving transaction automatically.</p>
    ${state.goals.map((g) => `
      <div class="goal-card">
        <div class="snap-head"><span><b>${esc(g.name)}</b>${g.note ? ` <span class="muted">— ${esc(g.note)}</span>` : ""}</span><span id="goal-amt-${esc(g.id)}">${money(g.saved)} of ${money(g.target)}</span></div>
        ${progressBar(100 * g.saved / g.target, "goal")}
        <div class="snap-foot"><span>${pctOf(g.saved, g.target)} saved</span><span class="muted">${money(Math.max(0, g.target - g.saved))} to go</span></div>
        <div class="fund-row">
          <label>Add funds ($) <input id="fund-${esc(g.id)}" type="number" min="1" step="1" placeholder="50"></label>
          <button class="btn small fund-add" data-goal="${esc(g.id)}">Add to ${esc(g.name)}</button>
        </div>
      </div>`).join("")}
  </section>
  <section class="panel">
    <h2>Start a new goal</h2>
    <form id="goal-form" class="form-grid">
      <label>Goal name <input id="goal-name" type="text" placeholder="e.g. New sofa" maxlength="40" required></label>
      <label>Target ($) <input id="goal-target" type="number" min="1" step="1" placeholder="1000" required></label>
      <label>Starting amount ($) <input id="goal-start" type="number" min="0" step="1" value="0"></label>
      <button class="btn" id="goal-create" type="submit">Create goal</button>
    </form>
    <p class="muted" id="goal-msg"></p>
  </section>`;
}

/* ---------------- Insights ---------------- */

function pageInsights(state) {
  const totals = sumKinds(state.transactions);
  const rows = spendByCategory(state.transactions);
  const oct = NEST_SEED.october;
  const top = rows[0] || { category: "—", cents: 0 };
  const over = NEST_SEED.spendCategories
    .map((cat) => ({ cat, spent: rows.find((r) => r.category === cat)?.cents || 0, limit: state.limits[cat] || 0 }))
    .filter((b) => b.spent > b.limit);
  const saveRate = totals.income > 0 ? 100 * totals.saving / totals.income : 0;
  const tips = [
    `<b>${esc(top.category)}</b> is the biggest slice of November spending at ${money(top.cents)} (${pctOf(top.cents, totals.spending)} of all spending). Rent and groceries are mostly fixed — the flexible money sits in dining, entertainment and shopping.`,
    over.length
      ? `<b>${esc(over[0].cat)}</b> ran ${money(over[0].spent - over[0].limit)} over its ${money(over[0].limit)} limit. A single big purchase did it — worth a pause before the next one, not a smaller grocery run.`
      : `No budget is over its limit this month — every category is inside its plan.`,
    `November spending is ${changeLabel(totals.spending, oct.spending)} against October while income is ${changeLabel(totals.income, oct.income)}. The household kept ${money(totals.remaining)} unspent — that is the buffer for December.`,
    `The savings rate is ${saveRate.toFixed(1)}% of income (${money(totals.saving)} of ${money(totals.income)}). Lifting it to 15% would mean setting aside about ${money(Math.round(totals.income * 0.15) - totals.saving)} more a month.`,
  ];
  return `
  <section class="panel">
    <h1>Insights — November vs October</h1>
    ${monthBars(totals, oct)}
    <p class="muted">Income ${changeLabel(totals.income, oct.income)} · spending ${changeLabel(totals.spending, oct.spending)} · savings ${changeLabel(totals.saving, oct.saving)} against October (${money(oct.income)} / ${money(oct.spending)} / ${money(oct.saving)}).</p>
  </section>
  <div class="two-col">
    <section class="panel">
      <h2>Biggest spending</h2>
      <ol class="rank">
        ${rows.slice(0, 5).map((r, i) => `<li><span class="rank-pos">${i + 1}</span><span class="rank-cat">${esc(r.category)}</span><span class="rank-bar">${progressBar(100 * r.cents / rows[0].cents, "")}</span><b>${money(r.cents)}</b></li>`).join("")}
      </ol>
    </section>
    <section class="panel">
      <h2>What the numbers say</h2>
      <ul class="tips">${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </section>
  </div>
  <section class="panel">
    <h2>Demo data</h2>
    <p>This site ships with the Chen household's November as demo data. Everything you change is saved on this device only.</p>
    <button class="btn danger" id="reset-demo">Reset demo data</button>
    <p class="muted" id="reset-msg"></p>
  </section>`;
}

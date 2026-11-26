/* Nest Egg — money helpers and the household store.
   Money is kept as integer cents everywhere so the totals never drift
   by a penny. The store persists in localStorage and can reset to seed. */
"use strict";

/* Format integer cents as dollars, e.g. 241012 -> "$2,410.12". */
function money(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return sign + "$" + dollars.toLocaleString("en-US") + "." + String(rem).padStart(2, "0");
}

/* Format a ratio as a percent with one decimal, e.g. 0.642 -> "64.2%". */
function pctOf(part, whole) {
  if (whole <= 0) return "0.0%";
  return (100 * part / whole).toFixed(1) + "%";
}

/* Signed percent change between two months, e.g. +2.8% or -5.8%. */
function changeLabel(now, before) {
  if (before <= 0) return "—";
  const d = 100 * (now - before) / before;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

const STORAGE_KEY = "nest-egg-v1";

function freshState() {
  return JSON.parse(JSON.stringify({
    transactions: NEST_SEED.transactions,
    limits: NEST_SEED.budgetLimits,
    goals: NEST_SEED.goals,
  }));
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.transactions) || !parsed.limits || !Array.isArray(parsed.goals)) {
      return freshState();
    }
    return parsed;
  } catch (err) {
    return freshState();
  }
}

function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  const state = freshState();
  saveState(state);
  return state;
}

/* Totals for one list of transactions, in cents. */
function sumKinds(list) {
  const out = { income: 0, spending: 0, saving: 0 };
  for (const tx of list) {
    if (out[tx.kind] !== undefined) out[tx.kind] += tx.cents;
  }
  out.remaining = out.income - out.spending - out.saving;
  return out;
}

/* Spending grouped by category, biggest first. */
function spendByCategory(list) {
  const byCat = new Map();
  for (const tx of list) {
    if (tx.kind !== "spending") continue;
    byCat.set(tx.category, (byCat.get(tx.category) || 0) + tx.cents);
  }
  return [...byCat.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

function budgetStatus(spent, limit) {
  if (limit <= 0) return "No limit";
  if (spent > limit) return "Over budget";
  if (spent === limit) return "Target met";
  if (spent >= 0.8 * limit) return "Almost there";
  return "On track";
}

function nextTxId(state) {
  let n = 0;
  for (const tx of state.transactions) {
    const m = /^t(\d+)$/.exec(tx.id || "");
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  return "t" + String(n + 1).padStart(2, "0");
}

/* Add a transaction. A saving entry whose category names a goal also
   tops that goal up, so the goals page and the ledger always agree. */
function addTransaction(state, tx) {
  tx.id = nextTxId(state);
  state.transactions.push(tx);
  if (tx.kind === "saving") {
    const goal = state.goals.find((g) => g.name === tx.category);
    if (goal) goal.saved += tx.cents;
  }
  saveState(state);
  return tx;
}

function removeTransaction(state, id) {
  const at = state.transactions.findIndex((tx) => tx.id === id);
  if (at < 0) return false;
  const [gone] = state.transactions.splice(at, 1);
  if (gone.kind === "saving") {
    const goal = state.goals.find((g) => g.name === gone.category);
    if (goal) goal.saved = Math.max(0, goal.saved - gone.cents);
  }
  saveState(state);
  return true;
}

function addToGoal(state, goalId, cents) {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal || !(cents > 0)) return null;
  goal.saved += cents;
  const tx = {
    id: nextTxId(state),
    date: new Date().toISOString().slice(0, 10),
    kind: "saving",
    category: goal.name,
    note: "Added to " + goal.name,
    cents,
  };
  state.transactions.push(tx);
  saveState(state);
  return goal;
}

function createGoal(state, name, targetCents, startCents) {
  const id = "g" + Date.now().toString(36);
  const goal = { id, name, saved: startCents || 0, target: targetCents, note: "" };
  state.goals.push(goal);
  saveState(state);
  return goal;
}

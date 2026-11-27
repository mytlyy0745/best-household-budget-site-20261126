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
  if (limit <= 0) return spent > 0 ? "Over budget" : "No limit";
  if (spent > limit) return "Over budget";
  if (spent === limit) return "Target met";
  if (spent >= 0.8 * limit) return "Almost there";
  return "On track";
}

/* Which categories a new entry of this kind can take: income has its
   own list, saving goes to a goal by name, spending to the nine
   household categories. Pages and the CSV import both use this. */
function categoryOptions(kind, state) {
  if (kind === "income") return NEST_SEED.incomeCategories;
  if (kind === "saving") return state.goals.map((g) => g.name);
  return NEST_SEED.spendCategories;
}

function nextTxId(state) {
  let n = 0;
  for (const tx of state.transactions) {
    const m = /^t(\d+)$/.exec(tx.id || "");
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  return "t" + String(n + 1).padStart(2, "0");
}

/* ---- Month pace, weekly spending and goal projections ---- */

/* Days in a month, e.g. 30 for November 2026. */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/* The demo "today": the newest transaction date inside the seed
   month, clamped inside it so the figures always describe November
   2026 — even after the household adds a transaction dated in
   December, the pace strip keeps answering for the month the ledger
   is about. Dates outside the month are ignored here: a December
   dinner on the 28th used to push "today" to the 28th and shrink the
   days left from five to two. */
function demoToday(state) {
  const parts = NEST_SEED.month.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const last = daysInMonth(year, month);
  const prefix = NEST_SEED.month + "-";
  let latest = 1;
  for (const tx of state.transactions) {
    if (!String(tx.date || "").startsWith(prefix)) continue;
    const day = parseInt((tx.date || "").slice(8, 10), 10);
    if (Number.isFinite(day)) latest = Math.max(latest, day);
  }
  const day = Math.min(Math.max(latest, 1), last);
  return { year, month, day, daysInMonth: last, daysLeft: last - day };
}

/* The demo "today" as an ISO date, e.g. "2026-11-25": the day the
   ledger is on, so anything the household adds (a goal top-up, an
   edited transaction) is dated inside the demo month instead of on
   the real calendar day the browser happens to be opened. */
function demoDateString(state) {
  const t = demoToday(state);
  const mm = String(t.month).padStart(2, "0");
  const dd = String(t.day).padStart(2, "0");
  return `${t.year}-${mm}-${dd}`;
}

/* How November is pacing: what is safe to spend each remaining day,
   and whether the flexible spending is ahead of or behind the plan
   for this point in the month. Categories whose money lands as one
   lump at the start of the month (rent, on the 1st) are left out of
   the pace comparison: judging them against an evenly-spread plan
   would always cry wolf in week one. */
const PACE_FIXED = ["Housing"];

function monthPace(state) {
  const totals = sumKinds(state.transactions);
  const today = demoToday(state);
  const flexCats = NEST_SEED.spendCategories.filter((c) => !PACE_FIXED.includes(c));
  const flexLimit = flexCats
    .reduce((sum, cat) => sum + (state.limits[cat] || 0), 0);
  const flexSpent = state.transactions
    .filter((tx) => tx.kind === "spending" && flexCats.includes(tx.category))
    .reduce((sum, tx) => sum + tx.cents, 0);
  const safePerDay = today.daysLeft > 0
    ? Math.floor(totals.remaining / today.daysLeft)
    : totals.remaining;
  const expected = Math.round(flexLimit * today.day / today.daysInMonth);
  const pacePct = expected > 0
    ? 100 * (flexSpent - expected) / expected
    : 0;
  return {
    day: today.day,
    daysInMonth: today.daysInMonth,
    daysLeft: today.daysLeft,
    remaining: totals.remaining,
    flexLimit,
    flexSpent,
    safePerDay,
    expected,
    pacePct,
  };
}

/* Spending grouped by week of the month: Nov 1–7, 8–14, 15–21, 22–30.
   Only the seed month counts — a transaction dated in December used
   to land in a November week by its day number alone. */
function weeklySpending(list) {
  const weeks = [
    { label: "Nov 1–7", from: 1, to: 7, cents: 0 },
    { label: "Nov 8–14", from: 8, to: 14, cents: 0 },
    { label: "Nov 15–21", from: 15, to: 21, cents: 0 },
    { label: "Nov 22–30", from: 22, to: 30, cents: 0 },
  ];
  const prefix = NEST_SEED.month + "-";
  for (const tx of list) {
    if (tx.kind !== "spending") continue;
    if (!String(tx.date || "").startsWith(prefix)) continue;
    const day = parseInt((tx.date || "").slice(8, 10), 10);
    const week = weeks.find((w) => day >= w.from && day <= w.to);
    if (week) week.cents += tx.cents;
  }
  return weeks;
}

/* Income grouped by source, biggest first — the mirror of
   spendByCategory: the household's money comes from five places, and
   until now only the total ever showed. */
function incomeByCategory(list) {
  const byCat = new Map();
  for (const tx of list) {
    if (tx.kind !== "income") continue;
    byCat.set(tx.category, (byCat.get(tx.category) || 0) + tx.cents);
  }
  return [...byCat.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

/* Spending on each day of the seed month, day 1 to the last day —
   a day with no spending stays at zero, so the quiet days show too.
   Transactions dated outside the month are ignored here: this chart
   is the month, day by day. */
function dailySpending(list) {
  const parts = NEST_SEED.month.split("-").map(Number);
  const last = daysInMonth(parts[0], parts[1]);
  const days = [];
  for (let d = 1; d <= last; d++) days.push({ day: d, cents: 0 });
  const prefix = NEST_SEED.month + "-";
  for (const tx of list) {
    if (tx.kind !== "spending") continue;
    if (!String(tx.date || "").startsWith(prefix)) continue;
    const day = parseInt(tx.date.slice(8, 10), 10);
    if (day >= 1 && day <= last) days[day - 1].cents += tx.cents;
  }
  return days;
}

/* The savings rate as one plain object: the share of income saved,
   what 15% would be, and how far short of it the household is. The
   15% target is the one the Next moves panel already uses, so the
   gauge and the advice can never disagree about the number. */
const SAVINGS_TARGET_RATE = 15;

function savingsRate(state) {
  const totals = sumKinds(state.transactions);
  const rate = totals.income > 0 ? 100 * totals.saving / totals.income : 0;
  const targetCents = Math.round(totals.income * SAVINGS_TARGET_RATE / 100);
  return {
    income: totals.income,
    saving: totals.saving,
    rate,
    targetRate: SAVINGS_TARGET_RATE,
    targetCents,
    short: Math.max(0, targetCents - totals.saving),
  };
}

/* What a category's budget looks like right now: what is spent, the
   limit, how far over it is (or how much room is left). The
   add-transaction form uses this to say the consequence out loud
   instead of just "Added". */
function budgetImpact(state, cat) {
  const spent = spendByCategory(state.transactions)
    .find((r) => r.category === cat)?.cents || 0;
  const limit = state.limits[cat] || 0;
  return {
    cat,
    spent,
    limit,
    overBy: Math.max(0, spent - limit),
    left: Math.max(0, limit - spent),
    pct: limit > 0 ? 100 * spent / limit : (spent > 0 ? Infinity : 0),
  };
}

/* One plain sentence about what just happened to a budget, or "" when
   there is nothing worth saying — a small spend well inside its limit
   needs no announcement. */
function budgetImpactLine(impact) {
  if (impact.overBy > 0) {
    return `${impact.cat} is now ${money(impact.overBy)} over its ${money(impact.limit)} limit.`;
  }
  if (impact.limit > 0 && impact.pct >= 80) {
    return `${impact.cat} is now at ${pctOf(impact.spent, impact.limit)} of its ${money(impact.limit)} limit — ${money(impact.left)} left.`;
  }
  return "";
}

/* An ISO date as a short "Nov 28", built from its parts so no
   timezone can shift the day. */
function monthDay(iso) {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return String(iso || "");
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* When a budget's limit runs out at the pace the household is
   spending it: the daily rate is what it spent so far divided by the
   days gone, and the limit is hit when the remaining room runs out
   at that rate. A category whose spending all landed on one day
   (rent, a subscription) is a lump, not a pace — the honest line for
   it is what is left, not a projected date. */
function burnProjection(state, cat) {
  const spent = spendByCategory(state.transactions)
    .find((r) => r.category === cat)?.cents || 0;
  const limit = state.limits[cat] || 0;
  const today = demoToday(state);
  if (spent > limit) return { kind: "over", spent, limit, overBy: spent - limit };
  if (spent === limit && limit > 0) return { kind: "met", spent, limit };
  if (limit <= 0) return { kind: "nolimit", spent, limit };
  if (spent <= 0) return { kind: "none", spent, limit };
  const days = state.transactions
    .filter((tx) => tx.kind === "spending" && tx.category === cat)
    .map((tx) => tx.date);
  if (new Set(days).size === 1) {
    return { kind: "lump", spent, limit, left: limit - spent, date: days[0] };
  }
  const rate = Math.round(spent / today.day);
  const daysToLimit = Math.ceil((limit - spent) / rate);
  const hitDay = today.day + daysToLimit;
  if (hitDay > today.daysInMonth) {
    return { kind: "safe", spent, limit, rate };
  }
  const parts = NEST_SEED.month.split("-").map(Number);
  const hitDate = `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(hitDay).padStart(2, "0")}`;
  return { kind: "pace", spent, limit, rate, hitDay, hitDate };
}

/* The burn projection as one plain line for a budget row. */
function burnLine(proj) {
  switch (proj.kind) {
    case "over": return `Over by ${money(proj.overBy)} — the limit is already spent.`;
    case "met": return "Limit reached exactly — nothing left for this category.";
    case "nolimit": return "No limit set for this category.";
    case "none": return "Nothing spent yet this month.";
    case "lump": return `Paid on ${monthDay(proj.date)} — ${money(proj.left)} of the limit left.`;
    case "pace": return `At this pace, the limit runs out around ${monthDay(proj.hitDate)}.`;
    case "safe": return `At this pace the limit lasts the month — about ${money(proj.rate)} a day.`;
    default: return "";
  }
}

/* When a goal finishes at its current saving pace: the pace is what
   the household actually put into that goal this month, so the date
   moves when the household saves more — or stalls when it stops. */
function goalProjection(goal, state) {
  const pace = state.transactions
    .filter((tx) => tx.kind === "saving" && tx.category === goal.name)
    .reduce((sum, tx) => sum + tx.cents, 0);
  const left = Math.max(0, goal.target - goal.saved);
  if (left === 0) return { pace, monthsLeft: 0, finishLabel: "Target reached" };
  if (pace <= 0) return { pace, monthsLeft: null, finishLabel: "" };
  const monthsLeft = Math.ceil(left / pace);
  const parts = NEST_SEED.month.split("-").map(Number);
  const finish = new Date(parts[0], parts[1] - 1 + monthsLeft, 1);
  const finishLabel = finish.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return { pace, monthsLeft, finishLabel };
}

/* Milestones on the way to a goal: the 25/50/75/100% marks, which
   are hit, and what the next one still needs. A goal that is only
   46.7% saved has one milestone behind it and one $80.00 away — that
   reads better than a bare percent. Hitting a mark exactly counts:
   50.0% saved has the 50% milestone behind it. */
function goalMilestones(goal) {
  const marks = [25, 50, 75, 100];
  const pct = goal.target > 0 ? 100 * goal.saved / goal.target : 0;
  const next = marks.find((m) => pct < m);
  return {
    pct,
    marks: marks.map((m) => ({ pct: m, hit: pct >= m })),
    next: next === undefined ? null : {
      pct: next,
      cents: Math.ceil(goal.target * next / 100) - goal.saved,
    },
    done: next === undefined,
  };
}

/* One line about the next milestone, or that they are all reached. */
function nextMilestoneLine(goal) {
  const ms = goalMilestones(goal);
  if (ms.done) return "All four milestones reached — 25%, 50%, 75% and 100%.";
  return `Next milestone: ${ms.next.pct}% — ${money(ms.next.cents)} more to go.`;
}

/* November against October, category by category: the totals panel
   says spending fell 5.8%, but that hides that Shopping jumped while
   Entertainment fell by a third. Sorted biggest rise first, so the
   movers sit at the top and the bottom. A category with no October
   figure and money this month is "new" (change null) and sorts first;
   one with nothing either month is flat at 0%. Only the seed month
   counts in the November column — a December transaction dated in
   the same category must not move it. */
function categoryMonthComparison(state) {
  const prefix = NEST_SEED.month + "-";
  const novByCat = new Map();
  for (const tx of state.transactions) {
    if (tx.kind !== "spending") continue;
    if (!String(tx.date || "").startsWith(prefix)) continue;
    novByCat.set(tx.category, (novByCat.get(tx.category) || 0) + tx.cents);
  }
  const out = NEST_SEED.spendCategories.map((cat) => {
    const nov = novByCat.get(cat) || 0;
    const oct = NEST_SEED.octoberByCategory[cat] || 0;
    const change = oct > 0 ? 100 * (nov - oct) / oct : (nov > 0 ? null : 0);
    return { cat, nov, oct, change };
  });
  out.sort((a, b) => (b.change === null ? Infinity : b.change) - (a.change === null ? Infinity : a.change));
  return out;
}

/* The one-line summary of the category comparison: which category
   moved most in each direction, in plain words. */
function categoryComparisonNote(rows) {
  const changed = rows.filter((r) => r.change !== null);
  if (!changed.length) return "No October figures to compare against yet.";
  const up = changed.filter((r) => r.change > 0);
  const down = changed.filter((r) => r.change < 0);
  const bits = [];
  if (up.length) {
    bits.push(`${up[0].cat} is up the most (${changeLabel(up[0].nov, up[0].oct)})`);
  }
  if (down.length) {
    const bottom = down[down.length - 1];
    bits.push(`${bottom.cat} is down the most (${changeLabel(bottom.nov, bottom.oct)})`);
  }
  if (!bits.length) return "Every category spent exactly what it did in October.";
  return bits.join(" — ") + ".";
}

/* Notes the household has already used for this kind and category,
   newest first — the add form offers them as you type, so "Weekly
   shop — Green Mart" is one tap instead of retyping. Duplicates are
   dropped, and the list is capped so a long ledger stays usable. */
function noteSuggestions(state, kind, category) {
  const seen = new Set();
  const out = [];
  const sorted = [...state.transactions]
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  for (const tx of sorted) {
    if (tx.kind !== kind || tx.category !== category) continue;
    if (seen.has(tx.note)) continue;
    seen.add(tx.note);
    out.push(tx.note);
    if (out.length >= 8) break;
  }
  return out;
}

/* What a goal needs each month to finish on a schedule, not just at
   the pace the household happens to be saving now: the amount is
   rounded UP to the cent, so paying it every month really does cover
   the gap (rounding down would leave a few cents short at the end).
   A goal that is already met needs nothing; one with no saving pace
   yet still gets its numbers, so the household can see what "start"
   would have to look like. */
function goalMonthlyPlan(goal, state) {
  const pace = state.transactions
    .filter((tx) => tx.kind === "saving" && tx.category === goal.name)
    .reduce((sum, tx) => sum + tx.cents, 0);
  const left = Math.max(0, goal.target - goal.saved);
  const monthsAtPace = pace > 0 ? Math.ceil(left / pace) : null;
  return {
    pace,
    left,
    need6: left === 0 ? 0 : Math.ceil(left / 6),
    need12: left === 0 ? 0 : Math.ceil(left / 12),
    monthsAtPace,
  };
}

/* One sentence comparing the goal's real pace with its 6- and
   12-month plans, so the household can see whether to save more —
   and by exactly how much — instead of just watching a date drift. */
function goalPlanLine(goal, state) {
  const plan = goalMonthlyPlan(goal, state);
  if (plan.left === 0) return "Target reached — nothing more to save.";
  if (plan.pace <= 0) {
    return `No money went into this goal yet — ${money(plan.need6)} a month would finish it in 6 months, ${money(plan.need12)} a month in 12.`;
  }
  if (plan.pace >= plan.need6) {
    return `At ${money(plan.pace)} a month you are already saving enough to finish it in 6 months.`;
  }
  if (plan.pace >= plan.need12) {
    return `At ${money(plan.pace)} a month it takes about ${plan.monthsAtPace} months — ${money(plan.need6 - plan.pace)} more a month would do it in 6.`;
  }
  return `At ${money(plan.pace)} a month it takes about ${plan.monthsAtPace} months — ${money(plan.need12 - plan.pace)} more a month would finish it in 12.`;
}

/* An ISO date as a short "Sun, Nov 1", built from its parts so no
   timezone can shift the day. */
function dayLabel(iso) {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return String(iso || "");
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/* The month's best and worst days, by net money: income minus
   spending minus saving for each day. Payday is usually the best day
   even when rent lands on it — Nov 1 takes in $4,200.00 and pays out
   $958.97, so it is +$3,241.03 and also the biggest-spending day —
   while the worst day is the one that quietly took the most out, Nov 5
   at −$420.00. Only the seed month counts, like the daily chart. */
function dayNetSummary(state) {
  const prefix = NEST_SEED.month + "-";
  const byDay = new Map();
  for (const tx of state.transactions) {
    if (!String(tx.date || "").startsWith(prefix)) continue;
    if (!byDay.has(tx.date)) {
      byDay.set(tx.date, { date: tx.date, income: 0, spending: 0, saving: 0 });
    }
    const d = byDay.get(tx.date);
    if (d[tx.kind] !== undefined) d[tx.kind] += tx.cents;
  }
  const days = [...byDay.values()].map((d) => ({
    ...d,
    net: d.income - d.spending - d.saving,
    label: dayLabel(d.date),
  }));
  if (!days.length) return { best: null, worst: null, single: false };
  const best = days.reduce((a, b) => (b.net > a.net ? b : a), days[0]);
  const worst = days.reduce((a, b) => (b.net < a.net ? b : a), days[0]);
  return { best, worst, single: best.date === worst.date };
}

/* A day's net as one short line: only the kinds that actually
   happened that day are shown, with the sign each kind carries. */
function dayNetLine(d) {
  const bits = [];
  if (d.income > 0) bits.push(`income +${money(d.income)}`);
  if (d.spending > 0) bits.push(`spending −${money(d.spending)}`);
  if (d.saving > 0) bits.push(`saving −${money(d.saving)}`);
  return bits.join(" · ");
}

/* The regular bills, with whether each one has actually been paid
   this month: a bill counts as paid when the ledger holds a spending
   transaction in its category for exactly its amount inside the seed
   month — the seed's four bills each mirror one such transaction, so
   deleting or editing that transaction flips the bill to unpaid,
   which is the honest answer. A bill whose day has passed unpaid is
   overdue; one whose day is still ahead is simply due. */
function regularBills(state) {
  const prefix = NEST_SEED.month + "-";
  const today = demoToday(state);
  const total = NEST_SEED.recurring.reduce((sum, b) => sum + b.cents, 0);
  const rows = NEST_SEED.recurring.map((b) => {
    const paid = state.transactions.some((tx) =>
      tx.kind === "spending" && tx.category === b.category && tx.cents === b.cents &&
      String(tx.date || "").startsWith(prefix));
    const status = paid ? "paid" : (b.day <= today.day ? "overdue" : "due");
    return { ...b, paid, status };
  });
  return { rows, total, paidTotal: rows.filter((r) => r.paid).reduce((s, r) => s + r.cents, 0) };
}

/* The next bill the household still has to pay, in plain words: the
   nearest unpaid bill, dated in December when its November day has
   already passed — or, when every bill is paid, the first one of next
   month. */
function nextBillLine(state) {
  const bills = regularBills(state);
  const unpaid = bills.rows.filter((r) => !r.paid);
  if (!unpaid.length) {
    const first = [...bills.rows].sort((a, b) => a.day - b.day)[0];
    if (!first) return "";
    const parts = NEST_SEED.month.split("-").map(Number);
    const next = new Date(parts[0], parts[1], first.day);
    const when = next.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `All November bills are paid — next is ${first.name}, ${money(first.cents)} on ${when}.`;
  }
  const next = [...unpaid].sort((a, b) => a.day - b.day)[0];
  const due = monthDay(`${NEST_SEED.month}-${String(next.day).padStart(2, "0")}`);
  if (next.status === "overdue") {
    return `Next bill to pay: ${next.name} — ${money(next.cents)}, due ${due} and still unpaid.`;
  }
  return `Next bill to pay: ${next.name} — ${money(next.cents)} on ${due}.`;
}

/* Group a transaction list by day, newest day first: each group
   carries its own totals, so a day's spending, income and saving are
   visible without adding them up by hand. The groups follow whatever
   list they are given — the full ledger, or a filtered one. */
function groupTransactionsByDay(list) {
  const byDay = new Map();
  for (const tx of list) {
    if (!byDay.has(tx.date)) byDay.set(tx.date, []);
    byDay.get(tx.date).push(tx);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, txs]) => {
      const totals = sumKinds(txs);
      return { date, label: dayLabel(date), txs, totals, count: txs.length };
    });
}

/* A group's totals as one short line: only the kinds that actually
   happened that day are shown, with the sign each kind carries. */
function daySubtotalLine(totals) {
  const bits = [];
  if (totals.income > 0) bits.push(`income +${money(totals.income)}`);
  if (totals.spending > 0) bits.push(`spending −${money(totals.spending)}`);
  if (totals.saving > 0) bits.push(`saving −${money(totals.saving)}`);
  return bits.join(" · ");
}

/* ---- Moving money between budgets (envelope budgeting) ---- */

/* What a category still has free: its limit minus what it spent.
   Negative when the category is already over its limit. */
function headroom(state, cat) {
  const spent = spendByCategory(state.transactions)
    .find((r) => r.category === cat)?.cents || 0;
  return (state.limits[cat] || 0) - spent;
}

/* Move limit dollars from one spending category to another. The
   month's total limit never changes — this is envelope budgeting, not
   new money. The source must have the room: moving more than its
   headroom would just move the overage somewhere else. Returns an
   object saying what happened, so the page can say it in words. */
function moveLimit(state, fromCat, toCat, cents) {
  if (!NEST_SEED.spendCategories.includes(fromCat) || !NEST_SEED.spendCategories.includes(toCat)) {
    return { ok: false, error: "Pick two spending budgets to move between." };
  }
  if (fromCat === toCat) {
    return { ok: false, error: "Pick two different budgets — moving money to itself changes nothing." };
  }
  if (!Number.isFinite(cents) || cents <= 0 || Math.floor(cents) !== cents) {
    return { ok: false, error: "Enter a whole-dollar amount above $0." };
  }
  const free = headroom(state, fromCat);
  if (cents > free) {
    if (free < 0) {
      return { ok: false, error: `${fromCat} is already ${money(-free)} over its limit — there is nothing to move from it.` };
    }
    return { ok: false, error: `${fromCat} has only ${money(free)} free — moving ${money(cents)} would put it over.` };
  }
  state.limits[fromCat] -= cents;
  state.limits[toCat] += cents;
  saveState(state);
  return { ok: true, moved: cents, fromCat, toCat };
}

/* The one move that would help most right now: the category furthest
   over its limit, covered from the category with the most room. The
   amount is the smaller of the overage and the room, so a move never
   puts its source over. Null when nothing is over, or when no budget
   has any room to give. */
function rebalanceSuggestion(state) {
  const rows = spendByCategory(state.transactions);
  let over = null;
  for (const cat of NEST_SEED.spendCategories) {
    const spent = rows.find((r) => r.category === cat)?.cents || 0;
    const overBy = spent - (state.limits[cat] || 0);
    if (overBy > 0 && (!over || overBy > over.overBy)) over = { cat, spent, overBy };
  }
  if (!over) return null;
  let source = null;
  for (const cat of NEST_SEED.spendCategories) {
    if (cat === over.cat) continue;
    const free = headroom(state, cat);
    if (free > 0 && (!source || free > source.free)) source = { cat, free };
  }
  if (!source) return null;
  const amount = Math.min(over.overBy, source.free);
  return {
    overCat: over.cat,
    overBy: over.overBy,
    fromCat: source.cat,
    free: source.free,
    amount,
    coversAll: amount >= over.overBy,
  };
}

/* The concrete next moves for the household, computed from its own
   numbers — at most two, each with the exact dollars attached. A move
   is only listed when it is real: a rebalance when something is over,
   a savings nudge when the rate is under 15%. */
function nextMoves(state) {
  const moves = [];
  const sug = rebalanceSuggestion(state);
  if (sug) {
    moves.push({
      kind: "rebalance",
      text: `${sug.overCat} is ${money(sug.overBy)} over its limit — move ${money(sug.amount)} from ${sug.fromCat} (${money(sug.free)} free)${sug.coversAll ? " and it is covered." : ", which covers part of it."}`,
      fromCat: sug.fromCat,
      toCat: sug.overCat,
      amount: sug.amount,
    });
  }
  const totals = sumKinds(state.transactions);
  if (totals.income > 0) {
    const rate = 100 * totals.saving / totals.income;
    if (rate < 15) {
      const short = Math.round(totals.income * 0.15) - totals.saving;
      if (short > 0) {
        moves.push({
          kind: "savings",
          text: `The savings rate is ${rate.toFixed(1)}% of income. Setting aside ${money(short)} more a month would reach 15%.`,
        });
      }
    }
  }
  return moves;
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
    date: demoDateString(state),
    kind: "saving",
    category: goal.name,
    note: "Added to " + goal.name,
    cents,
  };
  state.transactions.push(tx);
  saveState(state);
  return goal;
}

/* Change one transaction in place, keeping its id. A saving entry's
   goal is unwound for the old values and re-applied for the new ones,
   so editing an amount, a category or a kind can never leave a goal
   out of step with the ledger. Returns false when the id is unknown. */
function updateTransaction(state, id, fields) {
  const at = state.transactions.findIndex((tx) => tx.id === id);
  if (at < 0) return false;
  const old = state.transactions[at];
  if (old.kind === "saving") {
    const g = state.goals.find((x) => x.name === old.category);
    if (g) g.saved = Math.max(0, g.saved - old.cents);
  }
  const updated = { ...old, ...fields, id };
  state.transactions[at] = updated;
  if (updated.kind === "saving") {
    const g = state.goals.find((x) => x.name === updated.category);
    if (g) g.saved += updated.cents;
  }
  saveState(state);
  return true;
}

/* The ledger as a CSV download: one row a transaction, amounts in
   dollars with the sign the row carries on screen (income +, the
   rest −). Notes are quoted and doubled the way CSV wants. */
function csvCell(value) {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function transactionsCSV(list) {
  const head = ["Date", "Type", "Category", "Note", "Amount"];
  const rows = list.map((tx) => {
    const sign = tx.kind === "income" ? 1 : -1;
    const amount = (sign * tx.cents / 100).toFixed(2);
    return [tx.date, tx.kind, tx.category, tx.note, amount].map(csvCell).join(",");
  });
  return head.join(",") + "\n" + rows.join("\n") + "\n";
}

/* ---- CSV import (the round trip of the CSV export) ---- */

/* Split one CSV line the way the format wants: commas inside quotes
   do not split, and a doubled quote inside a quoted field is one
   quote. Returns null when the quotes do not balance. */
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (quoted) return null;
  out.push(cur);
  return out;
}

/* Is this a real calendar date, not just four digits, a dash and
   wishful thinking — 2026-11-31 and 2026-13-01 both fail here. */
function isRealDate(iso) {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return false;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

/* Read a CSV in the shape the export writes — Date, Type, Category,
   Note, Amount — and turn it into transactions. The header row is
   skipped, blank lines are ignored, and a row that does not check
   out is listed in errors instead of stopping the whole import, so
   one bad line never eats the good ones. Amounts carry the sign the
   export writes (income +, the rest −); the type column decides the
   kind, and the amount's size is what is stored. A leading $ and
   thousands commas are forgiven. */
function parseTransactionsCSV(text, state) {
  const rows = [];
  const errors = [];
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  let seenHeader = false;
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    if (!line.trim()) continue;
    const cells = splitCSVLine(line);
    if (cells === null) { errors.push({ line: ln + 1, reason: "unbalanced quotes" }); continue; }
    if (!seenHeader) {
      seenHeader = true;
      if (cells[0].trim().toLowerCase() === "date") continue;
    }
    if (cells.length !== 5) { errors.push({ line: ln + 1, reason: `expected 5 columns, found ${cells.length}` }); continue; }
    const [date, kind, category, note, amountRaw] = cells.map((c) => c.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) { errors.push({ line: ln + 1, reason: `bad date "${date}"` }); continue; }
    if (!["income", "spending", "saving"].includes(kind)) { errors.push({ line: ln + 1, reason: `unknown type "${kind}"` }); continue; }
    if (!categoryOptions(kind, state).includes(category)) { errors.push({ line: ln + 1, reason: `unknown category "${category}" for ${kind}` }); continue; }
    if (!note) { errors.push({ line: ln + 1, reason: "empty note" }); continue; }
    const amount = Number(amountRaw.replace(/^\$/, "").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount === 0) { errors.push({ line: ln + 1, reason: `bad amount "${amountRaw}"` }); continue; }
    rows.push({ date, kind, category, note, cents: Math.round(Math.abs(amount) * 100) });
  }
  return { rows, errors };
}

function createGoal(state, name, targetCents, startCents) {
  const id = "g" + Date.now().toString(36);
  const goal = { id, name, saved: startCents || 0, target: targetCents, note: "" };
  state.goals.push(goal);
  saveState(state);
  return goal;
}

/* The month as a plain-text report the household can keep: totals,
   every budget against its limit, every goal with its pace and finish
   date, the savings rate, and the two lines that matter most — what is
   over, and how far the savings rate is from its target. Pure text,
   no network — the Insights page offers it as a download. */
function monthReport(state) {
  const totals = sumKinds(state.transactions);
  const rows = spendByCategory(state.transactions);
  const sr = savingsRate(state);
  const pace = monthPace(state);
  const lines = [];
  lines.push(`NEST EGG — ${NEST_SEED.monthLabel} report`);
  lines.push(`The Chen household · day ${pace.day} of ${pace.daysInMonth} · ${pace.daysLeft} day${pace.daysLeft === 1 ? "" : "s"} left`);
  lines.push("");
  lines.push(`Income   ${money(totals.income)}`);
  lines.push(`Spending ${money(totals.spending)}`);
  lines.push(`Savings  ${money(totals.saving)}`);
  lines.push(`Left     ${money(totals.remaining)}`);
  lines.push(`Savings rate ${sr.rate.toFixed(1)}% of income (target ${sr.targetRate}%)`);
  lines.push("");
  lines.push("Income sources");
  for (const r of incomeByCategory(state.transactions)) {
    lines.push(`  ${r.category}: ${money(r.cents)} (${pctOf(r.cents, totals.income)} of income)`);
  }
  lines.push("");
  lines.push("Budgets");
  for (const cat of NEST_SEED.spendCategories) {
    const spent = rows.find((r) => r.category === cat)?.cents || 0;
    const limit = state.limits[cat] || 0;
    lines.push(`  ${cat}: ${money(spent)} of ${money(limit)} — ${budgetStatus(spent, limit)}`);
  }
  lines.push("");
  lines.push("Regular bills");
  const bills = regularBills(state);
  for (const b of bills.rows) {
    lines.push(`  ${b.name}: ${money(b.cents)} on day ${b.day} — ${b.paid ? "paid" : b.status === "overdue" ? "not paid yet (due date passed)" : "due"}`);
  }
  lines.push(`  ${money(bills.paidTotal)} of ${money(bills.total)} paid this month. ${nextBillLine(state)}`);
  lines.push("");
  lines.push("Spending vs October");
  for (const r of categoryMonthComparison(state)) {
    const ch = r.change === null ? "new this month"
      : r.change === 0 ? "same as October"
      : changeLabel(r.nov, r.oct);
    lines.push(`  ${r.cat}: ${money(r.nov)} vs ${money(r.oct)} (${ch})`);
  }
  lines.push("");
  lines.push("Goals");
  for (const g of state.goals) {
    const proj = goalProjection(g, state);
    const when = proj.monthsLeft === 0 ? "target reached"
      : proj.monthsLeft === null ? "no saving pace yet"
      : `about ${proj.monthsLeft} month${proj.monthsLeft === 1 ? "" : "s"} to go, around ${proj.finishLabel}`;
    lines.push(`  ${g.name}: ${money(g.saved)} of ${money(g.target)} (${pctOf(g.saved, g.target)}) — ${when}`);
  }
  lines.push("");
  lines.push("Biggest spending");
  rows.slice(0, 5).forEach((r, i) => lines.push(`  ${i + 1}. ${r.category} — ${money(r.cents)}`));
  lines.push("");
  lines.push("Notes");
  const over = NEST_SEED.spendCategories.filter((cat) => {
    const spent = rows.find((r) => r.category === cat)?.cents || 0;
    return spent > (state.limits[cat] || 0);
  });
  lines.push(over.length
    ? `  Over budget: ${over.map((cat) => `${cat} ${money((rows.find((r) => r.category === cat)?.cents || 0) - (state.limits[cat] || 0))} over`).join(", ")}.`
    : "  No budget is over its limit this month.");
  lines.push(sr.rate >= sr.targetRate
    ? `  Savings rate ${sr.rate.toFixed(1)}% is above the ${sr.targetRate}% target.`
    : `  Savings rate ${sr.rate.toFixed(1)}% is ${money(sr.short)} a month short of the ${sr.targetRate}% target.`);
  lines.push("");
  lines.push("Made with Nest Egg — demo data for the Chen household, November 2026.");
  return lines.join("\n") + "\n";
}

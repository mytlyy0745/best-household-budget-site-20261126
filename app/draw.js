/* Nest Egg — hand-rolled SVG charts. No libraries: a donut built from
   circle strokes and a grouped bar chart built from plain rectangles. */
"use strict";

const CHART_COLORS = {
  Housing: "#1e4d3a",
  Groceries: "#d9930d",
  Dining: "#c96f4a",
  Transport: "#5b8a72",
  Utilities: "#8a6d3b",
  Entertainment: "#b56576",
  Shopping: "#6a994e",
  Health: "#4a7fa5",
  Subscriptions: "#9b7ede",
};

/* Donut of spending by category. Returns an SVG string plus a legend.
   Every slice and every legend row is clickable: boot.js listens for
   .donut-seg and .legend-cat and opens Transactions filtered to that
   category, so the chart is a way in, not just a picture. */
function donutChart(rows, total) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 82;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let rings = "";
  for (const row of rows) {
    const frac = total > 0 ? row.cents / total : 0;
    const len = Math.max(frac * circ - 2, 0.5);
    rings += `<circle class="donut-seg" data-cat="${row.category}" cx="${cx}" cy="${cy}" r="${r}" fill="none" ` +
      `stroke="${CHART_COLORS[row.category] || "#888"}" stroke-width="34" ` +
      `stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" ` +
      `stroke-dashoffset="${(-offset).toFixed(2)}">` +
      `<title>${row.category} — ${money(row.cents)} (${pctOf(row.cents, total)}) — tap to see its transactions</title></circle>`;
    offset += frac * circ;
  }
  const legend = rows.map((row) =>
    `<li><button type="button" class="legend-cat" data-cat="${row.category}"><span class="swatch" style="background:${CHART_COLORS[row.category] || "#888"}"></span>` +
    `${row.category} <b>${money(row.cents)}</b> <span class="muted">${pctOf(row.cents, total)}</span></button></li>`
  ).join("");
  return `<div class="donut-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `role="img" aria-label="Spending by category — tap a slice to see its transactions"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ` +
    `stroke="#efe8d3" stroke-width="34" />${rings}` +
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle" class="donut-total">${money(total)}</text>` +
    `<text x="${cx}" y="${cy + 18}" text-anchor="middle" class="donut-label">spent in November</text></svg>` +
    `<ul class="legend">${legend}</ul></div>` +
    `<p class="muted donut-hint">Tap a slice or a category to see its transactions.</p>`;
}

/* Grouped bars comparing November with October for three measures.
   The viewBox is taller than the drawing so the "% vs October" line
   under each group is never clipped — it sits at y 242. */
function monthBars(nov, oct) {
  const groups = [
    { label: "Income", now: nov.income, before: oct.income },
    { label: "Spending", now: nov.spending, before: oct.spending },
    { label: "Savings", now: nov.saving, before: oct.saving },
  ];
  const top = Math.max(...groups.flatMap((g) => [g.now, g.before]), 1);
  const W = 560, H = 262, base = 200, gap = 46;
  const slot = (W - gap) / 3;
  const barW = 52;
  let bars = "";
  let labels = "";
  groups.forEach((g, i) => {
    const x0 = gap / 2 + i * slot;
    const hNow = Math.round(150 * g.now / top);
    const hBefore = Math.round(150 * g.before / top);
    bars += `<rect x="${x0}" y="${base - hBefore}" width="${barW}" height="${hBefore}" rx="4" fill="#cbbf9d" />` +
      `<rect x="${x0 + barW + 8}" y="${base - hNow}" width="${barW}" height="${hNow}" rx="4" fill="#1e4d3a" />` +
      `<text x="${x0 + barW}" y="${base - Math.max(hNow, hBefore) - 8}" text-anchor="middle" class="bar-val">${money(g.now)}</text>`;
    labels += `<text x="${x0 + barW}" y="${base + 22}" text-anchor="middle" class="bar-lab">${g.label}</text>` +
      `<text x="${x0 + barW}" y="${base + 42}" text-anchor="middle" class="bar-sub">${changeLabel(g.now, g.before)} vs October</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="November compared with October">` +
    `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#d8cfb6" />${bars}${labels}</svg>` +
    `<p class="chart-key"><span class="key-dot now"></span> November &nbsp; <span class="key-dot before"></span> October</p>`;
}

/* Vertical bars for the four weeks of November, in the same visual
   language as monthBars: pine bars, the amount on top, the week below. */
function weekBars(weeks) {
  const top = Math.max(...weeks.map((w) => w.cents), 1);
  const W = 560, H = 230, base = 180, gap = 40;
  const slot = (W - gap) / 4;
  const barW = 64;
  let bars = "";
  let labels = "";
  weeks.forEach((w, i) => {
    const x0 = gap / 2 + i * slot;
    const h = Math.max(Math.round(140 * w.cents / top), 2);
    bars += `<rect x="${x0}" y="${base - h}" width="${barW}" height="${h}" rx="4" fill="#1e4d3a" />` +
      `<text x="${x0 + barW / 2}" y="${base - h - 8}" text-anchor="middle" class="bar-val">${money(w.cents)}</text>`;
    labels += `<text x="${x0 + barW / 2}" y="${base + 22}" text-anchor="middle" class="bar-lab">${w.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="Spending by week in November">` +
    `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#d8cfb6" />${bars}${labels}</svg>`;
}

/* One thin bar per day of the month, in the same visual language as
   weekBars. Only the biggest day carries its amount on top and only
   every fifth day is labelled underneath — thirty of each would be
   unreadable. The biggest day is amber so the eye lands on it first.
   A day with no spending gets no bar at all, so the quiet days show
   as gaps. */
function dayBars(days) {
  const top = Math.max(...days.map((d) => d.cents), 1);
  const W = 560, H = 215, base = 165, gap = 24;
  const slot = (W - gap) / days.length;
  const barW = Math.max(8, Math.floor(slot) - 6);
  const biggest = days.reduce((a, b) => (b.cents > a.cents ? b : a), days[0]);
  let bars = "";
  let labels = "";
  days.forEach((d, i) => {
    const x0 = gap / 2 + i * slot + (slot - barW) / 2;
    const h = d.cents > 0 ? Math.max(Math.round(125 * d.cents / top), 2) : 0;
    const isBig = d.day === biggest.day && d.cents > 0;
    if (h > 0) {
      bars += `<rect x="${x0.toFixed(1)}" y="${base - h}" width="${barW}" height="${h}" rx="3" fill="${isBig ? "#d9930d" : "#1e4d3a"}" />`;
    }
    if (isBig) {
      bars += `<text x="${(x0 + barW / 2).toFixed(1)}" y="${base - h - 8}" text-anchor="middle" class="bar-val">${money(d.cents)}</text>`;
    }
    if (d.day === 1 || d.day % 5 === 0 || d.day === days.length) {
      labels += `<text x="${(x0 + barW / 2).toFixed(1)}" y="${base + 22}" text-anchor="middle" class="bar-lab">${d.day}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="Spending by day in November">` +
    `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#d8cfb6" />${bars}${labels}</svg>`;
}

/* A semicircular gauge for the savings rate, on a 0–25% scale: the
   pine arc is what the household actually saved, the amber tick marks
   the 15% target. An arc helper keeps the trigonometry in one place. */
function arcPoint(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
  const [x0, y0] = arcPoint(cx, cy, r, fromDeg);
  const [x1, y1] = arcPoint(cx, cy, r, toDeg);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function savingsGauge(ratePct, targetPct) {
  const W = 260, H = 150, cx = 130, cy = 128, r = 92;
  const scale = 25; // the dial runs 0–25%
  const rateClamped = Math.max(0, Math.min(scale, ratePct));
  const rateDeg = 180 - 180 * rateClamped / scale;
  const targetDeg = 180 - 180 * Math.max(0, Math.min(scale, targetPct)) / scale;
  const [tx0, ty0] = arcPoint(cx, cy, r - 7, targetDeg);
  const [tx1, ty1] = arcPoint(cx, cy, r + 7, targetDeg);
  const [lx, ly] = arcPoint(cx, cy, r + 16, targetDeg);
  const labelAnchor = targetDeg > 90 ? "end" : targetDeg < 90 ? "start" : "middle";
  const rateText = ratePct.toFixed(1) + "%";
  return `<svg viewBox="0 0 ${W} ${H}" class="gauge" role="img" aria-label="Savings rate ${rateText} of income, target ${targetPct}%">` +
    `<path d="${arcPath(cx, cy, r, 180, 0)}" fill="none" stroke="#e7dfc6" stroke-width="16" stroke-linecap="round" />` +
    (rateClamped > 0
      ? `<path d="${arcPath(cx, cy, r, 180, rateDeg)}" fill="none" stroke="#1e4d3a" stroke-width="16" stroke-linecap="round" />`
      : "") +
    `<line x1="${tx0.toFixed(1)}" y1="${ty0.toFixed(1)}" x2="${tx1.toFixed(1)}" y2="${ty1.toFixed(1)}" stroke="#d9930d" stroke-width="3" />` +
    `<text x="${lx.toFixed(1)}" y="${Math.max(14, ly - 4).toFixed(1)}" text-anchor="${labelAnchor}" class="bar-sub">${targetPct}% target</text>` +
    `<text x="${cx}" y="${cy - 16}" text-anchor="middle" class="gauge-num">${rateText}</text>` +
    `<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="bar-sub">of income saved</text>` +
    `</svg>`;
}

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

/* Donut of spending by category. Returns an SVG string plus a legend. */
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
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ` +
      `stroke="${CHART_COLORS[row.category] || "#888"}" stroke-width="34" ` +
      `stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" ` +
      `stroke-dashoffset="${(-offset).toFixed(2)}" />`;
    offset += frac * circ;
  }
  const legend = rows.map((row) =>
    `<li><span class="swatch" style="background:${CHART_COLORS[row.category] || "#888"}"></span>` +
    `${row.category} <b>${money(row.cents)}</b> <span class="muted">${pctOf(row.cents, total)}</span></li>`
  ).join("");
  return `<div class="donut-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `role="img" aria-label="Spending by category"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ` +
    `stroke="#efe8d3" stroke-width="34" />${rings}` +
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle" class="donut-total">${money(total)}</text>` +
    `<text x="${cx}" y="${cy + 18}" text-anchor="middle" class="donut-label">spent in November</text></svg>` +
    `<ul class="legend">${legend}</ul></div>`;
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

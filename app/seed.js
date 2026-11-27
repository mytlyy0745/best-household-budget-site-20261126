/* Nest Egg — seed data for the November 2026 demo household.
   All money is integer cents. The seed month is November 2026 and the
   figures below are the household's own starting point: they add up to
   income $5,470.00, spending $2,459.88 and savings $600.00. */
"use strict";

const NEST_SEED = {
  monthLabel: "November 2026",
  month: "2026-11",
  october: { income: 532101, spending: 261134, saving: 50000 },
  /* October spending by category, for the category-by-category
     comparison on Insights: the nine figures add up to the October
     spending total above, so the two views can never disagree. */
  octoberByCategory: {
    Housing: 92000,
    Groceries: 74250,
    Dining: 16840,
    Transport: 17420,
    Utilities: 22150,
    Entertainment: 9630,
    Shopping: 13200,
    Health: 11747,
    Subscriptions: 3897,
  },
  spendCategories: [
    "Housing",
    "Groceries",
    "Dining",
    "Transport",
    "Utilities",
    "Entertainment",
    "Shopping",
    "Health",
    "Subscriptions",
  ],
  incomeCategories: ["Salary", "Freelance", "Refund", "Interest", "Gift"],
  budgetLimits: {
    Housing: 95000,
    Groceries: 65000,
    Dining: 20000,
    Transport: 18000,
    Utilities: 24000,
    Entertainment: 10000,
    Shopping: 18000,
    Health: 15000,
    Subscriptions: 4000,
  },
  savingsTarget: 60000,
  /* The bills that land every month, on the same day, for the same
     amount — the fixed outgoings the household can count on. Each one
     mirrors a transaction in the ledger below, so the Budgets page
     can say whether it has actually been paid this month. */
  recurring: [
    { name: "November rent", category: "Housing", cents: 92000, day: 1 },
    { name: "Streaming bundle", category: "Subscriptions", cents: 3897, day: 1 },
    { name: "Electricity bill", category: "Utilities", cents: 13245, day: 10 },
    { name: "Internet and phone", category: "Utilities", cents: 8999, day: 12 },
  ],
  goals: [
    { id: "emergency", name: "Emergency fund", saved: 321000, target: 500000, note: "Six months of essentials, for the things nobody plans." },
    { id: "japan", name: "Japan trip", saved: 112000, target: 240000, note: "Two weeks in Kyoto and Tokyo next spring." },
    { id: "laptop", name: "New laptop", saved: 83000, target: 200000, note: "A replacement for the one that overheats every summer." },
  ],
  transactions: [
    { id: "t01", date: "2026-11-01", kind: "income", category: "Salary", note: "November salary — Northwind Studio", cents: 420000 },
    { id: "t02", date: "2026-11-01", kind: "spending", category: "Housing", note: "November rent", cents: 92000 },
    { id: "t03", date: "2026-11-01", kind: "spending", category: "Subscriptions", note: "Streaming bundle (three services)", cents: 3897 },
    { id: "t04", date: "2026-11-02", kind: "spending", category: "Groceries", note: "Weekly shop — Green Mart", cents: 18640 },
    { id: "t05", date: "2026-11-03", kind: "spending", category: "Transport", note: "Metro card top-up", cents: 4860 },
    { id: "t06", date: "2026-11-05", kind: "spending", category: "Transport", note: "Fuel — family car", cents: 12000 },
    { id: "t07", date: "2026-11-05", kind: "saving", category: "Emergency fund", note: "Monthly transfer to the emergency fund", cents: 30000 },
    { id: "t08", date: "2026-11-07", kind: "spending", category: "Dining", note: "Family dinner out", cents: 8640 },
    { id: "t09", date: "2026-11-08", kind: "income", category: "Freelance", note: "Logo project for a local bakery", cents: 65000 },
    { id: "t10", date: "2026-11-09", kind: "spending", category: "Groceries", note: "Farmers market", cents: 14285 },
    { id: "t11", date: "2026-11-10", kind: "spending", category: "Utilities", note: "Electricity bill", cents: 13245 },
    { id: "t12", date: "2026-11-12", kind: "income", category: "Refund", note: "Tax refund from last year", cents: 32000 },
    { id: "t13", date: "2026-11-12", kind: "spending", category: "Utilities", note: "Internet and phone", cents: 8999 },
    { id: "t14", date: "2026-11-12", kind: "saving", category: "Japan trip", note: "Japan trip savings", cents: 20000 },
    { id: "t15", date: "2026-11-14", kind: "spending", category: "Dining", note: "Takeaway Friday", cents: 5425 },
    { id: "t16", date: "2026-11-15", kind: "spending", category: "Entertainment", note: "Cinema night and popcorn", cents: 6498 },
    { id: "t17", date: "2026-11-16", kind: "spending", category: "Groceries", note: "Weekly shop — Green Mart", cents: 17425 },
    { id: "t18", date: "2026-11-18", kind: "spending", category: "Shopping", note: "Winter coats for the kids", cents: 21000 },
    { id: "t19", date: "2026-11-19", kind: "saving", category: "New laptop", note: "Laptop fund", cents: 10000 },
    { id: "t20", date: "2026-11-20", kind: "income", category: "Interest", note: "Savings account interest", cents: 18000 },
    { id: "t21", date: "2026-11-20", kind: "spending", category: "Health", note: "Pharmacy — flu medicine", cents: 9650 },
    { id: "t22", date: "2026-11-23", kind: "spending", category: "Groceries", note: "Pantry top-up", cents: 9424 },
    { id: "t23", date: "2026-11-25", kind: "income", category: "Gift", note: "Birthday gift from Mum", cents: 12000 },
  ],
};

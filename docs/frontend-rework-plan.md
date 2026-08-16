# Budget Quest — Rework Plan

Turning [prototype.html](mockups/prototype.html) into the real app.

**Decisions locked in:** game state server-side in MongoDB · incremental rollout behind a flag · auto-assigned category colors with opt-in budgets.

**Hard constraint:** existing transaction data is never rewritten. Every schema change is additive.

---

## Things about the current code that shape this plan

| Fact | Consequence |
|---|---|
| `type` enum is `['income','expense','subscription']` ([models/Transaction.js:17](../models/Transaction.js)) | `subscription` counts as **outflow** everywhere. The prototype only knew income/expense — every new aggregate must handle three values. |
| `category` is free-text with default `'Uncategorized'` | No fixed palette. Colors must be derived from the string. |
| `GET /api/transactions` returns **every** transaction, unpaginated ([routes/transactionRoutes.js:272](../routes/transactionRoutes.js)) | Fine at 23 rows, not at 5,000. The month strip and net-by-month chart get a real aggregate endpoint instead of summing client-side. |
| `Report.js` is 851 lines holding all state | Split into views. This is the bulk of the frontend work. |
| `Report.test.js` is 403 lines against that component | It keeps passing during the incremental phase and gets rewritten at cutover. |
| Amounts are stored positive with direction in `type` | Keep. Do not introduce signed amounts. |

---

## Phase 1 — Backend and database

All additive. No migration touches the `transactions` collection.

### 1.1 New models

**`models/Budget.js`**
```
userId, category, monthlyLimit, createdAt/updatedAt
unique index (userId, category)
```
Absent budget = no cap; bar shows relative spend instead of spend-vs-cap.

**`models/Progress.js`** — one document per user
```
userId (unique)
xp: Number
claims: [{ periodKey: '2026-05', questId, xpAwarded, claimedAt }]
achievements: [{ id, unlockedAt }]
```
Unique compound index on `claims.periodKey + claims.questId` enforced in application logic plus a guard at write time, so a double-click can't award XP twice.

### 1.2 Quest evaluation lives on the server

**`lib/quests.js`** — the single source of truth. Exports quest definitions and `evaluateQuests(transactions, budgets)` returning progress per quest.

This matters: if quest completion is computed in the browser, XP is free for anyone with devtools. The client renders progress; the server decides whether a claim is valid.

**`lib/achievements.js`** — same pattern, evaluated from transactions plus progress.

### 1.3 New endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/transactions/summary?year=2026` | `$group` by month → `{month, income, expense, net, count}[]`. Feeds the month strip dots and the net-by-month chart in one request. |
| `GET /api/progress` | XP, level, rank, streak, unlocked achievements |
| `GET /api/progress/quests/:year/:month` | Quest definitions + live progress + claimable flags |
| `POST /api/progress/quests/:year/:month/:questId/claim` | Re-evaluates server-side, awards XP, idempotent |
| `GET /api/budgets` · `PUT /api/budgets` | Read/upsert category caps |

The summary aggregation must bucket `expense` **and** `subscription` into outflow — mirroring the existing logic at [routes/transactionRoutes.js:326](../routes/transactionRoutes.js).

### 1.4 Backfill so you don't start at zero

**`scripts/backfillProgress.js`** — walks existing transactions, awards retroactive XP (10/transaction, 25/import batch), evaluates historical quests and achievements, computes the saving streak, writes one `Progress` doc.

Without this you'd open a "gamified" app at Level 1 with three years of history. Run once per user, idempotent.

---

## Phase 2 — Frontend foundation

Nothing visible ships in this phase.

- **`src/theme/tokens.css`** — the CSS custom properties from the prototype, both themes. Replaces the ad-hoc colors in `App.css`.
- **`src/lib/categoryColor.js`** — `hashString(category) % PALETTE.length`. Deterministic, so "Groceries" is always the same blue on every device with zero migration. Palette is the six CVD-validated hues already checked with the dataviz validator.
- **`src/lib/money.js`** — one formatter, `tabular-nums` everywhere.
- **`src/api/budgets.js`**, **`src/api/progress.js`** — matching the existing `requestJson` style in [api/transactions.js](../finance-tracker-frontend/src/api/transactions.js).

---

## Phase 3 — Shell and views behind a flag

`App.js` reads `REACT_APP_UI_V2`. True → new shell; false/absent → today's `Report.js`. Both compile the whole time; you flip it in Vercel when ready.

```
src/state/AppStateContext.js     month, filters, sort, theme, view
src/components/shell/
  AppShell.js  Sidebar.js  TopBar.js  MonthStrip.js  StatusBar.js
src/views/
  DashboardView.js  TransactionsView.js  QuestsView.js  AchievementsView.js
src/components/game/
  PlayerCard.js  XpBar.js  QuestCard.js  BadgeGrid.js
src/components/CommandPalette.js
```

`TransactionsView` reuses the existing `AddTransaction` and `ImportStatementModal` rather than rewriting them — they already work.

**Order:** shell → DashboardView (hero, budget bars, recent activity) → TransactionsView (table, filters, sort) → QuestsView → AchievementsView → CommandPalette.

The **empty-month fix ships with the shell**, not at the end: default to the latest month containing data, and render the designed empty state for months without any. That's the single worst bug in the current app and it doesn't need the game layer.

---

## Phase 4 — Animations

**`src/hooks/useCountUp.js`**
`requestAnimationFrame` loop, `easeOutCubic`, ~900ms. Drives the hero net-saved figure on mount and re-runs on month change, counting from the previous month's value rather than from zero so switching months reads as a transition rather than a reset. Returns the target immediately when `prefers-reduced-motion: reduce`.

**Bar growth**
Budget bars and category bars mount at `width: 0` and transition to target — `useLayoutEffect` + one `requestAnimationFrame` so the browser paints the zero state first. Stagger with `transition-delay: calc(var(--i) * 40ms)`.

**Net-by-month chart: switch from SVG to HTML divs.** The prototype drew `<rect>` elements; SVG height isn't reliably transitionable across browsers. A flex column of divs with `height` transitions animates cleanly, stays accessible, and drops the hand-computed geometry. Keep the numeric label above each bar — that's what relieves the palette's contrast warning.

Every animation sits behind the same reduced-motion guard, including the confetti.

---

## Phase 5 — Tests and cutover

New: `lib/quests` evaluation, claim idempotency (double-claim awards XP once), summary aggregation with `subscription` rows present, `categoryColor` determinism, `useCountUp` reduced-motion behaviour.

Cutover: flip the flag in Vercel, watch runtime logs, then delete `Report.js`, its 403-line test, and the flag in one cleanup commit.

---

## Sequencing

| Step | Deliverable | Depends on |
|---|---|---|
| 1 | Budget + Progress models, backfill script | — |
| 2 | `lib/quests`, `lib/achievements`, progress + budget routes | 1 |
| 3 | `/transactions/summary` endpoint | — |
| 4 | Tokens, category colors, API clients | — |
| 5 | Shell + month strip + **empty-state fix** | 3, 4 |
| 6 | DashboardView + animations | 5 |
| 7 | TransactionsView | 5 |
| 8 | Quests + Achievements views | 2, 5 |
| 9 | Command palette + shortcuts | 5 |
| 10 | Tests, flag flip, delete old code | all |

Steps 3 and 4 are independent of 1–2 and can run in parallel.

---

## Risks

- **`subscription` silently dropped from outflow** in a new aggregate would quietly understate spending. Covered by a test that includes a subscription row.
- **Backfill double-run** would double XP. Script is idempotent on `Progress.userId`.
- **`Report.test.js` is load-bearing** until cutover — don't let it rot in the meantime.
- **Unpaginated `GET /api/transactions`** is untouched here. The summary endpoint takes pressure off, but the transactions list will eventually need pagination. Out of scope; worth a follow-up.
- **Quest design is guesswork** until real numbers are in. The four in the prototype are placeholders; expect to retune the thresholds once you see your own categories.

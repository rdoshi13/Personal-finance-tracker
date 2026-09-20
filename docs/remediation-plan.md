# Remediation Plan

Findings from a full read of the repo on 2026-09-20, and the work to clear them.
Companion to [frontend-rework-plan.md](frontend-rework-plan.md) — that document plans
the Budget Quest rework, this one covers what has to be true before its final step
(flag flip, delete `Report.js`) is safe.

**Status:** Phases 1 and 2 done. Phase 3 transaction editing done, PDF export
parked, category breakdown open. Phases 4–5 open.

---

## Phase 1 — Dependency patches and housekeeping ✅

### Backend: 6 advisories → 0

Five moved inside their existing `^` ranges, so only `package-lock.json` changed:

| Package | From | To | Severity |
|---|---|---|---|
| nodemailer | 9.0.5 | 9.1.1 | high |
| multer | 2.2.0 | 2.4.0 | high |
| express | 4.22.2 | 4.22.3 | moderate (via `qs`) |
| body-parser | 1.20.6 | 1.20.8 | moderate (via `qs`) |
| qs | 6.15.3 | 6.16.0 | moderate |

The multer advisories were the ones that mattered — three of four are DoS through
crafted multipart fields, and `/api/transactions/import/preview` takes uploads.

**csv-parse 6.2.1 → 7.0.2** was the one major bump, and the one genuinely worth
the version jump: the advisory is prototype replacement reachable *through the
`columns` path*, and `parseCsvBuffer` calls `parse(buffer, { columns: true, … })`.

Verified as a drop-in before upgrading, against the exact call signature in
[lib/transactionImport.js](../lib/transactionImport.js):

- single-amount CSV and debit/credit CSV both parse to identical shapes
- a `__proto__` header now lands as an own key and leaves `Object.prototype` untouched

### Frontend: 113 → 9

`fflate@0.8.2` reaches the shipped bundle via `jspdf@4.2.1`. Pinned to `0.8.3`
through the existing `overrides` block. The build output hash did not change
(`main.00899354.js` before and after), which confirms the vulnerable `unzipSync`
path was tree-shaken out and never shipped — jsPDF writes PDFs, it does not read
untrusted archives. The fix is still worth having; the exposure was not.

**Two existing overrides had gone stale** — pinned to versions that later
advisories cover. This is the important finding, because the `overrides` block
*looked* like these were handled:

| Override | Was | Vulnerable range | Now |
|---|---|---|---|
| `fast-uri` | 3.1.2 | `>= 3.1.2, < 3.1.6` — the pin sat inside it | 3.1.8 |
| `postcss` | 8.5.8 | `<= 8.5.22` | 8.5.28 |

Both pins were correct when written and were overtaken. Bumping just these two
took the count from **112 to 13**, because everything in the `postcss-*` and `ajv`
trees hangs off them.

Four more were then pinned to the lowest patched version **in the same major
line** — `body-parser@1.20.8`, `colord@2.9.4`, `express@4.22.3`, `qs@6.16.0` —
taking 13 → 9. Pinning to `latest` would have forced express 5 and body-parser 2
into webpack-dev-server; the minimum patched version in the installed major is
the safe move.

**The remaining 9 are genuinely stuck.** Seven report `react-scripts@0.0.0` as the
fix, npm's way of saying no published version resolves them: `react-scripts`,
`svgo`, `@svgr/webpack`, `@svgr/plugin-svgo`, `sockjs`, `uuid`,
`webpack-dev-server`. The other two — `js-yaml` and `postcss-selector-parser` —
have **two major lines installed at once** (3.x + 4.x, 6.x + 7.x), and a flat
override forces one version on both consumers. js-yaml 4 dropped `safeLoad`, so
that would break the 3.x consumer inside `svgo@1.3.2`. Both of those sit in the
already-stuck svgo cluster, so scoping per-parent changes nothing about whether
the badge is red.

None of the 9 reach the bundle. `npm audit --omit=dev` does not filter them
because CRA declares `react-scripts` under `dependencies` rather than
`devDependencies`. The real fix is migrating off CRA — see Phase 5.

**Lesson worth keeping:** a version pin in `overrides` is a point-in-time
assertion, not a standing fix. Re-check the whole block against current
advisories periodically rather than assuming a listed package is handled.

### Housekeeping

[routes/progressRoutes.js](../routes/progressRoutes.js): dropped an unused
`periodKeyOf` import and merged a duplicated `require('../lib/achievements')`.

### Verification

| Check | Result |
|---|---|
| `npm test` (backend) | 30/30 pass |
| `node -e "require('./app')"` | ok |
| `node -e "require('./api/[...path]')"` | ok |
| `npm audit` (backend) | 0 vulnerabilities |
| `npm audit` (frontend) | 113 → 9, all build-tooling |
| `CI=true npm test -- --watchAll=false` | 49/49 pass, 9 suites |
| `npm run build` | compiles clean, 195.38 kB gzip, hash unchanged |
| v2 boot in browser | shell + auth gate render, console clean |

---

## Phase 2 — Actually run the v2 UI ✅

`REACT_APP_UI_V2` appeared in [README.md](../README.md), in
[App.js](../finance-tracker-frontend/src/App.js) and in the rework plan, but in **no
`.env` file anywhere**. Roughly 2,000 lines compiled into every bundle unexercised.

Done:

- `REACT_APP_UI_V2=true` added to the local (gitignored) `.env`, and documented
  commented-out in `.env.example` so it is discoverable.
- v2 boots. The shell mounts, the auth gate renders, and the browser console is
  clean — only the expected 401s from the unauthenticated `/api/auth/me` check.
  No compile errors, no React warnings.

**Walked signed-in on 2026-09-20** against the local `test@test.com` account
(27 transactions, Mar–May 2026). All four views render correctly, console clean.

Working as designed:

- **The empty-month fix.** Opening on May 2026 (latest month with data) rather
  than the current month, and a real empty state with "Go to May 2026" on months
  without any. This was the rework plan's "single worst bug" and it is genuinely
  fixed.
- Dashboard hero, budget bars, net-by-month chart, recent activity, quest cards
  with claim buttons, achievement grid, filters, sort, command palette (⌘K).
- The importer's merchant cleanup reads well in the table — "Google Play",
  "OpenAI ChatGPT", "Venmo - Doshi Rishabh" rather than raw statement text.
- Transaction editing, end to end: opens prefilled, saves, toast reads
  "Transaction updated", change persists to Mongo.

### Found while walking it: categories were silently reset on edit

Opening the edit form on an imported transaction could **discard its category**.
`AddTransaction` keeps a hardcoded category list per type and replaced anything
not in that list with the type's default, `Misc`. Saving then persisted the
replacement.

The importer routinely produces combinations the lists do not cover, because it
picks a category from merchant rules but derives the type from the amount's sign:

| Importer output | In that type's list? | Became |
|---|---|---|
| `expense` + `Subscription` | no — `Subscription` only exists under type `subscription` | `Misc` |
| `income` + `Groceries` | no — a shop refund is income, `Groceries` is expense-only | `Misc` |

**6 of 49 transactions** in the local test data were affected — 12%. `Utilities`,
`Tax Refund`, `Salary` and `Investment` on an expense are exposed the same way.

Fixed by surfacing the stored category as a selectable option instead of
overwriting it. Covered by a regression test in `AddTransaction.test.js`, verified
to fail without the fix. Note this bug predates v2 and is shared with the
`Report` UI — wiring up edit in v2 is what made it reachable again.

### Still open from the walkthrough

- ~~**Net-by-month bars ignore sign.**~~ **Fixed.** The plot now splits at a zero
  line whose position is set by the data (`maxPos / (maxPos + maxNeg)`), so
  positive months grow up from it and negative months hang below. Each side is
  scaled against its own peak, so both use the space they have. An all-negative
  run puts the line at the top, all-positive at the bottom, which is the old
  behaviour.
- ~~**The month strip shows on Achievements.**~~ **Fixed**, along with two other
  pieces of month chrome on the same view that were making the same claim: the
  TopBar subtitle ("May 2026" under the Achievements heading) and the StatusBar's
  per-month count, period and net. `isMonthScopedView` in `AppStateContext` is now
  the single definition of which views are month-scoped; the StatusBar falls back
  to the all-time transaction count and "All time", and drops the month net.

---

## Phase 3 — Close the v2 feature gap

The rework plan's step 10 reads "flip the flag, delete `Report.js` and its test". That
is not safe yet — v2 is missing three things v1 ships today.

| Missing in v2 | Evidence | Cost |
|---|---|---|
| ~~**Transaction editing**~~ — **done** | `AppShell` now holds the transaction under edit and passes it through; `TransactionsView` has an edit button beside delete | Was low, as predicted — `AddTransaction` already supported edit mode and `updateTransaction` already existed. See below. |
| **PDF export** | `jspdf` is imported by `Report.js` and nothing else | Medium — a real port. Listed as a core feature in the README. |
| **Monthly category breakdown** | `MonthlyReportSection`, `MonthlySummaryCards` and `getMonthlyReport` have `Report.js` as their only consumer | Medium — DashboardView's budget bars and net-by-month chart overlap the summary cards, but the income-vs-outflow category split has no v2 equivalent. |

Deleting `Report.js` without porting these is a straight feature regression. It also
orphans those three components, the `getMonthlyReport` client, and possibly the
backend `/api/transactions/report/:year/:month` endpoint.

**Decision taken 2026-09-20:** PDF export is parked for now. Transaction editing is
done. The monthly category breakdown is still open.

### Transaction editing, as wired

- `AppShell` holds `editing` alongside `adding`; `openAdd` clears it, `openEdit`
  sets it, `closeForm` resets both. The modal's `aria-label` switches between
  "Add transaction" and "Edit transaction".
- `AddTransaction` already returned `onSaved(data, mode)`, so the toast now reads
  "Transaction updated" or "Transaction saved" off `mode`.
- `TransactionsView` takes an `onEdit` prop and renders a `PencilIcon` button
  before the delete button. `.bq-ract` already had `gap: 5px` and was clearly
  built for more than one action.
- `.bq-mini:hover` used to turn red for every mini button. Red now lives on
  `.bq-mini.del:hover` only, so the destructive colour means something.
- Covered by `src/views/TransactionsView.test.js` — the first v2 component test.
  It asserts `onEdit` receives the **whole transaction object** (AddTransaction
  reads name/type/category/amount off it), that delete still removes by id, and
  that the `_id`/`id` fallback holds.

Not wired: the Dashboard's "Recent activity" rows are still read-only. That was a
deliberate scope call — the transactions table is where v1 put the edit affordance.

---

## Phase 4 — Replace the test coverage before cutting over

`Report.test.js` holds **11 integration tests**: load/render, monthly report data,
legacy-shape fallback, delete under two id shapes, search filtering, import preview,
invalid import rows, import-to-list, theme persistence, unauthenticated state.

**v2 has zero component tests.** Only `money`, `categoryColor` and `useCountUp` lib
tests exist. Deleting `Report.test.js` drops 11 tests and replaces them with nothing.

Needed before cutover:

- equivalents against `AppShell`, `TransactionsView` and `DashboardView`
- `App.test.js` currently does `jest.mock('./Report', …)` and breaks the moment
  `Report.js` is deleted — it needs rewriting in the same commit

---

## Phase 5 — Deferred

- **Unpaginated `GET /api/transactions`.** Already flagged in the rework plan's risks.
  Fine at current row counts.
- **`/api/progress` re-reads every transaction** on each call to re-derive
  achievements ([routes/progressRoutes.js](../routes/progressRoutes.js), `syncAchievements`).
  Compounds with the above — the two get slow together, not separately.
- **CRA migration (Vite).** The only real answer to the 112 build-tooling advisories.
  `react-scripts` is unmaintained. Sizeable, independent project.

---

## Sequencing

| Step | Deliverable | Depends on | Status |
|---|---|---|---|
| 1 | Dependency patches + housekeeping | — | done |
| 2 | Flag on locally, walk the v2 UI, widen the gap list | 1 | done |
| 3 | Wire transaction editing into `TransactionsView` | 2 | done |
| 4 | Port the category breakdown | 2 | open |
| 4b | Port PDF export | 2 | parked |
| 5 | v2 component tests replacing `Report.test.js` | 3, 4 | open |
| 6 | Flip flag in Vercel, watch logs, then delete `Report.js`, `Report.test.js`, rewrite `App.test.js` | 5 | open |
| 7 | Pagination; CRA migration | — | open |

Step 7 is independent and can run whenever.

---

## Risks

- **Cutting over on the rework plan's timeline** would ship a regression. The plan
  predates the v2 views and assumes feature parity that does not exist.
- **Deleting `Report.js` before Phase 4** leaves the app's main flows untested. The
  rework plan already warns `Report.test.js` is load-bearing; it is more load-bearing
  than that warning implies, because nothing was written to replace it.
- **Overrides go stale silently.** Two pins in the block were sitting inside
  vulnerable ranges while looking handled. Re-audit the whole `overrides` block
  against current advisories rather than trusting that a listed package is fixed.
- **Chasing the last 9 CRA advisories** is not worth it: seven have no published
  fix short of leaving CRA, and two would force a single major on two consumers
  that need different ones.
- **`fflate` will drift again** — it is pinned by override, not by `jspdf`. Re-check
  it whenever `jspdf` is upgraded.
- **v2 has still only been seen logged out.** Every conclusion about the
  Dashboard, Transactions, Quests and Achievements views — including the Phase 3
  gap list and the editing work above — rests on reading the code, not on seeing
  it render against real data.

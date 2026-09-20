# Remediation Plan

Findings from a full read of the repo on 2026-09-20, and the work to clear them.
Companion to [frontend-rework-plan.md](frontend-rework-plan.md) — that document plans
the Budget Quest rework, this one covers what has to be true before its final step
(flag flip, delete `Report.js`) is safe.

**Status:** Phase 1 done. Phases 2–5 open.

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

### Frontend: one real fix, 112 deliberately left

`fflate@0.8.2` reaches the shipped bundle via `jspdf@4.2.1`. Pinned to `0.8.3`
through the existing `overrides` block. The build output hash did not change
(`main.00899354.js` before and after), which confirms the vulnerable `unzipSync`
path was tree-shaken out and never shipped — jsPDF writes PDFs, it does not read
untrusted archives. The fix is still worth having; the exposure was not.

**The remaining 112 advisories all trace to `react-scripts@5.0.1` build tooling**
— postcss, svgo, webpack-dev-server, tailwind, ajv, js-yaml. `npm audit --omit=dev`
does not filter them because CRA declares `react-scripts` under `dependencies`
rather than `devDependencies`. None reach the bundle.

**Do not chase these individually.** Each override risks the build for no runtime
gain. The real fix is migrating off CRA — see Phase 5.

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
| `CI=true npm test -- --watchAll=false` | 46/46 pass, 8 suites |
| `npm run build` | compiles clean, 195.38 kB gzip |

---

## Phase 2 — Actually run the v2 UI

`REACT_APP_UI_V2` appears in [README.md](../README.md), in
[App.js](../finance-tracker-frontend/src/App.js) and in the rework plan, but in **no
`.env` file anywhere**. The Budget Quest UI has never been run. Roughly 2,000 lines
compile into every bundle unexercised.

- Set `REACT_APP_UI_V2=true` locally and click through every view.
- Add it to `finance-tracker-frontend/.env.example`, commented, so it is discoverable.

The gap list in Phase 3 comes from reading the code. Running it will find more.
**Nothing in Phase 3 or 4 should be scoped before this happens.**

---

## Phase 3 — Close the v2 feature gap

The rework plan's step 10 reads "flip the flag, delete `Report.js` and its test". That
is not safe yet — v2 is missing three things v1 ships today.

| Missing in v2 | Evidence | Cost |
|---|---|---|
| **Transaction editing** | [AppShell.js:105](../finance-tracker-frontend/src/components/shell/AppShell.js) hardcodes `editingTransaction={null}`; `TransactionsView` renders delete but no edit | Low — `AddTransaction` already supports edit mode and `updateTransaction` already exists in the API client. Purely unwired. |
| **PDF export** | `jspdf` is imported by `Report.js` and nothing else | Medium — a real port. Listed as a core feature in the README. |
| **Monthly category breakdown** | `MonthlyReportSection`, `MonthlySummaryCards` and `getMonthlyReport` have `Report.js` as their only consumer | Medium — DashboardView's budget bars and net-by-month chart overlap the summary cards, but the income-vs-outflow category split has no v2 equivalent. |

Deleting `Report.js` without porting these is a straight feature regression. It also
orphans those three components, the `getMonthlyReport` client, and possibly the
backend `/api/transactions/report/:year/:month` endpoint.

**Open decision:** port all three, or drop some deliberately? PDF export is the
expensive one and the answer depends on whether it is actually used or mainly a
portfolio feature.

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
| 2 | Flag on locally, walk the v2 UI, widen the gap list | 1 | open |
| 3 | Wire transaction editing into `TransactionsView` | 2 | open |
| 4 | Port PDF export and category breakdown *(scope TBD)* | 2 | open |
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
- **Chasing the 112 CRA advisories** with `overrides` risks breaking the build to fix
  code that never ships.
- **`fflate` will drift again** — it is pinned by override, not by `jspdf`. Re-check
  it whenever `jspdf` is upgraded.

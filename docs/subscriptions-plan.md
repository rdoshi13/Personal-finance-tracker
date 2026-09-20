# Subscriptions View — Plan

A new sidebar section listing every subscription with what it costs and how often it
bills. Companion to [remediation-plan.md](remediation-plan.md), which closed out the
Budget Quest cutover.

**Status:** built and merged, 2026-09-20. Option A (classification) as decided,
plus two things agreed after the plan was written: the importer now emits
`type: 'subscription'` directly, and a lapsed subscription can be marked cancelled.

---

## What the data actually looks like

Checked against the local `test@test.com` account, 49 transactions across Mar–May 2026.

### Subscriptions live in two incompatible shapes

| Shape | Rows | Where they come from |
|---|---|---|
| `type: 'subscription'` | 4 | Added by hand through `AddTransaction` |
| `type: 'expense'` + `category: 'Subscription'` | 3 | Imported from statements |

The importer **cannot** produce `type: 'subscription'`. It picks the category from
merchant rules in `CATEGORY_RULES` but derives the type from the sign of the amount,
so every imported subscription lands as an `expense`. This is the same
vocabulary mismatch behind the category-loss bug fixed in #6.

**Keying the view on `type === 'subscription'` alone would hide 3 of 7 — 43% of them,
and specifically every imported one.** Keying on `category === 'Subscription'` alone
would hide the Gym and Streaming rows. Neither field is sufficient on its own.

### Cadence is not stored anywhere

Nothing on `Transaction` records a billing period. "Monthly" has to be inferred from
the gaps between charges, and the real data shows why that is harder than it sounds:

| Merchant | Charges | Amount | Inferred |
|---|---|---|---|
| OpenAI ChatGPT | Apr 10, May 11 | $21.62 both | Monthly — clean 31-day gap |
| Spotify | Mar 2, **May 1** | $11.99 both | Monthly with April missing — the raw 60-day gap reads as bi-monthly |
| Gym (`test4`) | Mar 12 | $23 | One charge; cadence unknowable |
| Google Play | May 15 | $25 and $23 | See below |

So the algorithm has to treat a gap near a multiple of ~30 days as a monthly cycle
with a missed charge, not as a longer cycle. With three months of history and gaps
in it, confidence is genuinely low and the UI should say so rather than assert
"monthly" from two data points.

### Recurring is not the same as subscription

Rent ($380, Mar and May) and Chase Credit Card Autopay ($40, Apr and May) recur on a
fixed monthly amount and look exactly like subscriptions to a pure recurrence
detector — but they are `Housing` and `Credit Card Payment`, and almost certainly
not what you want in this list. NJ Transit recurs with a varying amount ($89, $42.50).

This is the argument against inferring membership purely from repetition.

### One data problem this surfaced

There are **two Google Play charges on 15 May 2026**: `$25.00` as
`expense + Subscription` (imported) and `$23.00` as `subscription + Subscription`
(manual). Almost certainly the same real charge entered twice, once by import and
once by hand, with the amount mistyped. The dedupe `importHash` does not catch it
because the manual row has no hash.

Not in scope here, but the Subscriptions view will make it visible, and it is worth
deciding whether near-duplicate detection belongs on the roadmap.

---

## The identification rule

**This is the decision.** Everything else follows from it.

### Option A — classification ✅ chosen

A subscription is any transaction where `type === 'subscription'` **or** `category`
is one of `Subscription`, `Streaming`, `Software`, `Cloud`, `Gym`, `Membership`.

- Catches all 7 rows in the real data, both shapes.
- Predictable: you control what appears by setting type or category, and the
  existing edit form already exposes both.
- No false positives from Rent or credit-card autopay.
- Matches how `CATEGORY_OPTIONS` already groups these categories under the
  `subscription` type in `AddTransaction`.

Weakness: a subscription filed under an unrelated category (say Netflix tagged
`Entertainment`) is missed until you retag it.

### Option B — recurrence detection

Infer membership from a name and amount repeating at a regular interval.

- Catches things you forgot to tag.
- But it also catches Rent and Chase autopay, and it misses any subscription with
  only one charge so far. On three months of gappy history it will be wrong often
  enough to erode trust in the list.

### Option C — a real `Subscription` model

Store name, amount, cadence, next due date and active/cancelled as their own
documents, and link charges to them.

- The correct long-term answer. Cadence becomes a fact rather than a guess, and
  you can track a subscription that has not been charged yet.
- Much bigger: new model, new endpoints, new management UI, and a migration to
  seed it from history.

**Decided 2026-09-20: A now, C later.** Ship the classification rule. Recurrence is
used only to *derive cadence and flag staleness* for rows already identified as
subscriptions — never to decide membership, which is what keeps Rent and the card
autopay out of the list. C becomes the follow-up if the view proves useful, and the
first thing likely to force it is wanting to dismiss a cancelled subscription.

---

## Proposed build

Assumes Option A.

### 1 · `lib/subscriptions.js`

One pure function, tested in isolation the way `categoryBreakdown` is.

```
detectSubscriptions(transactions) -> [{
  name,            // display name, from the most recent charge
  key,             // normalised name used for grouping
  category,
  amount,          // most recent charge
  amountVaries,    // true when charges differ, so the UI can say "~$X"
  cadence,         // 'monthly' | 'yearly' | 'weekly' | 'irregular' | 'unknown'
  confidence,      // 'high' | 'low' -- low when fewer than 3 charges
  monthlyCost,     // normalised, so annual plans compare honestly
  charges,         // count
  firstCharged, lastCharged,
  nextExpected,    // null when cadence is unknown
  status,          // 'active' | 'lapsed'
}]
```

Cadence from the **median** gap between charges, bucketed with tolerance, and gaps
near a multiple of ~30 days treated as a monthly cycle with missed charges rather
than a longer cycle. One charge means `cadence: 'unknown'`, not a guess. `lapsed`
when nothing has arrived for roughly two expected cycles — that is the "you are
still paying for something you forgot" signal, which is arguably the whole point of
the view.

### 2 · `views/SubscriptionsView.js`

- **Header figure: total normalised monthly cost**, with the annual equivalent
  beneath it. This is the number worth knowing.
- A row per subscription: category colour dot, name, amount (prefixed `~` when it
  varies), cadence, last charged, next expected.
- `lapsed` rows in a separate group below, since they are a different question.
- Low-confidence rows marked, so a cadence inferred from two charges does not read
  as fact.
- Reuses the `.bq-cat` row pattern and `categoryColor`, as the Breakdown view does.
- Empty state consistent with the other views.

### 3 · Wiring

`Sidebar` (after Breakdown), `AppShell` view switch, `TopBar` title, `CommandPalette`
command, plus a new repeat-arrow icon in `icons.js`.

**Not month-scoped.** A subscription is an ongoing commitment, not a property of the
selected month, so it joins Achievements outside `MONTH_SCOPED_VIEWS` and the month
strip stays hidden. `isMonthScopedView` already exists for exactly this.

### 4 · Tests

`lib/subscriptions.test.js` carries the weight: both data shapes detected, monthly
cadence from clean gaps, a missed month still reading as monthly, annual normalised
to a monthly figure, single charge reported as unknown rather than guessed, varying
amounts flagged, lapsed detection, and Rent and credit-card autopay **not** picked up.

`views/SubscriptionsView.test.js` for grouping, ordering by monthly cost, the
lapsed split and the empty state.

---

## Sequencing

| Step | Deliverable | Depends on | Status |
|---|---|---|---|
| 0 | Decide the identification rule | — | done — Option A |
| 1 | `lib/subscriptions.js` + tests | 0 | done |
| 2 | `SubscriptionsView` + tests | 1 | done |
| 3 | Sidebar, shell, palette, icon wiring | 2 | done |
| 4 | Check against real data in the browser | 3 | done |

---

## How the open questions were resolved

- **The importer now emits `type: 'subscription'`.** `resolveType` promotes an
  outflow landing in a subscription category, so imported and hand-entered
  subscriptions finally share one shape. `scripts/backfillSubscriptionType.js`
  retyped the three existing rows and is idempotent, with a `--dry` flag. Safe on
  the numbers as predicted — `OUTFLOW_TYPES` already treated the two identically.
  Option A's category clause stays as a safety net for rows the rule misses.
- **Annual is supported and verified against real data.** `inferCadence` scores
  each candidate period by how well gaps fit whole multiples of it, penalised by
  assumed skipped cycles — without that penalty every gap fits `monthly`, since a
  year is twelve of them, and nothing would ever read as annual. Weekly, monthly,
  quarterly and yearly are all supported. Two `Domain Renewal` charges a year
  apart were seeded into the local test account to exercise it end to end.
- **Lapsed subscriptions can be marked cancelled**, which needed real storage:
  `models/SubscriptionState.js` plus `GET`/`PUT /api/subscriptions`. Only the
  override is stored — the subscriptions themselves stay derived. Keyed on the
  normalised name rather than a transaction id, so the override survives the
  charges it was derived from being edited or deleted.

## Still open

- **Should the importer emit `type: 'subscription'`?** It would collapse the two
  shapes into one and make Option A's category clause redundant over time. Safe on
  the numbers — `OUTFLOW_TYPES` already buckets `expense` and `subscription`
  identically, so no total, quest, budget or chart figure would change. It would
  need a backfill for existing rows, and `scripts/` has precedent for that. Worth
  doing, but as its own change rather than folded into this one.
- **Annual subscriptions.** None exist in the test data, so the yearly path would
  ship unexercised except by unit tests. Worth adding one by hand to check.
- **Should a lapsed subscription be dismissable?** Otherwise a cancelled service
  sits in the list forever. That may be the first thing that pushes toward Option C.
- **An unknown-cadence subscription counts at full value** in the monthly total.
  Google Play has one charge, so nothing is known about its period; treating it as
  monthly is the conservative reading and the row is labelled `Unknown`, but it
  could overstate. Revisit if it proves misleading.
- **The two Google Play rows** ($25 imported, $23 manual, same day) are still
  there. The view surfaces them as one subscription with a varying amount, which
  is honest, but they are probably one real charge entered twice.

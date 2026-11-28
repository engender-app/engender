# A cost is three fields on the record, and amounts never cross currencies

Status: Accepted
Decided: 2026-10-21
Last reviewed: 2026-11-02
Supersedes: none

Records that cost money carry an amount, a currency and a refunded flag:
hair-removal sessions, appointments (waits included), procedures, lab results
and the medication stock entry. Each table holds `cost_amount` (REAL,
nullable), `cost_currency` (TEXT, nullable) and `cost_refunded` (INTEGER, 0 or
1). There is no cost table, ledger or purchase log. `src/lib/data/cost.ts`
holds the one rule every write path and archive import uses.

## Decisions

- **Major units, as typed.** 250.50 is stored as 250.5, not 25050. Nothing
  converts, nothing adds across currencies, and readers format through
  `Intl.NumberFormat` for the record's own currency.
- **The currency is null exactly when the amount is.** "Refunded" can stand
  alone: a person can know NFZ paid without knowing the figure.
- **No CHECK** (ADR-0095). `assertValidCost` refuses a negative or non-finite
  amount, one over 1e9 or with more than two decimal places, a currency that is
  not three upper-case letters, and an amount without a currency, on every
  write and, through `archiveRowValidation.ts`, on every archive row.
- **Never summed across currencies.** `costTotalsByCurrency` returns one total
  per currency and is the only way a total is made. There is no exchange rate
  in the app: a rate is a fact about a day the person did not choose, and a
  converted sum would be a number nobody paid.
- **The default currency comes from the device's locales**, not the app's
  language: the first locale naming a region the table in `cost.ts` knows
  (`en-GB` is GBP, `pl-PL` is PLN), else the likely region of the first locale,
  else EUR. The editor's currency select lists common codes first, then every
  code the runtime knows.
- **Display keeps the stored precision.** Up to two decimal places whatever the
  currency's minor unit, so 250.5 JPY reads JP¥250.5, never a rounded JP¥251.
- **Stock carries the cost of the supply held now**, beside the expiry and
  pharmacy note (maintainer decision, 2026-10-21). A fresh count that leaves the cost out
  clears it, as it clears the expiry.
- **An edit that does not mention a procedure's cost keeps it**, the way
  `archived` is kept, because the procedure editor is not the only caller of
  `upsertProcedure`. Every other record's editor resubmits the cost, and
  leaving it out there clears it.

## The old free-text cost

Before this decision a hair-removal session had a free-text `cost`. The
migration (`src/lib/data/sqlite/cost-migration.ts`) and restore of an older
archive both read every non-blank value through `parseLegacyCostText` in
`cost.ts`, whose accepted shapes are held by `src/lib/data/cost.test.ts`: one
amount with at most one currency mark, thousands grouping that differs from the
decimal mark, a trailing ",-". A bare amount takes the device locale's default
currency. A clean parse becomes the amount and currency. Anything else (words
such as "covered by NFZ", a range, two amounts, an unknown mark) is appended
word for word to the session's `note` on a line of its own. Either way the old
`cost` column is emptied. `updated_at` is left alone: the session did not
change, its storage did.

## Known exposure

A bare number migrated on a device whose locale differs from the currency the
person paid in takes the wrong currency. The amount is right and the currency
is one tap to correct; nothing sums across currencies, so a wrong code never
contaminates another figure.

History: decided 2026-10-21.
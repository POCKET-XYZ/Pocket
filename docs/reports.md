# Results reports

Every contract has a results report: what it achieved against the targets the startup set, each milestone against the day committed to, and every payment as Stellar recorded it. It follows the contract while it runs and is final once the contract is completed, when both parties are emailed a link to it.

## KPIs and targets

A job is measured on up to 10 KPIs. Each one is either:

| Kind    | Fields                                     | In a delivery                        |
| ------- | ------------------------------------------ | ------------------------------------ |
| Floor   | `targetValue`, `direction: more_is_better` | A `number`, or `notMeasurable: true` |
| Ceiling | `targetValue`, `direction: less_is_better` | A `number`, or `notMeasurable: true` |
| Tracked | neither                                    | Free text `value`                    |

`targetValue` and `direction` go together (the database checks it), and a floor of 0 is refused. KPIs posted before targets were numbers keep their free text `target`: they are shown as written and never count as met or missed.

A delivery stores the number as `numericValue` and also as text in `value`, so every screen that shows results as text keeps working. A KPI that cannot be measured yet is stored as "Todavía no se puede medir" with no number.

## How the report reads

| Figure         | Rule                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A KPI's result | The one in the latest delivery the startup approved. A milestone settled by a dispute was not approved, so it does not count.                     |
| Met            | Floor: result at or above the target, with the percent reached. Ceiling: result at or under it, without a percent.                                |
| On time        | The milestone's first delivery came before its committed day ended anywhere on Earth (UTC-12). Not delivered and past that moment is late.        |
| Money          | Released is what left the escrow: milestones paid or resolved. What each side and each fee received comes from the chain, not from a computation. |

The report says plainly that results are reported by the specialist and accepted by the startup when it approves a delivery. Only the payments are proven on chain.

There is no cost per result (for example USDC per lead): dividing the contract's cost by a reported number reads as more certain than it is.

## Payouts from the chain

When a release or a dispute resolution is confirmed, `PayoutsService` reads its transaction from Horizon and stores each USDC transfer out of the escrow in `chain_payouts`, labelled `specialist`, `startup`, `pocket` or `trustless_work` (`other` if an address outside the contract ever appears; Pocket's policies never sign such a payment). It runs in the background and never holds up a payment. A transaction Horizon has not indexed yet, or cannot give right now, is read the next time the report is opened. Each transaction is read once: `chain_operations.payouts_read_at` marks it.

On mainnet the calls do not name Trustless Work's fee address, so the one transfer that is not to a party or to Pocket is its fee.

## Endpoints

| Endpoint                        | Who               | What it does                                                                                   |
| ------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `GET /contracts/:id/report`     | Parties, managers | The report as `ContractReport` (`packages/shared/src/api.ts`).                                 |
| `GET /contracts/:id/report/csv` | Parties, managers | The payments as a CSV for accounting, UTF-8 with a byte order mark so Excel reads the accents. |

The web shows a summary on the contract page and the full report at `/contracts/:id/report`. Its PDF is the browser's print of that page, so the links to each transaction keep working.

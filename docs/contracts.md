# Contracts, milestones and disputes

A contract is what a startup and a specialist agree on once the startup picks an application. It carries the agreed price, split into milestones, and its own escrow. How the money moves is in [escrow.md](escrow.md).

## Hiring

1. The startup picks an application and splits its price into 1 to 5 milestones, each with a title, a description, an amount and a due date. The amounts must add up to the price exactly. The job stops taking applications.
2. The specialist reviews the terms:
   - **Accepts:** Pocket deploys the escrow. The applicants who were on hold are turned down.
   - **Declines:** the contract is cancelled and the job opens again, so the startup can pick another applicant.
3. The startup funds the escrow with the full amount. The contract is active and the specialist can start.

The specialist's wallet must trust USDC before accepting, and the startup's before funding. The API answers `USDC_TRUSTLINE_REQUIRED` or `STELLAR_ACCOUNT_NOT_FOUND` in the `code` field so the client can offer the fix (see [Wallet](#wallet)).

Once there is a contract, each party sees the other's contact email, since they talk outside the platform.

## Milestones

1. The specialist delivers: a link, an optional note and a result for each of the job's KPIs. Every version is kept.
2. The startup approves it or asks for changes, with feedback on that version.
3. Approving takes one signature from the startup. Pocket then releases the milestone to the specialist.

When every milestone is paid, or its dispute resolved, the contract and the job are completed, and both parties are told its [results report](reports.md) is ready.

| Contract state        | Meaning                                          |
| --------------------- | ------------------------------------------------ |
| `awaiting_specialist` | The specialist has not answered the terms yet.   |
| `awaiting_funding`    | The escrow is deployed and waiting for the USDC. |
| `active`              | Funded. Work is under way.                       |
| `completed`           | Every milestone is paid or resolved.             |
| `cancelled`           | The specialist declined the terms.               |

| Milestone state     | Meaning                                                 |
| ------------------- | ------------------------------------------------------- |
| `pending`           | Waiting for a delivery.                                 |
| `delivered`         | Waiting for the startup.                                |
| `changes_requested` | Sent back with feedback. The specialist delivers again. |
| `approved`          | Approved on chain; the release is on its way.           |
| `paid`              | Released to the specialist.                             |
| `disputed`          | Frozen on chain until a manager decides.                |
| `resolved`          | A manager's decision was executed.                      |

There is no automatic release by time: if the startup stops answering, the specialist opens a dispute.

## Disputes

Either party can dispute a milestone that is pending, delivered or sent back for changes. Opening one is signed by that party's wallet and freezes the milestone's funds on chain. Both parties, and managers, can add evidence while it is open.

A manager resolves it with one of three outcomes, and a note both parties see:

| Outcome          | Result                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `pay_specialist` | The whole milestone goes to the specialist.                                         |
| `refund_startup` | The whole milestone goes back to the startup.                                       |
| `split`          | `specialistAmount` to the specialist, the rest to the startup. Each side gets part. |

## Endpoints

Steps that need a signature come in pairs: `prepare` returns `{ operationId, xdr, networkPassphrase }` for the wallet to sign, and the next call takes `{ signedXdr }`.

| Endpoint                               | Who                   | What it does                                                                    |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `POST /contracts`                      | Approved startups     | Hires: `{ applicationId, milestones }`.                                         |
| `GET /contracts/mine`                  | Startups, specialists | The user's contracts.                                                           |
| `GET /contracts/:id`                   | Parties, managers     | Milestones, deliveries, disputes, contacts and confirmed on-chain transactions. |
| `GET /contracts/:id/report`            | Parties, managers     | The [results report](reports.md). `/report/csv` has its payments as a CSV.      |
| `POST /contracts/:id/accept`           | The specialist        | Accepts the terms; deploys the escrow.                                          |
| `POST /contracts/:id/decline`          | The specialist        | Declines the terms.                                                             |
| `POST /contracts/:id/fund/prepare`     | The startup           | Funding transaction to sign.                                                    |
| `POST /contracts/:id/fund/submit`      | The startup           | Broadcasts it and activates the contract once the escrow is funded.             |
| `POST /contracts/:id/fund/sync`        | The startup           | Checks the escrow again, when the deposit took a moment to show.                |
| `POST /milestones/:id/deliveries`      | The specialist        | Delivers: `{ url, note?, results? }`. One result per KPI of the job.            |
| `POST /milestones/:id/request-changes` | The startup           | Sends it back: `{ feedback }`.                                                  |
| `POST /milestones/:id/approve/prepare` | The startup           | Approval transaction to sign.                                                   |
| `POST /milestones/:id/approve/submit`  | The startup           | Broadcasts it; Pocket then pays the milestone.                                  |
| `POST /milestones/:id/release`         | The startup, managers | Retries the payment of an approved milestone.                                   |
| `POST /milestones/:id/dispute/prepare` | Either party          | Dispute transaction to sign.                                                    |
| `POST /milestones/:id/dispute`         | Either party          | Broadcasts it: `{ signedXdr, reason }`.                                         |
| `GET /disputes/:id`                    | Parties, managers     | The dispute with its evidence and the milestone's deliveries.                   |
| `POST /disputes/:id/evidence`          | Parties, managers     | Adds `{ url?, comment }`.                                                       |
| `GET /manager/disputes`                | Managers              | Queue, oldest first. `status` defaults to `open`.                               |
| `POST /manager/disputes/:id/resolve`   | Managers              | `{ outcome, specialistAmount?, note }`.                                         |

## Wallet

| Endpoint                              | What it does                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| `GET /wallet/usdc`                    | `ready`, `no_trustline` or `no_account` for the signed-in wallet. |
| `POST /wallet/usdc-trustline/prepare` | Trustline transaction to sign.                                    |
| `POST /wallet/usdc-trustline/submit`  | Broadcasts it to Horizon.                                         |

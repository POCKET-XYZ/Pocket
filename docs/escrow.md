# Escrow

Every contract gets its own multi-release escrow on Stellar, deployed and operated through [Trustless Work](https://www.trustlesswork.com/). The startup's USDC is locked in it when the work starts, and each milestone is released on its own once the startup approves it.

## Roles

| Escrow role          | Who        | What it can do                                                                  |
| -------------------- | ---------- | ------------------------------------------------------------------------------- |
| `approver`           | Startup    | Approves a milestone, with its own wallet.                                      |
| `serviceProvider`    | Specialist | Can open a dispute on a milestone.                                              |
| Milestone `receiver` | Specialist | Receives each released milestone. Fixed at deploy time.                         |
| `releaseSigner`      | Pocket     | Executes the release once the milestone is approved on chain.                   |
| `disputeResolver`    | Pocket     | Executes a manager's decision, splitting the milestone between the two parties. |
| `platformAddress`    | Pocket     | Receives Pocket's 1% platform fee on every payout.                              |

Receivers are set when the escrow is deployed and cannot change once it holds funds, so Pocket decides _when_ money moves but never _where_: a release can only pay the specialist, and a dispute resolution can only split between the specialist and the startup.

## Non-custodial flow

Whatever needs a user's authority is signed by that user's wallet:

1. The client asks the API to prepare the step (`.../prepare`).
2. The API asks Trustless Work for the unsigned transaction and records its hash, the user and the purpose (`chain_operations`).
3. The wallet signs it and the client sends it back (`.../submit`).
4. The API accepts it only if its hash matches a transaction it prepared for that user and purpose, and only once. Then it broadcasts it.
5. The API reads the escrow back from the chain and only moves the contract forward when the chain shows the step: the balance for funding, and the milestone's `approved`, `released`, `disputed` or `resolved` flag for the rest.

The API never relays a transaction it did not build, so the Trustless Work API key cannot be used through Pocket for anything else.

| Step              | Signed by | On chain                                |
| ----------------- | --------- | --------------------------------------- |
| Enable USDC       | Each user | `changeTrust`, sent straight to Horizon |
| Deploy the escrow | Pocket    | When the specialist accepts the terms   |
| Fund              | Startup   | The full contract amount                |
| Deliver           | Nobody    | Off chain: a link and a note            |
| Approve           | Startup   | One signature per milestone             |
| Release           | Pocket    | Right after the approval shows on chain |
| Open a dispute    | The party | Freezes that milestone                  |
| Resolve a dispute | Pocket    | The manager's split                     |

Delivery stays off chain: the escrow contract does not require the milestone status to change before approval, so the specialist never has to sign anything to deliver.

## Safeguards

- **Each step happens once.** Deploy and fund once per contract; approve, release, dispute and resolve once per milestone. A confirmed operation holds a unique `step_key` (`fund:<contract id>`, `approve:<milestone id>`...), claimed before anything is sent, so a double click or two tabs cannot fund an escrow twice: the second request gets `409` and never reaches the network. A failed operation frees its key, so the step can be retried.
- **Funding is checked first.** Before preparing the funding transaction, the API reads the startup's spendable USDC on Horizon (balance minus what open DEX offers lock) and answers `INSUFFICIENT_USDC` with the missing amount, instead of handing over a transaction that fails after the user signs it.
- **The chain decides whether a milestone can be approved.** The V1 contract lets the approver approve a milestone that is in dispute, but that milestone can then only be settled by the dispute resolution, never released. So the API reads the milestone's flags before preparing an approval and again before sending it: a disputed, released or resolved milestone is refused, and one already approved is synced so its payment can be released.
- **Rate limit.** Trustless Work allows 50 requests per minute per API key. A `429` is retried up to 3 times, waiting what `Retry-After` asks or 1, 2 and 4 seconds, and then reported as a clear `503`.

## Leftover funds

Pocket funds each escrow with exactly the sum of its milestones, and releases and resolutions pay out each milestone in full, so a finished escrow holds nothing. A balance can only be left over if someone deposits into the escrow outside Pocket (anyone can call `fund-escrow`). V1's `withdraw-remaining-funds` can return it: only the dispute resolver (Pocket) can call it, once every milestone is released, resolved or disputed, and it pays the same two fees. Pocket does not expose it yet; if it happens, a manager can run it by hand with the platform key.

## Fees

Two fees come out of every amount the escrow pays out, on releases and on dispute resolutions (each side of a split pays them on its share). Deploying, funding, approving and opening a dispute pay neither, only the network's.

- **Trustless Work: 0.3%**, its protocol fee, on testnet as well ([release phase](https://docs.trustlesswork.com/trustless-work/v2-en/introduction/technology-overview/escrow-lifecycle/release-phase.md)). Measured on testnet with no platform fee: a 1 USDC milestone paid the specialist 0.997 USDC, and a 2 USDC milestone split 1.5 and 0.5 paid 1.4955 and 0.4985.
- **Pocket: 1%**, the escrow's `platformFee`, paid to the platform account (`platformAddress`). It is set at deploy and frozen once the escrow holds funds. The deploy policy and the read-back after the deploy both require exactly Pocket's fee: an escrow with no fee or another fee is refused.

Each fee is computed on the full payout and rounded down to the stroop, so a 1 USDC milestone pays the specialist 0.987 USDC.

The unit of `platformFee` is not confirmed on chain yet. Pocket sends `1` (percent) to Trustless Work's deploy endpoint and requires the escrow to store `100` (basis points); both are named constants in `escrow-policies.ts` (`TW_API_PLATFORM_FEE`, `POCKET_PLATFORM_FEE_ON_CHAIN`). Confirm both with one real testnet deploy read back with `get_escrow` before relying on the fee. A wrong guess fails closed: the platform refuses to sign the deploy and the security log names the fee it found.

The hire, offer, accept, fund and dispute screens show both fees and what the specialist receives after them. The math lives in `@pocket/shared` (`afterFees`, `totalAfterFees`, `POCKET_FEE_PERCENT`), charged on each payout on its own.

## Setup

- `USDC_ISSUER`: the USDC issuer of the network in use. On testnet, `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
- `STELLAR_PLATFORM_SECRET`: Pocket's account. It needs XLM for fees and a USDC trustline, because Pocket's fee is paid to it in USDC and Trustless Work refuses to deploy an escrow whose platform address does not trust the asset. Run `bun run stellar:setup` in `apps/api` once per network. The API raises a `platform_usdc_trustline_missing` alert at boot when the trustline is missing, and the platform monitor checks it again about every ten minutes.
- `TRUSTLESS_WORK_API_URL` and `TRUSTLESS_WORK_API_KEY`.

Trustless Work details that are easy to get wrong, all checked against the live API:

- Milestone indexes go as strings and amounts as numbers.
- `roles`, `trustline` and each distribution are objects, whatever the Swagger schema types say; its examples are right.
- `GET /helper/get-escrow-by-contract-ids` only reads the ids as an array with brackets: `contractIds[]=C...`.
- A multi-release escrow disputes and resolves a single milestone (`dispute-milestone`, `resolve-milestone-dispute`).

# Pollar

[Pollar](https://pollar.xyz) is the onboarding layer Pocket uses so that someone with no crypto experience can be paid on Stellar. It signs the user in with email, Google or GitHub, creates a Stellar account for them, enables the USDC trustline, and covers the network fees. The user never sees a seed phrase, an address or a fee.

It is optional. Without `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` and `POLLAR_SECRET_KEY`, Pocket only offers wallet sign-in and everything else works as before.

## What it changes, and what it does not

| Step                          | Own wallet                        | Pollar wallet                                  |
| ----------------------------- | --------------------------------- | ---------------------------------------------- |
| Signing in                    | Sign a challenge in the extension | Email or social login, no signature            |
| Getting an account on Stellar | The user funds it with XLM        | Pocket asks Pollar to activate it on approval  |
| Trusting USDC                 | A signature and a 0.5 XLM reserve | Set up at login, reserve paid by Pocket's app  |
| Funding, approving, disputing | Signed in the extension           | Signed on Pollar's side, fee paid by Pocket    |
| Holding the money             | The user's wallet                 | The user's wallet                              |

What does not change is the part that matters: the escrow roles are still the users' own addresses, every step is still signed by the address that holds the role, and Pocket never holds anyone's funds or keys. A wallet Pollar created belongs to the user, not to Pocket.

## Signing an escrow step

Trustless Work builds the transaction unsigned, and Pocket records it before anyone signs. From there the signature comes from wherever the wallet lives:

```
API prepares      →  Trustless Work returns an unsigned transaction
                     Pocket stores its hash against the step

wallet signs      →  extension            or   Pollar (POST /tx/sign)
                     signed XDR                signed XDR, wrapped in a fee bump

API broadcasts    →  the signed XDR goes to Trustless Work, which sends it
                     Pocket only accepts a transaction it prepared, once
```

Pollar returns the signature wrapped in a **fee bump** when the app sponsors the operation, so its own account pays the network fee. A fee bump has a different hash than the transaction inside it, so `StellarService.hashOf` reads the inner transaction: the step is identified by what Pocket prepared, not by who paid for it.

For this to work, the Pollar dashboard needs **Treasury → Sponsorship → Sponsor all contracts** turned on. Every escrow is a contract deployed for that engagement, so a per-contract rule cannot be written ahead of time.

## Deferred activation

A Stellar account costs XLM: a base reserve plus 0.5 XLM per trustline, paid by the app's funding wallet. Pocket does not pay that for every visitor who logs in. `PollarWalletsService.activate` asks Pollar to fund the wallet when a manager approves the account, which is the moment the account becomes real to Pocket.

The call is idempotent: a wallet that is already funded answers `409`, which counts as success. A failure never blocks the approval, and the next approval or login tries again.

## Configuration

| Where | Setting                                                    | Why                                                                |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| API   | `POLLAR_SECRET_KEY`                                        | Checks sessions and activates wallets. Never leaves the server.    |
| Web   | `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`                       | Opens the login modal and signs. Safe in the browser.              |
| Dashboard | Build → Domains                                        | The app's origin, or the SDK is refused with `ORIGIN_NOT_ALLOWED`. |
| Dashboard | Treasury → Tokens & Trustlines: USDC                   | The trustline every new wallet is born with.                       |
| Dashboard | Treasury → Sponsorship: contracts, trustlines, USDC    | Who pays the network fees.                                         |
| Dashboard | Treasury → Account Funding                             | The XLM that pays for new wallets.                                 |

Keys are network specific (`pub_testnet_` / `sec_testnet_`), and a session from the wrong network is refused at sign-in.

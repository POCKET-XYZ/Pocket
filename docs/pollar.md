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
                     signed XDR                signed XDR

API broadcasts    →  the signed XDR goes to Trustless Work, which sends it
                     Pocket only accepts a transaction it prepared, once

API confirms      →  the escrow is read back from the chain; a step with no
                     trace there is released so it can be tried again
```

**Sponsorship is turned down on purpose.** Pollar's `signTx` takes `skipSponsorship`, and Pocket passes it. Left on, Pollar answers with the signed transaction wrapped in a **fee bump** paid by the app's gas wallet, and Trustless Work refuses a fee bump on `/helper/send-transaction`: the same dispute sent both ways answers `400 Bad request` wrapped and `201 SUCCESS` plain. The wallet pays its own fee instead, around 0.0014 XLM for a dispute, out of the XLM Pollar gives every new wallet.

`StellarService.hashOf` still reads through a fee bump to the transaction inside it. Nothing sends one today, but a wallet that sponsors would break the check that a signed transaction is the one Pocket prepared, and the step is identified by what was prepared rather than by who paid for it.

A last point that is not specific to Pollar: `send-transaction` answers as soon as the network takes the transaction, which is not the same as the operation having happened. Every step is confirmed by reading the escrow back, and one the chain does not show is released rather than left claimed.

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
| Dashboard | Treasury → Sponsorship: trustlines and USDC transfers  | Who pays those network fees.                                       |
| Dashboard | Treasury → Account Funding: a starting XLM balance     | What each wallet pays its own escrow fees with. 1 XLM is plenty.   |

Keys are network specific (`pub_testnet_` / `sec_testnet_`), and a session from the wrong network is refused at sign-in.

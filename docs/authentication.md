# Authentication

A Stellar address is the account. There are two ways to prove it is yours, and both end in the same Pocket token:

| Door                                     | Who it is for                                    | How it proves the address                      |
| ---------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| A wallet you hold (`POST /auth/login`)   | Anyone with Freighter, xBull, Lobstr, Albedo...  | Signing a challenge with the wallet's key      |
| [Pollar](./pollar.md) (`POST /auth/pollar`) | Anyone with an email or a Google account      | A Pollar session, checked against Pollar's API |

## Flow with your own wallet

```
Web client                         Pocket API                        Wallet (SWK)
    │  POST /auth/challenge             │                                  │
    │  { stellarAddress }               │                                  │
    │ ────────────────────────────────▶ │ store nonce (5 min TTL)          │
    │ ◀──────────────────────────────── │ { xdr, networkPassphrase }       │
    │                                   │                                  │
    │  signTransaction(xdr) ─────────────────────────────────────────────▶ │
    │ ◀───────────────────────────────────────────────────── signed xdr ── │
    │                                   │                                  │
    │  POST /auth/login                 │                                  │
    │  { stellarAddress, signedXdr,     │ verify nonce + signature         │
    │    role? }                        │ create user on first login       │
    │ ────────────────────────────────▶ │ delete challenge                 │
    │ ◀──────────────────────────────── │ { accessToken, user, isNewUser } │
```

## The challenge

The challenge is a Stellar transaction built in the style of [SEP-10](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md):

- Source account: the address signing in.
- One `manageData` operation named `Pocket auth` whose value is a random one-time nonce.
- Fee `0` and a 5 minute time bound.

It is never submitted to the network. The zero fee makes wallets show "0 XLM", and the network would reject it anyway. Signing it only proves control of the secret key behind the address.

The API accepts the signed transaction only if it is the exact challenge issued to that address: same source, a single `manageData` operation with the stored nonce, not expired, and signed by the address's key. Requesting a new challenge replaces the previous one.

## Sign-up

The first login creates the account, so it must include `role`: `startup` or `specialist`. Without it the API answers `400` with `code: "ROLE_REQUIRED"` and keeps the challenge, so the client can ask the user for a role and resend the same signed transaction without a second wallet prompt.

Managers cannot sign up. They are created by the seed script from `MANAGER_STELLAR_ADDRESSES`.

## Replay protection

The challenge is deleted as soon as a login succeeds, so a captured signed transaction cannot be used again. Challenges live in the `auth_challenges` table, which keeps them valid across restarts and multiple API instances.

## Flow with Pollar

Pollar signs the user in with email, Google or GitHub, creates a Stellar wallet for them and holds its key. There is no challenge to sign: the browser sends the session Pollar gave it and the API checks it before trusting the address.

```
Web client                         Pocket API                       Pollar server API
    │  login (Pollar's own modal)       │                                  │
    │  session: { accessToken, wallet } │                                  │
    │                                   │                                  │
    │  POST /auth/pollar                │  POST /v1/tokens/verify          │
    │  { accessToken, role? }           │  x-pollar-api-key: sec_...       │
    │ ────────────────────────────────▶ │ ───────────────────────────────▶ │
    │                                   │ ◀─────────────────────────────── │
    │                                   │ { userId, wallet, profile }      │
    │                                   │ create user on first login       │
    │ ◀──────────────────────────────── │ { accessToken, user, isNewUser } │
```

The token is never trusted as it arrives. Pocket checks it with its Pollar **secret** key, which also proves the session belongs to this Pollar app, and only then reads the wallet address from the answer. A session from another Stellar network is refused, and so is a passkey smart account: an escrow role has to be a classic Stellar account.

Sign-up works the same as with a wallet: the first login needs a `role` and answers `ROLE_REQUIRED` without one.

## Which wallet signs

`User.walletCustody` records how the address is held:

| Value      | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `external` | A wallet the user holds. It signs escrow steps in its own extension.           |
| `pollar`   | A wallet reached through Pollar. It signs escrow steps on Pollar's side.       |

The web client reads it to know which signer to ask, and the escrow flow is otherwise identical: the address that holds the role is always the one that signs.

## Access tokens

A successful login returns a JWT (default lifetime 7 days, `JWT_EXPIRES_IN`) with these claims:

| Claim            | Meaning                              |
| ---------------- | ------------------------------------ |
| `sub`            | User id                              |
| `role`           | `startup`, `specialist` or `manager` |
| `stellarAddress` | The wallet address                   |

Send it as `Authorization: Bearer <token>`. A global guard rejects requests without a valid token, except on routes marked `@Public()` (`/health`, `/auth/*`).

A new account starts with verification status `not_submitted`. Verification by a manager is required before a user can operate on the marketplace.

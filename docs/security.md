# Security

How Pocket protects accounts and money, what it watches, and what to do when something goes wrong. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What is worth attacking

| Asset | Why it matters |
| ----- | -------------- |
| The platform key (`STELLAR_PLATFORM_SECRET`) | Deployer, release signer and dispute resolver of every escrow |
| `JWT_SECRET` | Whoever has it can sign in as anyone, manager included |
| The Trustless Work API key | Builds every escrow transaction |
| `POLLAR_SECRET_KEY` | Verifies Pollar sessions and funds Pollar wallets |
| The database | Accounts, contracts and the record of every chain operation |

Users' funds never touch Pocket: every deposit, approval and dispute is signed by the user's own wallet.

## Controls

### Signing

- **The platform key never signs blindly.** Every transaction Trustless Work builds for it is decoded and compared with what Pocket asked for (`platform-tx-policy.ts`, `escrow-policies.ts`): one `invokeHostFunction` on the expected contract and function, the exact roles, receivers and amounts of the deploy, the exact milestone of a release, and exactly the two parties and amounts of a dispute resolution. Fee bumps, other sources, extra operations, high fees and authorizations that reach other contracts are refused.
- `TRUSTLESS_WORK_DEPLOYER_CONTRACT_ID` and `TRUSTLESS_WORK_FEE_ADDRESS` are what those checks compare against. For a new network, read them from a real deploy and a real release on that network, not from Trustless Work's answer at signing time.
- **The escrow's code is pinned.** A deploy must install `TRUSTLESS_WORK_ESCROW_WASM_HASH`. Pocket derives the escrow's address itself from the deployer and the salt it signed, never from Trustless Work's answer, then reads the new escrow back from the chain (code, roles, receivers, amounts, asset) before using it.
- Platform transactions must expire within 15 minutes, so one that never lands cannot land later on top of a retry.
- **The browser checks what the user signs** (`apps/web/lib/tx-check.ts`): the user's own account, the expected network, a single operation, and either the USDC trustline or the expected call (`fund_escrow`, `approve_milestone`, `dispute_milestone`) on this contract's escrow. A deposit must pay exactly the agreed amount, from the user, into this escrow. The login challenge must be a single `Pocket auth` data entry with a sequence number no account can use, so it can never be submitted.

### What counts as done

- Funded, approved, released, disputed and resolved are read from the chain through a Soroban RPC node (`SOROBAN_RPC_URL`): the escrow's own `get_escrow` and the USDC contract's `balance`. Trustless Work's answers are never the proof.
- Every transaction sent through Trustless Work is confirmed by hash. A failed one frees its step at once; one that has not landed keeps its step until it can no longer land (15 minutes), and is freed then.
- Hiring, accepting, declining, closing, withdrawing, asking for changes and resolving disputes are claimed atomically: two requests at once cannot both win. A dispute decision is recorded before it is sent, so the record always matches what the escrow paid.

### Accounts and privacy

- Wallet sign-in signs a one-time challenge, kept per nonce and consumed atomically: a replay loses the race and gets nothing.
- Pollar can only sign into accounts Pollar created. An account that proved its wallet with a signature is never reachable through Pollar.
- Tokens are HS256 with issuer and audience, last 12 hours, and carry a session version: signing out ends every session on every device. The role is read from the database on every request, not from the token.
- The API refuses to start with a `JWT_SECRET` under 32 characters.
- Sign-out also ends the Pollar session and forgets the wallet picked in the kit.
- Contact emails are shared only once the specialist accepts the terms. Public profiles show a shortened wallet, not the full address.

### Abuse

- 120 requests per minute per caller overall, 20 per minute on sign-in routes and 12 per minute on escrow steps. Signed-in callers are counted by account, the rest by IP (`TRUST_PROXY_HOPS` must match the proxies in front of the API).
- Pocket spends at most 40 of Trustless Work's 50 requests per minute, so one caller cannot exhaust the key for everyone.

### Input and output

- Every DTO is whitelisted; unknown fields are refused. Text, lists, rates, search and paging are bounded.
- Links from users must be `https://` (`@IsHttpsUrl()`), and the web checks again, shows the domain, and never opens anything else.
- Errors from Trustless Work reach users as fixed sentences; the provider's text stays in the log.

### Web

- A Content Security Policy blocks scripts from other origins, plugins, `<base>` rewrites and posting forms away. `frame-ancestors 'none'` and `X-Frame-Options: DENY` stop Pocket from being framed to trick a click on *Approve*. A stricter policy runs in report-only mode to tighten `connect-src` later.
- HSTS, `nosniff`, a strict referrer policy and a permissions policy on every page.
- The Next.js image optimizer is off, on a patched Next.js (16.3.7).

### Dependencies

- CI fails on any high or critical advisory (`bun audit --audit-level=high`), scans the whole history for secrets (gitleaks) and runs every Monday even without commits. Dependabot opens weekly updates.
- What `bun audit` still lists is below that bar and not reachable from Pocket: `uuid`, `stream-json` and `elliptic` come with the Solana and NEAR wallets inside Stellar Wallets Kit, and `js-yaml` with build tools.

### Database

- Row Level Security on every table, with a deny-all policy for Supabase's `anon` and `authenticated` roles, and no grants to them. Only the API, through its own connection, reads or writes.
- Connections require TLS (`sslmode=require`).
- Verification reviews and submissions are claimed atomically, like escrow steps.

## Monitoring

Security events are written as one JSON line each under the `Security` logger. They carry ids, addresses, hashes and routes, never tokens or signed transactions.

| Event | When |
| ----- | ---- |
| `login`, `logout` | A session starts or ends |
| `denied`, `rate_limited` | Any 401, 403 or 429 |
| `platform_signed` | The platform key signed a transaction |
| `platform_refused` | **Alert.** Trustless Work returned a transaction the policy refused |
| `manager_decision` | A manager approved or rejected a verification |
| `unrecorded_platform_operation` | **Alert.** The platform account sent a transaction Pocket did not record |
| `platform_balance_low` | **Alert.** Less than `PLATFORM_MIN_XLM` (20 by default) left for fees |
| `platform_usdc_trustline_missing` | **Alert.** The platform account cannot receive USDC, so no escrow can be deployed and Pocket's fee cannot be paid. Run `bun run stellar:setup` |

The platform monitor polls Horizon every 30 seconds. Every transaction the platform key sends through Pocket is recorded in `chain_operations` before it is sent, so any other one means the key was used somewhere else.

Alerts also go to `SECURITY_ALERT_WEBHOOK_URL` when it is set (a Slack or Discord incoming webhook). Set it in production. `PLATFORM_MONITOR=off` turns the monitor off, for example on a second instance.

## Incident plan

Act first, investigate after. Write down what you did and when.

### The platform key leaked, or `unrecorded_platform_operation` fired

1. Stop the API so it signs nothing else.
2. With the offline key, set the leaked key's weight to 0 (`setOptions` with `masterWeight: 0`, signed only by the offline key). Until that key exists: move the account's XLM to a safe account and set up a new platform account.
3. Look at every open escrow. Releases and dispute resolutions need the platform key, so money in escrow cannot move without it; check the account's history on Horizon for anything it signed.
4. Generate a new key, add it as signer, update `STELLAR_PLATFORM_SECRET` and restart.
5. Tell affected users what happened and what they need to do, if anything.

### `platform_refused` fired

Trustless Work returned a transaction other than what Pocket asked for. Nothing was signed. Check Trustless Work's status and changelog: a new contract version changes the shape of the calls and needs the policies updated. If nothing explains it, rotate the Trustless Work API key and contact them.

### `JWT_SECRET` leaked

Set a new random value (`openssl rand -base64 48`) and restart. Every session ends at once and users sign in again.

### Trustless Work API key leaked

Revoke it in the Trustless Work dashboard, create a new one, update `TRUSTLESS_WORK_API_KEY` and restart. The key cannot move funds by itself: every transaction it builds is still checked before the platform signs it.

### Pollar secret key leaked

Rotate it in the Pollar dashboard (Build, API Keys), update `POLLAR_SECRET_KEY` and restart.

### Database credentials leaked

Reset the database password in Supabase, update `DATABASE_URL` and `DIRECT_URL` and restart. Review recent changes to `users.role` and `verification_requests`.

## Hardening still open

- **A second, offline key for the platform account**, so a leaked hot key can be removed without losing the account. `bun run stellar:cosigner` (in `apps/api`) adds it: generate the key offline, pass only its public key as `OFFLINE_SIGNER`, check the dry run, then add `--apply`. The server key keeps weight 1 and signs every escrow step; changing signers needs weight 2, which only the offline key has. Tested on a throwaway testnet account; run one release on testnet after applying it to the real account.
- **Error tracking** (Sentry or similar), filtering `authorization` headers and `signedXdr` bodies.
- **The session token lives in `localStorage`.** CSP blocks outside scripts and tokens last 12 hours and can be revoked, but an `HttpOnly` cookie (with CSRF protection) would keep it out of reach of any script. It needs the web and the API on the same site.
- **The browser trusts the escrow address the API gives it.** Checking the escrow's code from the browser too, through its own RPC call, would protect deposits even against a compromised API.
- **An external audit** of the escrow flow, the platform key and both sign-in doors.

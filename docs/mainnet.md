# Mainnet

How Pocket goes from testnet to Stellar mainnet, with real USDC. Testnet and mainnet are the only two environments, each with its own database, Pollar app, Trustless Work API and platform account. Nothing is shared between them.

## What is different on mainnet

| | Testnet | Mainnet |
| --- | --- | --- |
| Trustless Work API | `https://dev.api.trustlesswork.com` | `https://api.trustlesswork.com` |
| Deployer contract | `CAZZOSFFNQQSDOLPPGN5BDITMNSLZITXW4S7V5ISM5EAB2THBD7F2AHR` | `CB2HSK3BTB5LCNDZNBMHELPI3DLS724GKFVFQQOXZBOYU2CIPAR5QDMD` |
| Escrow code (wasm hash) | `5618791548edfc44074e4b79e5d1b29f5712ff98eead12d22fb4d7f04d4edbf2` | `2ddb5ef1f8f029ea93313ed7a6886f763eda7287d8a08bacc0a427ab0aa1dc1f` |
| Trustless Work fee address | Named in every release and resolution | Written into the contract: leave `TRUSTLESS_WORK_FEE_ADDRESS` empty |
| USDC issuer (Circle) | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Soroban RPC | SDF's public node, by default | Required. `https://soroban-rpc.mainnet.stellar.gateway.fm` works without an account |
| XLM | Free from friendbot | Bought; every account and trustline locks a reserve |
| Trustless Work fee | None | 0.3% of every payout, on top of Pocket's 1% |

The mainnet values were read from the network: the deployer and code from a deploy Trustless Work's mainnet API built, and the release and resolution arguments from the spec of that code. `bun run stellar:preflight` reads them again.

## Money the platform needs

- **Platform account** (`STELLAR_PLATFORM_SECRET`): 1 XLM opens it, 0.5 XLM holds the USDC trustline the 1% fee arrives in, and the rest pays the fees of deploys, releases and resolutions, a few hundredths of an XLM each. 10 XLM is a comfortable start. `PLATFORM_MIN_XLM` raises an alert below the amount you set.
- **Pollar funding wallet** (Pollar dashboard, Account Funding): for each approved user, 1 XLM for the account, 0.5 XLM for the USDC trustline, and the starting balance the wallet pays its own escrow fees with. About 2.5 XLM per user. Top it up as users arrive.
- **Pocket's 1% collects in the platform account.** Move it out periodically to the wallet that keeps it; it is not swept automatically.

## Before the first hire

1. **Supabase.** A separate project, on a paid plan. Run the migrations and the seed against it (`db:deploy`, `db:seed`); `MANAGER_STELLAR_ADDRESSES` decides the managers.
2. **Platform account.** Generate a new key for mainnet, fund it with XLM, then `bun run stellar:setup` adds the USDC trustline. Keep an offline copy of the secret.
3. **Pollar.** A new app on mainnet:
   - API keys: `pub_mainnet_` for the web, `sec_mainnet_` for the API.
   - Allowed domains: the mainnet web origin.
   - Tokens & Trustlines: USDC with Circle's mainnet issuer, enabled.
   - Account Funding: **Deferred** (Pocket activates a wallet when a manager approves it; Immediate would pay for every visitor), a starting XLM balance of 1, and XLM in the funding wallet.
4. **API environment** (Railway). Everything in `apps/api/.env.example`, with the mainnet values above, and also:
   - `STELLAR_NETWORK=mainnet`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`
   - `API_PUBLIC_URL` and `CORS_ORIGINS` for the mainnet URLs
   - a new `JWT_SECRET`, never testnet's
   - `SECURITY_ALERT_WEBHOOK_URL` and `SENTRY_DSN`, with `SENTRY_ENVIRONMENT=mainnet`
5. **Web environment** (Vercel). `NEXT_PUBLIC_STELLAR_NETWORK=mainnet`, `NEXT_PUBLIC_API_URL`, the `pub_mainnet_` Pollar key, and Sentry with `NEXT_PUBLIC_SENTRY_ENVIRONMENT=mainnet`.
6. **Preflight.** With the API's mainnet environment:

   ```
   cd apps/api
   bun --env-file=.env.mainnet scripts/preflight.ts
   ```

   It checks the platform account, the escrow code, the arguments the policies expect, and a deploy Trustless Work builds right now, without signing anything. Every line must say `ok`.
7. **A real hire with small amounts.** Two test accounts signed in through Pollar, a 1 USDC job in two milestones: release the first, dispute the second and split it. Check on [stellar.expert](https://stellar.expert/explorer/public) that each party received its share net of fees and that the platform account received the 1%.

## Accounts carried over from testnet

Pollar gives each person a new wallet on mainnet, so testnet accounts cannot follow their address. Approved accounts chosen to carry over are copied into `migrated_accounts` in the mainnet database, by email, with their verification, profile, CV and logo. The first time that email signs in through Pollar on mainnet, the account is created already approved on the new wallet, and the wallet is activated. Each row is claimed once. Jobs, applications and contracts stay on testnet.

## If a deploy costs too much

Contracts on Stellar pay rent to stay live. When nobody pays it, the network archives them, and the next transaction that uses one pays to restore it. If Trustless Work's escrow code or deployer is archived, every deploy asks for that restore, about 33 XLM. The platform key refuses any step over 2 XLM, so the hire waits, the user is told the step is paused, and `platform_refused` fires with the fee. The preflight shows the same thing. Ask Trustless Work to restore and extend their escrow code and deployer. Pocket does not pay it.

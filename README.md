# Pocket

**The on-chain marketplace that connects startups with growth, sales and marketing specialists, with every payment protected by escrow on Stellar.**

Startups post work and lock the budget in an escrow. Specialists deliver. Funds are released only when the deliverable is accepted, so the startup never pays for nothing and the specialist never works for free. Every user is reviewed by Pocket's team before they can operate, and every profile follows the same template so the marketplace stays easy to compare and looks premium.

## How it works

1. **Sign in with your Stellar wallet.** Freighter, xBull, Lobstr, Albedo and other wallets are supported through Stellar Wallets Kit. No passwords.
2. **Get verified.** A Pocket manager reviews every startup and specialist before they can use the marketplace.
3. **Fill in your profile.** Startups and specialists complete a fixed template, so every profile looks consistent.
4. **Hire.** A startup picks a specialist and the agreed amount is locked in a USDC escrow on Stellar through [Trustless Work](https://www.trustlesswork.com/).
5. **Deliver and get paid.** The specialist submits the deliverable, the startup approves it with their wallet and the escrow releases the funds. Disagreements are settled by a Pocket manager.

Pocket never holds user funds: each party signs their own escrow operations with their own wallet.

## Roles

| Role           | What they do                                                                            |
| -------------- | --------------------------------------------------------------------------------------- |
| **Startup**    | Posts work, funds the escrow and approves deliverables.                                 |
| **Specialist** | Offers growth, sales or marketing services, delivers the work and receives the payment. |
| **Manager**    | Pocket's internal team. Verifies users and resolves disputes.                           |

## Tech stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Web      | Next.js + Stellar Wallets Kit       |
| API      | NestJS + Prisma                     |
| Database | PostgreSQL on Supabase              |
| Escrow   | Trustless Work on Stellar (Soroban) |
| Payments | USDC                                |
| Tooling  | Bun workspaces + Turborepo          |

## Repository structure

```
Pocket/
├── apps/
│   ├── api/            NestJS REST API
│   └── web/            Next.js web app
├── packages/
│   └── shared/         Enums and API contracts shared by the API and the web client
└── docs/               Engineering documentation
```

## Getting started

Requirements: [Bun](https://bun.sh) 1.3+, Node.js 22+ and a Supabase project.

```bash
bun install

# API environment: fill in the Supabase connection strings and a JWT secret
cp apps/api/.env.example apps/api/.env

# Database
cd apps/api
bunx prisma migrate deploy
bun run db:seed          # managers = MANAGER_STELLAR_ADDRESSES (others are demoted)
bun run stellar:setup    # one time per network: the platform account trusts USDC

# Run the API on http://localhost:3000/api (Swagger UI at /api/docs)
bun run dev

# In another terminal: the web app on http://localhost:3001
cd ../web
cp .env.example .env.local
bun run dev
```

Run the tests with `bun run test` and the linter with `bun run lint`.

## Status

Early MVP, running on Stellar testnet.

- [x] Wallet sign-in (SEP-10 style challenge) with startup and specialist roles
- [x] Manual verification reviewed by managers
- [x] Standardized startup and specialist profiles, with a public specialist directory
- [x] Jobs and applications: startups post, specialists apply
- [x] Contracts and milestones
- [x] Escrow with Trustless Work: fund, deliver, approve, release, verified on testnet
- [x] Disputes resolved by managers
- [x] Web client: every screen of the MVP, for startups, specialists and managers

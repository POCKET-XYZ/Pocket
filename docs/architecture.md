# Architecture

Pocket is a marketplace web application with an integration layer to Trustless Work for everything that moves money. It does not run its own blockchain: escrow logic lives in audited Soroban contracts operated by Trustless Work, and Pocket orchestrates them.

## Guiding principle

Build the marketplace and its rules; buy everything else. Identity checks start as a manual review by managers, wallets belong to the users whether they brought one or Pollar created it, and escrow is provided as a service.

## Components

```
┌──────────────┐    REST + JWT    ┌──────────────┐    Prisma    ┌──────────────┐
│  Web client  │ ◀──────────────▶ │   Pocket API │ ───────────▶ │   Postgres   │
│  (Next.js)   │  unsigned XDR out│   (NestJS)   │              │  (Supabase)  │
└──────┬───────┘  signed XDR back └──────┬───────┘              └──────────────┘
       │ signs XDR                       │ REST (API key)
       ▼                                 ▼
┌──────────────┐                   ┌──────────────┐   Soroban   ┌──────────────┐
│ User wallet  │                   │Trustless Work│ ──────────▶ │   Stellar    │
│ SWK or Pollar│                   │     API      │             │   network    │
└──────────────┘                   └──────────────┘             └──────────────┘
```

| Component          | Responsibility                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Web client**     | Marketplace UI, profiles, hiring flow, manager panel, and the two sign-in doors: Stellar Wallets Kit and Pollar.                |
| **Pocket API**     | Users, roles, verification, profiles, hiring state and escrow orchestration. Source of truth for off-chain state.               |
| **Postgres**       | Relational state. On-chain references (escrow contract ids, transaction hashes) are stored next to the entities they belong to. |
| **Trustless Work** | Deploys and operates the escrow contracts. Write endpoints return unsigned XDR.                                                 |
| **User wallet**    | Signs every operation that belongs to its owner: sign-in, USDC trustline, funding, approvals and disputes. Either an extension the user installed or a wallet held through [Pollar](pollar.md). |

## Non-custodial by design

Pocket never holds user funds or keys. When an operation needs a user's authority (for example, funding an escrow), the API asks Trustless Work for the unsigned transaction, the web client has the user's own wallet sign it, and the client sends the signed XDR back to the API, which broadcasts it. The Trustless Work API key stays on the server.

The API only broadcasts a signed transaction whose hash matches one it prepared for that same user and purpose, and only once. Each step then counts only after the escrow, read back from the chain, shows it happened. Pocket's own Stellar account fills the platform roles of the escrow: platform address, release signer and dispute resolver. See [escrow.md](escrow.md).

## API layout

```
apps/api/src/
├── common/        Guards, decorators and shared types
├── config/        Typed configuration and env validation
├── prisma/        Prisma client as a global Nest module
└── modules/
    ├── auth/          Wallet challenge, Pollar sessions and JWT sign-in
    ├── pollar/        Pollar sessions and wallet activation
    ├── users/         The signed-in user
    ├── verification/  Manual KYC/KYB submissions
    ├── manager/       Verification queue for managers
    ├── profiles/      Standardized profiles and the specialist directory
    ├── jobs/          Jobs and applications
    ├── contracts/     Contracts, milestones, deliveries, disputes and the escrow flow
    └── stellar/       Horizon, Trustless Work client, on-chain operations and wallet setup
```

Every route requires a bearer token unless it is marked `@Public()`. Routes can be restricted to roles with `@Roles()`, and to accounts a manager approved with `@Verified()`.

## Shared contracts

`packages/shared` holds the enums and request/response types used by both the API and the web client, so the two sides cannot drift apart. Enum values are stored as-is in the database and must never be renamed.

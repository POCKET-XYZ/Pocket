# Security policy

Pocket moves real money through escrows on Stellar, so we take reports seriously and answer fast.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:

**[Report a vulnerability](https://github.com/diegoveme/Pocket/security/advisories/new)**

Include what you found, how to reproduce it and what an attacker could do with it. A proof of concept against testnet is welcome; please do not test against mainnet funds or other users' accounts.

What to expect:

| When           | What                                                      |
| -------------- | --------------------------------------------------------- |
| 2 working days | We confirm we received the report                         |
| 7 days         | We tell you whether we can reproduce it and how severe it is |
| 30 days        | Target for a fix of a high or critical issue              |

We will credit you in the advisory unless you prefer otherwise.

## Scope

In scope: the API (`apps/api`), the web app (`apps/web`), the shared package, and how Pocket uses Trustless Work, Pollar and the platform's Stellar account.

Out of scope: the Trustless Work contracts and API, Pollar, wallets and Stellar itself. Report those to their owners; we are happy to help coordinate.

## How Pocket is protected

See [docs/security.md](./docs/security.md) for the controls in place, the monitoring, and what we do when something goes wrong.

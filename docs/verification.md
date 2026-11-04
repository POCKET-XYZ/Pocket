# Verification

Nobody operates on Pocket before their account is active. Activating it takes two steps: the account details, and an identity check through [Didit](https://didit.me)'s hosted flow (official ID, selfie with liveness, face match, sanctions lists). Nobody reviews accounts by hand at Pocket: Didit decides, and Didit's own console holds the cases it sends to a person.

The identity check is on when `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` and `DIDIT_WEBHOOK_SECRET` are all set (the API refuses to start with only some of them). Without them, sending the details approves the account on the spot, which is what local runs and tests use.

## States

A user carries one verification status, shown in `GET /users/me`.

| Status          | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `not_submitted` | The account exists but its details were never completed.                                            |
| `pending`       | Details sent, identity check not passed yet: not started, in progress, or held for a review in Didit. |
| `approved`      | Can fill in a profile and operate on the marketplace.                                                |
| `rejected`      | Didit declined the check, or found the same ID or face on another live account. Can try again.       |

## Flow

```
Startup / Specialist
        │ POST /verification          details: not_submitted (or rejected) → pending
        │ POST /verification/kyc      { consent: true } → Didit's link (records the consent)
        │
        ├──▶ Didit's page: ID, selfie, liveness
        │        │
        │        └─▶ webhook  POST /verification/kyc/webhook  (status.updated)
        │ back on /verification?verificationSessionId=…
        │ POST /verification/kyc/refresh   reads the result without waiting for the webhook
        │
        │ Approved  → approved: "account ready" email, Pollar wallet activated (see pollar.md)
        │ Declined  → rejected, with a note; the person fixes the details and tries again
        │ In Review → stays pending; the team is alerted to decide in Didit's console
```

The webhook is only trusted to be authentic (Didit's `X-Signature-V2` over the canonical payload, the raw-body signature as a fallback, five minutes of tolerance on the timestamp) and only its session id is used: the outcome is always read back from Didit's API, and the session must be the one Pocket opened for that very user (`vendor_data` is the user id). A webhook and a refresh arriving together decide the request once.

### One person, one account

Didit matches IDs and faces across sessions. An approval whose ID or face also appears on another live Pocket account, or on Didit's blocklist, is turned down with a note that says why. Matches against deleted accounts, or against sessions that are not Pocket users, do not count.

### Consent

Biometric data is sensitive data. Before the first session the person ticks an express consent, apart from the Terms and the sign-up consent, and `POST /verification/kyc` refuses to open a session without `consent: true`. The time is stored on the request (`kycConsentAt`).

### What Pocket keeps

Only the session id, Didit's status, the reason for a decline or a review, and the consent time. No ID data, photos or biometrics: those stay with Didit, for the retention period set in Didit's console.

## Accounts from before the identity check

`scripts/require-kyc.ts` moves every approved startup and specialist without a Didit approval back to `pending`, with a new request that copies their details, so they only have to verify. Accounts with money in a contract are left alone and listed; run it again once those contracts end. Run it per environment, after that environment's Didit keys are set:

```
bun --env-file=.env scripts/require-kyc.ts           # who would change
bun --env-file=.env scripts/require-kyc.ts --apply   # change them
```

Accounts carried over from testnet (see `MigratedAccountsService`) arrive `pending` with their profile, and their wallet is activated once Didit approves.

## What the user submits

Links, not file uploads.

| Field                   | Who                                                  | Required                 |
| ----------------------- | ---------------------------------------------------- | ------------------------ |
| `fullName`              | Everyone                                             | Yes                      |
| `contactEmail`          | Everyone                                             | Yes                      |
| `country`               | Everyone                                             | Yes (ISO 3166-1 alpha-2) |
| `linkedinUrl`           | Everyone                                             | No                       |
| `websiteUrl`            | Company site for startups, portfolio for specialists | No                       |
| `companyName`           | Startups                                             | Yes for startups         |
| `companyRegistrationId` | Startups                                             | No                       |
| `note`                  | Everyone                                             | No                       |

Every submission is stored as its own row. Rows from the manual review era keep the manager who decided them and their note.

## Rules

- An approved user cannot submit again; with the check on, neither can a pending one.
- Two submissions sent at once are taken once: the second is refused.
- Managers never go through verification: their accounts are created already approved.
- Each identity-check call reaches Didit, so `POST /verification/kyc` and `/kyc/refresh` share a limit of 10 a minute.

## Setting up Didit

1. Console → Workflows: a KYC workflow with ID verification, liveness, face match and AML screening, published. Its id is `DIDIT_WORKFLOW_ID`.
2. Console → API Keys: `DIDIT_API_KEY`.
3. Console → Webhooks: destination `https://<api>/api/verification/kyc/webhook`, event `status.updated`. The secret shown once is `DIDIT_WEBHOOK_SECRET`.
4. Set a data retention period, as the Privacy Policy says Didit deletes the images after it.
5. `WEB_PUBLIC_URL` must be the web app: Didit sends people back to `/verification` there.

Use a separate Didit application for testnet and for mainnet.

## Effect on the rest of the API

Routes marked `@Verified()` are refused until the account is approved, with a message pointing to the verification page. Filling in a profile is one of those routes, and the public directory and public profiles hide anyone who is not approved.

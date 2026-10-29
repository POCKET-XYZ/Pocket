# Verification

Nobody operates on Pocket before completing their account details. Nobody reviews them by hand: sending the details approves the account on the spot. There is no identity check yet.

## States

A user carries one verification status, shown in `GET /users/me`.

| Status          | Meaning                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `not_submitted` | The account exists but its details were never completed.                                                      |
| `approved`      | Can fill in a profile and operate on the marketplace.                                                         |
| `rejected`      | Turned down during the manual review era, or a manager removed from the team. Can complete the details again. |
| `pending`       | Unused for now. Accounts that were waiting for a manager were approved when manual review ended.              |

## Flow

```
Startup / Specialist
        │ POST /verification
        │ status: not_submitted (or rejected)
        │      → approved
        │
        │ ◀── "account ready" email to the contact address
        │ ◀── Pollar wallet activated (see pollar.md)
```

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

Every submission is stored as its own row, approved with `reviewedAt` set and no reviewer. Rows from the manual review era keep the manager who decided them and their note.

## Rules

- An approved user cannot submit again.
- Two submissions sent at once approve the account once: the second is refused.
- Managers never go through verification: their accounts are created already approved by the seed script.

## Effect on the rest of the API

Routes marked `@Verified()` are refused until the account is approved, with a message pointing to the account details. Filling in a profile is one of those routes, so the marketplace only ever shows profiles of approved users. The public directory and public profiles also hide anyone who is not approved.

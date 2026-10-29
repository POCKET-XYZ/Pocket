# Profiles

Both sides of the marketplace fill in a fixed template. This is a deliberate product decision from the PDR: less freedom of format, more consistency. It makes profiles comparable at a glance and keeps the marketplace looking premium.

A profile can only be filled in once the account is approved (see [verification](verification.md)), and only the profile that matches the user's role.

## Startup template

| Field                               | Required | Notes                                                        |
| ----------------------------------- | -------- | ------------------------------------------------------------ |
| `companyName`                       | Yes      |                                                              |
| `oneLiner`                          | Yes      | One sentence on what the company does, 10 to 200 characters. |
| `sector`                            | Yes      | For example Fintech, Health, Logistics.                      |
| `stage`                             | Yes      | `idea`, `pre_seed`, `seed`, `series_a` or `series_b_plus`.   |
| `lookingFor`                        | Yes      | What they need help with right now, 20 to 1000 characters.   |
| `websiteUrl`, `logoUrl`, `location` | No       |                                                              |

## Specialist template

| Field                                                  | Required | Notes                                                                |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `displayName`                                          | Yes      |                                                                      |
| `headline`                                             | Yes      | Short professional line, for example "B2B SaaS outbound specialist". |
| `bio`                                                  | Yes      | 50 to 2000 characters.                                               |
| `categories`                                           | Yes      | One to four of `growth`, `sales`, `marketing`, `digital_marketing`.  |
| `skills`                                               | No       | Up to 20 tags.                                                       |
| `caseStudies`                                          | No       | Up to 10 links to past work.                                         |
| `hourlyRate`, `minProjectBudget`                       | No       | In USDC.                                                             |
| `portfolioUrl`, `linkedinUrl`, `avatarUrl`, `location` | No       |                                                                      |

## Endpoints

| Endpoint                      | Who                  | What it does                                                                         |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `GET /profiles/me`            | Signed in            | The user's own profile, or `null` when empty.                                        |
| `PUT /profiles/me/startup`    | Approved startups    | Creates or replaces the startup profile.                                             |
| `PUT /profiles/me/specialist` | Approved specialists | Creates or replaces the specialist profile.                                          |
| `GET /profiles/specialists`   | Public               | Directory of approved specialists. Filters: `category`, `search`, `limit`, `offset`. |
| `GET /profiles/:userId`       | Public               | Public profile of an approved user.                                                  |

Both `PUT` endpoints replace the whole profile, so the client always sends the complete template. `GET /profiles/specialists` sorts by most recently updated and returns `{ items, total, limit, offset }`.

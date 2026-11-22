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

| Endpoint                      | Who                  | What it does                                                                                 |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `GET /profiles/me`            | Signed in            | The user's own profile (for a startup, the active one), or `null` when empty.                |
| `PUT /profiles/me/startup`    | Approved startups    | Replaces the active startup's profile, or creates the account's first startup.               |
| `POST /profiles/me/startups`  | Approved startups    | Adds another startup to the account and makes it the active one.                             |
| `PUT /profiles/me/specialist` | Approved specialists | Creates or replaces the specialist profile.                                                  |
| `GET /profiles/specialists`   | Public               | Directory of approved specialists. Filters: `category`, `search`, `limit`, `offset`.         |
| `GET /profiles/:id`           | Public               | One startup by its own id, or an approved user's profile (`as` = `startup` or `specialist`). |

Both `PUT` endpoints replace the whole profile, so the client always sends the complete template. `GET /profiles/specialists` sorts by most recently updated and returns `{ items, total, limit, offset }`.

## Several startups and the specialist side

One account can own several startups and also work as a specialist, with one wallet and one identity check.

- `users.roles` holds every role the account has; `users.role` is the one it acts as now, and every permission reads it. `POST /users/me/roles` adds the other role and switches to it, `PUT /users/me/role` switches between roles the account has. A manager has no other role.
- `users.active_startup_id` is the startup the account acts as. `PUT /users/me/startup` switches to another of its own startups (and to the startup role). `GET /users/me` lists `roles` and `startups`.
- Each job belongs to one startup (`jobs.startup_profile_id`), set from the active startup when it is posted. The job list, contracts, dashboard and period report of a startup show only the active startup's.
- Each startup has its own logo, served at `GET /profiles/:startupId/logo`. A logo is uploaded once the startup's profile is saved.
- In public the two sides are never tied: a startup's page shows the startup, a specialist's page the specialist, and neither shows the shared wallet. Links from before (`/profiles/<user id>`) show the account's active startup.
- A specialist cannot apply to a job their own account posted.

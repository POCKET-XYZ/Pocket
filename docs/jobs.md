# Jobs and applications

Hiring starts with a job. A startup posts what it needs, specialists apply, and the startup picks one of them. Early on there are few specialists, so the work comes to them instead of the other way around.

Only approved accounts take part, and both sides need a filled-in profile first: the board shows which company is hiring, and the startup chooses by looking at each applicant's profile.

## Job

| Field          | Required | Notes                                                       |
| -------------- | -------- | ----------------------------------------------------------- |
| `title`        | Yes      | What is needed, in one line. 10 to 120 characters.          |
| `description`  | Yes      | Scope of the work, 50 to 5000 characters.                   |
| `category`     | Yes      | `growth`, `sales`, `marketing` or `digital_marketing`.      |
| `deliverables` | Yes      | What the startup expects to receive, 10 to 2000 characters. |
| `budget`       | Yes      | In USDC, up to 7 decimals.                                  |
| `deadline`     | Yes      | Calendar date as `YYYY-MM-DD`. Today or later, in UTC.      |

A job goes through these states:

| State         | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `draft`       | Saved but not posted. Only the startup and managers see it.                    |
| `open`        | On the board and taking applications.                                          |
| `in_progress` | The startup hired someone.                                                     |
| `completed`   | Every milestone was paid.                                                      |
| `closed`      | The startup closed it before hiring anyone. Waiting applications are rejected. |

### Drafts

A startup can save a job as a draft (`draft: true` on `POST /jobs`) and post it later. A draft is checked like a job when it is saved, so it is always complete. For anyone but its startup and managers it does not exist: `GET /jobs/:id`, applying and downloading its report template all answer 404, and it is never on the board.

While it is a draft, `PUT /jobs/:id` replaces all of it, milestones and KPIs included; once posted, a job no longer changes. Posting checks the dates again, since a draft can wait: a deadline or a milestone due date that has passed must be changed first. `publishedAt` records when the job reached the board and is `null` on a draft. A draft can be deleted; a posted job is closed instead. Deleting an account deletes its drafts.

## Application

A specialist applies once per job, with a proposal (50 to 5000 characters), a price in USDC that may differ from the budget, and an estimate in days (1 to 365).

| State       | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `submitted` | Waiting for the startup.                                |
| `accepted`  | The startup chose this application.                     |
| `rejected`  | Someone else was hired, or the job was closed.          |
| `withdrawn` | The specialist took it back before the startup decided. |

## Endpoints

| Endpoint                          | Who                  | What it does                                                            |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `POST /jobs`                      | Approved startups    | Posts a job, or saves it as a draft with `draft: true`.                 |
| `GET /jobs`                       | Public               | Board of open jobs. Filters: `category`, `search`, `limit`, `offset`.   |
| `GET /jobs/mine`                  | Startups             | The startup's jobs in every state, drafts included.                     |
| `GET /jobs/:id`                   | Public               | Detail of a job. A draft only for its startup and managers.             |
| `PUT /jobs/:id`                   | Approved startups    | Replaces a draft the startup owns.                                      |
| `POST /jobs/:id/publish`          | Approved startups    | Posts a draft the startup owns.                                         |
| `DELETE /jobs/:id`                | Startups             | Deletes a draft the startup owns.                                       |
| `POST /jobs/:id/close`            | Approved startups    | Closes an open job the startup owns.                                    |
| `POST /jobs/:id/applications`     | Approved specialists | Applies to an open job.                                                 |
| `GET /jobs/:id/applications`      | Startups             | Applicants to a job the startup owns, oldest first, with their profile. |
| `GET /applications/mine`          | Specialists          | The specialist's applications, with the job each one is for.            |
| `POST /applications/:id/withdraw` | Specialists          | Withdraws an application that is still `submitted`.                     |

The board sorts by the latest posted first and returns `{ items, total, limit, offset }`. Each item carries `startup` (company name and logo) and `applicationCount`. Amounts are serialized as strings to keep their decimals.

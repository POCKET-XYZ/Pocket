# The Pocket assistant

`apps/api/src/modules/assistant`. A Claude model (`ASSISTANT_MODEL`, default
`claude-haiku-5-5`) that suggests; people accept, edit or discard each part.
It never posts, delivers, approves or moves money. The web never talks to
Anthropic: the key lives only in the API.

## Environments

| Railway environment | Network | Console workspace | `ASSISTANT_ENABLED` |
|---|---|---|---|
| `production` | testnet | `pocket-testnet` | `true` |
| `mainnet` | mainnet | `pocket-mainnet` | `false` until the new Privacy Policy is accepted |

Changing the model means running the eval set first: another model can
behave differently, and `pricing.ts` needs its price.

## A request, in order

1. **Checks, before the model is asked** (`AssistantService.begin`), read
   together and judged in this order; the first that fails answers, is
   recorded as `rejected_precheck` at no cost, and the model is not called:
   on (flag, key, known price) 503, a verified startup 403, 5 requests a
   minute 429, the daily limit from midnight UTC 429, and the month's budget
   503.
2. **A row holding the highest possible cost** (two calls at 4,000 output
   tokens) is written first, so calls running at once cannot pass the month's
   budget together. It is replaced by the real cost when the call ends.
3. **Masking** (`scrub.ts`): emails, phones, wallet addresses, secret keys and
   links with tokens become placeholders before anything is stored or sent.
4. **The call** (`model.client.ts`): streamed, `effort: low`, structured
   output with a fixed JSON schema, the instructions cached, 30 s at most and
   one retry on a temporary error. A refusal, a cut-off answer or a timeout is
   a failure that does not count toward the daily limit.
5. **Checks in code** (`job-draft/validate.ts`): no money, dates or promised
   results in any text, the form's lengths, and KPIs only from the company's
   own templates. A part that fails is never shown; the model is asked once
   more, and a part that fails again is left out.
6. **Amounts**: the model only gives each milestone a weight. The budget is
   read in code from what the company wrote (`numbers.ts`); only one total
   written plainly counts. A range, a price per unit, another currency or
   two amounts leave every amount empty, with a note.

## The stream

`POST /api/assistant/job-draft` answers newline-delimited JSON
(`application/x-ndjson`): `status`, then a `part` (`title`, `description`,
`deliverables`, `milestone:N`) as soon as it is complete and checked, then
`done` with the whole draft (amounts, KPIs, notes) or `questions` (one round
at most, not counted). A refused request gets a plain JSON error instead.

## Records

`assistant_suggestions`: one row per request, with the instructions version
(`job_draft@1`), real tokens, cost, time, calls, and, once the job is posted,
each part's outcome (`POST /api/assistant/suggestions/:id/outcome`), compared
in the API against what was shown. Deleting an account clears its texts and
keeps the numbers.

## Spend

`ASSISTANT_MONTHLY_BUDGET_USD` (20 by default) in Pocket, under the
Console's own organization limit. The team is alerted at 80% and at 100%,
when the assistant turns itself off until the next month.

# Zoho CRM audit & cleanup kit

Reads a Zoho CRM org through the v8 API, audits it, writes a change plan you can read and approve, applies
record fixes with a journal (and rollback), and generates a configuration register. Node 22, no dependencies.

Everything in `site/` and `dist/` comes from one measured run against a **fictional** org
("Brightwater Supply Co.") served by a mock of the Zoho CRM v8 API. No client data is involved.

## Results of the sample run (results/measurements.json)

| | |
|---|---|
| Records read | 5,776 (3,134 leads, 1,442 contacts, 520 accounts, 680 deals) in 43 API calls / 43 credits |
| Duplicates merged | 192 records in 177 groups, 0 wrong; 40 groups held for review (31 real, 9 namesakes) |
| Duplicate matching (leads) | 96% of matches real, 93% of real duplicates found; one-field matching: 8% real |
| Lead Source | 25 values to 11; 12 of 14 variants found by spelling, 3 decided in `mappings/Lead_Source.json`, 0 wrong |
| Record updates | 6,727 applied, 0 errors; second run finds 0 left |
| API credits | 854 estimated by the plan = 854 charged; 897 for the whole run (6.9% of 13,000/day) |
| Workflow e-mails | current rules 416/day average; over the Standard cap (600/day for 6 licences) on 11 of 30 days; proposed set 76/day |
| Tests | 17 pass (`node --test kit/test/*.test.mjs`) |

## Try it on the sample org

```
node mock/seed.mjs                      # generate the fictional org + planted-problem truth
node mock/server.mjs 8701 &             # mock Zoho CRM v8 API on :8701
node kit/bin/zcrm.mjs snapshot --mock http://127.0.0.1:8701 --out snapshot.json
node kit/bin/zcrm.mjs audit snapshot.json --edition Professional
node kit/bin/zcrm.mjs plan snapshot.json --mappings mappings/ --out plan.json
node kit/bin/zcrm.mjs apply plan.json                         # dry run
node kit/bin/zcrm.mjs apply plan.json --yes --mock http://127.0.0.1:8701 --journal journal.json
node kit/bin/zcrm.mjs rollback journal.json --yes --mock http://127.0.0.1:8701
node kit/bin/zcrm.mjs register snapshot.json --out register.md
node kit/bin/zcrm.mjs simulate snapshot.json mock/data/events.json --edition Standard --licenses 6
node bench/run.mjs                      # the full measured run behind the site
```

## Run it on a real org

1. In api-console.zoho.com (your data centre) create a **Self Client**. Generate a grant code with read
   scopes for the audit: `ZohoCRM.users.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.layouts.READ,ZohoCRM.settings.pipeline.READ,ZohoCRM.settings.workflow_rules.READ,ZohoCRM.modules.READ`
   and exchange it for a refresh token. Add `ZohoCRM.modules.ALL` only when you approve applying a plan.
2. `export ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_REFRESH_TOKEN=... ZOHO_DC=us` (`eu`, `in`, `au`, `jp`, `ca`)
3. `node kit/bin/zcrm.mjs snapshot --out snapshot.json`, then audit / plan as above.

Credits: a snapshot costs about one credit per 200 records per 49 fields, plus ~12 for settings. Applying
costs 1 per merge call and 1 per 10 updated records. Zoho's daily allowance is 5,000 + 250/licence
(Standard), 10,000 + 500 (Professional), 15,000 + 1,000 (Enterprise).

## How the plan decides

- **Duplicates** (Leads, Contacts): same personal email; or same phone and agreeing names (nicknames,
  one typo); or same company (suffixes ignored) and agreeing names. A shared switchboard alone never
  matches. Groups where two personal emails differ are `review`, the rest `auto`. Only `auto` groups merge
  unless you pass `--approve all`. Merge Records API: one master + up to two others per call; the master
  is the most complete record and takes any field it lacks from the others. **Merges cannot be undone.**
- **Picklists**: values that differ only in case, spacing, punctuation, a trailing "s", a year, or one
  typo are merged into the most used one. Meaning-level merges ("Web Form" = "Website") go in
  `mappings/<Field>.json`. Stage, Pipeline, Lead Status and Rating are never merged by spelling.
- **Owners**: records of deactivated users go round-robin to the users in `mappings/owners.json`.
- **Formats**: phones to international form (+14155550134), emails trimmed and lower-cased.
- **Settings** (picklist options, retiring fields, workflow rules, duplicate check, assignment rules)
  are listed as manual steps with where to find them, not changed through the API.
- Leads that are already contacts, overdue deals and stale leads are reported, not changed.

## Layout

```
kit/bin/zcrm.mjs        CLI
kit/src/zoho.mjs        OAuth refresh, paging (page_token past 2,000), field chunks, concurrency, credits
kit/src/snapshot.mjs    read-only snapshot
kit/src/audit.mjs       23 checks
kit/src/dupes.mjs       matching rules, merge planning, scoring
kit/src/picklists.mjs   picklist usage and variant groups
kit/src/plan.mjs        change plan + manual checklist
kit/src/apply.mjs       apply with journal, rollback
kit/src/simulate.mjs    workflow e-mail volume vs edition cap
kit/src/register.mjs    configuration register
kit/src/limits.mjs      edition limits (Zoho feature comparison, Nov 2026)
kit/test/               17 tests (unit + end-to-end against the mock)
mock/                   sample org generator, planted-problem truth, mock API
mappings/               decisions: Lead_Source, Stage, owners
bench/run.mjs           measured run -> results/
results/                measurements.json, register.md, transcript.txt, run/*.json
site/                   review site (Vercel), dist/ the PDF
```

## Review site

`site/` is static. `vercel.json` publishes it with `X-Robots-Tag: noindex`; deploy with `vercel deploy`
from this folder or import the folder in the Vercel dashboard. Rebuild with `npm run site`.

## Measured vs not measured

Measured: one run of this kit against the mock API, which follows the documented v8 endpoints, response
shapes, paging rules, merge and update limits and credit costs; scores against the problems planted in the
sample. Not measured: a real org (the sample and the matching rules share an author, so the scores show the
rules work on these patterns, not a promise for your data), live API latency, and real activity volumes
(the 30-day activity log for the e-mail simulation is generated). The mock treats deactivated users as
invalid owners; rollback restores owner changes separately and lists any the API refuses.

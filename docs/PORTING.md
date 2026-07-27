# What is ported, and what is left

The prototype has around thirty screens. This first pass carries the
architecture and the screens that prove it end to end. Everything below
has a working API endpoint already — what is missing is the React screen.

## Carried over

| Screen | Route | Endpoint |
|---|---|---|
| Sign in | `/` | `POST /api/auth/login` |
| Banking dashboard | `/banking` | `GET /api/dashboards/banking` |
| Opportunities | `/banking/opportunities` | `GET /api/opportunities` |
| Opportunity detail, stage move, notes | `/banking/opportunities/:id` | `GET/PATCH/POST /api/opportunities/:id/*` |
| Institutional clients | `/institutional/clients` | `GET /api/institutions` |
| Client form with schemes and codes | `/institutional/clients/:id/edit` | `POST/PUT /api/institutions` |
| Volume & brokerage | `/institutional/brokerage` | `GET /api/brokerage` |
| Assignments | `/internal/assignments` | `GET /api/assignments` |
| Work approvals with decisions | `/internal/work-approvals` | `GET /api/work-approvals`, `PATCH …/decide` |
| Masters | `/masters` | `GET/POST/PUT/DELETE /api/masters/:master` |
| Users & rights | `/users` | `GET /api/users`, `…/permissions` |

## Still to port

| Screen | Endpoint that exists | Notes |
|---|---|---|
| Accounts list and detail | `accounts` routes to add — schema is complete | Edit is Level 1 only; enforce with `superAdmin` |
| Mandates, milestones, record fee | `mandates` routes to add | Fee posting must go through `fee_receipts` so the triggers fire |
| Closed projects | filter on `mandates.status IN ('Executed','Terminated')` | |
| Pipeline board (drag between stages) | `GET /api/opportunities/board`, `PATCH …/stage` | The API is done; this is a UI job |
| Assign dialog for opportunities | `PATCH /api/opportunities/:id/assign` | Owner plus support team in one call |
| Institutional dashboard | `GET /api/dashboards/institutional` | |
| Daily movement, incl. voice capture | `GET /api/institutions/visits/all`, `POST …/:id/visits` | Speech runs in the browser; post the parsed fields plus `transcript` |
| Research reports | `research_reports` routes to add | |
| Assignment detail, subtasks, checklist, time | `GET /api/assignments/:id`, `POST …/time` | |
| My day | `GET /api/assignments/my-day` | Returns overdue / today / upcoming / approvals in one call |
| Workload and SLA reports | `GET /api/assignments/reports/{workload,sla}` | Both read prepared views |
| Meetings and calendar | `meetings` routes to add | |
| Email threads | `emails` table with `thread_key` | See the note below |
| Imports (client base, brokerage, reports) | `POST /api/brokerage/import` exists | Parse in the browser, post rows; keep the preview-before-commit step |
| Notifications | `notifications` table | Poll, or add SSE later |

## Two things that change on a server

**Email.** The prototype hands messages to the desktop mail client and
takes replies back by paste, because a local page cannot reach a mailbox.
With a server this becomes real: send through SMTP, and have a scheduled
job poll an IMAP mailbox — say `deals@ashika.com` — matching the
`[OPP-2026-0001]` token in the subject to `emails.thread_key`. The
threading logic is already written for that token; nothing is wasted.

**Voice.** Recognition still runs in the browser (Chrome and Edge). What
changes is where the optional AI pass happens: put the API key on the
server, expose one endpoint, and point the client at it. The key then
never reaches a browser, which is the whole reason for doing it.

## Two behaviours worth preserving exactly

- **Imports show you the rows before writing any of them.** Duplicate
  detection, unknown client codes, layout sniffing for older files — all
  of it earned its place by catching real mistakes.
- **Assignment grants visibility.** It is tempting to treat the deal team
  as decoration. It is not: `opportunity_team` and `assignment_watchers`
  are read by the scope rules, and removing someone from a team removes
  their access.

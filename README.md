# ClaimEase: AI-Powered Insurance Claims Simplification

**One AI guide for every kind of claim. Tell it what happened, or drop a bill. See exactly where it stands.**

Filing and following an insurance claim is confusing, and incomplete claims cause most of the delay. ClaimEase puts an AI guide called **Ease** on every screen. A claimant or provider can just *tell Ease what happened* (or drop a bill, repair estimate or photos) and Ease builds the claim, asks only what is missing, and checks it before it is sent. Adjusters get a short brief and drafted messages for every claim. Operations see what is slowing claims down. Every outcome is still decided by a person and a rules engine.

It covers **Health** (provider bills, CPT/ICD-10 service lines, 837/835-style views, network savings), **Auto** and **Property** (Homeowners/Renters) claims with the same AI layer.

> **Core principle:** more uncertainty → more investigation and human review. Low-uncertainty claims are flagged **Fast-track eligible**.

All policy and claim data is mock data. There is no real authentication, payments, EDI or file storage. When an API key is configured, uploaded documents are sent to Google's Gemini API to be read, so **use only fictional documents** (samples are included). See [docs/AI_GUIDE.md](docs/AI_GUIDE.md).

---

## AI features

The AI has one name everywhere: **Ease**.

| Feature | Who | What it does |
|---|---|---|
| **Smart start** | Claimant, provider | Tell Ease what happened (typed or spoken) or drop a bill or photo. Ease fills in the claim, shows it building live ("Your claim so far"), verifies the policy and asks one question at a time. |
| **Bill, estimate and photo reading** | Claimant, provider | Reads photos and PDFs and suggests values with a confidence level and where each was seen. Nothing is applied until the person agrees. A **photo check** says what is visible, how good each photo is and which shots are missing. |
| **Pre-submit check** | Claimant, provider | Explains in plain English what is missing and why, and catches contradictions. The rules-based checklist keeps the last word on "ready". |
| **Ask Ease** (Ctrl/Cmd+K) | Everyone | Knows which screen you are on, explains jargon in context and can take you to the right page. |
| **Where you stand / Explain this** | Claimant, provider | A plain-English summary of a claim, what a decision means and what the patient owes. |
| **Appeal help** | Claimant | Drafts an appeal letter for the person to edit. |
| **Brief and drafts** | Adjuster | What the claim is, the risks, a suggested next step, and drafted decision and information-request messages. The rules engine still decides. |
| **Insights** | Operations admin | What is slowing claims down, with a concrete suggestion for each. |
| **Network savings** | Everyone | On health claims, billed against the network rate and what the network saved (not AI: it reuses the fee-schedule maths). Rolled up on the admin dashboard. |

Every AI result is badged **AI**, or **Demo data** when no key is configured. Setup, architecture, the demo script and judging talking points are in [docs/AI_GUIDE.md](docs/AI_GUIDE.md).

```bash
copy .env.example .env.local   # then paste your free key after GEMINI_API_KEY=
npm run ai:check               # proves the key works and reads the sample documents
npm run dev
```

Without a key the app runs in **demo mode** (clearly labelled sample values), so everything still works.

---

## Quick start

Requires Node 18+ (tested on Node 25).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: rules engine, status machine, payable calculation
npm run build      # type-check + production build
```

Open the profile menu (top right) and use **Switch persona** to change between Claimant, Healthcare provider, Claims adjuster and Operations admin. State is saved to `localStorage` so a demo survives a refresh. **Admin → Reset demo data** restores the seed.

Seed data: 3 active policies (Auto `POL-100245`, Homeowners `POL-200318`, Health `POL-300577`). There is also one lapsed renters policy (`POL-400112`) for showing lookup validation. The seed has 10 claims that cover every type and every main lifecycle status.

---

## Demo walkthrough (about 5 minutes)

The full script, with what to say, is in [docs/AI_GUIDE.md](docs/AI_GUIDE.md#4-demo-script-about-5-minutes). In short:

| # | Persona | Step |
|---|------|------|
| 1 | Claimant | Open `/welcome`, click **Start as Maria**. **File a claim → Start with Ease**. |
| 2 | Claimant | Drop `public/samples/sample-itemized-bill.pdf` in the chat. Ease reads it, fills in 11 things and builds **Your claim so far**. Click **Review my claim**. |
| 3 | Claimant | **Check my claim**: Ease says medical records are required and why. **Submit claim**. |
| 4 | Claimant | Press **Ctrl+K**, ask "What happens next?". |
| 5 | **Adjuster** | Switch to *Alex Chen*, open a claim from the **Work queue**: the Ease brief, then **Request info →** tick an item **→ Draft the message with Ease**. |
| 6 | Any | Open a health claim → **837 / 835 view → Remittance (835)** for **Network savings**. |
| 7 | **Operations admin** | Switch to *Jordan Rivera*: Ease's insights and the Network savings total. |

Other things to show: the claim **timeline**, the contact log, the printable **Claim file**, glossary tooltips, **Rules & SLA** configuration and **Reset demo data** (Admin).

---

## Features

1. **Claim intake** (`features/intake`). Two ways in: **Smart start** (talk to Ease; `intake/smart/`) or the **form** (Policy → Documents → Details → Review & submit), which Smart start hands over to with everything prefilled.
   - The fields and required documents change by claim type (Auto: vehicles, other parties, police report. Property: damage type, contractor, receipts. Health: provider-submitted, member, NPI, CPT/ICD service lines).
   - Policy validation: the policy must exist, be ACTIVE, and cover the date of loss.
   - **"I'm not sure"** toggles. Unsure values get partial credit in the readiness score and add a review trigger.
   - Live **claim readiness** score (0–100%) that shows what is still needed, plus a contextual tip for each step.
   - On submit, the claim number is generated, the status goes REPORTED → REGISTERED, the SLA starts and the confirmation page opens.
2. **Claimant / Provider portal** (`features/claims`):
   - My Claims list.
   - Lifecycle timeline showing completed, current, skipped and upcoming stages.
   - A highlighted information-request panel with upload.
   - Communication log, printable claim file and appeals.
   - Notification center plus a header bell.
3. **Adjuster workspace** (`features/adjuster`):
   - Work queue with filters for type, status, priority, SLA and owner, plus sorting.
   - Review screen with the rules engine, policy summary, documents gallery, notes, expert input, flags and audit trail.
   - Adjudication panel: override needs a reason; denial needs a reason code and explanation.
   - Simulated payment → close.
4. **Rules engine** (`domain/rulesEngine.ts`), made of pure functions:
   - Checks: policy active, coverage/exclusions, eligibility, required docs/data, cost-sharing, payable, and manual review.
   - Triggers: high value, missing or estimated data, unclear liability, injury, coverage uncertainty, third-party input pending, fraud indicators (new policy, duplicate date of loss, frequent claims), catastrophe and legal.
   - Outputs: an uncertainty score, complexity, priority and fast-track eligibility.
5. **SLA** (`domain/sla.ts`):
   - Example ERISA windows for health (urgent 72 h, pre-service 15 d, post-service 30 d).
   - Configurable auto/property targets by complexity.
   - Live countdown with on-track, at-risk, overdue, paused, met and missed states, plus a disclaimer that the times are illustrative.
6. **Admin dashboard** (`features/admin`):
   - KPIs (total, average time to decision, % fast-tracked, % needing info, denial rate, appeals).
   - recharts charts by status and type, top delay reasons (11 categories), and a table view for each chart.
   - Config screen for thresholds and SLA targets.
7. **Health specifics** (`features/health`): fee-schedule allowed amounts, deductible, copay, coinsurance, out-of-pocket cap and provider write-off. The 837/277/835-style views are labelled as a simplified illustration, not real EDI.
8. **Help & education:** glossary page and inline tooltips (`GlossaryTerm`) for policy, premium, claim, deductible, adjuster (company/independent/public), adjudication, FNOL, settlement, denial, appeal and more.

UI: Tailwind CSS v4, lucide-react icons and color-coded status badges that are the same everywhere (`components/badges.tsx`). Also included: empty, loading and skeleton states, toasts, keyboard-accessible modals and tabs, a skip link, labelled form fields, and a mobile layout that works at 375px.

---

## Architecture

```
server/            runs in Node inside the Vite dev server; holds the API key, never shipped to the browser
  gemini.ts            the only file that calls Google's Gemini API (structured JSON output, model failover)
  prompts.ts           every instruction given to the model
  handlers.ts, features.ts   scan / gaps / explain / chat / intake / brief / draft / insights / photo: validate input, call the model, sanity-check the output
  demo.ts, demoFeatures.ts   labelled sample answers when no key is set
src/
  domain/          pure TypeScript: no React, no I/O
    types.ts           domain model (Policy, Claim, Document, AuditEntry, …)
    statusMachine.ts   single source of truth for allowed transitions + role permissions + timeline
    rulesEngine.ts     adjudication checks, triggers, payable calculation
    requirements.ts    required fields/documents per claim type (shared by readiness + rules)
    readiness.ts       Claim Readiness Score
    sla.ts             SLA windows and status
    claimNumber.ts     CLM-YYYY-NNNNNN / POL-XXXXXX helpers
    catalog.ts         reference data (procedures, perils, denial codes, …)
    config.ts          default rules/SLA configuration
    __tests__/         Vitest suites
  services/        mock API: async functions with simulated latency
    claimService.ts    create, transition, requestInformation, decide, issuePayment, fileAppeal, …
    policyService.ts   lookup / list
    notificationService.ts  notifications, config, admin reset
    db.ts              in-memory DB + localStorage persistence
    seed.ts            seed data generated relative to "now"
  store/           Zustand store, hooks (useClaim, useRules), useClaimAction (toasts + pending)
  components/      shared UI (Layout, badges, Timeline, Documents, CommunicationLog, AuditTrail, …)
  features/        intake · claims · adjuster · admin · health · copilot (Ask Ease) · welcome · tour
  pages/           Home, Glossary
  routes.tsx       React Router (lazy-loaded feature routes)
```

- **Status machine:** every transition goes through `assertTransition(from, to, role)` in the service layer. The UI calls `canTransition()` to disable actions that aren't allowed, so the screen and the server can't drift apart.
- **Audit trail:** every service mutation appends a frozen `AuditEntry` (actor, role, action, from/to status, details). Entries are never edited or deleted.
- **Notifications** are created by the service on status changes, information requests, decisions, payments and appeals. They are addressed by role.

## Swapping the mock service for a real API

The UI imports services only from `src/services/index.ts`. To connect a backend:

1. Implement the same function signatures with HTTP calls, for example:
   ```ts
   // services/http/claimService.ts
   export const claimService = {
     list: (filter = {}) => api.get<Claim[]>('/claims', { params: filter }),
     create: (input: NewClaimInput) => api.post<Claim>('/claims', input),
     transition: (no: string, to: ClaimStatus, _actor: Actor, details?: string) =>
       api.post<Claim>(`/claims/${no}/transitions`, { to, details }),
     decide: (no: string, d: DecisionInput) => api.post<Claim>(`/claims/${no}/decision`, d),
     // …
   };
   ```
   The `actor` argument goes away once real auth exists. The server then knows who is calling from the session or token.
2. Re-export the HTTP versions from `services/index.ts`. Components and the store don't change.
3. Run `domain/statusMachine.ts` and `domain/rulesEngine.ts` on the server too, since they are dependency-free. The server should enforce transitions and compute payable amounts. `useRules()` in `store/hooks.ts` can then fetch `/claims/:id/evaluation` instead of computing on the client.
4. Uploads: `FileUploader` currently stores metadata and image previews only. Replace `addDocuments` with a signed-URL upload (for example S3/Blob) that returns document IDs.
5. Ready-made extension points: auth (replace the role switcher with the user's session role), payments (`issuePayment`), EDI (map the health claim to and from X12 837/835 in a backend adapter), and state-specific regulatory logic (pass a jurisdiction into `computeSlaDueDate` and `RulesConfig`).

## Out of scope (MVP)

Real authentication, real payments, real EDI integration, state-specific regulatory logic and real file storage. SLA windows are **illustrative targets, not legal deadlines**. Timeframes vary by insurance type, state regulation and policy terms.

# ClaimEase

ClaimEase is a hackathon MVP for U.S. insurance claims processing. It covers Auto, Property (Homeowners/Renters) and Health claims. It makes filing easier for claimants and providers, and it makes review faster for insurers by catching missing or uncertain information at intake.

> **Core principle:** more uncertainty → more investigation and human review. Low-uncertainty claims are flagged **Fast-track eligible**.

All data is mock data. There is no real authentication, payments, EDI, PHI or file storage.

---

## Quick start

Requires Node 18+ (tested on Node 25).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: rules engine, status machine, payable calculation
npm run build      # type-check + production build
```

Use the **Viewing as** role switcher in the header to change between Claimant, Healthcare Provider, Adjuster/Examiner and Admin. State is saved to `localStorage` so a demo survives a refresh. **Admin → Reset demo data** restores the seed.

Seed data: 3 active policies (Auto `POL-100245`, Homeowners `POL-200318`, Health `POL-300577`). There is also one lapsed renters policy (`POL-400112`) for showing lookup validation. The seed has 10 claims that cover every type and every main lifecycle status.

---

## Demo walkthrough for judges (about 6 minutes)

| # | Role | Step |
|---|------|------|
| 1 | **Claimant** | Click **File a claim**. Choose demo policy chip **POL-100245** and set today's date, then click **Look up**. The policy is verified. Try **POL-400112** too: it is rejected as lapsed. |
| 2 | Claimant | **Incident details:** set damage to "Front bumper, hood", write a description, and enter amount **8500**. Tick **Estimated / unsure** on the amount. Click **Add other party**, enter a name and insurer, and leave *at fault* as **Unknown**. Add police report number `APD-26-77001`. Watch the **Claim Readiness Score** update. |
| 3 | Claimant | **Documents:** upload a photo and a file named `police-report.pdf`. Leave out the repair estimate on purpose. The checklist shows it is still missing. |
| 4 | Claimant | **Review & submit:** the review explains why this claim will get human review (estimated value, unclear liability, missing estimate). Confirm and submit. The confirmation page shows the claim number `CLM-YYYY-NNNNNN`, the status *Registered*, the SLA countdown and next steps. |
| 5 | **Adjuster** | Open the claim from **Work queue**. Point out the priority and complexity flags, the uncertainty meter, the 7 rules-engine checks (pass/warn/fail with explanations) and the payable calculation. Click **Assign to me**, which starts the review. |
| 6 | Adjuster | Click **Request info**. *Repair shop estimate* is pre-ticked because the rules engine flagged it as missing. Send the request: the claimant is notified and the SLA shows as *paused*. |
| 7 | **Claimant** | The bell shows the request. On the claim page, the requested item is highlighted. Upload `estimate.pdf` and click **Submit requested information**. The claim goes back to *Under review*. |
| 8 | **Adjuster** | Click **Send to adjudication**. In the adjudication panel, choose **Partially approve** and change $8,000 to **$6,200**. An override reason is required. Add an explanation and record the decision. |
| 9 | **Claimant** | Click **File an appeal**, enter a reason and optional evidence, and submit. The status becomes *Appealed*. |
| 10 | **Adjuster** | Click **Re-adjudicate**, then **Approve** $8,000. In the payment panel, click **Queue payment**, then **Mark payment issued** (method, amount, date, reference). The status becomes *Paid*. Click **Close claim**. Show the **Audit trail** tab: every step was logged automatically. |
| 11 | **Admin** | Open the dashboard: KPIs, charts and top delay reasons. Open **Rules & SLA**, lower the auto high-value threshold to $5,000, then go back to the queue. Priorities are recalculated. |
| 12 | Any | Health: open `CLM-2026-000108` → **837 / 835 view**. It shows the patient → provider → payer flow, an 837-style claim, a 277-style status and an 835-style remittance (billed / allowed / plan paid / patient responsibility). |

Other things to show: the **Claim file** (print-friendly; use Save as PDF), the **communication log**, glossary tooltips (dotted underlines) and the **Help** page.

---

## Features

1. **FNOL intake wizard** (`features/intake`). Steps: Policy lookup → Incident details → Documents → Review & submit.
   - The fields and required documents change by claim type (Auto: vehicles, other parties, police report. Property: damage type, contractor, receipts. Health: provider-submitted, member, NPI, CPT/ICD service lines).
   - Policy validation: the policy must exist, be ACTIVE, and cover the date of loss.
   - **Estimated / unsure** toggles. Estimated values get partial credit in the readiness score and add a review trigger.
   - Live **Claim Readiness Score** (0–100%) with a required/recommended checklist. Includes the "Tips for a faster claim" panel.
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
  features/        intake · claims · adjuster · admin · health
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

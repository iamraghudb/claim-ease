# ClaimEase: AI-Powered Insurance Claims Simplification

**Upload a bill. AI fills in the claim. See exactly where it stands.**

ClaimEase is an AI-powered web app that takes the pain out of filing and following an insurance claim. Upload a bill, repair estimate or receipt and AI reads it, fills in the claim form and flags anything it is unsure about. Before you submit, an AI pre-check explains in plain English what is missing and why it matters, so claims arrive complete. After submission, a live status tracker and an AI claim assistant tell claimants where their claim stands and what happens next. Insurers get a rules-driven adjuster workspace with fast-track detection, SLA tracking and a full audit trail.

Healthcare first (provider bills, CPT/ICD-10 service lines, 837/835-style views), plus Auto and Property (Homeowners/Renters) claims.

> **Core principle:** more uncertainty → more investigation and human review. Low-uncertainty claims are flagged **Fast-track eligible**.

All policy and claim data is mock data. There is no real authentication, payments, EDI or file storage. When an API key is configured, uploaded documents are sent to Google's Gemini API to be read, so **use only fictional documents** (samples are included). See [docs/AI_GUIDE.md](docs/AI_GUIDE.md).

---

## AI features

| Feature | Where | What it does |
|---|---|---|
| **Bill / receipt scanner** | Intake → Documents | Reads photos and PDFs, suggests values for the form with a confidence level and where it saw each one. Nothing is applied until the user ticks it. Unsure values are marked *estimated*. Files are auto-labelled (itemized bill, estimate…) so the checklist ticks. |
| **Pre-submission check** | Intake → Review & submit | Explains in plain English what is missing and why, and catches contradictions (bill total vs lines, injuries vs description). The rules-based checklist keeps the last word on "ready". |
| **Claim status assistant** | Claim page (claimant / provider) | Answers "where is my claim / what do I do next?" from the claim's real status, timeline and requests. It only sees what the claimant already sees. |

Every AI result is badged **AI**, or **Demo data** when no key is configured. Setup, architecture and judging talking points are in [docs/AI_GUIDE.md](docs/AI_GUIDE.md).

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

## Demo walkthrough for judges (about 6 minutes)

| # | Persona | Step |
|---|------|------|
| 1 | **Healthcare provider** | Switch persona to *Dr. Priya Shah*. Click **Submit a claim**. Choose the sample policy **POL-300577**, set the date of service to **15 Sep 2026** (the sample bill's date) and click **Check policy**. Then **Continue**. |
| 2 | Provider | **Documents:** click *Download a sample itemized bill* in the indigo AI panel and drop the PDF in. Click **Read 1 document**. Show the confidence pills, the *Seen at* evidence and the warnings, then **Fill in** the suggestions. Nothing changes until you click. |
| 3 | Provider | **Details:** the *AI filled in N items* banner lists what it did. The patient is picked from the plan and both service lines are in. Everything is editable. |
| 4 | Provider | **Review and submit:** click **Check my claim**. The AI explains in plain English what is missing (the MRI needs medical records) and why. Submit. The confirmation shows the claim number, status and next steps. |
| 5 | Claimant | Switch to *Maria Lopez*. Open the claim: the timeline shows exactly where it is. Ask the assistant **What happens next?** |
| 6 | **Adjuster** | Switch to *Alex Chen* and open the claim from the **Work queue**. Point out the priority and complexity flags, the uncertainty meter, the rules-engine checks (pass/warn/fail with explanations) and the payable calculation. Click **Assign to me**, which starts the review. |
| 7 | Adjuster | Click **Request info**. *Repair shop estimate* is pre-ticked when the rules engine flagged it as missing. Send the request: the claimant is notified and the SLA shows as *paused*. |
| 8 | Claimant | The bell shows the request. On the claim page the requested item is highlighted. Upload the file and click **Send to my adjuster**. The claim goes back to *Under review*. |
| 9 | Adjuster | Click **Send to adjudication**. In the adjudication panel, choose **Partially approve** and change the amount. An override reason is required. Add an explanation and record the decision. |
| 10 | Claimant | Click **File an appeal**, enter a reason and optional evidence, and submit. The status becomes *Appealed*. |
| 11 | Adjuster | Re-adjudicate and approve. In the payment panel, queue the payment, then mark it issued (method, amount, date, reference). Close the claim. Open the **Audit trail** tab: every step was logged automatically. |
| 12 | **Operations admin** | Open the dashboard: KPIs, charts and top delay reasons. Open **Rules & SLA**, lower the auto high-value threshold to $5,000, then go back to the queue. Priorities are recalculated. |
| 13 | Any | Health: open `CLM-2026-000108` → **837 / 835 view**. It shows the patient → provider → payer flow, an 837-style claim, a 277-style status and an 835-style remittance (billed / allowed / plan paid / patient responsibility). |

Other things to show: the **Claim file** (print-friendly; use Save as PDF), the **contact log**, glossary tooltips (dotted underlines) and the **Help** page.

---

## Features

1. **Claim intake wizard** (`features/intake`). Steps: Policy → Documents (upload, AI reads them) → Details (pre-filled, you confirm) → Review & submit.
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
  gemini.ts            the only file that calls Google's Gemini API (structured JSON output, thinking level)
  prompts.ts           every instruction given to the model
  handlers.ts          scan / gaps / explain: validate input, call the model, sanity-check the output
  demo.ts              labelled sample answers when no key is set
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

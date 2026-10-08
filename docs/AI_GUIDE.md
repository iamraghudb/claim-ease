# ClaimEase AI guide

The AI runs on Google's **Gemini API**, which has a free tier that needs only a Google account. No credit card.

## 1. Get a free API key (2 minutes, one time)

You do this part yourself because it is tied to your Google account.

1. Open <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Accept the terms if asked, then click **Create API key**. AI Studio creates a project for you automatically.
3. **Copy the key** (it starts with `AIza`).
4. Open `.env.local` in this folder and paste it after the `=`:
   ```
   GEMINI_API_KEY=AIza...your key...
   ```
   No quotes, no spaces. Save.
5. Prove it works:
   ```bash
   npm run ai:check
   ```
   You should see three `ok` lines and the fields the AI read from the two sample documents.
6. Restart `npm run dev` (Ctrl+C, then start it again). The terminal should say `AI: Gemini (gemini-flash-lite-latest)`.

Rules for the key:
- Never paste it into chat, a commit, a screenshot or a slide. `.env.local` is git-ignored on purpose.
- Never rename the variable to `VITE_GEMINI_API_KEY`. Anything starting with `VITE_` is bundled into the browser code, which would publish your key to every visitor.
- If it leaks, delete it on the AI Studio keys page and create a new one.

## 2. What the free tier means

- **No cost, no card**, but it is rate-limited (requests per minute and per day). You can see your exact limits in AI Studio. A normal demo is far below them. If you hit one, the app tells you to wait a minute.
- **Google may use free-tier content to improve its products.** So never upload a real medical bill or any real personal data. Use the two fictional samples in `public/samples/` (also downloadable from the AI panel on the Documents step). `python scripts/make_sample_docs.py` regenerates them.
- Google's terms limit the free tier in some regions (for example the EEA, UK and Switzerland). If AI Studio will not give you a free key, or the app reports "permission denied", that is the likely reason.

## 3. How it works

The AI has one name everywhere: **Ease**. Every screen, for every persona, has Ease in some form.

```
Browser (React)                       Vite dev server (Node)                  Google
───────────────                       ──────────────────────                  ──────
Ask Ease (every screen)  ─ /api/ai/chat ───▶  server/features.ts
Smart start              ─ /api/ai/intake ─▶  server/handlers.ts
Bill / photo reading     ─ /api/ai/scan, /photo ─▶   validate input
Where you stand          ─ /api/ai/explain ─▶        build the prompt  ───────▶ Gemini
Pre-submit check         ─ /api/ai/gaps ───▶         check + clean the answer ◀── JSON
Adjuster brief           ─ /api/ai/brief ──▶
Drafts (appeal, notes)   ─ /api/ai/draft ──▶
Admin insights           ─ /api/ai/insights ▶
     ◀──────────── JSON ────────────────
```

The browser never sees the key. It only talks to its own server, which holds the key (read from `.env.local` in `vite.config.ts`) and talks to Google.

### Where to change what

| I want to… | Edit |
|---|---|
| Change how Ease talks or how careful it is | `server/prompts.ts` (every instruction lives in this one file) |
| Change the shape of an AI answer | `server/schemas.ts` + `src/domain/aiTypes.ts` |
| Pin or change the model | `GEMINI_MODEL=...` in `.env.local` |
| Change which pages Ease may send people to | `src/domain/aiRoutes.ts` (also the site map Ease is told) |
| Tell Ease what a screen is showing | call `useCopilotPage({...})` in that screen (`src/features/copilot/pages.ts`) |
| Change what Ease is allowed to see about a claim | `src/domain/aiContext.ts` (claimant view and staff view, both scrubbed of names and IDs) |
| Change which fields a bill scan or Smart start can fill | `src/features/intake/aiApply.ts` and `intakeApply.ts` (one entry per field) |
| Change how Ease looks | `src/components/ai.tsx` (avatar, thinking state, typing, AI card) |
| Switch to a different AI provider | write one new file like `server/gemini.ts` and use it in `server/vitePlugin.ts` |

### What Ease does, by persona

| Who | What Ease does |
|---|---|
| **Everyone** | **Ask Ease**: a side panel (or Ctrl/Cmd+K) that knows which screen you are on, explains jargon in context, suggests the next step and can take you there. |
| **Claimant / provider** | **Smart start**: tell Ease what happened (typed or by voice) or drop a bill, and it builds the claim by conversation, asking one question at a time. **Bill and photo reading** fills in the form with confidence levels. **Photo check** says what is visible, how good each photo is and which shots are missing. **Pre-submit check** explains what is missing. **Where you stand** summarises a claim in plain English. **Explain this**: decisions and what a patient owes. **Appeal drafting** writes a first draft for you to edit. |
| **Adjuster** | **Brief**: what the claim is, the risks in plain English, a suggested next action and what to double-check. **Drafts** for decision explanations and info-request messages. |
| **Admin** | **Insights**: what is slowing claims down, with a concrete suggestion for each, plus "ask the dashboard". |

How the pieces behave:
1. **Reading documents** (`/scan`, `/photo`). Files go to the model as images/PDFs. It must answer in a fixed JSON shape (structured output), listing only what it can see, each with a confidence and where it saw it. The browser turns that into *proposals*; nothing changes until the person agrees. Values they typed are never silently replaced.
2. **Smart start** (`/intake`). Each turn the model returns the facts it understood, one short reply and the single next question. Facts are validated (dates, enums, yes/no, policy numbers must be the person's own). A deterministic list of essentials decides when it is "done", and a backstop picks the policy when only one fits. The model cannot declare a claim ready early.
3. **Ask Ease** (`/chat`). Gets the screen's title, summary and a small data snapshot. Any button it offers must point to a real page for that persona; the server and the browser both check this.
4. **Brief** (`/brief`) uses the rules engine's own checks as the source of truth: it cannot recommend approving when a check failed, or denying when none did.
5. **Drafts** (`/draft`) land in editable previews ("Use this draft" / "Dismiss"), never straight into the claim.
6. **Automatic, but remembered.** The few things that appear on their own (the adjuster brief, "Where you stand", admin insights) run once per distinct claim state and are cached in the browser for six hours, so reopening costs nothing and the free tier is not drained. Everything else runs only when asked.

### Safety choices worth mentioning to judges

- **Human in the loop.** The AI proposes, drafts and explains; a person confirms, edits and submits. Decisions stay with adjusters and the rules engine.
- **Rules have the last word.** Readiness, the payable calculation and "is this claim ready" are deterministic. The AI cannot override them.
- **Honest uncertainty.** Confidence per field, "seen at" evidence, and the app's "I'm not sure" mechanism.
- **Least data, scrubbed.** Each feature sends the minimum. Names, member IDs, policy and claim numbers are removed from anything the AI reads, including the rules engine's own explanations.
- **Prompt-injection aware.** Document text, claim text and conversations are treated as data, never instructions; file names are sanitised; outputs are validated and clamped before the UI uses them; links are checked against an allow-list.
- **Never fake AI.** No key → everything is badged **Demo data**.
- **Key stays server-side**, and the endpoints only accept `application/json`, which stops other websites from spending your quota through your browser.

## 4. Demo script (about 5 minutes)

The story: **one AI guide for every kind of claim (Health, Auto and Property)**. It makes claims right the first time, and explains the result in plain English. People always decide.

Before you start: `npm run dev`, open <http://localhost:5173/welcome>, and use **Admin → Reset demo data** if the data looks messy. Have the sample bill from `public/samples/` handy.

1. **Welcome (20 s).** The welcome screen shows the four people. Click **Start as Maria** (claimant).
2. **Smart start, the hero moment (90 s).** **File a claim → Start with Ease**. Drop `sample-itemized-bill.pdf` into the chat (paperclip). In about 10 seconds Ease reads it, says "I filled in 11 things", and the **Your claim so far** card on the right fills in: verified policy, date, place, visit, patient, services, $1,895. Click **Review my claim**.
3. **Pre-submit check (30 s).** On **Review and submit** click **Check my claim**. Ease says, in plain English, that medical records are required and why. Tick the box and **Submit claim** (confetti, claim number).
   *Auto version, if you prefer a conversation:* type "I was rear-ended at a red light on Main Street last Friday. The rear bumper and trunk are crushed and the car is not drivable. Nobody was hurt. Roughly $4,500 in damage." Ease picks the auto policy, works out the date, and says it has what it needs.
4. **Ask Ease (30 s).** Press **Ctrl+K** (or the **Ask Ease** button) on any screen. Ask "What happens next?". Ease answers from what is on that screen and offers a button to the right page.
5. **Adjuster (60 s).** Profile menu → **Alex Chen**. Open a claim from the **Work queue**. Show the **Ease brief** (what it is, the risks, a suggested next step), then **Request info**: tick an item and click **Draft the message with Ease**; it writes the message and the adjuster chooses **Use this draft** or **Dismiss**. The rules engine still works out the numbers.
6. **Network savings (30 s).** Open a health claim → **837 / 835 view → Remittance (835)**. The **Network savings** card shows billed, network rate and what the network saved. Providers see it as their write-off, claimants as the amount they are not charged.
7. **Operations (30 s).** Profile menu → **Jordan Rivera**. The dashboard shows Ease's read on what is slowing claims down and the **Network savings** total.
8. **Close (20 s).** "Same guide, same checks, for Auto and Property too: photos of damage get a photo check, repair estimates are read like bills."

Safety net: **demo mode**. If the venue wifi dies, remove the key line from `.env.local` and restart. Everything still works with clearly labelled **Demo data**.

What to say if asked:
- *Is it safe?* A person decides every outcome. Rules, not the AI, work out payable amounts. Names and IDs are removed before anything reaches the model.
- *Real data?* Not yet. The free tier is for fictional data only. A real deployment needs an enterprise AI agreement and the right data agreements.
- *Results?* Not measured yet. We would measure claims right first time, minutes per claim reviewed and support contacts per claim.

## 5. Speed and reliability on the free tier

Typical answers take 2 to 10 seconds. The free tier is shared, so Google's models sometimes answers "503: high demand", or holds a request for a minute before failing. The app handles this for you (`server/gemini.ts`):

- Models are tried in order: `gemini-flash-lite-latest` (fast, separate quota, reads these documents correctly), then `gemini-flash-latest` (heavier). The lighter one goes first because on the free tier the heavier one often queues for 10+ seconds or answers "503".
- A model that does not answer within 12 seconds, is busy, or is out of free quota is abandoned and skipped for a minute, so the next requests go straight to the one that works.
- The dev terminal prints one line per attempt, for example `[ai] gemini-flash-lite-latest failed with 503 after 2.0s`, then `[ai] gemini-flash-latest answered in 3.8s`. Watch it if something feels slow.

Settings (all optional, in `.env.local`):

| Variable | What it does |
|---|---|
| `GEMINI_MODEL` | Main model. Default `gemini-flash-lite-latest` always points at Google's current light Flash model, so the app keeps working when Google retires old versions. Once you have rehearsed, pin the exact name you tested (list: <https://ai.google.dev/gemini-api/docs/models>) so nothing changes on demo day. |
| `GEMINI_FALLBACK_MODELS` | Comma-separated models to try next. Default `gemini-flash-latest`. |

## 6. If something goes wrong

| You see | Fix |
|---|---|
| Badge says **Demo data**, terminal says "demo mode" | No key found. Check `.env.local` is in the project root, the line is `GEMINI_API_KEY=AIza…`, and you restarted `npm run dev`. |
| "Google rejected the API key" | Key is wrong or deleted, or has a stray space/quote. Create a new one. |
| "permission denied … free tier may not be offered in your country" | See the region note in section 2. |
| "You hit the free-tier limit" | Wait a minute and try again. |
| "Google does not know the model …" | Fix or remove `GEMINI_MODEL` in `.env.local`. |
| "safety filter blocked this content" | Try a different document, or fill the form in by hand. |
| No purple panels at all | The page was served without the AI server (for example a static host). They hide themselves by design; run via `npm run dev`. |
| iPhone photo "can't read" | HEIC is not supported. Use a screenshot, JPEG, PNG or PDF. |

## 7. A tiny TypeScript/React map for this repo

- **`types.ts`-style files** describe the shape of data (`interface Claim { … }`). TypeScript checks that every file agrees. `npm run typecheck` is your safety net: if it is silent, the shapes line up.
- **A component** (`AiScanPanel.tsx`) is a function that returns the HTML-like markup (JSX) for one piece of the screen. Its inputs are **props** (`draft`, `setDraft`).
- **`useState`** holds values that change on screen (`busy`, `error`). Calling its setter re-draws the component.
- **`async` / `await`** means "wait for the server's answer without freezing the page". See `read()` in `AiScanPanel.tsx`.
- **`services/`** is the only place the screens talk to data. `aiService.ts` talks to our AI server, the same pattern the repo already uses for claims.
- **Tests** (`npm test`) pin the important behaviour: the AI never overwrites typed values, the assistant never sees internal notes, and the request to Google has exactly the right shape.

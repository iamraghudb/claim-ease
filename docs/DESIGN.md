# ClaimEase design system

A calm, modern healthcare-tech look: light surfaces, generous spacing, one confident teal, and a distinct indigo for anything AI produced. If you are changing a screen, follow these rules so the whole app stays consistent.

## Principles

1. **The story is the product.** Upload a bill → AI fills the claim → track it → adjuster decides. Every screen should make its one next action obvious.
2. **Show, don't disclaim.** No "demo", "mock", "simulated", "illustrative", "MVP" or "hackathon" wording on screens. Caveats live in a `<InfoTip>` or the single footer line, never in repeated paragraphs.
3. **Plain English, sentence case.** Buttons start with a verb ("Send request", "Approve claim"). No jargon without an explanation.
4. **AI is always recognisable and never silent.** It uses the indigo `ai-*` colours, the `AiBadge`, and always shows its work.
5. **Mobile first.** Everything works at 375px wide. Tables become card lists on small screens.

## Tokens (`src/index.css`)

| Token | Use |
|---|---|
| `brand-50…900` (teal) | Primary actions, links, active nav. Use `brand-600` for buttons (passes contrast with white text), `brand-50/100` for tinted backgrounds |
| `ai-50…900` (indigo) | AI features only |
| `canvas` | Page background |
| `shadow-soft` / `shadow-lift` / `shadow-pop` | Cards / hovered cards / menus & modals |
| Status colours | Only via `src/components/badges.tsx` (`StatusBadge`, `SlaBadge`, `PriorityBadge`…) |
| Semantic | emerald = good, amber = needs attention, red = problem/denied |

Font: **Plus Jakarta Sans** (loaded in `index.html`).

## Shape and spacing

- Cards: `card` class (`rounded-2xl`, hairline border, soft shadow). Interactive cards add `card-hover`.
- Controls (buttons, inputs, menus): `rounded-xl`. Small buttons and chips: `rounded-lg` / `rounded-full`.
- Page rhythm: `space-y-6` between sections, `gap-6` in grids, `p-5` inside cards.
- Page titles: `PageHeader` (`text-2xl sm:text-3xl font-bold`). Section labels: `eyebrow` class (small uppercase grey).
- Page content width and horizontal padding come from `Layout`; do not add another max-width wrapper.

## Components to reuse (`src/components/ui.tsx`)

`Button` (variants: primary, secondary, ghost, danger, success, **ai**), `ButtonLink`, `Card`, `Field`, `Alert`, `Pill`, `InfoTip`, `Avatar`, `StatCard`, `EmptyState`, `Skeleton`, `Spinner`, `Modal`, `Tabs` (segmented control), `PageHeader`, `DescriptionList`.
From `badges.tsx`: `StatusBadge`, `SlaBadge`, `SlaInfo` (the one place the "targets, not legal deadlines" caveat lives), `ClaimTypeIcon`, `ClaimTypeTag`, `PriorityBadge`, `ComplexityBadge`, `FastTrackBadge`.

## The AI look

- Surface: `ai-surface` class (indigo-tinted gradient, rounded-2xl) with `p-5`.
- Primary AI action: `<Button variant="ai">`. Output is marked with `<AiBadge />` (`src/components/AiBadge.tsx`), which switches to an amber "Demo data" pill when no API key is configured.
- Confidence: green = high, amber = medium, red = low.

## Do not

- Do not hard-code hex colours in components (charts excepted: use the status chart colours from `badges.tsx` or the brand ramp).
- Do not add `violet-*` for AI (use `ai-*`); `violet` stays only for the Adjudication status colour.
- Do not repeat a disclaimer paragraph. Use `<SlaInfo />` / `<InfoTip>`.
- Do not change domain logic, services, props of shared components, or test-covered behaviour while restyling.

## Ease, the AI guide

The AI is one character with one name: **Ease**. "Ask Ease", "Tell Ease what happened", "Ease says". Never "the AI" or the model/vendor name in user-facing copy (the only exception is the one-line privacy note on file uploads).

### Voice
Warm, brief, plain English. First person ("I"). One idea per sentence. Explain any insurance term in a few words. No emoji, no exclamation-mark pile-ups, no "As an AI…". Never promise a coverage outcome, a payment or a timeline; times are targets. Sympathetic in one short sentence when something bad happened, then helpful.

### Building blocks (all in `src/components/ai.tsx` unless noted)
| Piece | Use |
|---|---|
| `EaseAvatar` | Ease's face (sparkle on an indigo→teal gradient). `pulse` makes it ring a few times. |
| `AiCard` | The card for anything Ease produces on its own (brief, summary, insights). Handles title, `AiBadge`, refresh button and the loading state. |
| `AiThinking` | The "Ease is working" look: rotating status line plus shimmering placeholder lines. Always show it while waiting. |
| `Typewriter` | Reveals text as if Ease is writing it. Use for conversational answers, not for data. |
| `AiBadge` (`src/components/AiBadge.tsx`) | `<AiBadge source={result.source} />` on every AI result: purple "AI", or amber "Demo data" when there is no key. |
| `ai-surface` class, `Button variant="ai"`, `ai-*` colours | The indigo look. AI only. |

### Data hooks
- `useAiStatus()` (`src/store/useAiStatus.ts`): `undefined` loading, `null` = no AI server (render nothing and let the screen work without AI), otherwise `{ configured, model }`.
- `useAiResource(namespace, input, load)` (`src/store/useAiResource.ts`): runs an AI call **once per distinct input and remembers the answer** (6h, localStorage). Use it for things that should appear by themselves (a claim brief, a status summary). Pass `null` as input to do nothing yet. Returns `{ data, loading, error, refresh }`. Everything else is **on request** (a button), never automatic.
- `useCopilotPage(page)` (`src/features/copilot/pages.ts`): tell Ease what the screen shows: `{ path, title, summary, data, suggestions }`. `data` must be a small JSON-safe snapshot containing only what the current user may see. Call it with `null` until the data has loaded.
- `useCopilotStore.getState().ask("question")` opens "Ask Ease" and asks it something (for "Explain this to me" buttons).
- Calls: `aiService.scan / intake / chat / brief / draft / insights / photo / explain / gaps` (`src/services/aiService.ts`). Types are in `src/domain/aiTypes.ts`.

### Rules
1. **Humans decide.** AI proposes and drafts; a person confirms, edits and submits. Drafts land in editable fields, labelled as drafts.
2. **Rules have the last word.** The rules engine and the readiness checklist stay authoritative; AI advice never overrides them.
3. **Never block on AI.** The screen must be fully usable while an AI result loads, fails, or does not exist. Show `AiThinking` while loading and a small non-blocking message on error.
4. **Least data.** Send only what the current user already sees (`buildClaimContext`, `buildStaffContext`, `buildDraftContext`). No names, IDs or contact details.
5. **Free-tier friendly.** Automatic AI only for the few moments that make a screen feel alive, always through `useAiResource` so repeat views cost nothing.
6. **Always badge it.** Every AI result carries `AiBadge` with its `source`.

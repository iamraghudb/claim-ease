// Demo mode for the newer features: what the endpoints return with no API key.
// Everything here is tagged source: 'demo' and the UI badges it, so nobody mistakes it for the real AI.
// Where a sensible answer can be worked out from the data itself (the brief, the insights), it is, so demo
// mode is still useful. Smart start follows a fixed script of questions.

import type {
  BriefAction,
  BriefResult,
  CopilotAction,
  CopilotRequest,
  CopilotResult,
  DraftRequest,
  DraftResult,
  InsightsRequest,
  InsightsResult,
  IntakeField,
  IntakeKey,
  IntakeRequest,
  IntakeResult,
  PhotoRequest,
  PhotoResult,
  StaffClaimContext,
} from '../src/domain/aiTypes';

// ---------- copilot ----------

export function demoCopilot(req: CopilotRequest): CopilotResult {
  const go = (label: string, to: string): CopilotAction[] => (req.page.path === to ? [] : [{ label, to }]);
  const actions: Record<CopilotRequest['role'], CopilotAction[]> = {
    CLAIMANT: go('Start a claim', '/file'),
    PROVIDER: go('Submit a claim', '/file'),
    ADJUSTER: go('Open the work queue', '/queue'),
    ADMIN: go('Open the dashboard', '/admin'),
  };
  return {
    source: 'demo',
    answer: `${req.page.summary || 'I can help you find your way around.'} I'm running without an AI key, so I can describe this screen but not reason about it yet.`,
    followUps: [],
    actions: actions[req.role],
  };
}

// ---------- Smart start (a fixed script of questions) ----------

type Kind = 'AUTO' | 'PROPERTY' | 'HEALTH';
const ORDER: Record<Kind, IntakeKey[]> = {
  AUTO: ['policyNumber', 'dateOfLoss', 'description', 'vehicleDamage', 'drivable', 'injuries', 'estimatedAmount'],
  PROPERTY: ['policyNumber', 'dateOfLoss', 'description', 'damageType', 'habitable', 'estimatedAmount'],
  HEALTH: ['policyNumber', 'dateOfLoss', 'description', 'patientName'],
};
const QUESTION: Partial<Record<IntakeKey, { ask: string; quick?: string[] }>> = {
  policyNumber: { ask: 'Which policy is this for?' },
  dateOfLoss: { ask: 'When did it happen?', quick: ['Today', 'Yesterday'] },
  description: { ask: 'Tell me what happened, in your own words.' },
  vehicleDamage: { ask: 'What got damaged?' },
  drivable: { ask: 'Is the car drivable?', quick: ['Yes', 'No'] },
  injuries: { ask: 'Was anyone hurt?', quick: ['No', 'Yes'] },
  damageType: { ask: 'What kind of damage is it? For example water, fire, wind or theft.' },
  habitable: { ask: 'Is the home livable right now?', quick: ['Yes', 'No'] },
  estimatedAmount: { ask: 'Roughly how much do you think it will cost?' },
  patientName: { ask: 'Who was the patient?' },
};
const LABEL: Partial<Record<IntakeKey, string>> = {
  policyNumber: 'Which policy',
  dateOfLoss: 'Date it happened',
  description: 'What happened',
  vehicleDamage: 'What was damaged',
  drivable: 'Whether the car is drivable',
  injuries: 'Whether anyone was hurt',
  damageType: 'The kind of damage',
  habitable: 'Whether the home is livable',
  estimatedAmount: 'A rough amount',
  patientName: 'The patient',
};

function inferKind(text: string): Kind | undefined {
  if (/\b(car|vehicle|crash|collision|rear[- ]?end|bumper|windshield|truck|hit and run|accident)\b/i.test(text)) return 'AUTO';
  if (/\b(water|pipe|leak|roof|fire|storm|burglar|break[- ]?in|house|home|kitchen|flood|ceiling|apartment)\b/i.test(text)) return 'PROPERTY';
  if (/\b(doctor|hospital|clinic|surgery|bill|visit|mri|medical|x-?ray|er)\b/i.test(text)) return 'HEALTH';
  return undefined;
}

const shift = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDate(text: string, today: string): string | undefined {
  if (/\btoday\b|\bthis morning\b|\btonight\b/i.test(text)) return today;
  if (/\byesterday\b/i.test(text)) return shift(today, -1);
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso && iso <= today) return iso;
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (us) {
    const year = us[3] ? (us[3].length === 2 ? `20${us[3]}` : us[3]) : today.slice(0, 4);
    const d = `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    if (d <= today) return d;
  }
  const day = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  if (day >= 0) {
    const todayDay = new Date(`${today}T12:00:00Z`).getUTCDay();
    return shift(today, -(((todayDay - day + 7) % 7) || 7));
  }
  return undefined;
}

const yesNo = (t: string) => (/\b(yes|yeah|yep|y)\b/i.test(t) ? 'yes' : /\b(no|nope|nobody|none|n)\b/i.test(t) ? 'no' : undefined);

export function demoIntake(req: IntakeRequest): IntakeResult {
  const last = [...req.conversation].reverse().find((t) => t.role === 'user')?.text ?? '';
  const known: Record<string, string> = { ...req.known };
  const fields: IntakeField[] = [];
  const set = (key: IntakeKey, value: string | undefined) => {
    if (!value || known[key]) return;
    known[key] = value;
    fields.push({ key, value, confidence: 'medium' });
  };

  const order = () => ORDER[(known.claimType as Kind) ?? 'AUTO'];
  const asked: IntakeKey | undefined = known.claimType ? order().find((k) => !known[k]) : 'policyNumber';

  // Work out the kind of claim, then the policy.
  const kind = (known.claimType as Kind | undefined) ?? inferKind(last);
  if (kind) known.claimType = kind;
  if (!known.policyNumber) {
    const want = (t: string) => (kind === 'PROPERTY' ? t === 'HOME' || t === 'RENTERS' : t === kind);
    const typed = req.policies.filter((p) => want(p.type));
    const named = req.policies.find((p) => last.toUpperCase().includes(p.policyNumber) || last.toLowerCase().includes(p.label.toLowerCase()));
    const typedPlan = last.toUpperCase().match(/POL-\d{6}/)?.[0];
    if (named) set('policyNumber', named.policyNumber);
    else if (typed.length === 1) set('policyNumber', typed[0].policyNumber);
    else if (!req.policies.length && typedPlan) set('policyNumber', typedPlan);
  }
  const policy = req.policies.find((p) => p.policyNumber === known.policyNumber);
  if (policy) known.claimType = policy.type === 'AUTO' ? 'AUTO' : policy.type === 'HEALTH' ? 'HEALTH' : 'PROPERTY';

  set('dateOfLoss', parseDate(last, req.today));

  // Anything said in answer to the last question lands on that question.
  if (asked === 'description' || (!known.description && last.length >= 20)) set('description', last);
  if (asked === 'vehicleDamage') set('vehicleDamage', last);
  if (asked === 'damageType') {
    const hit = ['FIRE', 'WATER', 'WIND', 'HAIL', 'THEFT', 'VANDALISM', 'FLOOD', 'EARTHQUAKE', 'MOLD'].find((w) => new RegExp(w, 'i').test(last));
    set('damageType', hit);
  }
  if (asked === 'patientName') set('patientName', last);
  if (asked === 'drivable' || asked === 'injuries' || asked === 'habitable') set(asked, yesNo(last));
  if (asked === 'estimatedAmount') {
    const n = Number(last.replace(/[^0-9.]/g, ''));
    if (n > 0) set('estimatedAmount', String(n));
  }
  if (known.claimType === 'AUTO' && !known.vehicleDamage) set('vehicleDamage', last.match(/\b(rear bumper|front bumper|bumper|windshield|hood|door|fender|trunk|tail ?light)\b/i)?.[0]);

  const next = known.claimType ? order().find((k) => !known[k]) : 'policyNumber';
  const sympathetic = /\b(accident|crash|stolen|fire|flood|leak|burst|hurt|injur)/i.test(last) && req.conversation.length <= 2 ? "I'm sorry that happened. " : '';
  if (!next) {
    return { source: 'demo', reply: `${sympathetic}That's everything I need. Let's look it over together before you submit.`, fields, quickReplies: [], done: true, stillNeeded: [] };
  }
  const q = known.claimType ? QUESTION[next] : { ask: 'What kind of claim is this: auto, home or health?', quick: ['Auto', 'Home', 'Health'] };
  const ask = next === 'policyNumber' && req.policies.length > 1 ? `Which policy is this for? ${req.policies.map((p) => p.label).join(', ')}.` : q?.ask ?? 'Tell me more.';
  return {
    source: 'demo',
    reply: `${sympathetic}${fields.length ? 'Got it. ' : ''}${ask}`,
    fields,
    quickReplies: next === 'policyNumber' && req.policies.length > 1 ? req.policies.slice(0, 4).map((p) => p.label) : (q?.quick ?? []),
    done: false,
    stillNeeded: (known.claimType ? order() : (['policyNumber'] as IntakeKey[])).filter((k) => !known[k]).map((k) => LABEL[k] ?? k),
  };
}

// ---------- staff brief (worked out from the rules engine's own output) ----------

export function demoBrief(ctx: StaffClaimContext): BriefResult {
  const failed = ctx.checks.filter((c) => c.status === 'FAIL');
  const warned = ctx.checks.filter((c) => c.status === 'WARN');
  const fraud = ctx.triggers.some((t) => /fraud|duplicate|frequent|new policy/i.test(t.label));
  const missing = ctx.triggers.some((t) => /missing/i.test(t.label)) || ctx.checks.some((c) => /required/i.test(c.label) && c.status !== 'PASS');

  let action: BriefAction = 'APPROVE';
  let why = 'Every check passes and uncertainty is low.';
  if (ctx.openInfoRequests > 0) [action, why] = ['WAIT', 'Information has been requested and is still outstanding.'];
  else if (failed.length) [action, why] = ['INVESTIGATE', `${failed[0].label} did not pass: ${failed[0].explanation}`];
  else if (missing) [action, why] = ['REQUEST_INFO', 'Required documents or data are missing.'];
  else if (fraud) [action, why] = ['INVESTIGATE', 'The fraud indicators need a closer look first.'];
  else if (warned.length || ctx.uncertaintyScore >= 40) [action, why] = ['INVESTIGATE', 'Several checks need a human decision before this can be approved.'];

  return {
    source: 'demo',
    headline: `${ctx.claimType[0]}${ctx.claimType.slice(1).toLowerCase()} claim, ${ctx.priority.toLowerCase()} priority, ${ctx.fastTrackEligible ? 'fast-track eligible' : `${ctx.complexity.toLowerCase()} complexity`}`,
    summary: `${ctx.statusMeaning} ${ctx.checks.filter((c) => c.status === 'PASS').length} of ${ctx.checks.length} checks pass and uncertainty is ${ctx.uncertaintyScore}/100.`,
    risks: ctx.triggers.slice(0, 4).map((t, i) => ({ title: t.label, plain: t.explanation, severity: i === 0 ? 'high' : i === 1 ? 'medium' : 'low' })),
    recommended: { action, why },
    verify: ctx.triggers.slice(0, 3).map((t) => `Check: ${t.label.toLowerCase()}`),
  };
}

// ---------- drafts ----------

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
const usd = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '');

export function demoDraft(req: DraftRequest): DraftResult {
  const c = req.context;
  switch (req.kind) {
    case 'decision_explanation': {
      const outcome = str(c.outcome, 'decided').replace('_', ' ').toLowerCase();
      const why = [str(c.denialReason, ''), ...(Array.isArray(c.reviewFindings) ? (c.reviewFindings as { detail?: unknown }[]).map((f) => str(f.detail, '')) : [])].filter(Boolean).join('. ');
      return { source: 'demo', text: `Your claim has been ${outcome}${c.approvedAmount !== undefined ? ` for ${usd(c.approvedAmount)}` : ''}. ${why ? `The reason: ${why}.` : str(c.reason, 'We reviewed your policy, the documents you sent and the amount claimed.')} If you disagree with this decision you can file an appeal from your claim page and a different examiner will take another look.` };
    }
    case 'info_request_message': {
      const items = Array.isArray(c.items) ? (c.items as unknown[]).map((i) => String(i)).join(', ') : 'a few more items';
      return { source: 'demo', text: `Hello, to keep your claim moving we need ${items}. You can upload them straight from your claim page. The review clock is paused until we hear back, so there is no rush, but the sooner we have them the sooner we can decide.` };
    }
    case 'appeal_letter':
      return { source: 'demo', text: `I am writing to appeal the decision on my claim. ${str(c.reason, 'The reason I was given does not match what happened.')} ${req.notes ?? ''} I would be grateful if a different examiner could review my claim again with this in mind.`.replace(/\s+/g, ' ').trim() };
    case 'cost_explanation':
      return { source: 'demo', text: `The provider billed ${usd(c.billed)}. Your plan only pays its agreed price for each service (${usd(c.allowed)}), and the provider writes off the rest. From that, your plan pays ${usd(c.planPaid)} and you owe ${usd(c.patientResponsibility)}, which covers your deductible, copay and coinsurance.` };
  }
}

// ---------- insights ----------

export function demoInsights(req: InsightsRequest): InsightsResult {
  const s = req.stats;
  const top = s.topDelayReasons[0];
  return {
    source: 'demo',
    headline: `${s.totalClaims} claims in the system, ${s.decided} decided${s.avgDaysToDecision !== null ? `, taking ${s.avgDaysToDecision} days on average` : ''}.`,
    insights: [
      { title: 'Fast-track share', detail: `${s.fastTrackPct}% of claims are eligible for fast-track.`, tone: s.fastTrackPct >= 50 ? 'good' : 'watch', suggestion: 'Raise the fast-track limits on the Rules & SLA page to send more claims through quickly.' },
      ...(top ? [{ title: 'Biggest cause of delay', detail: `"${top.reason}" is the top delay reason (${top.count} claim${top.count === 1 ? '' : 's'}).`, tone: 'watch' as const, suggestion: 'Ask for this earlier at intake so adjusters do not have to chase it.' }] : []),
      { title: 'Time pressure', detail: `${s.slaAtRisk} at risk and ${s.slaOverdue} overdue against their target times.`, tone: s.slaOverdue > 0 ? ('risk' as const) : s.slaAtRisk > 0 ? ('watch' as const) : ('good' as const), suggestion: 'Check the work queue filtered by overdue first.' },
      { title: 'Denials and appeals', detail: `${s.denialPct}% of decisions are denials, with ${s.appeals} appeal${s.appeals === 1 ? '' : 's'}.`, tone: s.denialPct > 30 ? ('risk' as const) : ('good' as const), suggestion: 'Review denial reasons if the rate keeps climbing.' },
    ],
    answer: req.question ? `I'm running without an AI key, so I can't answer open questions. The headline numbers are above.` : '',
  };
}

// ---------- photo check ----------

export function demoPhoto(req: PhotoRequest): PhotoResult {
  const shots: Record<PhotoRequest['claimType'], string[]> = {
    AUTO: ['A wide shot of the whole vehicle', 'A close-up of each damaged area', "The other vehicle and its plate, if there was one"],
    PROPERTY: ['A wide shot of each affected room', 'A close-up of the damage and its source'],
    HEALTH: ['A clear photo of the itemized bill'],
  };
  return {
    source: 'demo',
    findings: req.photos.map((p) => ({ fileName: p.fileName, quality: 'ok' as const, whatWeSee: 'Sample feedback: add an AI key to see what is really in this photo.', issues: [] })),
    severity: 'unclear',
    summary: 'Demo mode: these are sample suggestions, not a real look at your photos.',
    missingShots: shots[req.claimType],
  };
}

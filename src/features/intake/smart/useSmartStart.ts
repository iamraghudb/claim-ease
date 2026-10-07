import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiSource, ChatTurn, IntakeResult } from '../../../domain/aiTypes';
import type { ClaimType, Policy, Role } from '../../../domain/types';
import { todayIso } from '../../../components/format';
import { aiService, isScannable, policyService } from '../../../services';
import { useIntakeSeed } from '../../../store/intakeSeed';
import type { IntakeDraft } from '../draft';
import {
  applyIntakeFields,
  applyScanToDraft,
  checkPolicy,
  finalizeDraft,
  intakeKnown,
  intakePolicies,
  startDraft,
  stepForDraft,
  type IntakeCtx,
  type PolicyCheck,
} from '../intakeApply';
import { attachText, examples, firstNameOf, greeting, readText, snagText, unreadableText } from './copy';
import { stillNeededLabels } from './claimSummary';
import { sameFile, toPendingDocs } from './files';

// The Smart start conversation: what was said, the claim built from it, and what happens when the person talks,
// taps a suggestion or drops a file. All the real decisions live in intakeApply.ts; this is the glue to the AI service.

export type Turn = { id: string; from: 'user'; text: string } | { id: string; from: 'ease'; text: string; quickReplies?: string[]; error?: boolean };

/** 'scan' while Ease reads a file, 'turn' while it works out what to say next. */
export type Busy = null | 'scan' | 'turn';

const MAX_PER_SCAN = 4;

const toConversation = (turns: Turn[]): ChatTurn[] => turns.filter((t) => !(t.from === 'ease' && t.error)).map((t) => ({ role: t.from === 'user' ? 'user' : 'assistant', text: t.text }));

const kindKnown = (d: IntakeDraft) => !!d.policy || !!d.captured?.includes('claimType');

export function useSmartStart({ role, name, allPolicies, customerId }: { role: Role; name: string; allPolicies: Policy[]; customerId?: string }) {
  const firstName = firstNameOf(name);
  // A provider has no policies of their own: Ease asks for the patient's plan number.
  const policies = useMemo(() => (role === 'PROVIDER' ? [] : intakePolicies(allPolicies, customerId)), [role, allPolicies, customerId]);

  const [turns, setTurns] = useState<Turn[]>(() => [{ id: 'greeting', from: 'ease', text: greeting(role, firstName), quickReplies: examples(role) }]);
  const [draft, setDraft] = useState<IntakeDraft>(() => startDraft(role));
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [busy, setBusyState] = useState<Busy>(null);
  const [verifying, setVerifying] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  // Async work finishes after the render that started it, so it reads the latest values from refs.
  const turnsRef = useRef(turns);
  const draftRef = useRef(draft);
  const busyRef = useRef<Busy>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const counter = useRef(0);
  const sourceRef = useRef<AiSource | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const ctx = (): IntakeCtx => ({ role, today: todayIso(), policies });
  const nextId = () => `t${++counter.current}`;
  const setBusy = (b: Busy) => {
    busyRef.current = b;
    if (alive.current) setBusyState(b);
  };
  const commit = (d: IntakeDraft) => {
    draftRef.current = d;
    if (alive.current) setDraft(d);
  };
  const push = (t: Turn) => {
    turnsRef.current = [...turnsRef.current, t];
    if (alive.current) setTurns(turnsRef.current);
  };
  const easeSays = (text: string, quickReplies?: string[]) => push({ id: nextId(), from: 'ease', text, quickReplies: quickReplies?.length ? quickReplies : undefined });
  const remember = (r: IntakeResult) => {
    sourceRef.current = r.source;
    if (alive.current) setResult(r);
  };

  function clearSnag() {
    retryRef.current = null;
    setCanRetry(false);
    if (turnsRef.current.some((t) => t.from === 'ease' && t.error)) {
      turnsRef.current = turnsRef.current.filter((t) => !(t.from === 'ease' && t.error));
      if (alive.current) setTurns(turnsRef.current);
    }
  }

  function snag(e: unknown, retry: () => void) {
    push({ id: nextId(), from: 'ease', text: snagText(e instanceof Error ? e.message : ''), error: true });
    retryRef.current = retry;
    if (alive.current) setCanRetry(true);
    setBusy(null);
  }

  /** What to offer under Ease's question after the policy check could not confirm something. */
  const chipsAfter = (check: Extract<PolicyCheck, { status: 'failed' }>) =>
    check.cause === 'date' ? ['Today', 'Yesterday'] : policies.length > 1 ? policies.slice(0, 4).map((p) => p.label) : [];

  async function verify(d: IntakeDraft): Promise<PolicyCheck> {
    if (!d.policyNumber || !d.dateOfLoss || d.policy) return { status: 'skipped', draft: d };
    if (alive.current) setVerifying(true);
    try {
      return await checkPolicy(d, role, (policyNumber, date) => policyService.lookup(policyNumber, date));
    } finally {
      if (alive.current) setVerifying(false);
    }
  }

  /** One turn of the conversation: send what was said, apply what Ease learned, then say what it says next. */
  async function runTurn() {
    clearSnag();
    setBusy('turn');
    try {
      const before = draftRef.current;
      const res = await aiService.intake({
        role,
        today: todayIso(),
        policies,
        known: intakeKnown(before),
        documents: (before.scan?.documents ?? []).slice(-MAX_PER_SCAN).map((d) => ({ fileName: d.fileName, documentType: d.documentType, summary: d.summary })),
        conversation: toConversation(turnsRef.current),
      });
      commit(applyIntakeFields(draftRef.current, res.fields, ctx()));
      const check = await verify(draftRef.current);
      commit(check.draft);
      if (check.status === 'failed') {
        // The policy did not check out, so Ease's own next question would be the wrong one: ask about the policy instead.
        easeSays(check.text, chipsAfter(check));
        remember({ ...res, reply: check.text, done: false });
      } else {
        easeSays(res.reply, res.quickReplies);
        remember(res);
      }
      setBusy(null);
    } catch (e) {
      snag(e, () => void runTurn());
    }
  }

  /** The person said something (typed, spoken or tapped). */
  function send(text: string) {
    const said = text.trim();
    if (!said || busyRef.current) return;
    push({ id: nextId(), from: 'user', text: said });
    void runTurn();
  }

  /** Read the new files, fill in the claim from them, then let Ease carry on from what it read. */
  async function readAndContinue(docs: IntakeDraft['documents']) {
    clearSnag();
    const readable = docs.filter((d) => d.file && isScannable(d.file));
    const unreadable = docs.filter((d) => !readable.includes(d)).map((d) => d.fileName);
    const batch = readable.slice(0, MAX_PER_SCAN);

    if (batch.length === 0) {
      if (unreadable.length) easeSays(unreadableText(unreadable));
      await runTurn();
      return;
    }

    setBusy('scan');
    try {
      const known: ClaimType | 'UNKNOWN' = kindKnown(draftRef.current) ? draftRef.current.claimType : 'UNKNOWN';
      const scan = await aiService.scan(
        known,
        batch.map((d) => d.file!),
      );
      const filled = applyScanToDraft(draftRef.current, scan, ctx());
      commit(filled.draft); // the rows in the claim card pop in now, before the policy check finishes
      const check = await verify(filled.draft);
      commit(check.draft);
      const applied = filled.applied + (check.status === 'verified' ? check.applied : 0);

      const extras = [
        readable.length > MAX_PER_SCAN ? `I read the first ${MAX_PER_SCAN} files and kept the rest with your claim.` : '',
        unreadable.length ? unreadableText(unreadable) : '',
      ].filter(Boolean);
      easeSays([readText(scan, applied), ...extras].join(' '));

      if (check.status === 'failed') {
        easeSays(check.text, chipsAfter(check));
        remember({ source: scan.source, reply: check.text, fields: [], quickReplies: [], done: false, stillNeeded: [] });
        setBusy(null);
        return;
      }
    } catch (e) {
      snag(e, () => void readAndContinue(docs));
      return;
    }
    await runTurn();
  }

  /** Files picked or dropped in the chat. */
  async function attach(picked: File[]) {
    if (busyRef.current || picked.length === 0) return;
    setBusy('scan');
    try {
      const have = draftRef.current.documents;
      const fresh = picked.filter((f, i) => !have.some((d) => sameFile(d, f)) && picked.findIndex((g) => g.name === f.name && g.size === f.size) === i);
      if (fresh.length === 0) {
        easeSays(picked.length === 1 ? 'I already have that file.' : 'I already have those files.');
        setBusy(null);
        return;
      }
      const known = draftRef.current;
      const fallback = kindKnown(known) ? (known.claimType === 'HEALTH' ? 'INVOICE' : 'PHOTO') : 'OTHER';
      const docs = await toPendingDocs(fresh, fallback);
      commit({ ...draftRef.current, documents: [...draftRef.current.documents, ...docs] });
      push({ id: nextId(), from: 'user', text: attachText(fresh.map((f) => f.name)) });
      await readAndContinue(docs);
    } catch (e) {
      snag(e, () => void attach(picked));
    }
  }

  function retry() {
    retryRef.current?.();
  }

  /** Hands the claim to the step-by-step form. `review` opens it on the Details step, otherwise where the claim left off. */
  function handOff(review: boolean) {
    const d = finalizeDraft(draftRef.current, sourceRef.current ?? 'ai');
    useIntakeSeed.getState().seed(d, review ? 2 : stepForDraft(d));
  }

  const ready = !!result && !!draft.policy && (result.done || result.stillNeeded.length === 0);
  const stillNeeded = result ? stillNeededLabels(result.stillNeeded, draft, ready) : [];

  return { turns, draft, result, busy, verifying, ready, stillNeeded, canRetry, source: result?.source, firstName, send, attach, retry, handOff };
}

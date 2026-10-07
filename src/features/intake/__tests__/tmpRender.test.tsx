import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../store/useAiStatus', () => ({ useAiStatus: () => ({ configured: false, model: 'x' }) }));

import { buildSeed } from '../../../services/seed';
import { useAppStore } from '../../../store/appStore';
import { applyIntakeFields, applyVerifiedPolicy, intakePolicies, startDraft } from '../intakeApply';
import { ClaimSoFar, ClaimSoFarBar } from '../smart/ClaimSoFar';
import { ChatThread } from '../smart/ChatThread';
import { Composer } from '../smart/Composer';
import FileChooser from '../smart/FileChooser';
import SmartStart from '../smart/SmartStart';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const noop = () => undefined;

describe('smoke render', () => {
  const ctx = { role: 'CLAIMANT' as const, today: '2026-10-07', policies: intakePolicies(seed.policies, 'C-1001') };
  const base = applyIntakeFields(startDraft('CLAIMANT'), [
    { key: 'policyNumber', value: 'POL-100245', confidence: 'high' },
    { key: 'dateOfLoss', value: '2026-09-26', confidence: 'high' },
    { key: 'description', value: 'Rear-ended at a red light.', confidence: 'high' },
    { key: 'drivable', value: 'no', confidence: 'high' },
  ], ctx);
  const draft = applyVerifiedPolicy(base, seed.policies[0], seed.customers[0]).draft;
  const props = { draft, stillNeeded: ['Whether anyone was hurt'], ready: false, verifying: false, onReview: noop, onContinue: noop };

  it('renders the claim card and the mobile bar', () => {
    const html = renderToString(<ClaimSoFar {...props} />);
    expect(html).toContain('Your claim so far');
    expect(html).toContain('Verified');
    expect(html).toContain('Whether anyone was hurt');
    expect(html).toContain('Rear-ended at a red light.');
    const bar = renderToString(<ClaimSoFarBar {...props} ready />);
    expect(bar).toContain('details');
    expect(renderToString(<ClaimSoFar {...props} ready />)).toContain('Review my claim');
    expect(renderToString(<ClaimSoFar {...props} draft={startDraft('CLAIMANT')} stillNeeded={[]} />)).toContain('Nothing yet');
  });

  it('renders the thread in each state', () => {
    const turns = [
      { id: 'g', from: 'ease' as const, text: 'Hi Maria', quickReplies: ['One', 'Two'] },
      { id: 'u', from: 'user' as const, text: 'I was rear-ended' },
      { id: 'e', from: 'ease' as const, text: 'I hit a snag: x. You can try again or use the form.', error: true },
    ];
    const handlers = { onRetry: noop, onQuickReply: noop, onReview: noop, onContinue: noop };
    const html = renderToString(
      <MemoryRouter>
        <ChatThread turns={turns} busy={null} verifying={false} canRetry ready={false} {...handlers} />
      </MemoryRouter>,
    );
    expect(html).toContain('I was rear-ended');
    expect(html).toContain('Try again');
    const busy = renderToString(
      <MemoryRouter>
        <ChatThread turns={turns.slice(0, 2)} busy="scan" verifying={false} canRetry={false} ready={false} {...handlers} />
      </MemoryRouter>,
    );
    expect(busy).toContain('Ease is reading your document');
  });

  it('renders the composer', () => {
    const html = renderToString(<Composer busy={false} onSend={noop} onAttach={noop} footer={<span>footer</span>} />);
    expect(html).toContain('Add a bill, photo or document');
    expect(html).toContain('footer');
  });

  it('renders the chooser and the screen', () => {
    useAppStore.setState({ role: 'CLAIMANT', policies: seed.policies });
    const chooser = renderToString(
      <MemoryRouter>
        <FileChooser />
      </MemoryRouter>,
    );
    expect(chooser).toContain('data-tour="file-choice"');
    expect(chooser).toContain('Fastest');
    expect(chooser).toContain('Tell Ease what happened');
    expect(chooser).toContain('Fill in the form');
    const screen = renderToString(
      <MemoryRouter>
        <SmartStart />
      </MemoryRouter>,
    );
    expect(screen).toContain('Hi Maria');
    expect(screen).toContain('Tell Ease what happened');
    expect(screen).toContain('Choose another way');
    expect(screen).toContain('Your claim so far');
    console.log(screen.length);
  });
});

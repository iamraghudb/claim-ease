import { useState } from 'react';
import { Mail, MessageSquare, Monitor, Phone, Plus } from 'lucide-react';
import type { Claim, CommunicationChannel } from '../domain/types';
import { claimService } from '../services';
import { useAppStore } from '../store/appStore';
import { useClaimAction } from '../store/useClaimAction';
import { formatDateTime, todayIso } from './format';
import { Button, Card, EmptyState, Field, Modal } from './ui';

const CHANNEL_ICONS = { CALL: Phone, EMAIL: Mail, PORTAL: Monitor };
const CHANNEL_LABELS: Record<CommunicationChannel, string> = { CALL: 'Phone call', EMAIL: 'Email', PORTAL: 'Portal message' };

export function CommunicationLog({ claim, readOnly }: { claim: Claim; readOnly?: boolean }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), contactPerson: '', channel: 'CALL' as CommunicationChannel, summary: '', requestedItems: '', response: '' });
  const [error, setError] = useState('');

  async function save() {
    if (!form.contactPerson.trim() || !form.summary.trim()) {
      setError('Contact person and summary are required.');
      return;
    }
    const ok = await run('comm', () => claimService.addCommunication(claim.claimNumber, { ...form, date: new Date(`${form.date}T12:00:00`).toISOString() }, actor), 'Contact logged');
    if (ok) {
      setOpen(false);
      setForm({ date: todayIso(), contactPerson: '', channel: 'CALL', summary: '', requestedItems: '', response: '' });
      setError('');
    }
  }

  const entries = [...claim.communicationLog].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card
      title="Contact log"
      icon={MessageSquare}
      actions={!readOnly && claim.status !== 'CLOSED' && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>Log a contact</Button>}
    >
      {entries.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No contacts logged" message="Note who you spoke to and when. It helps if questions come up later." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => {
            const Icon = CHANNEL_ICONS[e.channel];
            return (
              <li key={e.id} className="flex gap-3 rounded-xl bg-slate-50/80 p-3.5">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-slate-900">
                    {CHANNEL_LABELS[e.channel]} with {e.contactPerson}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(e.date)} · logged by {e.loggedBy}
                  </p>
                  <p className="mt-1 text-slate-700">{e.summary}</p>
                  {e.requestedItems && (
                    <p className="mt-1 text-slate-600">
                      <span className="font-medium">Requested:</span> {e.requestedItems}
                    </p>
                  )}
                  {e.response && (
                    <p className="mt-0.5 text-slate-600">
                      <span className="font-medium">Response:</span> {e.response}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={pending === 'comm'}>Save entry</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="cl-date" required>
            <input id="cl-date" type="date" className="input" value={form.date} max={todayIso()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Channel" htmlFor="cl-channel">
            <select id="cl-channel" className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as CommunicationChannel })}>
              {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Person contacted" htmlFor="cl-person" required hint="Name and role, e.g. “Sam Patel, adjuster” or “Joe’s Body Shop”">
              <input id="cl-person" className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Summary" htmlFor="cl-summary" required error={error || undefined}>
              <textarea id="cl-summary" rows={3} className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
          </div>
          <Field label="Items requested" htmlFor="cl-req">
            <input id="cl-req" className="input" value={form.requestedItems} onChange={(e) => setForm({ ...form, requestedItems: e.target.value })} />
          </Field>
          <Field label="Response / outcome" htmlFor="cl-resp">
            <input id="cl-resp" className="input" value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

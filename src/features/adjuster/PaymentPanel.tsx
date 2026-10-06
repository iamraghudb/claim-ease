import { useState } from 'react';
import { Banknote, Lock } from 'lucide-react';
import type { Claim, PaymentMethod } from '../../domain/types';
import { formatUSD } from '../../domain/rulesEngine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { todayIso } from '../../components/format';
import { Alert, Button, Card, Field } from '../../components/ui';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'ACH', label: 'ACH direct deposit' },
  { value: 'EFT', label: 'EFT (provider)' },
  { value: 'CHECK', label: 'Paper check' },
  { value: 'VIRTUAL_CARD', label: 'Virtual card' },
];

/** Simulated payment step: PAYMENT_PENDING → PAID → CLOSED. No real money moves. */
export function PaymentPanel({ claim }: { claim: Claim }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [method, setMethod] = useState<PaymentMethod>(claim.claimType === 'HEALTH' ? 'EFT' : 'ACH');
  const [amount, setAmount] = useState(String(claim.decision?.approvedAmount ?? 0));
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState(() => `PMT-${Math.floor(100000 + Math.random() * 900000)}`);

  const s = claim.status;
  if (!['APPROVED', 'PARTIALLY_APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(s)) return null;

  return (
    <Card title="Payment" icon={Banknote}>
      {(s === 'APPROVED' || s === 'PARTIALLY_APPROVED') && (
        <div className="space-y-3">
          {s === 'PARTIALLY_APPROVED' && <Alert tone="info">The claimant may appeal the partial approval. You can still pay the undisputed amount now.</Alert>}
          <p className="text-sm text-slate-700">
            Approved amount: <strong>{formatUSD(claim.decision?.approvedAmount ?? 0)}</strong>
          </p>
          <Button onClick={() => run('queue', () => claimService.transition(claim.claimNumber, 'PAYMENT_PENDING', actor), 'Payment queued')} loading={pending === 'queue'}>
            Queue payment
          </Button>
        </div>
      )}
      {s === 'PAYMENT_PENDING' && (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run('pay', () => claimService.issuePayment(claim.claimNumber, { method, amount: Number(amount), date, reference }, actor), 'Payment issued');
          }}
        >
          <Field label="Method" htmlFor="pm-method">
            <select id="pm-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount" htmlFor="pm-amount" hint={Number(amount) !== claim.decision?.approvedAmount ? 'Differs from approved amount' : undefined}>
            <input id="pm-amount" type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Payment date" htmlFor="pm-date">
            <input id="pm-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reference" htmlFor="pm-ref">
            <input id="pm-ref" className="input font-mono" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Lock className="h-3 w-3" aria-hidden /> Simulated: no real payment is made.
            </p>
            <Button type="submit" variant="success" loading={pending === 'pay'} disabled={!(Number(amount) > 0)}>
              Mark payment issued
            </Button>
          </div>
        </form>
      )}
      {s === 'PAID' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            {formatUSD(claim.payment?.amount ?? 0)} paid by {claim.payment?.method} on {claim.payment?.date} (ref {claim.payment?.reference}).
          </p>
          <Button onClick={() => run('close', () => claimService.transition(claim.claimNumber, 'CLOSED', actor, 'Payment complete'), 'Claim closed')} loading={pending === 'close'}>
            Close claim
          </Button>
        </div>
      )}
    </Card>
  );
}

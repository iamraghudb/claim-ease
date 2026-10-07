import { useState, type ReactNode } from 'react';
import { Banknote, CircleCheck } from 'lucide-react';
import type { Claim, PaymentMethod } from '../../domain/types';
import { formatUSD } from '../../domain/rulesEngine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { formatDate, todayIso } from '../../components/format';
import { Alert, Button, Card, cx, Field } from '../../components/ui';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'ACH', label: 'ACH direct deposit' },
  { value: 'EFT', label: 'EFT (provider)' },
  { value: 'CHECK', label: 'Paper check' },
  { value: 'VIRTUAL_CARD', label: 'Virtual card' },
];

/**
 * Payment step: APPROVED → PAYMENT_PENDING → PAID → CLOSED.
 * `embedded` renders it as a section of the claim's action card. In that mode the one-click steps
 * (Queue payment, Close claim) live in the claim summary's next-step bar, so only the details show here.
 */
export function PaymentPanel({ claim, embedded }: { claim: Claim; embedded?: boolean }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [method, setMethod] = useState<PaymentMethod>(claim.claimType === 'HEALTH' ? 'EFT' : 'ACH');
  const [amount, setAmount] = useState(String(claim.decision?.approvedAmount ?? 0));
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState(() => `PMT-${Math.floor(100000 + Math.random() * 900000)}`);

  const s = claim.status;
  if (!['APPROVED', 'PARTIALLY_APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(s)) return null;

  const body = (
    <>
      {(s === 'APPROVED' || s === 'PARTIALLY_APPROVED') && (
        <div className="space-y-3">
          {s === 'PARTIALLY_APPROVED' && <Alert tone="info">The claimant may appeal the partial approval. You can still pay the undisputed amount now.</Alert>}
          <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved amount</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{formatUSD(claim.decision?.approvedAmount ?? 0)}</p>
          </div>
          {embedded ? (
            <p className="text-sm text-slate-600">Ready to pay out. Use Queue payment in the next-step bar to start.</p>
          ) : (
            <Button onClick={() => run('queue', () => claimService.transition(claim.claimNumber, 'PAYMENT_PENDING', actor), 'Payment queued')} loading={pending === 'queue'}>
              Queue payment
            </Button>
          )}
        </div>
      )}
      {s === 'PAYMENT_PENDING' && (
        <form
          className={cx('grid gap-4', !embedded && 'sm:grid-cols-2')}
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
          <Field label="Amount" htmlFor="pm-amount" hint={Number(amount) !== claim.decision?.approvedAmount ? 'Differs from approved amount' : `Approved amount: ${formatUSD(claim.decision?.approvedAmount ?? 0)}`}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
              <input id="pm-amount" type="number" min={0} step="0.01" className="input pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </Field>
          <Field label="Payment date" htmlFor="pm-date">
            <input id="pm-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reference" htmlFor="pm-ref">
            <input id="pm-ref" className="input font-mono" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="success" className="w-full" icon={Banknote} loading={pending === 'pay'} disabled={!(Number(amount) > 0)}>
              Mark payment issued
            </Button>
          </div>
        </form>
      )}
      {s === 'PAID' && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">
            <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            {formatUSD(claim.payment?.amount ?? 0)} paid
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <PaidFact label="Method" value={METHODS.find((m) => m.value === claim.payment?.method)?.label ?? claim.payment?.method} />
            <PaidFact label="Date" value={formatDate(claim.payment?.date)} />
            <PaidFact label="Reference" value={<span className="font-mono">{claim.payment?.reference}</span>} wide />
          </dl>
          {embedded ? (
            <p className="text-sm text-slate-600">Payment is complete. Close the claim from the next-step bar when you are done.</p>
          ) : (
            <Button onClick={() => run('close', () => claimService.transition(claim.claimNumber, 'CLOSED', actor, 'Payment complete'), 'Claim closed')} loading={pending === 'close'}>
              Close claim
            </Button>
          )}
        </div>
      )}
    </>
  );

  if (embedded)
    return (
      <section aria-labelledby="payment-heading">
        <h3 id="payment-heading" className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-slate-900">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Banknote className="h-4 w-4" aria-hidden />
          </span>
          Payment
        </h3>
        {body}
      </section>
    );
  return (
    <Card title="Payment" icon={Banknote}>
      {body}
    </Card>
  );
}

function PaidFact({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('min-w-0', wide && 'col-span-2')}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}

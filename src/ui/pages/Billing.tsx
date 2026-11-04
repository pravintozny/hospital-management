import { Button, Card, DataTable, Field, StatusBadge, useFields } from '../components';
import { useApp } from '../context';
import { dollarsToCents, formatMoney } from '../format';
import type { Discount } from '../../domain/types';

export function Billing() {
  const { s, act } = useApp();
  const f = useFields({ patientId: '', discountType: 'none', discountValue: '0', taxPercent: '5' });
  const discount = (): Discount | null =>
    f.values.discountType === 'percent' ? { type: 'percent', bps: Math.round(Number(f.values.discountValue) * 100) }
    : f.values.discountType === 'fixed' ? { type: 'fixed', cents: dollarsToCents(f.values.discountValue) } : null;
  const opts = () => ({ discount: discount(), taxRateBps: Math.round(Number(f.values.taxPercent) * 100) });

  let preview: ReturnType<typeof s.billing.preview> | null = null;
  let previewError = '';
  if (f.values.patientId) {
    try { preview = s.billing.preview(f.values.patientId, opts()); } catch (e) { previewError = (e as Error).message; }
  }

  return (
    <div className="grid two">
      <Card title="Generate invoice">
        <div className="form">
          <Field label="Patient"><select {...f.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Discount type"><select {...f.bind('discountType')}><option value="none">None</option><option value="percent">Percent</option><option value="fixed">Fixed ($)</option></select></Field>
          <Field label="Discount value"><input type="number" {...f.bind('discountValue')} /></Field>
          <Field label="Tax rate (%)"><input type="number" {...f.bind('taxPercent')} /></Field>
        </div>
        {previewError && <p className="muted">{previewError}</p>}
        {preview && (
          <div aria-label="Invoice preview">
            <DataTable rows={preview.lines} rowKey={(l) => `${l.sourceType}-${l.sourceId}-${l.description}`} empty="Nothing to bill" columns={[
              { header: 'Category', render: (l) => l.category }, { header: 'Description', render: (l) => l.description },
              { header: 'Qty', render: (l) => l.quantity }, { header: 'Unit', render: (l) => formatMoney(l.unitPriceCents) }, { header: 'Amount', render: (l) => formatMoney(l.amountCents) },
            ]} />
            <p>Subtotal {formatMoney(preview.subtotalCents)} − Discount {formatMoney(preview.discountCents)} + Tax {formatMoney(preview.taxCents)} = <strong>{formatMoney(preview.totalCents)}</strong></p>
          </div>
        )}
        <Button disabled={!preview?.lines.length} onClick={() => act(() => s.billing.createInvoice(f.values.patientId, opts()), 'Invoice created')}>Create invoice</Button>
      </Card>
      <Card title="Invoices">
        <DataTable rows={s.billing.list()} rowKey={(i) => i.id} columns={[
          { header: 'ID', render: (i) => i.id }, { header: 'Patient', render: (i) => s.db.patients.get(i.patientId)?.name },
          { header: 'Total', render: (i) => formatMoney(i.totalCents) }, { header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          { header: '', render: (i) => i.status === 'issued' && (
            <span className="row">
              <Button variant="secondary" onClick={() => act(() => s.billing.markPaid(i.id), 'Invoice paid')}>Mark paid</Button>
              <Button variant="danger" onClick={() => act(() => s.billing.void(i.id), 'Invoice voided')}>Void</Button>
            </span>) },
        ]} />
      </Card>
    </div>
  );
}

import { Badge, Button, Card, DataTable, Field, StatusBadge, useFields } from '../components';
import { useApp } from '../context';
import { dollarsToCents, formatMoney } from '../format';

export function Pharmacy() {
  const { s, act } = useApp();
  const m = useFields({ name: '', sku: '', price: '', reorder: '10' });
  const b = useFields({ medicineId: '', batchNumber: '', expiryDate: '', quantity: '' });
  const rx = useFields({ patientId: '', doctorId: '', medicineId: '', quantity: '1', dosage: '' });
  const levels = s.pharmacy.stockLevels();
  const nameOf = (id: string) => s.db.medicines.get(id)?.name ?? id;
  return (
    <div className="grid two">
      <div>
        <Card title="Low-stock alerts">
          {s.pharmacy.lowStockAlerts().length === 0 ? <p className="muted">All medicines sufficiently stocked</p> :
            <ul>{s.pharmacy.lowStockAlerts().map((l) => <li key={l.medicine.id}><Badge tone="danger">Low</Badge> {l.medicine.name} ({l.medicine.sku}): {l.sellable} / reorder {l.medicine.reorderLevel}</li>)}</ul>}
          {s.pharmacy.expiringBatches().map((x) => <p key={x.id}><Badge tone="warning">Expiring</Badge> {nameOf(x.medicineId)} batch {x.batchNumber} on {x.expiryDate}</p>)}
        </Card>
        <Card title="Add medicine">
          <div className="form">
            <Field label="Medicine name"><input {...m.bind('name')} /></Field>
            <Field label="SKU"><input {...m.bind('sku')} /></Field>
            <Field label="Unit price ($)"><input type="number" {...m.bind('price')} /></Field>
            <Field label="Reorder level"><input type="number" {...m.bind('reorder')} /></Field>
            <Button onClick={() => act(() => s.pharmacy.addMedicine({ name: m.values.name, sku: m.values.sku, unitPriceCents: dollarsToCents(m.values.price), reorderLevel: Number(m.values.reorder) }), 'Medicine added') && m.reset()}>Add medicine</Button>
          </div>
        </Card>
        <Card title="Receive stock batch">
          <div className="form">
            <Field label="Medicine"><select {...b.bind('medicineId')}><option value="">Select…</option>{levels.map((l) => <option key={l.medicine.id} value={l.medicine.id}>{l.medicine.name}</option>)}</select></Field>
            <Field label="Batch number"><input {...b.bind('batchNumber')} /></Field>
            <Field label="Expiry (YYYY-MM-DD)"><input {...b.bind('expiryDate')} /></Field>
            <Field label="Quantity"><input type="number" {...b.bind('quantity')} /></Field>
            <Button onClick={() => act(() => s.pharmacy.receiveBatch({ ...b.values, quantity: Number(b.values.quantity) }), 'Batch received') && b.reset()}>Receive</Button>
          </div>
        </Card>
        <Card title="New prescription (single item)">
          <div className="form">
            <Field label="Patient"><select {...rx.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Prescriber"><select {...rx.bind('doctorId')}><option value="">Select…</option>{s.doctors.list({ activeOnly: true }).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Prescribed medicine"><select {...rx.bind('medicineId')}><option value="">Select…</option>{levels.map((l) => <option key={l.medicine.id} value={l.medicine.id}>{l.medicine.name}</option>)}</select></Field>
            <Field label="Prescribed quantity"><input type="number" {...rx.bind('quantity')} /></Field>
            <Field label="Dosage"><input {...rx.bind('dosage')} /></Field>
            <Button onClick={() => act(() => s.pharmacy.prescribe({ patientId: rx.values.patientId, doctorId: rx.values.doctorId, items: [{ medicineId: rx.values.medicineId, quantity: Number(rx.values.quantity), dosage: rx.values.dosage }] }), 'Prescription created')}>Prescribe</Button>
          </div>
        </Card>
      </div>
      <div>
        <Card title="Inventory">
          <DataTable rows={levels} rowKey={(l) => l.medicine.id} columns={[
            { header: 'SKU', render: (l) => l.medicine.sku }, { header: 'Medicine', render: (l) => l.medicine.name },
            { header: 'Price', render: (l) => formatMoney(l.medicine.unitPriceCents) }, { header: 'In stock', render: (l) => l.sellable },
            { header: 'Expired', render: (l) => l.expired }, { header: 'Status', render: (l) => l.low ? <Badge tone="danger">Low stock</Badge> : <Badge tone="success">OK</Badge> },
          ]} />
        </Card>
        <Card title="Batches">
          <DataTable rows={[...s.db.batches.values()]} rowKey={(x) => x.id} columns={[
            { header: 'Medicine', render: (x) => nameOf(x.medicineId) }, { header: 'Batch', render: (x) => x.batchNumber },
            { header: 'Expiry', render: (x) => x.expiryDate }, { header: 'Qty', render: (x) => x.quantity },
          ]} />
        </Card>
        <Card title="Prescriptions">
          <DataTable rows={s.pharmacy.listPrescriptions()} rowKey={(r) => r.id} columns={[
            { header: 'ID', render: (r) => r.id }, { header: 'Patient', render: (r) => s.db.patients.get(r.patientId)?.name },
            { header: 'Items', render: (r) => r.items.map((i) => `${nameOf(i.medicineId)} ×${i.quantity}`).join(', ') },
            { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { header: '', render: (r) => r.status === 'pending' && (
              <span className="row">
                <Button variant="secondary" onClick={() => act(() => s.pharmacy.dispense(r.id), 'Prescription dispensed')}>Dispense</Button>
                <Button variant="danger" onClick={() => act(() => s.pharmacy.cancelPrescription(r.id), 'Prescription cancelled')}>Cancel</Button>
              </span>) },
          ]} />
        </Card>
      </div>
    </div>
  );
}

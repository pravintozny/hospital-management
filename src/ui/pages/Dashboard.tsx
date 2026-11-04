import { Badge, Card, DataTable, ProgressBar, StatCard } from '../components';
import { useApp } from '../context';
import { formatMoney, pct } from '../format';

export function Dashboard() {
  const { s } = useApp();
  const d = s.reporting.dashboard();
  return (
    <div>
      <div className="grid stats">
        <StatCard label="Patients" value={d.patients.total} hint={`${d.patients.admitted} admitted`} />
        <StatCard label="Appointments" value={d.appointments.total} hint={`${d.appointments.scheduled} scheduled`} />
        <StatCard label="Revenue collected" value={formatMoney(d.revenue.collectedCents)} hint={`${formatMoney(d.revenue.outstandingCents)} outstanding`} />
        <StatCard label="Bed occupancy" value={pct(d.beds.occupancyRate)} hint={`${d.beds.occupied}/${d.beds.total} beds`} />
      </div>
      <div className="grid two">
        <Card title="Appointments by status">
          <DataTable
            rows={(['scheduled', 'completed', 'cancelled', 'no_show'] as const).map((k) => ({ k, n: d.appointments[k] }))}
            rowKey={(r) => r.k}
            columns={[{ header: 'Status', render: (r) => r.k.replace('_', ' ') }, { header: 'Count', render: (r) => r.n }]}
          />
          <p className="muted">Cancellation rate: {pct(d.appointments.cancellationRate)}</p>
        </Card>
        <Card title="Revenue by category (gross)">
          <DataTable
            rows={Object.entries(d.revenue.grossByCategory)}
            rowKey={([k]) => k}
            columns={[{ header: 'Category', render: ([k]) => k }, { header: 'Amount', render: ([, v]) => formatMoney(v) }]}
          />
          <p className="muted">Discounts {formatMoney(d.revenue.discountsCents)} · Tax {formatMoney(d.revenue.taxCents)}</p>
        </Card>
        <Card title="Bed occupancy by ward">
          {d.beds.wards.map((w) => (
            <div key={w.ward.id} className="ward-row">
              <span>{w.ward.name} ({w.occupied}/{w.total})</span>
              <ProgressBar label={`${w.ward.name} occupancy`} value={w.total ? w.occupied / w.total : 0} />
            </div>
          ))}
        </Card>
        <Card title="Pharmacy inventory">
          <p>Stock value: <strong>{formatMoney(d.pharmacy.stockValueCents)}</strong></p>
          {d.pharmacy.lowStock.length === 0 ? <p className="muted">No low-stock alerts</p> : (
            <ul>{d.pharmacy.lowStock.map((l) => (
              <li key={l.medicine.id}><Badge tone="danger">Low</Badge> {l.medicine.name}: {l.sellable} left (reorder at {l.medicine.reorderLevel})</li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}

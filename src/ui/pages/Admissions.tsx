import { Button, Card, DataTable, Field, StatusBadge, useFields } from '../components';
import { useApp } from '../context';
import { formatMoney } from '../format';

export function Admissions() {
  const { s, act } = useApp();
  const f = useFields({ patientId: '', doctorId: '', bedId: '', reason: '' });
  const beds = s.admissions.listBeds();
  return (
    <div className="grid two">
      <div>
        <Card title="Admit patient">
          <div className="form">
            <Field label="Patient"><select {...f.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Attending doctor"><select {...f.bind('doctorId')}><option value="">Select…</option>{s.doctors.list({ activeOnly: true }).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Bed"><select {...f.bind('bedId')}><option value="">Select…</option>{s.admissions.listBeds({ availableOnly: true }).map(({ bed, room, ward }) => <option key={bed.id} value={bed.id}>{ward.name} / {room.number} / {bed.label} ({formatMoney(bed.dailyRateCents)}/day)</option>)}</select></Field>
            <Field label="Reason"><input {...f.bind('reason')} /></Field>
            <Button onClick={() => act(() => s.admissions.admit(f.values), 'Patient admitted') && f.reset()}>Admit</Button>
          </div>
        </Card>
        <Card title="Bed availability">
          <DataTable rows={s.admissions.wardAvailability()} rowKey={(w) => w.ward.id} columns={[
            { header: 'Ward', render: (w) => w.ward.name }, { header: 'Total', render: (w) => w.total },
            { header: 'Available', render: (w) => w.available }, { header: 'Occupied', render: (w) => w.occupied }, { header: 'Maintenance', render: (w) => w.maintenance },
          ]} />
          <DataTable rows={beds} rowKey={(b) => b.bed.id} columns={[
            { header: 'Bed', render: (b) => `${b.ward.name} / ${b.room.number} / ${b.bed.label}` },
            { header: 'Status', render: (b) => <StatusBadge status={b.bed.status} /> },
            { header: '', render: (b) => b.bed.status !== 'occupied' && (
              <Button variant="secondary" onClick={() => act(() => s.admissions.setBedMaintenance(b.bed.id, b.bed.status !== 'maintenance'))}>
                {b.bed.status === 'maintenance' ? 'Return to service' : 'Maintenance'}
              </Button>) },
          ]} />
        </Card>
      </div>
      <Card title="Admission history">
        <DataTable rows={s.admissions.history()} rowKey={(a) => a.id} columns={[
          { header: 'ID', render: (a) => a.id }, { header: 'Patient', render: (a) => s.db.patients.get(a.patientId)?.name },
          { header: 'Bed', render: (a) => a.bedId }, { header: 'Admitted', render: (a) => a.admittedAt }, { header: 'Discharged', render: (a) => a.dischargedAt ?? '—' },
          { header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          { header: '', render: (a) => a.status === 'active' && <Button variant="secondary" onClick={() => act(() => s.admissions.discharge(a.id), 'Patient discharged')}>Discharge</Button> },
        ]} />
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Button, Card, DataTable, Field, StatusBadge, useFields } from '../components';
import { useApp } from '../context';
import { dollarsToCents, formatMoney } from '../format';

export function Laboratory() {
  const { s, act } = useApp();
  const t = useFields({ code: '', name: '', price: '' });
  const r = useFields({ patientId: '', doctorId: '', testId: '' });
  const [entry, setEntry] = useState<{ id: string; value: string; unit: string } | null>(null);
  return (
    <div className="grid two">
      <div>
        <Card title="Test catalog">
          <DataTable rows={s.lab.listTests()} rowKey={(x) => x.id} columns={[
            { header: 'Code', render: (x) => x.code }, { header: 'Name', render: (x) => x.name }, { header: 'Price', render: (x) => formatMoney(x.priceCents) },
          ]} />
          <div className="form inline">
            <Field label="Test code"><input {...t.bind('code')} /></Field>
            <Field label="Test name"><input {...t.bind('name')} /></Field>
            <Field label="Test price ($)"><input type="number" {...t.bind('price')} /></Field>
            <Button onClick={() => act(() => s.lab.addTest({ code: t.values.code, name: t.values.name, priceCents: dollarsToCents(t.values.price) }), 'Test added') && t.reset()}>Add test</Button>
          </div>
        </Card>
        <Card title="Request test">
          <div className="form">
            <Field label="Patient"><select {...r.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Requesting doctor"><select {...r.bind('doctorId')}><option value="">Select…</option>{s.doctors.list({ activeOnly: true }).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Test"><select {...r.bind('testId')}><option value="">Select…</option>{s.lab.listTests().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Button onClick={() => act(() => s.lab.request(r.values), 'Test requested')}>Request</Button>
          </div>
        </Card>
      </div>
      <Card title="Lab requests">
        <DataTable rows={s.lab.list()} rowKey={(x) => x.id} columns={[
          { header: 'ID', render: (x) => x.id }, { header: 'Patient', render: (x) => s.db.patients.get(x.patientId)?.name },
          { header: 'Test', render: (x) => s.db.labTests.get(x.testId)?.name }, { header: 'Sample', render: (x) => x.sampleId ?? '—' },
          { header: 'Status', render: (x) => <StatusBadge status={x.status} /> }, { header: 'Report', render: (x) => <StatusBadge status={x.reportStatus} /> },
          { header: 'Result', render: (x) => x.result ? `${x.result.value} ${x.result.unit ?? ''}` : '—' },
          { header: 'Actions', render: (x) => (
            <span className="row">
              {x.status === 'requested' && <Button variant="secondary" onClick={() => act(() => s.lab.collectSample(x.id), 'Sample collected')}>Collect sample</Button>}
              {x.status === 'sample_collected' && <Button variant="secondary" onClick={() => setEntry({ id: x.id, value: x.result?.value ?? '', unit: x.result?.unit ?? '' })}>Enter result</Button>}
              {x.reportStatus === 'draft' && <Button variant="secondary" onClick={() => act(() => s.lab.finalizeReport(x.id), 'Report finalised')}>Finalise</Button>}
              {(x.status === 'requested' || x.status === 'sample_collected') && <Button variant="danger" onClick={() => act(() => s.lab.cancel(x.id), 'Request cancelled')}>Cancel</Button>}
            </span>) },
        ]} />
        {entry && (
          <div className="form inline">
            <Field label="Result value"><input value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} /></Field>
            <Field label="Result unit"><input value={entry.unit} onChange={(e) => setEntry({ ...entry, unit: e.target.value })} /></Field>
            <Button onClick={() => act(() => s.lab.recordResult(entry.id, { value: entry.value, unit: entry.unit || undefined }), 'Result saved as draft') && setEntry(null)}>Save draft</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

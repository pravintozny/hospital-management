import { Button, Card, DataTable, Field, useFields } from '../components';
import { useApp } from '../context';
import { DAYS, dollarsToCents, formatMoney } from '../format';

export function Doctors() {
  const { s, act } = useApp();
  const f = useFields({ name: '', specialization: '', departmentId: '', fee: '', days: '1,2,3,4,5', start: '09:00', end: '17:00' });
  const a = useFields({ doctorId: '', patientId: '' });
  const depts = s.doctors.listDepartments();
  const dep = useFields({ name: '' });

  return (
    <div className="grid two">
      <div>
        <Card title="Add department">
          <div className="form inline">
            <Field label="Department name"><input {...dep.bind('name')} /></Field>
            <Button onClick={() => act(() => s.doctors.addDepartment(dep.values.name), 'Department added') && dep.reset()}>Add</Button>
          </div>
        </Card>
        <Card title="Add doctor">
          <div className="form">
            <Field label="Doctor name"><input {...f.bind('name')} /></Field>
            <Field label="Specialization"><input {...f.bind('specialization')} /></Field>
            <Field label="Department">
              <select {...f.bind('departmentId')}><option value="">Select…</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Consultation fee ($)"><input type="number" {...f.bind('fee')} /></Field>
            <Field label="Days (0=Sun … 6=Sat, comma separated)"><input {...f.bind('days')} /></Field>
            <Field label="From"><input {...f.bind('start')} /></Field>
            <Field label="To"><input {...f.bind('end')} /></Field>
            <Button onClick={() => act(() => s.doctors.create({
              name: f.values.name, specialization: f.values.specialization, departmentId: f.values.departmentId,
              consultationFeeCents: dollarsToCents(f.values.fee),
              availability: f.values.days.split(',').filter(Boolean).map((d) => ({ dayOfWeek: Number(d), start: f.values.start, end: f.values.end })),
            }), 'Doctor added') && f.reset()}>Add doctor</Button>
          </div>
        </Card>
        <Card title="Assign patient to doctor">
          <div className="form inline">
            <Field label="Doctor">
              <select {...a.bind('doctorId')}><option value="">Select…</option>{s.doctors.list({ activeOnly: true }).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Field>
            <Field label="Patient">
              <select {...a.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </Field>
            <Button onClick={() => act(() => s.doctors.assign(a.values.doctorId, a.values.patientId), 'Patient assigned')}>Assign</Button>
          </div>
        </Card>
      </div>
      <Card title="Doctors">
        <DataTable rows={s.doctors.list()} rowKey={(d) => d.id} columns={[
          { header: 'Name', render: (d) => d.name },
          { header: 'Specialization', render: (d) => d.specialization },
          { header: 'Department', render: (d) => s.db.departments.get(d.departmentId)?.name },
          { header: 'Fee', render: (d) => formatMoney(d.consultationFeeCents) },
          { header: 'Availability', render: (d) => d.availability.map((x) => `${DAYS[x.dayOfWeek]} ${x.start}-${x.end}`).join('; ') },
          { header: 'Patients', render: (d) => s.doctors.patientsOf(d.id).length },
          { header: '', render: (d) => <Button variant="secondary" onClick={() => act(() => s.doctors.setActive(d.id, !d.active))}>{d.active ? 'Deactivate' : 'Activate'}</Button> },
        ]} />
      </Card>
    </div>
  );
}

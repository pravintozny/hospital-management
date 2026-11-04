import { useState } from 'react';
import { Button, Card, DataTable, Field, StatusBadge, useFields } from '../components';
import { useApp } from '../context';

export function Appointments() {
  const { s, act } = useApp();
  const f = useFields({ patientId: '', doctorId: '', start: '', duration: '30', reason: '' });
  const [resched, setResched] = useState<{ id: string; start: string } | null>(null);
  const today = s.db.now().toISOString().slice(0, 10);
  const slots = f.values.doctorId ? s.appointments.availableSlots(f.values.doctorId, f.values.start.slice(0, 10) || today, Number(f.values.duration) || 30) : [];

  return (
    <div className="grid two">
      <Card title="Book appointment">
        <div className="form">
          <Field label="Patient">
            <select {...f.bind('patientId')}><option value="">Select…</option>{s.patients.search().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
          <Field label="Doctor">
            <select {...f.bind('doctorId')}><option value="">Select…</option>{s.doctors.list({ activeOnly: true }).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
          <Field label="Start (YYYY-MM-DDTHH:mm)"><input placeholder={`${today}T09:00`} {...f.bind('start')} /></Field>
          <Field label="Duration (min)"><input type="number" {...f.bind('duration')} /></Field>
          <Field label="Reason"><input {...f.bind('reason')} /></Field>
          <Button onClick={() => act(() => s.appointments.schedule({
            patientId: f.values.patientId, doctorId: f.values.doctorId, start: f.values.start, durationMinutes: Number(f.values.duration), reason: f.values.reason,
          }), 'Appointment scheduled')}>Book</Button>
          {slots.length > 0 && <p className="muted">Free slots: {slots.join(', ')}</p>}
        </div>
      </Card>
      <Card title="Appointments">
        <DataTable rows={s.appointments.list()} rowKey={(a) => a.id} columns={[
          { header: 'ID', render: (a) => a.id },
          { header: 'Patient', render: (a) => s.db.patients.get(a.patientId)?.name },
          { header: 'Doctor', render: (a) => s.db.doctors.get(a.doctorId)?.name },
          { header: 'When', render: (a) => `${a.start} → ${a.end.slice(11)}` },
          { header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          { header: 'Actions', render: (a) => a.status === 'scheduled' && (
            <span className="row">
              <Button variant="secondary" onClick={() => act(() => s.appointments.complete(a.id), 'Marked completed')}>Complete</Button>
              <Button variant="secondary" onClick={() => setResched({ id: a.id, start: a.start })}>Reschedule</Button>
              <Button variant="danger" onClick={() => act(() => s.appointments.cancel(a.id), 'Appointment cancelled')}>Cancel</Button>
              <Button variant="secondary" onClick={() => act(() => s.appointments.markNoShow(a.id), 'Marked no-show')}>No-show</Button>
            </span>
          ) },
        ]} />
        {resched && (
          <div className="form inline">
            <Field label="New start"><input value={resched.start} onChange={(e) => setResched({ ...resched, start: e.target.value })} /></Field>
            <Button onClick={() => act(() => s.appointments.reschedule(resched.id, resched.start), 'Appointment rescheduled') && setResched(null)}>Confirm</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

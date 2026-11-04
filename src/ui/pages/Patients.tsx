import { useState } from 'react';
import type { Gender } from '../../domain/types';
import { Button, Card, DataTable, Field, useFields } from '../components';
import { useApp } from '../context';

export function Patients() {
  const { s, act } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const f = useFields({ name: '', age: '', gender: 'female', phone: '', email: '', address: '', ecName: '', ecRel: '', ecPhone: '' });
  const h = useFields({ type: 'condition', description: '' });
  const patients = s.patients.search(query);
  const current = selected ? s.patients.get(selected) : null;

  const register = () => {
    const v = f.values;
    const p = act(() => s.patients.register({
      name: v.name, age: Number(v.age), gender: v.gender as Gender, phone: v.phone, email: v.email, address: v.address,
      emergencyContact: { name: v.ecName, relationship: v.ecRel, phone: v.ecPhone },
    }), 'Patient registered');
    if (p) { f.reset(); setSelected(p.id); }
  };

  return (
    <div className="grid two">
      <div>
        <Card title="Register patient">
          <div className="form">
            <Field label="Name"><input {...f.bind('name')} /></Field>
            <Field label="Age"><input type="number" {...f.bind('age')} /></Field>
            <Field label="Gender">
              <select {...f.bind('gender')}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select>
            </Field>
            <Field label="Phone"><input {...f.bind('phone')} /></Field>
            <Field label="Email"><input {...f.bind('email')} /></Field>
            <Field label="Address"><input {...f.bind('address')} /></Field>
            <Field label="Emergency contact name"><input {...f.bind('ecName')} /></Field>
            <Field label="Emergency contact relationship"><input {...f.bind('ecRel')} /></Field>
            <Field label="Emergency contact phone"><input {...f.bind('ecPhone')} /></Field>
            <Button onClick={register}>Register</Button>
          </div>
        </Card>
      </div>
      <div>
        <Card title="Patients">
          <Field label="Search"><input placeholder="Name, ID or phone" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
          <DataTable rows={patients} rowKey={(p) => p.id} columns={[
            { header: 'ID', render: (p) => p.id }, { header: 'Name', render: (p) => p.name },
            { header: 'Age', render: (p) => p.age }, { header: 'Phone', render: (p) => p.phone },
            { header: '', render: (p) => <Button variant="secondary" onClick={() => setSelected(p.id)}>View</Button> },
          ]} />
        </Card>
        {current && (
          <Card title={`Profile: ${current.name}`}>
            <p>{current.gender}, {current.age} · {current.phone}{current.email ? ` · ${current.email}` : ''}</p>
            <p>{current.address}</p>
            <p className="muted">Emergency: {current.emergencyContact.name} ({current.emergencyContact.relationship}) {current.emergencyContact.phone}</p>
            <p className="muted">Doctors: {s.doctors.doctorsOf(current.id).map((d) => d.name).join(', ') || 'none assigned'}</p>
            <h4>Medical history</h4>
            <DataTable rows={current.medicalHistory} rowKey={(m) => m.id} empty="No history recorded" columns={[
              { header: 'Date', render: (m) => m.date }, { header: 'Type', render: (m) => m.type }, { header: 'Description', render: (m) => m.description },
            ]} />
            <div className="form inline">
              <Field label="History type">
                <select {...h.bind('type')}>{['condition', 'allergy', 'surgery', 'medication', 'note'].map((t) => <option key={t}>{t}</option>)}</select>
              </Field>
              <Field label="History description"><input {...h.bind('description')} /></Field>
              <Button onClick={() => act(() => s.patients.addHistory(current.id, { date: '', type: h.values.type as never, description: h.values.description }), 'History added') && h.reset()}>Add</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

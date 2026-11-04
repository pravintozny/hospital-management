import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { makeEnv } from '../test/helpers';

describe('PatientService', () => {
  it('registers a patient with generated id and empty history', () => {
    const { patient } = makeEnv();
    expect(patient.id).toBe('P-0001');
    expect(patient.medicalHistory).toEqual([]);
  });
  it.each([
    ['name', { name: ' ' }], ['age', { age: -1 }], ['age', { age: 1.5 }], ['phone', { phone: 'abc' }],
    ['email', { email: 'nope' }], ['gender', { gender: 'x' as never }],
    ['emergency', { emergencyContact: { name: '', relationship: 'x', phone: '+1 555-0100' } }],
  ])('rejects invalid %s', (_f, patch) => {
    const { s } = makeEnv();
    expect(() =>
      s.patients.register({
        name: 'A', age: 30, gender: 'male', phone: '+1 555-0100', address: 'x',
        emergencyContact: { name: 'B', relationship: 'Friend', phone: '+1 555-0100' }, ...patch,
      }),
    ).toThrow(ValidationError);
  });
  it('updates profile, keeping history and id', () => {
    const { s, patient } = makeEnv();
    s.patients.addHistory(patient.id, { date: '2025-01-01', type: 'condition', description: 'Asthma' });
    const u = s.patients.update(patient.id, { ...patient, name: 'New Name', age: 41 });
    expect(u.name).toBe('New Name');
    expect(u.medicalHistory).toHaveLength(1);
    expect(s.patients.get(patient.id).id).toBe(patient.id);
  });
  it('searches by name, id and phone; unknown id throws NotFound', () => {
    const { s, mkPatient } = makeEnv();
    mkPatient('Zed Zebra');
    expect(s.patients.search('zebra')).toHaveLength(1);
    expect(s.patients.search('P-0001')).toHaveLength(1);
    expect(s.patients.search('555-0100')).toHaveLength(2);
    expect(() => s.patients.get('P-9999')).toThrow(NotFoundError);
  });
  it('requires a history description', () => {
    const { s, patient } = makeEnv();
    expect(() => s.patients.addHistory(patient.id, { date: '', type: 'note', description: '' })).toThrow(ValidationError);
  });
});

describe('DoctorService', () => {
  it('rejects duplicate departments, unknown department and bad availability', () => {
    const { s, dept, doctor } = makeEnv();
    expect(() => s.doctors.addDepartment('general')).toThrow(ConflictError);
    const base = { name: 'X', specialization: 'Y', departmentId: dept.id, consultationFeeCents: 1, availability: [] };
    expect(() => s.doctors.create({ ...base, departmentId: 'DEP-99' })).toThrow(NotFoundError);
    expect(() => s.doctors.create({ ...base, consultationFeeCents: -5 })).toThrow(ValidationError);
    expect(() => s.doctors.create({ ...base, availability: [{ dayOfWeek: 9, start: '09:00', end: '10:00' }] })).toThrow(ValidationError);
    expect(() => s.doctors.create({ ...base, availability: [{ dayOfWeek: 1, start: '10:00', end: '09:00' }] })).toThrow(ValidationError);
    expect(() =>
      s.doctors.create({ ...base, availability: [{ dayOfWeek: 1, start: '09:00', end: '11:00' }, { dayOfWeek: 1, start: '10:00', end: '12:00' }] }),
    ).toThrow(/overlap/);
    expect(doctor.active).toBe(true);
  });
  it('filters by department/specialization/active', () => {
    const { s, doctor } = makeEnv();
    s.doctors.setActive(doctor.id, false);
    expect(s.doctors.list({ activeOnly: true })).toHaveLength(0);
    expect(s.doctors.list({ specialization: 'gp' })).toHaveLength(1);
  });
  it('assigns patients, prevents duplicates, supports unassign and reverse lookup', () => {
    const { s, doctor, patient } = makeEnv();
    const a = s.doctors.assign(doctor.id, patient.id);
    expect(() => s.doctors.assign(doctor.id, patient.id)).toThrow(ConflictError);
    expect(s.doctors.patientsOf(doctor.id)).toHaveLength(1);
    expect(s.doctors.doctorsOf(patient.id)[0].id).toBe(doctor.id);
    s.doctors.unassign(a.id);
    expect(s.doctors.patientsOf(doctor.id)).toHaveLength(0);
    s.doctors.assign(doctor.id, patient.id); // allowed again after unassign
  });
  it('cannot assign to an inactive doctor', () => {
    const { s, doctor, patient } = makeEnv();
    s.doctors.setActive(doctor.id, false);
    expect(() => s.doctors.assign(doctor.id, patient.id)).toThrow(ConflictError);
  });
});

import { createServices } from '../services';

/** Fixed clock: Monday 2026-01-05 08:00 (hospital-local). */
export const NOW = new Date('2026-01-05T08:00:00Z');

export function makeEnv(startAt: Date = NOW) {
  let current = startAt;
  const s = createServices(() => current);
  const advance = (ms: number) => (current = new Date(current.getTime() + ms));
  const dept = s.doctors.addDepartment('General');
  const doctor = s.doctors.create({
    name: 'Dr. Test', specialization: 'GP', departmentId: dept.id, consultationFeeCents: 10000,
    availability: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }, { dayOfWeek: 2, start: '09:00', end: '12:00' }],
  });
  const mkPatient = (name = 'Pat Ient') =>
    s.patients.register({
      name, age: 40, gender: 'other', phone: '+1 555-0100', address: '1 Main St',
      emergencyContact: { name: 'Em Contact', relationship: 'Friend', phone: '+1 555-0199' },
    });
  const patient = mkPatient();
  return { s, doctor, dept, patient, mkPatient, advance };
}

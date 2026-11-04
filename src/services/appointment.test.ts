import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../lib/errors';
import { makeEnv } from '../test/helpers';

// Clock is Monday 2026-01-05 08:00. Doctor works Mon/Tue 09:00-12:00.
describe('AppointmentService', () => {
  const book = (env: ReturnType<typeof makeEnv>, start: string, dur = 30, patientId = env.patient.id) =>
    env.s.appointments.schedule({ patientId, doctorId: env.doctor.id, start, durationMinutes: dur, reason: 'Checkup' });

  it('schedules within availability and snapshots the fee', () => {
    const env = makeEnv();
    const a = book(env, '2026-01-05T09:00');
    expect(a).toMatchObject({ end: '2026-01-05T09:30', status: 'scheduled', feeCents: 10000 });
  });
  it('rejects outside availability (wrong day, before start, past end)', () => {
    const env = makeEnv();
    expect(() => book(env, '2026-01-06T13:00')).toThrow(/not available/);
    expect(() => book(env, '2026-01-07T09:00')).toThrow(ConflictError); // Wednesday
    expect(() => book(env, '2026-01-05T08:30')).toThrow(ConflictError);
    expect(() => book(env, '2026-01-05T11:45', 30)).toThrow(ConflictError);
    expect(book(env, '2026-01-05T11:30', 30).end).toBe('2026-01-05T12:00'); // exactly at the boundary is ok
  });
  it('rejects past, malformed and bad-duration bookings', () => {
    const env = makeEnv();
    env.advance(2 * 3600_000); // 10:00
    expect(() => book(env, '2026-01-05T09:00')).toThrow(/past/);
    expect(() => book(env, 'tomorrow')).toThrow(ValidationError);
    expect(() => book(env, '2026-01-05T10:30', 0)).toThrow(ValidationError);
    expect(() => env.s.appointments.schedule({ patientId: env.patient.id, doctorId: env.doctor.id, start: '2026-01-05T10:30', durationMinutes: 30, reason: ' ' })).toThrow(ValidationError);
  });
  it('prevents overlapping appointments for the doctor (including partial overlap)', () => {
    const env = makeEnv();
    book(env, '2026-01-05T09:00', 60);
    const other = env.mkPatient('Other');
    expect(() => book(env, '2026-01-05T09:30', 30, other.id)).toThrow(/Doctor already/);
    expect(() => book(env, '2026-01-05T08:30', 60, other.id)).toThrow(ConflictError);
    expect(book(env, '2026-01-05T10:00', 30, other.id).start).toBe('2026-01-05T10:00'); // back-to-back is fine
  });
  it('prevents the same patient double-booking with another doctor', () => {
    const env = makeEnv();
    const d2 = env.s.doctors.create({
      name: 'Dr. Two', specialization: 'GP', departmentId: env.dept.id, consultationFeeCents: 1,
      availability: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }],
    });
    book(env, '2026-01-05T09:00');
    expect(() => env.s.appointments.schedule({ patientId: env.patient.id, doctorId: d2.id, start: '2026-01-05T09:15', durationMinutes: 30, reason: 'x' })).toThrow(/Patient already/);
  });
  it('cancelled appointments free the slot', () => {
    const env = makeEnv();
    const a = book(env, '2026-01-05T09:00');
    env.s.appointments.cancel(a.id, 'patient request');
    expect(env.s.appointments.get(a.id)).toMatchObject({ status: 'cancelled', cancelReason: 'patient request' });
    expect(book(env, '2026-01-05T09:00', 30, env.mkPatient('B').id).status).toBe('scheduled');
  });
  it('reschedules, ignoring itself in overlap checks, and counts reschedules', () => {
    const env = makeEnv();
    const a = book(env, '2026-01-05T09:00', 30);
    const r = env.s.appointments.reschedule(a.id, '2026-01-05T09:15');
    expect(r).toMatchObject({ start: '2026-01-05T09:15', end: '2026-01-05T09:45', rescheduleCount: 1 });
    const b = book(env, '2026-01-06T09:00', 30, env.mkPatient('B').id);
    expect(() => env.s.appointments.reschedule(b.id, '2026-01-05T09:30')).toThrow(ConflictError);
    expect(() => env.s.appointments.reschedule(b.id, '2026-01-07T09:00')).toThrow(/not available/);
  });
  it('enforces status transitions', () => {
    const env = makeEnv();
    const a = book(env, '2026-01-05T09:00');
    env.s.appointments.complete(a.id);
    expect(() => env.s.appointments.cancel(a.id)).toThrow(/Invalid status change/);
    expect(() => env.s.appointments.reschedule(a.id, '2026-01-05T10:00')).toThrow(ConflictError);
    const b = book(env, '2026-01-05T10:00');
    expect(env.s.appointments.markNoShow(b.id).status).toBe('no_show');
  });
  it('rejects inactive doctors', () => {
    const env = makeEnv();
    env.s.doctors.setActive(env.doctor.id, false);
    expect(() => book(env, '2026-01-05T09:00')).toThrow(ConflictError);
  });
  it('lists available slots excluding booked ones', () => {
    const env = makeEnv();
    book(env, '2026-01-05T09:30', 30);
    expect(env.s.appointments.availableSlots(env.doctor.id, '2026-01-05')).toEqual([
      '2026-01-05T09:00', '2026-01-05T10:00', '2026-01-05T10:30', '2026-01-05T11:00', '2026-01-05T11:30',
    ]);
    expect(env.s.appointments.availableSlots(env.doctor.id, '2026-01-07')).toEqual([]);
  });
  it('filters list by status/date', () => {
    const env = makeEnv();
    const a = book(env, '2026-01-05T09:00');
    book(env, '2026-01-06T09:00');
    env.s.appointments.cancel(a.id);
    expect(env.s.appointments.list({ status: 'scheduled' })).toHaveLength(1);
    expect(env.s.appointments.list({ date: '2026-01-05' })).toHaveLength(1);
  });
});

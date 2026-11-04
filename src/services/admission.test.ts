import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../lib/errors';
import { makeEnv } from '../test/helpers';

function setup() {
  const env = makeEnv();
  const ward = env.s.admissions.addWard('Ward A', 'general');
  const room = env.s.admissions.addRoom(ward.id, '101');
  const bed = env.s.admissions.addBed(room.id, 'A', 5000);
  const bed2 = env.s.admissions.addBed(room.id, 'B', 5000);
  return { ...env, ward, room, bed, bed2 };
}

describe('AdmissionService', () => {
  it('admits a patient and occupies the bed; discharge frees it', () => {
    const e = setup();
    const adm = e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'Surgery' });
    expect(adm).toMatchObject({ status: 'active', dailyRateCents: 5000, admittedAt: '2026-01-05T08:00' });
    expect(e.s.db.beds.get(e.bed.id)!.status).toBe('occupied');
    e.advance(3 * 3600_000);
    const d = e.s.admissions.discharge(adm.id, 'Recovered');
    expect(d).toMatchObject({ status: 'discharged', dischargedAt: '2026-01-05T11:00', dischargeSummary: 'Recovered' });
    expect(e.s.db.beds.get(e.bed.id)!.status).toBe('available');
  });
  it('prevents admitting to an occupied or maintenance bed', () => {
    const e = setup();
    e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'x' });
    expect(() => e.s.admissions.admit({ patientId: e.mkPatient('B').id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'x' })).toThrow(/occupied/);
    e.s.admissions.setBedMaintenance(e.bed2.id, true);
    expect(() => e.s.admissions.admit({ patientId: e.mkPatient('C').id, doctorId: e.doctor.id, bedId: e.bed2.id, reason: 'x' })).toThrow(/maintenance/);
    expect(() => e.s.admissions.setBedMaintenance(e.bed.id, true)).toThrow(ConflictError);
  });
  it('prevents admitting an already-admitted patient and double discharge', () => {
    const e = setup();
    const adm = e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'x' });
    expect(() => e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed2.id, reason: 'x' })).toThrow(/already admitted/);
    e.s.admissions.discharge(adm.id);
    expect(() => e.s.admissions.discharge(adm.id)).toThrow(/already discharged/);
    // re-admission after discharge is allowed
    e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'again' });
    expect(e.s.admissions.history(e.patient.id)).toHaveLength(2);
  });
  it('tracks ward availability', () => {
    const e = setup();
    e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'x' });
    e.s.admissions.setBedMaintenance(e.bed2.id, true);
    expect(e.s.admissions.wardAvailability()[0]).toMatchObject({ total: 2, available: 0, occupied: 1, maintenance: 1 });
    expect(e.s.admissions.listBeds({ availableOnly: true })).toHaveLength(0);
  });
  it('validates infrastructure', () => {
    const e = setup();
    expect(() => e.s.admissions.addRoom(e.ward.id, '101')).toThrow(ConflictError);
    expect(() => e.s.admissions.addBed(e.room.id, 'A', 1)).toThrow(ConflictError);
    expect(() => e.s.admissions.addBed(e.room.id, 'Z', -1)).toThrow(ValidationError);
  });
  it('rejects admission without a reason or with an inactive doctor', () => {
    const e = setup();
    expect(() => e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: '' })).toThrow(ValidationError);
    e.s.doctors.setActive(e.doctor.id, false);
    expect(() => e.s.admissions.admit({ patientId: e.patient.id, doctorId: e.doctor.id, bedId: e.bed.id, reason: 'x' })).toThrow(ConflictError);
  });
});

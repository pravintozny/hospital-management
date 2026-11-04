import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../lib/errors';
import { makeEnv } from '../test/helpers';

function pharm() {
  const e = makeEnv();
  const med = e.s.pharmacy.addMedicine({ name: 'Paracetamol', sku: 'para-1', unitPriceCents: 100, reorderLevel: 10 });
  return { ...e, med };
}

describe('PharmacyService', () => {
  it('normalises SKU and rejects duplicates / bad input', () => {
    const e = pharm();
    expect(e.med.sku).toBe('PARA-1');
    expect(() => e.s.pharmacy.addMedicine({ name: 'X', sku: 'PARA-1', unitPriceCents: 1, reorderLevel: 0 })).toThrow(ConflictError);
    expect(() => e.s.pharmacy.addMedicine({ name: 'X', sku: 'X1', unitPriceCents: -1, reorderLevel: 0 })).toThrow(ValidationError);
    expect(() => e.s.pharmacy.addMedicine({ name: 'X', sku: 'X1', unitPriceCents: 1, reorderLevel: -1 })).toThrow(ValidationError);
  });
  it('receives batches: rejects expired, duplicate batch numbers, non-positive quantity', () => {
    const e = pharm();
    const rb = (o: object) => e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 5, ...o });
    expect(() => rb({ expiryDate: '2026-01-05' })).toThrow(/expired/);
    expect(() => rb({ expiryDate: '01/01/2027' })).toThrow(ValidationError);
    expect(() => rb({ quantity: 0 })).toThrow(ValidationError);
    rb({});
    expect(() => rb({})).toThrow(ConflictError);
  });
  it('flags low stock at or below the reorder level and ignores expired stock', () => {
    const e = pharm();
    expect(e.s.pharmacy.lowStockAlerts()).toHaveLength(1); // zero stock
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'B1', expiryDate: '2026-02-01', quantity: 11 });
    expect(e.s.pharmacy.lowStockAlerts()).toHaveLength(0);
    e.advance(30 * 86400000); // now 2026-02-04: batch expired
    const [lvl] = e.s.pharmacy.stockLevels();
    expect(lvl).toMatchObject({ sellable: 0, expired: 11, low: true });
  });
  it('lists batches expiring soon', () => {
    const e = pharm();
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'SOON', expiryDate: '2026-01-20', quantity: 5 });
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'LATE', expiryDate: '2027-01-20', quantity: 5 });
    expect(e.s.pharmacy.expiringBatches().map((b) => b.batchNumber)).toEqual(['SOON']);
  });
  it('validates prescriptions', () => {
    const e = pharm();
    const base = { patientId: e.patient.id, doctorId: e.doctor.id };
    expect(() => e.s.pharmacy.prescribe({ ...base, items: [] })).toThrow(ValidationError);
    expect(() => e.s.pharmacy.prescribe({ ...base, items: [{ medicineId: e.med.id, quantity: 0, dosage: 'x' }] })).toThrow(ValidationError);
    expect(() => e.s.pharmacy.prescribe({ ...base, items: [{ medicineId: e.med.id, quantity: 1, dosage: '' }] })).toThrow(ValidationError);
    const item = { medicineId: e.med.id, quantity: 1, dosage: '1x' };
    expect(() => e.s.pharmacy.prescribe({ ...base, items: [item, item] })).toThrow(/Duplicate/);
    expect(() => e.s.pharmacy.prescribe({ ...base, items: [{ ...item, medicineId: 'M-99' }] })).toThrow(/not found/);
  });
  it('links a prescription to an appointment only if patient/doctor match', () => {
    const e = pharm();
    const ap = e.s.appointments.schedule({ patientId: e.patient.id, doctorId: e.doctor.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    const items = [{ medicineId: e.med.id, quantity: 1, dosage: '1x' }];
    expect(e.s.pharmacy.prescribe({ patientId: e.patient.id, doctorId: e.doctor.id, appointmentId: ap.id, items }).appointmentId).toBe(ap.id);
    expect(() => e.s.pharmacy.prescribe({ patientId: e.mkPatient('B').id, doctorId: e.doctor.id, appointmentId: ap.id, items })).toThrow(ValidationError);
  });
  it('dispenses FEFO across batches and snapshots price', () => {
    const e = pharm();
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'LATE', expiryDate: '2027-06-01', quantity: 10 });
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'EARLY', expiryDate: '2026-06-01', quantity: 5 });
    const rx = e.s.pharmacy.prescribe({ patientId: e.patient.id, doctorId: e.doctor.id, items: [{ medicineId: e.med.id, quantity: 8, dosage: '1x' }] });
    const done = e.s.pharmacy.dispense(rx.id);
    expect(done.status).toBe('dispensed');
    expect(done.items[0].unitPriceCents).toBe(100);
    expect(e.s.pharmacy.batchesOf(e.med.id).map((b) => [b.batchNumber, b.quantity])).toEqual([['EARLY', 0], ['LATE', 7]]);
    expect(() => e.s.pharmacy.dispense(rx.id)).toThrow(ConflictError);
  });
  it('dispense is atomic: insufficient stock for any item leaves all stock untouched', () => {
    const e = pharm();
    const m2 = e.s.pharmacy.addMedicine({ name: 'B', sku: 'B', unitPriceCents: 1, reorderLevel: 0 });
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 10 });
    e.s.pharmacy.receiveBatch({ medicineId: m2.id, batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 1 });
    const rx = e.s.pharmacy.prescribe({
      patientId: e.patient.id, doctorId: e.doctor.id,
      items: [{ medicineId: e.med.id, quantity: 5, dosage: 'a' }, { medicineId: m2.id, quantity: 2, dosage: 'b' }],
    });
    expect(() => e.s.pharmacy.dispense(rx.id)).toThrow(/Insufficient stock/);
    expect(e.s.pharmacy.sellableStock(e.med.id)).toBe(10);
    expect(e.s.pharmacy.getPrescription(rx.id).status).toBe('pending');
  });
  it('does not dispense from expired batches; cancelled prescriptions cannot be dispensed', () => {
    const e = pharm();
    e.s.pharmacy.receiveBatch({ medicineId: e.med.id, batchNumber: 'B1', expiryDate: '2026-01-10', quantity: 10 });
    const rx = e.s.pharmacy.prescribe({ patientId: e.patient.id, doctorId: e.doctor.id, items: [{ medicineId: e.med.id, quantity: 1, dosage: 'a' }] });
    e.s.pharmacy.cancelPrescription(rx.id);
    expect(() => e.s.pharmacy.dispense(rx.id)).toThrow(ConflictError);
    const rx2 = e.s.pharmacy.prescribe({ patientId: e.patient.id, doctorId: e.doctor.id, items: [{ medicineId: e.med.id, quantity: 1, dosage: 'a' }] });
    e.advance(10 * 86400000);
    expect(() => e.s.pharmacy.dispense(rx2.id)).toThrow(/Insufficient/);
  });
});

describe('LabService', () => {
  function lab() {
    const e = makeEnv();
    const test = e.s.lab.addTest({ code: 'cbc', name: 'CBC', priceCents: 2500 });
    const req = e.s.lab.request({ patientId: e.patient.id, doctorId: e.doctor.id, testId: test.id });
    return { ...e, test, req };
  }
  it('manages the catalog', () => {
    const e = lab();
    expect(e.test.code).toBe('CBC');
    expect(() => e.s.lab.addTest({ code: 'CBC', name: 'x', priceCents: 1 })).toThrow(ConflictError);
    expect(() => e.s.lab.addTest({ code: 'N', name: 'x', priceCents: -1 })).toThrow(ValidationError);
  });
  it('snapshots price: later price changes do not alter existing requests', () => {
    const e = lab();
    e.s.lab.updatePrice(e.test.id, 9999);
    expect(e.s.lab.get(e.req.id).priceCents).toBe(2500);
  });
  it('follows requested -> sample_collected -> draft -> final/completed', () => {
    const e = lab();
    expect(e.req).toMatchObject({ status: 'requested', reportStatus: 'none' });
    expect(() => e.s.lab.recordResult(e.req.id, { value: '5' })).toThrow(/sample must be collected/);
    const c = e.s.lab.collectSample(e.req.id);
    expect(c.sampleId).toBe(`S-${e.req.id}`);
    expect(() => e.s.lab.collectSample(e.req.id)).toThrow(ConflictError);
    expect(() => e.s.lab.finalizeReport(e.req.id)).toThrow(ConflictError);
    expect(() => e.s.lab.recordResult(e.req.id, { value: ' ' })).toThrow(ValidationError);
    e.s.lab.recordResult(e.req.id, { value: '5', unit: 'g/dL' });
    expect(e.s.lab.recordResult(e.req.id, { value: '6' }).reportStatus).toBe('draft'); // draft editable
    const f = e.s.lab.finalizeReport(e.req.id);
    expect(f).toMatchObject({ status: 'completed', reportStatus: 'final' });
    expect(() => e.s.lab.recordResult(e.req.id, { value: '7' })).toThrow(ConflictError);
    expect(() => e.s.lab.cancel(e.req.id)).toThrow(ConflictError);
  });
  it('cancels requests before completion', () => {
    const e = lab();
    expect(e.s.lab.cancel(e.req.id).status).toBe('cancelled');
    expect(e.s.lab.list({ status: 'cancelled' })).toHaveLength(1);
  });
});

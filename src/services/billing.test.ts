import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../lib/errors';
import { makeEnv } from '../test/helpers';
import { billableDays, calculateTotals } from './billingService';

const L = (...a: number[]) => a.map((amountCents) => ({ amountCents }));

describe('calculateTotals', () => {
  it('computes subtotal, percent discount, tax on discounted amount, total', () => {
    // 10000 + 2500 = 12500; 10% -> 1250; taxable 11250; 5% -> 562.5 -> 563; total 11813
    expect(calculateTotals(L(10000, 2500), { type: 'percent', bps: 1000 }, 500)).toEqual({
      subtotalCents: 12500, discountCents: 1250, taxCents: 563, totalCents: 11813,
    });
  });
  it('supports fixed discount and no discount', () => {
    expect(calculateTotals(L(1000), { type: 'fixed', cents: 200 }, 1000)).toMatchObject({ discountCents: 200, taxCents: 80, totalCents: 880 });
    expect(calculateTotals(L(1000), null, 0)).toMatchObject({ discountCents: 0, taxCents: 0, totalCents: 1000 });
  });
  it('allows a 100% discount, and handles empty lines', () => {
    expect(calculateTotals(L(1000), { type: 'percent', bps: 10000 }, 500).totalCents).toBe(0);
    expect(calculateTotals([], null, 500).totalCents).toBe(0);
  });
  it('rejects invalid discount / tax', () => {
    expect(() => calculateTotals(L(100), { type: 'fixed', cents: 101 }, 0)).toThrow(ValidationError);
    expect(() => calculateTotals(L(100), { type: 'fixed', cents: -1 }, 0)).toThrow(ValidationError);
    expect(() => calculateTotals(L(100), { type: 'percent', bps: 10001 }, 0)).toThrow(ValidationError);
    expect(() => calculateTotals(L(100), null, -1)).toThrow(ValidationError);
    expect(() => calculateTotals(L(100), null, 10001)).toThrow(ValidationError);
  });
});

describe('billableDays', () => {
  it('charges a minimum of 1 day and rounds partial days up', () => {
    expect(billableDays('2026-01-05T08:00', '2026-01-05T08:00')).toBe(1);
    expect(billableDays('2026-01-05T08:00', '2026-01-06T08:00')).toBe(1);
    expect(billableDays('2026-01-05T08:00', '2026-01-06T08:01')).toBe(2);
    expect(billableDays('2026-01-05T08:00', '2026-01-08T07:00')).toBe(3);
  });
});

function scenario() {
  const e = makeEnv();
  const { s, doctor, patient } = e;
  // consultation (completed)
  const ap = s.appointments.schedule({ patientId: patient.id, doctorId: doctor.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
  s.appointments.complete(ap.id);
  // admission: 8:00 -> 2 days later 10:00 => 3 days @ 5000
  const ward = s.admissions.addWard('W', 'general');
  const bed = s.admissions.addBed(s.admissions.addRoom(ward.id, '1').id, 'A', 5000);
  const adm = s.admissions.admit({ patientId: patient.id, doctorId: doctor.id, bedId: bed.id, reason: 'x' });
  e.advance(2 * 86400000 + 2 * 3600000);
  s.admissions.discharge(adm.id);
  // medicine: 4 x 100
  const med = s.pharmacy.addMedicine({ name: 'M', sku: 'M', unitPriceCents: 100, reorderLevel: 0 });
  s.pharmacy.receiveBatch({ medicineId: med.id, batchNumber: 'b', expiryDate: '2027-01-01', quantity: 50 });
  const rx = s.pharmacy.prescribe({ patientId: patient.id, doctorId: doctor.id, items: [{ medicineId: med.id, quantity: 4, dosage: 'x' }] });
  s.pharmacy.dispense(rx.id);
  // lab: 2500
  const t = s.lab.addTest({ code: 'T', name: 'T', priceCents: 2500 });
  const lr = s.lab.request({ patientId: patient.id, doctorId: doctor.id, testId: t.id });
  s.lab.collectSample(lr.id);
  s.lab.recordResult(lr.id, { value: '1' });
  s.lab.finalizeReport(lr.id);
  return { ...e, ap, adm, rx, lr };
}

describe('BillingService', () => {
  it('bills consultation, room, medicine and lab charges with discount and tax', () => {
    const e = scenario();
    // 10000 + 3*5000 + 400 + 2500 = 27900; 10% off = 2790; taxable 25110; 5% = 1255.5 -> 1256; total 26366
    const inv = e.s.billing.createInvoice(e.patient.id, { discount: { type: 'percent', bps: 1000 } });
    expect(inv.lines.map((l) => [l.category, l.amountCents])).toEqual([
      ['consultation', 10000], ['room', 15000], ['medicine', 400], ['laboratory', 2500],
    ]);
    expect(inv).toMatchObject({ subtotalCents: 27900, discountCents: 2790, taxCents: 1256, totalCents: 26366, status: 'issued' });
  });
  it('previews without side effects, and does not double-bill', () => {
    const e = scenario();
    expect(e.s.billing.preview(e.patient.id).totalCents).toBe(Math.round(27900 * 1.05));
    expect(e.s.billing.unbilledLines(e.patient.id)).toHaveLength(4);
    e.s.billing.createInvoice(e.patient.id);
    expect(e.s.billing.unbilledLines(e.patient.id)).toHaveLength(0);
    expect(() => e.s.billing.createInvoice(e.patient.id)).toThrow(/Nothing to bill/);
  });
  it('only bills finished work: scheduled appointments, active admissions, pending Rx and unfinished labs are excluded', () => {
    const e = makeEnv();
    const { s, doctor, patient } = e;
    s.appointments.schedule({ patientId: patient.id, doctorId: doctor.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    const bed = s.admissions.addBed(s.admissions.addRoom(s.admissions.addWard('W', 'icu').id, '1').id, 'A', 100);
    s.admissions.admit({ patientId: patient.id, doctorId: doctor.id, bedId: bed.id, reason: 'x' });
    const t = s.lab.addTest({ code: 'T', name: 'T', priceCents: 1 });
    s.lab.request({ patientId: patient.id, doctorId: doctor.id, testId: t.id });
    expect(s.billing.unbilledLines(patient.id)).toEqual([]);
  });
  it('isolates patients', () => {
    const e = scenario();
    expect(e.s.billing.unbilledLines(e.mkPatient('Other').id)).toEqual([]);
  });
  it('pays an invoice once; void releases items for re-billing; paid cannot be voided', () => {
    const e = scenario();
    const inv = e.s.billing.createInvoice(e.patient.id);
    e.s.billing.void(inv.id);
    expect(e.s.billing.get(inv.id).status).toBe('void');
    const inv2 = e.s.billing.createInvoice(e.patient.id, { taxRateBps: 0 });
    expect(inv2.totalCents).toBe(27900);
    const paid = e.s.billing.markPaid(inv2.id);
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeDefined();
    expect(() => e.s.billing.markPaid(inv2.id)).toThrow(ConflictError);
    expect(() => e.s.billing.void(inv2.id)).toThrow(ConflictError);
  });
  it('invalid discount does not mark anything billed', () => {
    const e = scenario();
    expect(() => e.s.billing.createInvoice(e.patient.id, { discount: { type: 'fixed', cents: 10 ** 9 } })).toThrow(ValidationError);
    expect(e.s.billing.unbilledLines(e.patient.id)).toHaveLength(4);
  });
  it('keeps the booked fee after the doctor fee changes', () => {
    const e = makeEnv();
    const ap = e.s.appointments.schedule({ patientId: e.patient.id, doctorId: e.doctor.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    e.s.doctors.update(e.doctor.id, { ...e.doctor, consultationFeeCents: 99999 });
    e.s.appointments.complete(ap.id);
    expect(e.s.billing.preview(e.patient.id, { taxRateBps: 0 }).totalCents).toBe(10000);
  });
});

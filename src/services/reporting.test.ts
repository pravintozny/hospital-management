import { describe, expect, it } from 'vitest';
import { createServices } from './index';
import { seed } from './seed';
import { NOW } from '../test/helpers';

describe('ReportingService', () => {
  it('summarises an empty hospital without dividing by zero', () => {
    const s = createServices(() => NOW);
    const d = s.reporting.dashboard();
    expect(d.appointments.cancellationRate).toBe(0);
    expect(d.beds.occupancyRate).toBe(0);
    expect(d.revenue.collectedCents).toBe(0);
  });

  it('reports statistics from a seeded, active hospital', () => {
    const s = createServices(() => NOW);
    seed(s);
    const [d1, d2] = s.doctors.list();
    const [p1, p2] = s.patients.search();
    const a1 = s.appointments.schedule({ patientId: p1.id, doctorId: d1.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    const a2 = s.appointments.schedule({ patientId: p2.id, doctorId: d2.id, start: '2026-01-05T10:00', durationMinutes: 30, reason: 'x' });
    s.appointments.schedule({ patientId: p2.id, doctorId: d1.id, start: '2026-01-06T09:00', durationMinutes: 30, reason: 'x' });
    s.appointments.complete(a1.id);
    s.appointments.cancel(a2.id);
    const bed = s.admissions.listBeds({ availableOnly: true })[0].bed;
    s.admissions.admit({ patientId: p1.id, doctorId: d1.id, bedId: bed.id, reason: 'obs' });
    const inv1 = s.billing.createInvoice(p1.id, { taxRateBps: 0 });
    s.billing.markPaid(inv1.id);

    const ps = s.reporting.patientStats();
    expect(ps).toMatchObject({ total: 2, admitted: 1, registeredToday: 2, byGender: { male: 1, female: 1, other: 0 } });
    expect(ps.byAgeGroup).toMatchObject({ '18-39': 1, '40-64': 1 });

    const as = s.reporting.appointmentStats();
    expect(as).toMatchObject({ total: 3, scheduled: 1, completed: 1, cancelled: 1, cancellationRate: 0.5 });
    expect(s.reporting.appointmentStats({ from: '2026-01-06' }).total).toBe(1);

    const rev = s.reporting.revenueReport();
    expect(rev).toMatchObject({ invoices: 1, collectedCents: 15000, outstandingCents: 0 });
    expect(rev.grossByCategory.consultation).toBe(15000);

    const beds = s.reporting.bedOccupancy();
    expect(beds).toMatchObject({ total: 3, occupied: 1 });
    expect(beds.occupancyRate).toBeCloseTo(1 / 3);
  });

  it('reports pharmacy inventory, low stock and stock value', () => {
    const s = createServices(() => NOW);
    seed(s);
    const inv = s.reporting.pharmacyInventory();
    // PARA: 400 @ 50 = 20000, AMOX: 40 @ 120 = 4800 (40 <= reorder 50 => low)
    expect(inv.stockValueCents).toBe(24800);
    expect(inv.lowStock.map((l) => l.medicine.sku)).toEqual(['AMOX-250']);
    expect(inv.expiringBatches).toHaveLength(0);
  });

  it('excludes void invoices from revenue', () => {
    const s = createServices(() => NOW);
    seed(s);
    const [d1] = s.doctors.list();
    const [p1] = s.patients.search();
    const a = s.appointments.schedule({ patientId: p1.id, doctorId: d1.id, start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    s.appointments.complete(a.id);
    s.billing.void(s.billing.createInvoice(p1.id).id);
    expect(s.reporting.revenueReport().invoices).toBe(0);
  });
});

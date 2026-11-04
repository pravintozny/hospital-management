import type { ChargeCategory } from '../domain/types';
import { isoDate } from '../lib/time';
import type { Database } from './database';
import type { AdmissionService } from './admissionService';
import type { PharmacyService } from './pharmacyService';

export interface DateRange {
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
}
const inRange = (date: string, r: DateRange) => (!r.from || date >= r.from) && (!r.to || date <= r.to);

export class ReportingService {
  constructor(private db: Database, private admissions: AdmissionService, private pharmacy: PharmacyService) {}

  patientStats() {
    const patients = [...this.db.patients.values()];
    const byGender = { male: 0, female: 0, other: 0 };
    const byAgeGroup = { '0-17': 0, '18-39': 0, '40-64': 0, '65+': 0 };
    for (const p of patients) {
      byGender[p.gender]++;
      byAgeGroup[p.age < 18 ? '0-17' : p.age < 40 ? '18-39' : p.age < 65 ? '40-64' : '65+']++;
    }
    const today = isoDate(this.db.now());
    return {
      total: patients.length,
      registeredToday: patients.filter((p) => p.registeredAt.slice(0, 10) === today).length,
      admitted: this.admissions.history().filter((a) => a.status === 'active').length,
      byGender, byAgeGroup,
    };
  }

  appointmentStats(range: DateRange = {}) {
    const counts = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 };
    const byDoctor: Record<string, number> = {};
    let total = 0;
    for (const a of this.db.appointments.values()) {
      if (!inRange(a.start.slice(0, 10), range)) continue;
      total++;
      counts[a.status]++;
      byDoctor[a.doctorId] = (byDoctor[a.doctorId] ?? 0) + 1;
    }
    const closed = counts.completed + counts.cancelled + counts.no_show;
    return {
      total, ...counts, byDoctor,
      /** cancelled / (completed + cancelled + no_show), 0 when nothing closed. */
      cancellationRate: closed ? counts.cancelled / closed : 0,
    };
  }

  /** Revenue from paid invoices (collected) and issued invoices (outstanding), by charge category. */
  revenueReport(range: DateRange = {}) {
    const byCategory: Record<ChargeCategory, number> = { consultation: 0, room: 0, medicine: 0, laboratory: 0 };
    let collectedCents = 0, outstandingCents = 0, discountsCents = 0, taxCents = 0, invoices = 0;
    for (const inv of this.db.invoices.values()) {
      if (inv.status === 'void' || !inRange(inv.createdAt.slice(0, 10), range)) continue;
      invoices++;
      discountsCents += inv.discountCents;
      taxCents += inv.taxCents;
      if (inv.status === 'paid') collectedCents += inv.totalCents;
      else outstandingCents += inv.totalCents;
      for (const l of inv.lines) byCategory[l.category] += l.amountCents;
    }
    return { invoices, collectedCents, outstandingCents, discountsCents, taxCents, grossByCategory: byCategory };
  }

  bedOccupancy() {
    const wards = this.admissions.wardAvailability();
    const total = wards.reduce((s, w) => s + w.total, 0);
    const occupied = wards.reduce((s, w) => s + w.occupied, 0);
    const inService = total - wards.reduce((s, w) => s + w.maintenance, 0);
    return { wards, total, occupied, /** occupied / beds in service */ occupancyRate: inService ? occupied / inService : 0 };
  }

  pharmacyInventory() {
    const levels = this.pharmacy.stockLevels();
    return {
      levels,
      lowStock: levels.filter((l) => l.low),
      expiringBatches: this.pharmacy.expiringBatches(),
      stockValueCents: levels.reduce((s, l) => s + l.sellable * l.medicine.unitPriceCents, 0),
      expiredUnits: levels.reduce((s, l) => s + l.expired, 0),
    };
  }

  dashboard() {
    return {
      patients: this.patientStats(),
      appointments: this.appointmentStats(),
      revenue: this.revenueReport(),
      beds: this.bedOccupancy(),
      pharmacy: this.pharmacyInventory(),
    };
  }
}

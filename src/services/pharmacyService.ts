import type { Medicine, MedicineBatch, Prescription, PrescriptionItem } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { isCents } from '../lib/money';
import { isoDate } from '../lib/time';
import { nonNegativeInt, positiveInt, required } from '../lib/validate';
import type { Database } from './database';

export const EXPIRY_WARNING_DAYS = 30;

export interface StockLevel {
  medicine: Medicine;
  sellable: number; // unexpired units
  expired: number;
  low: boolean;
}

export class PharmacyService {
  constructor(private db: Database) {}

  // ---- Catalog ----
  addMedicine(input: { name: string; sku: string; unitPriceCents: number; reorderLevel: number }): Medicine {
    const sku = required(input.sku, 'SKU').toUpperCase();
    if ([...this.db.medicines.values()].some((m) => m.sku === sku)) throw new ConflictError(`SKU ${sku} already exists`);
    if (!isCents(input.unitPriceCents)) throw new ValidationError('unit price must be non-negative cents');
    const m: Medicine = {
      id: this.db.nextId('M'), name: required(input.name, 'name'), sku,
      unitPriceCents: input.unitPriceCents, reorderLevel: nonNegativeInt(input.reorderLevel, 'reorder level'),
    };
    this.db.medicines.set(m.id, m);
    return m;
  }
  listMedicines(query = ''): Medicine[] {
    const q = query.trim().toLowerCase();
    return [...this.db.medicines.values()].filter((m) => !q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q));
  }
  getMedicine(id: string): Medicine {
    return this.db.get(this.db.medicines, 'Medicine', id);
  }

  // ---- Stock ----
  receiveBatch(input: { medicineId: string; batchNumber: string; expiryDate: string; quantity: number }): MedicineBatch {
    this.getMedicine(input.medicineId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) throw new ValidationError('expiry must be YYYY-MM-DD');
    if (input.expiryDate <= isoDate(this.db.now())) throw new ValidationError('Cannot receive an expired batch');
    const bn = required(input.batchNumber, 'batch number');
    if ([...this.db.batches.values()].some((b) => b.medicineId === input.medicineId && b.batchNumber === bn))
      throw new ConflictError(`Batch ${bn} already exists for this medicine`);
    const b: MedicineBatch = {
      id: this.db.nextId('BT'), medicineId: input.medicineId, batchNumber: bn,
      expiryDate: input.expiryDate, quantity: positiveInt(input.quantity, 'quantity'),
    };
    this.db.batches.set(b.id, b);
    return b;
  }
  batchesOf(medicineId: string): MedicineBatch[] {
    return [...this.db.batches.values()].filter((b) => b.medicineId === medicineId).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }
  private isExpired(b: MedicineBatch): boolean {
    return b.expiryDate <= isoDate(this.db.now());
  }
  sellableStock(medicineId: string): number {
    return this.batchesOf(medicineId).filter((b) => !this.isExpired(b)).reduce((s, b) => s + b.quantity, 0);
  }
  stockLevels(): StockLevel[] {
    return this.listMedicines().map((medicine) => {
      const batches = this.batchesOf(medicine.id);
      const sellable = batches.filter((b) => !this.isExpired(b)).reduce((s, b) => s + b.quantity, 0);
      const expired = batches.filter((b) => this.isExpired(b)).reduce((s, b) => s + b.quantity, 0);
      return { medicine, sellable, expired, low: sellable <= medicine.reorderLevel };
    });
  }
  /** Medicines whose sellable stock is at or below their reorder level. */
  lowStockAlerts(): StockLevel[] {
    return this.stockLevels().filter((s) => s.low);
  }
  /** Batches with stock that expire within `days` (not yet expired). */
  expiringBatches(days = EXPIRY_WARNING_DAYS): MedicineBatch[] {
    const limit = isoDate(new Date(this.db.now().getTime() + days * 86400000));
    return [...this.db.batches.values()].filter((b) => b.quantity > 0 && !this.isExpired(b) && b.expiryDate <= limit);
  }

  // ---- Prescriptions ----
  prescribe(input: { patientId: string; doctorId: string; appointmentId?: string; items: PrescriptionItem[] }): Prescription {
    this.db.get(this.db.patients, 'Patient', input.patientId);
    this.db.get(this.db.doctors, 'Doctor', input.doctorId);
    if (input.appointmentId) {
      const ap = this.db.get(this.db.appointments, 'Appointment', input.appointmentId);
      if (ap.patientId !== input.patientId || ap.doctorId !== input.doctorId)
        throw new ValidationError('Appointment does not match patient/doctor');
    }
    if (!input.items.length) throw new ValidationError('A prescription needs at least one medicine');
    const seen = new Set<string>();
    const items = input.items.map((i) => {
      this.getMedicine(i.medicineId);
      if (seen.has(i.medicineId)) throw new ValidationError('Duplicate medicine in prescription');
      seen.add(i.medicineId);
      return { medicineId: i.medicineId, quantity: positiveInt(i.quantity, 'quantity'), dosage: required(i.dosage, 'dosage') };
    });
    const rx: Prescription = {
      id: this.db.nextId('RX'), patientId: input.patientId, doctorId: input.doctorId,
      appointmentId: input.appointmentId, items, status: 'pending', createdAt: this.db.now().toISOString(),
    };
    this.db.prescriptions.set(rx.id, rx);
    return rx;
  }
  getPrescription(id: string): Prescription {
    return this.db.get(this.db.prescriptions, 'Prescription', id);
  }
  listPrescriptions(patientId?: string): Prescription[] {
    return [...this.db.prescriptions.values()].filter((p) => !patientId || p.patientId === patientId);
  }
  cancelPrescription(id: string): Prescription {
    const rx = this.getPrescription(id);
    if (rx.status !== 'pending') throw new ConflictError(`Cannot cancel a ${rx.status} prescription`);
    const u = { ...rx, status: 'cancelled' as const };
    this.db.prescriptions.set(id, u);
    return u;
  }
  /**
   * Dispense all items atomically: stock for every item is verified first, then deducted
   * first-expiry-first-out from unexpired batches. Unit prices are snapshotted for billing.
   */
  dispense(id: string): Prescription {
    const rx = this.getPrescription(id);
    if (rx.status !== 'pending') throw new ConflictError(`Prescription is ${rx.status}`);
    for (const item of rx.items) {
      const have = this.sellableStock(item.medicineId);
      if (have < item.quantity)
        throw new ConflictError(`Insufficient stock for ${this.getMedicine(item.medicineId).name}: need ${item.quantity}, have ${have}`);
    }
    const items = rx.items.map((item) => {
      let remaining = item.quantity;
      for (const batch of this.batchesOf(item.medicineId).filter((b) => !this.isExpired(b))) {
        if (remaining === 0) break;
        const take = Math.min(batch.quantity, remaining);
        this.db.batches.set(batch.id, { ...batch, quantity: batch.quantity - take });
        remaining -= take;
      }
      return { ...item, unitPriceCents: this.getMedicine(item.medicineId).unitPriceCents };
    });
    const u: Prescription = { ...rx, items, status: 'dispensed', dispensedAt: this.db.now().toISOString() };
    this.db.prescriptions.set(id, u);
    return u;
  }
}

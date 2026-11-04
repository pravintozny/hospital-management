import type { Discount, Invoice, InvoiceLine } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { applyBps } from '../lib/money';
import { parseLocal } from '../lib/time';
import type { Database } from './database';

export const DEFAULT_TAX_BPS = 500; // 5.00%
const MINUTES_PER_DAY = 1440;

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Pure calculation of invoice totals:
 *   discount = percent ? round(subtotal * bps/10000) : fixed   (never more than subtotal)
 *   taxable  = subtotal - discount
 *   tax      = round(taxable * taxRate)
 *   total    = taxable + tax
 */
export function calculateTotals(lines: Pick<InvoiceLine, 'amountCents'>[], discount: Discount | null, taxRateBps: number): Totals {
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new ValidationError('tax rate must be 0-10000 bps');
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  let discountCents = 0;
  if (discount?.type === 'percent') {
    if (!Number.isInteger(discount.bps) || discount.bps < 0 || discount.bps > 10000) throw new ValidationError('discount percent must be 0-100%');
    discountCents = applyBps(subtotalCents, discount.bps);
  } else if (discount?.type === 'fixed') {
    if (!Number.isInteger(discount.cents) || discount.cents < 0) throw new ValidationError('discount must be non-negative cents');
    if (discount.cents > subtotalCents) throw new ValidationError('discount cannot exceed the subtotal');
    discountCents = discount.cents;
  }
  const taxable = subtotalCents - discountCents;
  const taxCents = applyBps(taxable, taxRateBps);
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

/** Whole billable days for a stay: ceil(minutes / 1440), minimum 1. */
export const billableDays = (admittedAt: string, dischargedAt: string): number =>
  Math.max(1, Math.ceil((parseLocal(dischargedAt) - parseLocal(admittedAt)) / MINUTES_PER_DAY));

export class BillingService {
  constructor(private db: Database) {}

  /** Collects every not-yet-billed, billable item for the patient. */
  unbilledLines(patientId: string): InvoiceLine[] {
    this.db.get(this.db.patients, 'Patient', patientId);
    const lines: InvoiceLine[] = [];
    for (const a of this.db.appointments.values()) {
      if (a.patientId === patientId && a.status === 'completed' && !a.invoiceId)
        lines.push({
          category: 'consultation', description: `Consultation with ${this.db.doctors.get(a.doctorId)?.name ?? a.doctorId} (${a.start})`,
          quantity: 1, unitPriceCents: a.feeCents, amountCents: a.feeCents, sourceType: 'appointment', sourceId: a.id,
        });
    }
    for (const a of this.db.admissions.values()) {
      if (a.patientId === patientId && a.status === 'discharged' && !a.invoiceId) {
        const days = billableDays(a.admittedAt, a.dischargedAt!);
        lines.push({
          category: 'room', description: `Bed ${a.bedId} (${a.admittedAt} to ${a.dischargedAt})`,
          quantity: days, unitPriceCents: a.dailyRateCents, amountCents: days * a.dailyRateCents, sourceType: 'admission', sourceId: a.id,
        });
      }
    }
    for (const rx of this.db.prescriptions.values()) {
      if (rx.patientId === patientId && rx.status === 'dispensed' && !rx.invoiceId)
        for (const i of rx.items)
          lines.push({
            category: 'medicine', description: this.db.medicines.get(i.medicineId)?.name ?? i.medicineId,
            quantity: i.quantity, unitPriceCents: i.unitPriceCents!, amountCents: i.quantity * i.unitPriceCents!,
            sourceType: 'prescription', sourceId: rx.id,
          });
    }
    for (const r of this.db.labRequests.values()) {
      if (r.patientId === patientId && r.status === 'completed' && !r.invoiceId)
        lines.push({
          category: 'laboratory', description: this.db.labTests.get(r.testId)?.name ?? r.testId,
          quantity: 1, unitPriceCents: r.priceCents, amountCents: r.priceCents, sourceType: 'lab_request', sourceId: r.id,
        });
    }
    return lines;
  }

  preview(patientId: string, opts: { discount?: Discount | null; taxRateBps?: number } = {}) {
    const lines = this.unbilledLines(patientId);
    return { lines, ...calculateTotals(lines, opts.discount ?? null, opts.taxRateBps ?? DEFAULT_TAX_BPS) };
  }

  createInvoice(patientId: string, opts: { discount?: Discount | null; taxRateBps?: number } = {}): Invoice {
    const lines = this.unbilledLines(patientId);
    if (!lines.length) throw new ConflictError('Nothing to bill for this patient');
    const taxRateBps = opts.taxRateBps ?? DEFAULT_TAX_BPS;
    const totals = calculateTotals(lines, opts.discount ?? null, taxRateBps);
    const inv: Invoice = {
      id: this.db.nextId('INV'), patientId, lines, ...totals, discount: opts.discount ?? null, taxRateBps,
      status: 'issued', createdAt: this.db.now().toISOString(),
    };
    this.db.invoices.set(inv.id, inv);
    this.linkSources(inv, inv.id);
    return inv;
  }

  private linkSources(inv: Invoice, invoiceId: string | undefined) {
    for (const l of inv.lines) {
      const map = { appointment: this.db.appointments, admission: this.db.admissions, prescription: this.db.prescriptions, lab_request: this.db.labRequests }[l.sourceType] as Map<string, { invoiceId?: string }>;
      const src = map.get(l.sourceId);
      if (src) src.invoiceId = invoiceId;
    }
  }

  get(id: string): Invoice {
    return this.db.get(this.db.invoices, 'Invoice', id);
  }
  list(patientId?: string): Invoice[] {
    return [...this.db.invoices.values()].filter((i) => !patientId || i.patientId === patientId);
  }
  markPaid(id: string): Invoice {
    const inv = this.get(id);
    if (inv.status !== 'issued') throw new ConflictError(`Invoice is ${inv.status}`);
    const u: Invoice = { ...inv, status: 'paid', paidAt: this.db.now().toISOString() };
    this.db.invoices.set(id, u);
    return u;
  }
  /** Voids an unpaid invoice and releases its items so they can be re-billed. */
  void(id: string): Invoice {
    const inv = this.get(id);
    if (inv.status !== 'issued') throw new ConflictError(`Only issued invoices can be voided (invoice is ${inv.status})`);
    const u: Invoice = { ...inv, status: 'void' };
    this.db.invoices.set(id, u);
    this.linkSources(inv, undefined);
    return u;
  }
}

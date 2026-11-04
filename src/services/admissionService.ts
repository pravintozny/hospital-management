import type { Admission, Bed, BedStatus, Room, Ward } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { isCents } from '../lib/money';
import { toLocalString } from '../lib/time';
import { required } from '../lib/validate';
import type { Database } from './database';

export class AdmissionService {
  constructor(private db: Database) {}

  // ---- Infrastructure ----
  addWard(name: string, type: Ward['type']): Ward {
    const w: Ward = { id: this.db.nextId('W'), name: required(name, 'ward name'), type };
    this.db.wards.set(w.id, w);
    return w;
  }
  addRoom(wardId: string, number: string): Room {
    this.db.get(this.db.wards, 'Ward', wardId);
    const n = required(number, 'room number');
    if ([...this.db.rooms.values()].some((r) => r.wardId === wardId && r.number === n))
      throw new ConflictError(`Room ${n} already exists in this ward`);
    const r: Room = { id: this.db.nextId('R'), wardId, number: n };
    this.db.rooms.set(r.id, r);
    return r;
  }
  addBed(roomId: string, label: string, dailyRateCents: number): Bed {
    this.db.get(this.db.rooms, 'Room', roomId);
    if (!isCents(dailyRateCents)) throw new ValidationError('daily rate must be non-negative cents');
    const l = required(label, 'bed label');
    if ([...this.db.beds.values()].some((b) => b.roomId === roomId && b.label === l))
      throw new ConflictError(`Bed ${l} already exists in this room`);
    const b: Bed = { id: this.db.nextId('B'), roomId, label: l, dailyRateCents, status: 'available' };
    this.db.beds.set(b.id, b);
    return b;
  }
  setBedMaintenance(bedId: string, maintenance: boolean): Bed {
    const bed = this.db.get(this.db.beds, 'Bed', bedId);
    if (bed.status === 'occupied') throw new ConflictError('Cannot change an occupied bed');
    return this.setBedStatus(bed, maintenance ? 'maintenance' : 'available');
  }
  private setBedStatus(bed: Bed, status: BedStatus): Bed {
    const b = { ...bed, status };
    this.db.beds.set(b.id, b);
    return b;
  }

  /** Beds with their room and ward resolved, optionally only available ones. */
  listBeds(opts: { wardId?: string; availableOnly?: boolean } = {}) {
    return [...this.db.beds.values()]
      .map((bed) => {
        const room = this.db.rooms.get(bed.roomId)!;
        return { bed, room, ward: this.db.wards.get(room.wardId)! };
      })
      .filter((x) => (!opts.wardId || x.ward.id === opts.wardId) && (!opts.availableOnly || x.bed.status === 'available'));
  }
  wardAvailability() {
    return [...this.db.wards.values()].map((ward) => {
      const beds = this.listBeds({ wardId: ward.id }).map((x) => x.bed);
      return {
        ward,
        total: beds.length,
        available: beds.filter((b) => b.status === 'available').length,
        occupied: beds.filter((b) => b.status === 'occupied').length,
        maintenance: beds.filter((b) => b.status === 'maintenance').length,
      };
    });
  }

  // ---- Admissions ----
  get(id: string): Admission {
    return this.db.get(this.db.admissions, 'Admission', id);
  }
  history(patientId?: string): Admission[] {
    return [...this.db.admissions.values()]
      .filter((a) => !patientId || a.patientId === patientId)
      .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
  }
  admit(input: { patientId: string; doctorId: string; bedId: string; reason: string }): Admission {
    this.db.get(this.db.patients, 'Patient', input.patientId);
    const doc = this.db.get(this.db.doctors, 'Doctor', input.doctorId);
    if (!doc.active) throw new ConflictError('Doctor is not active');
    const bed = this.db.get(this.db.beds, 'Bed', input.bedId);
    if (bed.status !== 'available') throw new ConflictError(`Bed is ${bed.status}`);
    if (this.history(input.patientId).some((a) => a.status === 'active'))
      throw new ConflictError('Patient is already admitted');
    const adm: Admission = {
      id: this.db.nextId('ADM'),
      ...input,
      reason: required(input.reason, 'reason'),
      admittedAt: toLocalString(this.db.now()),
      status: 'active',
      dailyRateCents: bed.dailyRateCents,
    };
    this.db.admissions.set(adm.id, adm);
    this.setBedStatus(bed, 'occupied');
    return adm;
  }
  discharge(id: string, summary = ''): Admission {
    const adm = this.get(id);
    if (adm.status !== 'active') throw new ConflictError('Patient already discharged');
    const updated: Admission = {
      ...adm, status: 'discharged', dischargedAt: toLocalString(this.db.now()), dischargeSummary: summary.trim() || undefined,
    };
    this.db.admissions.set(id, updated);
    this.setBedStatus(this.db.get(this.db.beds, 'Bed', adm.bedId), 'available');
    return updated;
  }
}
